# Warcraft Raid Heatmap (CPM)

Application FastAPI (API v1 uniquement) pour analyser un report Warcraft Logs et afficher des raid frames (drag-and-drop) colorées par CPM (casts par minute reçus d'un healer sélectionné).

## Prérequis
- Python 3.12.9
- [uv](https://github.com/astral-sh/uv) (optionnel mais recommandé)
- Clé API Warcraft Logs v1.

## Configuration
Créez un fichier `.env` à la racine du projet:

```
WCL_V1_API_KEY=your_v1_api_key
WCL_BASE=https://www.warcraftlogs.com
```

Pas besoin d’OAuth/PKCE; seule la clé v1 est nécessaire.

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
- Étape A: Coller l’URL → bouton « Charger ».
- Étape B: L’app récupère les Players et affiche les raid frames (5 par ligne).
- Étape C: Sélectionner le joueur à analyser (healer).
- Étape D: L’app requête les casts de ce joueur pendant le fight, calcule le CPM par target et met à jour la heatmap.
- Étape E: Réorganiser les cartes par drag-and-drop (persisté dans `localStorage`).

Mode unique: API v1 (sans OAuth). Définissez `WCL_V1_API_KEY` et l’app utilisera l’API REST v1 (fights, events/casts) sans écran de connexion.

## Qualité & scripts

```bash
uv run ruff check .
uv run black --check .
uv run mypy .
uv run pytest -q
```

## Limitations connues
- L’API WCL peut évoluer. Les noms de champs GraphQL sont basés sur la doc actuelle; ajustez si l’introspection renvoie des variantes.
- Pas de base de données; l’ordre est stocké côté navigateur.
- En mode v1, les données disponibles et les champs peuvent différer légèrement; l’app fait l’agrégation côté serveur.

### Notes
- L’API v1 est suffisante pour les endpoints utilisés (fights, events/casts). Si vous migrez vers v2 plus tard, il faudra réintroduire OAuth.

## License
MIT
