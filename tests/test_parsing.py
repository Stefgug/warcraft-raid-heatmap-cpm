from app.services.parsing import parse_report_url, ParseError


def test_parse_valid_url():
    url = "https://www.warcraftlogs.com/reports/Dfrtw1FVPXm68L7C?fight=17&type=healing"
    code, fight = parse_report_url(url)
    assert code == "Dfrtw1FVPXm68L7C"
    assert fight == 17


def test_parse_valid_with_extra_params():
    url = (
        "https://www.warcraftlogs.com/reports/Dfrtw1FVPXm68L7C?translate=true&fight=42&view=events"
    )
    code, fight = parse_report_url(url)
    assert code == "Dfrtw1FVPXm68L7C"
    assert fight == 42


def test_missing_code_raises():
    url = "https://www.warcraftlogs.com/reports/?fight=3"
    try:
        parse_report_url(url)
    except ParseError as e:
        assert "Code" in str(e)
    else:
        assert False, "Expected ParseError"


def test_missing_fight_raises():
    url = "https://www.warcraftlogs.com/reports/ABCDE12345?type=healing"
    try:
        parse_report_url(url)
    except ParseError as e:
        assert "fight" in str(e)
    else:
        assert False, "Expected ParseError"

