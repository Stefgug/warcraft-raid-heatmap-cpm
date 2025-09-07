from __future__ import annotations

from pydantic import BaseModel


class Actor(BaseModel):
    id: int
    name: str
    type: str | None = None
    subType: str | None = None


class Fight(BaseModel):
    id: int
    startTime: int
    endTime: int


class PlayersAndFight(BaseModel):
    players: list[Actor]
    fight: Fight


class CPMItem(BaseModel):
    id: int
    name: str
    value: float


class CPMResponse(BaseModel):
    source_id: int
    fight_minutes: float
    min: float
    max: float
    cpm_by_target: list[CPMItem]
