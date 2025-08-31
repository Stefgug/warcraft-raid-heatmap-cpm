from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates
from urllib.parse import urlencode

from app.schemas import CPMItem, CPMResponse, PlayersAndFight
from app.services.compute import compute_cpm, fight_minutes, min_max_positive
from app.services.parsing import ParseError, parse_report_url
from app.services.wcl_api_v1 import WCLV1Client, WCLV1APIError


BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)


def require_v1_key() -> tuple[str, str]:
    base = os.getenv("WCL_BASE", "https://www.warcraftlogs.com")
    v1_key = os.getenv("WCL_V1_API_KEY", "")
    if not v1_key:
        raise RuntimeError("WCL_V1_API_KEY manquant dans .env")
    return base, v1_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    base, v1_key = require_v1_key()
    v1 = WCLV1Client(base, v1_key)
    app.state.wcl_v1 = v1
    try:
        yield
    finally:
        if app.state.wcl_v1 is not None:
            await app.state.wcl_v1.aclose()


app = FastAPI(lifespan=lifespan)

templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))
app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "app" / "static")),
    name="static",
)

def _client_v1(request: Request) -> WCLV1Client:
    return request.app.state.wcl_v1


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "players": None,
            "report_code": None,
            "fight_id": None,
            "error": None,
            "uses_v1": True,
        },
    )


@app.post("/load", response_class=HTMLResponse)
async def load_report(request: Request, report_url: str = Form(...)):
    try:
        code, fight_id = parse_report_url(report_url)
    except ParseError as e:
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "players": None,
                "report_code": None,
                "fight_id": None,
                "error": str(e),
            },
            status_code=400,
        )

    try:
        paf = await _client_v1(request).get_players_and_fight(code, fight_id)
    except WCLV1APIError as e:
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "players": None,
                "report_code": None,
                "fight_id": None,
                "error": str(e),
                "uses_v1": True,
            },
            status_code=502,
        )

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "players": paf.players,
            "report_code": code,
            "fight_id": fight_id,
            "fight_minutes": fight_minutes(paf.fight.startTime, paf.fight.endTime),
            "error": None,
            "uses_v1": True,
        },
    )


@app.get("/api/cpm", response_model=CPMResponse)
async def api_cpm(
    request: Request,
    code: str = Query(...),
    fight_id: int = Query(...),
    source_id: int = Query(...),
):
    try:
        paf = await _client_v1(request).get_players_and_fight(code, fight_id)
        counts = await _client_v1(request).get_cast_counts_by_target(code, paf.fight, source_id)
    except WCLV1APIError as e:
        raise HTTPException(status_code=502, detail=str(e))

    minutes = fight_minutes(paf.fight.startTime, paf.fight.endTime)
    cpm_map = compute_cpm(counts, [p.id for p in paf.players], minutes)
    mm_min, mm_max = min_max_positive(cpm_map.values())

    items: List[CPMItem] = [
        CPMItem(id=p.id, name=p.name, value=round(cpm_map.get(p.id, 0.0), 3))
        for p in paf.players
    ]

    return JSONResponse(
        CPMResponse(
            source_id=source_id,
            fight_minutes=minutes,
            min=mm_min,
            max=mm_max,
            cpm_by_target=items,
        ).model_dump()
    )


# No OAuth routes in v1-only mode
