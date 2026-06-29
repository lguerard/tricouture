# Tricouture

Application web **auto-hébergée** pour gérer ses patrons de **couture, tricot et crochet**,
son stock de matières (laine, tissu, mercerie, outils), ses projets en cours (avec tableau
Kanban), et bien plus.

Conçue pour tourner en local sur un serveur avec GPU (ex. RTX 3080) afin d'offrir des
fonctionnalités d'IA locales (traduction de patrons, copilote, OCR d'étiquettes, etc.) sans
dépendre du cloud.

## Stack

- **SvelteKit** (full-stack, adapter-node) + TypeScript
- **PostgreSQL 16 + pgvector** (relationnel + recherche sémantique)
- **Drizzle ORM**
- Sidecars GPU optionnels (Ollama / vision / Whisper) — phases ultérieures

## Démarrage rapide (Docker)

```bash
cp .env.example .env
# éditer .env : mot de passe Postgres, AUTH_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

App disponible sur http://localhost:3000

Les migrations de base de données sont appliquées automatiquement au démarrage du conteneur `app`.

### Activer l'IA sur GPU (plus tard)

Prérequis : pilote NVIDIA + `nvidia-container-toolkit` sur l'hôte.

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

## Développement local (sans Docker pour l'app)

```bash
# 1. une base Postgres+pgvector (via Docker)
docker compose up -d db

cd app
npm install
# pointer DATABASE_URL vers localhost (voir .env.example)
export DATABASE_URL=postgres://tricouture:change-me-please@localhost:5432/tricouture
npm run db:generate   # génère la migration depuis le schéma
npm run db:migrate    # applique
npm run dev
```

## Auto-hébergement

Guide complet pas-à-pas (prérequis, GPU, **Cloudflare Tunnel** + alternatives Tailscale/Caddy,
sauvegardes, app Android) : **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**.

## Application Android

Coque **Capacitor** (`mobile/`) qui charge ton serveur. Compilée par GitHub Actions
(workflow `Build Android APK`) — aucun SDK Android à installer en local. Voir
[docs/SELF-HOSTING.md §11](docs/SELF-HOSTING.md).

## Feuille de route / état

- ✅ **Phase 1 (socle)** — auth multi-user, patrons + upload + recherche plein-texte,
  stock (laine/tissu/mercerie/outils), projets + **Kanban** drag & drop, compteur de rangs.
- ✅ **Phase 2 (motivation)** — calendrier d'échéances + prédiction « finiras-tu à temps ? »,
  « Mon année en mailles » + badges, objectifs/défis, bacs de rangement **QR**, destinataires.
- ✅ **Phase 3 (IA texte, Ollama)** — traduction de patrons, copilote sur patron, génération
  de patron. Endpoints `/api/ai/*`, services activés via `docker-compose.gpu.yml`.
- ✅ **Phase 4-5 (IA vision/voix)** — service `vision` (OCR étiquette → fiche laine),
  service `whisper` (compteur de rangs **vocal**). Aperçu coloris (Stable Diffusion) : à venir.

Détail dans le plan d'implémentation.
