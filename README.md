# Warcraft Raid Heatmap (CPM)

FastAPI application that analyzes a Warcraft Logs report (API v1) and renders a raid-frame heatmap colored by CPM (casts per minute) received by each player from a selected source. The roster is strictly limited to players who participated in the selected fight(s) — no NPCs or pets. The layout is fully color‑filled for readability and can be rearranged with drag‑and‑drop. Optional OCR can auto‑arrange the grid from a raid‑frames screenshot.

## Features
- Heatmap by CPM: shows casts-per-minute received per player.
- Multi‑fight aggregation: select one or multiple boss attempts; CPM aggregates over total minutes.
- Player picker: choose the source (e.g., healer) whose casts are analyzed.
- Drag‑and‑drop grid: reorder cards manually; order persists per report+fight in localStorage.
- OCR auto‑arrange: upload a raid‑frames screenshot to auto‑position players (all in-browser via Tesseract.js).
- No OAuth: uses Warcraft Logs API v1 key only.

## Requirements
- Python 3.12
- Optional: [uv](https://github.com/astral-sh/uv) for fast dependency management
- Warcraft Logs v1 API key (no OAuth)

## Configuration
Create a `.env` file at the project root (or edit the existing one):

```
WCL_V1_API_KEY=your_v1_api_key
WCL_BASE=https://www.warcraftlogs.com
```

## Setup

Using uv (recommended):

```bash
uv sync
```

Or with pip:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Run (development)

```bash
uv run uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/ and paste a report URL, for example:

```
https://www.warcraftlogs.com/reports/Dfrtw1FVPXm68L7C?fight=17&type=healing
```

## Usage
- Paste a Warcraft Logs report URL and click Load.
- Pick a player from the dropdown to compute the CPM heatmap.
- Select one or multiple fights (left list) to aggregate CPM over several attempts.
- Drag cards to rearrange the grid; layout is saved locally per report+fight.
- Optionally, upload a raid‑frames screenshot to auto‑arrange the grid via OCR.

## API

The UI calls a single API endpoint you can reuse:

GET `/api/cpm`

Query parameters:
- `code` (string): report code.
- `source_id` (int): player ID whose casts are analyzed.
- `fight_id` (int, optional): a single fight ID.
- `fight_ids` (string, optional): comma‑separated list of fight IDs (overrides `fight_id`).

Response (JSON):
```
{
  "source_id": 2127,
  "fight_minutes": 7.83,
  "min": 0.11,
  "max": 1.87,
  "cpm_by_target": [ { "id": 123, "name": "Player", "value": 0.93 }, ... ]
}
```

## Docker

The repository includes a `Dockerfile` and `requirements.txt`.

Example build and run:

```bash
docker build -t wcl-raid-heatmap .
docker run --rm -p 8000:8000 \
  -e WCL_V1_API_KEY=your_v1_api_key \
  wcl-raid-heatmap
```

## Notes & Limitations
- Warcraft Logs v1 may paginate events; the client follows `nextPageTimestamp`.
- No database: layout persistence is local (per browser, per report+fight).
- v1 payloads vary across logs; roster detection uses tolerant heuristics.

## Development

Useful commands:

```bash
uv run ruff check .
uv run black --check .
uv run mypy .
```

## License
MIT
