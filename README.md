# Warcraft Raid Heatmap (CPM)

Application FastAPI minimale pour analyser un report Warcraft Logs (API v1) et afficher des raid frames colorées par CPM (casts par minute reçus d'un healer sélectionné). Roster strictement limité aux participants du combat sélectionné (pas de NPC/pets). Les cartes sont entièrement colorées selon l’intensité (meilleure lisibilité), et l’ordre peut être modifié par glisser‑déposer via une petite poignée.

## Prérequis
- Python 3.12.9
- [uv](https://github.com/astral-sh/uv) (optionnel mais recommandé)
- Clé API Warcraft Logs v1 (pas d’OAuth requis)

## Configuration
Créez un fichier `.env` à la racine du projet (ou utilisez celui déjà présent):

```
WCL_V1_API_KEY=your_v1_api_key
WCL_BASE=https://www.warcraftlogs.com
```

> Remarque: L’application est volontairement limitée à l’API v1 pour éviter tout flux d’authentification utilisateur.

## Installation

```bash
cd warcraft-raid-heatmap
uv sync
```

## Démarrage (développement)

```bash
uv run uvicorn app.main:app --reload
```

Ouvrez http://127.0.0.1:8000/ puis collez une URL de report, par ex.

```
https://www.warcraftlogs.com/reports/Dfrtw1FVPXm68L7C?fight=17&type=healing
```

## Flux utilisateur
- Étape A: Coller l’URL → bouton « Charger » (ex. `.../reports/XXXX?fight=117&type=healing&source=2127`).
- Étape B: L’app affiche les joueurs du fight seulement (5 par ligne).
- Étape C: Cliquer un joueur (healer) pour le sélectionner; la heatmap se met à jour.
- Étape D: Optionnel — si l’URL contient `source=ID`, ce joueur est pré‑sélectionné automatiquement.
- Étape E: Réordonner les cartes en faisant glisser la poignée `≡` en haut‑gauche de chaque carte. Le clic sur la carte sert à la sélection; la poignée sert au déplacement.

## Drag-and-drop
Le glisser‑déposer est natif (pas de dépendance externe) et fonctionne via une poignée dédiée, afin d’éviter les conflits avec le clic de sélection. L’ordre est persisté côté navigateur via `localStorage` (par report + fight).

## Qualité & scripts

```bash
uv run ruff check .
uv run black --check .
uv run mypy .
uv run pytest -q
```

## Limitations connues
- L’API v1 peut paginer les événements; le client gère `nextPageTimestamp` jusqu’à épuisement.
- Pas de base de données; l’ordre des cartes (si DnD actif) est stocké côté navigateur.
- Les payloads v1 varient selon les logs; le mapping est tolérant (participants détectés via `friendlyPlayers` ou `actor.fights`).

## License
MIT
 
## Déploiement rapide (gratuit)

- Hugging Face Spaces (Docker):
  - Le repo contient `Dockerfile` et `requirements.txt` à la racine.
  - Créez un Space (type Docker), connectez ce repo.
  - Ajoutez le secret `WCL_V1_API_KEY` (et éventuellement `WCL_BASE`).
  - Le service démarre sur `$PORT` automatiquement.

- Render / Railway:
  - Construire depuis `Dockerfile` ou bien utiliser: build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
  - Définir `WCL_V1_API_KEY` dans les variables d’environnement.
