from __future__ import annotations

from urllib.parse import urlparse, parse_qs


class ParseError(ValueError):
    pass


def parse_report_url(url: str) -> tuple[str, int]:
    """
    Extract report code and fight id from a Warcraft Logs report URL.

    Examples:
        https://www.warcraftlogs.com/reports/Dfrtw1FVPXm68L7C?fight=17&type=healing
    """
    if not url:
        raise ParseError("URL vide")

    parsed = urlparse(url)
    # Path expected: /reports/{CODE}
    path_parts = [p for p in parsed.path.split("/") if p]
    try:
        reports_idx = path_parts.index("reports")
        code = path_parts[reports_idx + 1]
    except (ValueError, IndexError) as e:
        raise ParseError("Code de report introuvable dans l'URL fournie") from e

    if not code:
        raise ParseError("Code de report manquant")

    qs = parse_qs(parsed.query)
    fight_vals = qs.get("fight")
    if not fight_vals or not fight_vals[0]:
        raise ParseError("Paramètre fight manquant dans l'URL")

    try:
        fight_id = int(fight_vals[0])
    except ValueError as e:
        raise ParseError("Paramètre fight invalide (entier attendu)") from e

    return code, fight_id


def parse_report_any(url_or_code: str) -> tuple[str, dict]:
    """Parse any Warcraft Logs report URL (or bare code) and extract the base
    report code plus a flexible selection dict derived from query params.

    Returns (code, selection) where selection may contain:
      - fight: int | None
      - boss: int | None
      - difficulty: int | None
      - wipes: int | None  (1 means only wipes)
      - kill: int | None   (1 means only kills)
      - from: int | None   (ms)
      - to: int | None     (ms)
      - any other raw query params under 'extra'
    """
    if not url_or_code:
        raise ParseError("Empty input")

    # Accept a bare 16-char code (alnum) or a full URL
    parsed = urlparse(url_or_code)
    if parsed.scheme and parsed.netloc:
        path_parts = [p for p in parsed.path.split("/") if p]
        try:
            reports_idx = path_parts.index("reports")
            code = path_parts[reports_idx + 1]
        except (ValueError, IndexError) as e:
            raise ParseError("Could not find report code in URL") from e
        qs = parse_qs(parsed.query)
    else:
        # Assume input itself is the code
        code = url_or_code.strip()
        qs = {}

    if not code:
        raise ParseError("Missing report code")

    sel: dict = {"extra": {}}
    def take_int(key: str) -> int | None:
        v = qs.get(key)
        if not v:
            return None
        try:
            return int(str(v[0]))
        except Exception:
            return None

    sel["fight"] = take_int("fight")
    sel["boss"] = take_int("boss")
    sel["difficulty"] = take_int("difficulty")
    sel["wipes"] = take_int("wipes")
    sel["kill"] = take_int("kill")
    sel["from"] = take_int("from")
    sel["to"] = take_int("to")

    # Stash unrecognized params
    for k, v in qs.items():
        if k not in {"fight", "boss", "difficulty", "wipes", "kill", "from", "to"}:
            sel["extra"][k] = v

    return code, sel
