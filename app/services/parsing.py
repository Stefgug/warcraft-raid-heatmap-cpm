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
    except (ValueError, IndexError):
        raise ParseError("Code de report introuvable dans l'URL fournie")

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

