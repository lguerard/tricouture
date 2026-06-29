# Captures d'écran

Les images référencées par le `README.md` principal sont générées
automatiquement, afin de toujours refléter l'état réel de l'application.

## Générer les captures

1. Lance l'application :

   ```bash
   docker compose up -d
   ```

2. Installe Playwright (une seule fois) :

   ```bash
   npm install -D playwright
   npx playwright install chromium
   ```

3. Lance la capture :

   ```bash
   BASE_URL=http://localhost:3000 node scripts/capture-screenshots.mjs
   ```

Les fichiers `*.png` apparaissent dans ce dossier (`docs/screenshots/`).

## Liste des écrans capturés

- `dashboard.png` — tableau de bord
- `patterns.png` — bibliothèque de patrons
- `kanban.png` — tableau Kanban des projets
- `stash.png` — gestion du stock
- `calendar.png` — calendrier des échéances
- `goals.png` — objectifs et défis
- `stats.png` — « Mon année en mailles »
- `achievements.png` — succès façon Steam
- `assistant.png` — assistant IA
- `bins.png` — bacs de rangement à QR
