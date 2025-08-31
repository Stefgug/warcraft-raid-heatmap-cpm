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
            if int(f.get("id")) == int(fight_id):
                fight_raw = f
                break
        if not fight_raw:
            raise WCLV1APIError("Fight introuvable pour ce report (v1)")

        st = fight_raw.get("start_time") or fight_raw.get("startTime")
        et = fight_raw.get("end_time") or fight_raw.get("endTime")
        if st is None or et is None:
            raise WCLV1APIError("Champs start_time/end_time absents dans la réponse v1")
        fight = Fight(id=int(fight_raw["id"]), startTime=int(st), endTime=int(et))

        # Players: v1 includes a 'friendlies' list; filter to type == 'Player' if present.
        actors_raw = data.get("friendlies", [])
        players: List[Actor] = []
        for a in actors_raw:
            t = a.get("type")
            if t is None or str(t) == "Player":
                # v1 may not include 'type' on friendlies; assume Player when missing
                players.append(
                    Actor(
                        id=int(a.get("id")),
                        name=str(a.get("name")),
                        type=str(t) if t is not None else "Player",
                        subType=a.get("spec") or a.get("class"),
                    )
                )
        if not players:
            # fall back to 'friendlies' as players if no explicit Player type
            for a in actors_raw:
                players.append(Actor(id=int(a.get("id")), name=str(a.get("name"))))

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

