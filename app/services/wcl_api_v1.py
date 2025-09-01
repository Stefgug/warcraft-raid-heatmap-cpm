from __future__ import annotations

from typing import Any, Dict, List

import httpx

from app.schemas import Actor, Fight, PlayersAndFight


class WCLV1APIError(RuntimeError):
    pass


class WCLV1Client:
    """Warcraft Logs v1 REST API client using API key (no OAuth).

    Endpoints used:
      - GET /v1/report/fights/{code}
      - GET /v1/report/events/casts/{code}
    """

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = httpx.AsyncClient(timeout=30)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        p = {"api_key": self.api_key, **params}
        r = await self._client.get(url, params=p)
        if r.status_code != 200:
            raise WCLV1APIError(f"V1 HTTP {r.status_code}: {r.text[:200]}")
        return r.json()

    async def get_players_and_fight(self, code: str, fight_id: int) -> PlayersAndFight:
        data = await self._get(f"/v1/report/fights/{code}", {})

        # Fights: map to our Fight schema. v1 commonly uses start_time/end_time keys.
        fights = data.get("fights", [])
        fight_raw = None
        for f in fights:
            try:
                if int(f.get("id")) == int(fight_id):
                    fight_raw = f
                    break
            except Exception:
                continue
        if not fight_raw:
            raise WCLV1APIError("Fight introuvable pour ce report (v1)")

        st = fight_raw.get("start_time") or fight_raw.get("startTime")
        et = fight_raw.get("end_time") or fight_raw.get("endTime")
        if st is None or et is None:
            raise WCLV1APIError("Champs start_time/end_time absents dans la réponse v1")
        fight = Fight(id=int(fight_raw.get("id")), startTime=int(st), endTime=int(et))

        # Derive the set of players that actually participated in this fight.
        # Heuristics (robust to variations in v1 payloads):
        #  1) Prefer fight-local list of friendly players if present.
        #  2) Else use each actor's `fights` membership to see if they were in this fight.
        #  3) Fallback to all friendlies of type Player.
        actors_raw = data.get("friendlies", [])

        # 1) Look for fight-local participants (ids)
        participants: set[int] = set()
        fp = fight_raw.get("friendlyPlayers") or fight_raw.get("friendlyPlayerIds") or fight_raw.get("friendlies")
        if isinstance(fp, list):
            for item in fp:
                if isinstance(item, int):
                    participants.add(int(item))
                elif isinstance(item, dict):
                    # sometimes entries can be objects with an id field
                    try:
                        if "id" in item:
                            participants.add(int(item["id"]))
                        elif "playerid" in item:
                            participants.add(int(item["playerid"]))
                    except Exception:
                        pass

        # 2) If still empty, inspect actors' fights membership
        if not participants:
            for a in actors_raw:
                fs = a.get("fights")
                if not isinstance(fs, list):
                    continue
                found = False
                for ent in fs:
                    try:
                        if isinstance(ent, int):
                            if int(ent) == int(fight_id):
                                found = True
                                break
                        elif isinstance(ent, dict):
                            # common shapes: {"id": 17, ...} or {"fightID": 17, ...}
                            fid = ent.get("id") if ent is not None else None
                            if fid is None:
                                fid = ent.get("fightID") or ent.get("fightId")
                            if fid is not None and int(fid) == int(fight_id):
                                found = True
                                break
                    except Exception:
                        continue
                if found:
                    try:
                        participants.add(int(a.get("id")))
                    except Exception:
                        pass

        # Build final players list. Prefer participants set if available; strictly require type=="Player" when present.
        players: List[Actor] = []
        if participants:
            for a in actors_raw:
                try:
                    aid = int(a.get("id"))
                except Exception:
                    continue
                if aid not in participants:
                    continue
                t = a.get("type")
                if t is not None and str(t) != "Player":
                    # if type is known and not a Player, skip
                    continue
                players.append(
                    Actor(
                        id=aid,
                        name=str(a.get("name")),
                        type=str(t) if t is not None else None,
                        subType=a.get("spec") or a.get("class"),
                    )
                )
        else:
            # No participants info; fallback to explicit Player types only.
            for a in actors_raw:
                t = a.get("type")
                if str(t) != "Player":
                    continue
                try:
                    aid = int(a.get("id"))
                except Exception:
                    continue
                players.append(
                    Actor(
                        id=aid,
                        name=str(a.get("name")),
                        type="Player",
                        subType=a.get("spec") or a.get("class"),
                    )
                )

        # Final fallback: if still empty, include friendlies whose 'type' is missing but are referenced by friendlyPlayers
        if not players and participants:
            for a in actors_raw:
                try:
                    aid = int(a.get("id"))
                except Exception:
                    continue
                if aid not in participants:
                    continue
                players.append(Actor(id=aid, name=str(a.get("name"))))

        return PlayersAndFight(players=players, fight=fight)

    async def get_cast_counts_by_target(self, code: str, fight: Fight, source_id: int) -> Dict[int, int]:
        counts: Dict[int, int] = {}
        params: Dict[str, Any] = {
            "start": fight.startTime,
            "end": fight.endTime,
            "sourceid": source_id,
            "translate": "true",
        }
        next_page = None
        while True:
            if next_page is not None:
                params["page"] = next_page
            data = await self._get(f"/v1/report/events/casts/{code}", params)
            events = data.get("events", [])
            for ev in events:
                # v1 usually provides targetID on events; fallback to nested target if present
                tid = ev.get("targetID")
                if tid is None:
                    tgt = ev.get("target") or {}
                    tid = tgt.get("id")
                if tid is None:
                    continue
                tid = int(tid)
                counts[tid] = counts.get(tid, 0) + 1
            next_page = data.get("nextPageTimestamp")
            if not next_page:
                break
        return counts

    # --- Healers detection for a given fight ---
    HEALER_SPECS = {
        # Priest
        "Holy", "Discipline",
        # Druid
        "Restoration",
        # Paladin
        # Holy already covered
        # Shaman
        # Restoration already covered
        # Monk
        "Mistweaver",
        # Evoker
        "Preservation",
    }

    def _looks_like_healer(self, entry: Dict[str, Any]) -> bool:
        spec = entry.get("spec") or entry.get("specs")
        if isinstance(spec, str):
            if any(k.lower() in spec.lower() for k in self.HEALER_SPECS):
                return True
        elif isinstance(spec, list):
            for s in spec:
                name = s.get("spec") if isinstance(s, dict) else str(s)
                if name and any(k.lower() in str(name).lower() for k in self.HEALER_SPECS):
                    return True
        # Fallback: healer-ish classes with significant healing done
        cls = (entry.get("class") or "").lower()
        healer_classes = {"priest", "druid", "paladin", "shaman", "monk", "evoker"}
        if cls in healer_classes and float(entry.get("total", 0)) > 50000:
            return True
        return False

    async def get_healer_ids(self, code: str, fight: Fight) -> List[int]:
        """Return player IDs that acted as healers during the fight timeframe.

        Uses /v1/report/tables/healing to find sources with healing output and
        filters by known healer specs. Falls back to class+healing threshold.
        """
        params: Dict[str, Any] = {
            "start": fight.startTime,
            "end": fight.endTime,
            "by": "source",
            "hostility": 0,
            "translate": "true",
        }
        data = await self._get(f"/v1/report/tables/healing/{code}", params)
        entries = data.get("entries", [])
        ids: List[int] = []
        for e in entries:
            t = str(e.get("type") or "")
            # Tables often set type to class name (e.g., "Priest"). Accept both styles.
            if t and t.lower() not in {"player", "priest", "druid", "paladin", "shaman", "monk", "evoker"}:
                # Skip obvious NPCs
                continue
            try:
                pid = int(e.get("id"))
            except Exception:
                continue
            if self._looks_like_healer(e):
                ids.append(pid)
        # Deduplicate preserving order
        seen = set()
        res: List[int] = []
        for pid in ids:
            if pid not in seen:
                seen.add(pid)
                res.append(pid)
        return res
