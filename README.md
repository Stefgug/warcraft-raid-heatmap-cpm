# Warcraft Raid Heatmap (CPM)

Application FastAPI minimale pour analyser un report Warcraft Logs (API v1) et afficher des raid frames colorées par CPM (casts par minute reçus d'un healer sélectionné). Roster strictement limité aux participants du combat sélectionné (pas de NPC/pets).

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

## Drag-and-drop (optionnel)
Le drag-and-drop des cartes est optionnel. Pour éviter les erreurs de CDN, il est désactivé par défaut.

Deux options:
- Utiliser un CDN fiable et ajouter SortableJS dans `app/templates/base.html`.
- Ou bien déposer `sortable.min.js` dans `app/static/vendor/` et inclure le script local.

Si SortableJS est présent, l’ordre est persisté côté navigateur via `localStorage`.

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
