# 🪡 Tricouture

Application web **auto-hébergée** pour gérer ses patrons de **couture, tricot
et crochet**, son stock de matières, ses projets (avec tableau Kanban), et bien
plus — le tout dopé par de l'**IA locale** (GPU) et accompagné d'une **app
Android**.

> Pensée pour tourner chez soi, sans cloud : tes patrons et tes données restent
> sur ton serveur.

---

## Sommaire

1. [Aperçu](#aperçu)
2. [Fonctionnalités](#fonctionnalités)
3. [Captures d'écran](#captures-décran)
4. [Architecture](#architecture)
5. [Prérequis](#prérequis)
6. [Démarrage rapide](#démarrage-rapide)
7. [Configuration](#configuration)
8. [IA locale (GPU)](#ia-locale-gpu)
9. [Multi-utilisateur et partage](#multi-utilisateur-et-partage)
10. [Application Android](#application-android)
11. [Exposer sur Internet](#exposer-sur-internet)
12. [Développement](#développement)
13. [Versions et releases](#versions-et-releases)
14. [Feuille de route](#feuille-de-route)

---

## Aperçu

Tricouture centralise tout ce dont une personne qui coud, tricote ou crochète a
besoin :

- une **bibliothèque de patrons** (PDF/images) avec recherche dans le contenu ;
- un **inventaire** de laine, tissu, mercerie et outils ;
- un **suivi de projets** (Kanban, compteur de rangs, prédiction d'échéance) ;
- une **couche de motivation** (statistiques annuelles, objectifs, succès) ;
- un **assistant IA** local (traduction de patrons, copilote, génération).

---

## Fonctionnalités

### Patrons

- Upload de fichiers **PDF et images**, visionneuse intégrée.
- **Recherche plein-texte française** dans le contenu des PDF.
- Métadonnées riches : discipline, type, difficulté, jauge, métrage, tags.
- **Copilote IA** par patron (questions, recalculs de taille).
- **Partage** entre comptes (voir [section dédiée](#multi-utilisateur-et-partage)).

### Stock

- Laine (marque, coloris, bain, fibre, métrage, photo), tissu, mercerie, outils.
- **Scan d'étiquette** : photo → fiche pré-remplie (OCR).
- Suivi des outils occupés par un projet.

### Projets

- **Tableau Kanban** glisser-déposer (Idée → En cours → Bloqué → Terminé).
- **Compteur de rangs** (boutons + **commande vocale** mains-libres).
- **Prédiction d'échéance** basée sur la vitesse réelle.
- Suivi du temps, du coût et des **économies** vs prêt-à-porter.

### Motivation

- **« Mon année en mailles »** : mètres, heures, projets, économies.
- **Calendrier** des échéances (idéal cadeaux).
- **Objectifs / défis** avec progression.
- **Succès façon Steam/Xbox** : paliers bronze→platine, points, déblocage.
- **Bacs de rangement à QR**, profils destinataires.

### IA locale (sur GPU)

- **Traduction** de patrons EN/JP/DE → FR (glossaire tricot/crochet).
- **Copilote** et **génération de patron**.
- **OCR** d'étiquettes, **transcription vocale** (compteur mains-libres).

---

## Captures d'écran

> Les images sont générées par
> [`scripts/capture-screenshots.mjs`](scripts/capture-screenshots.mjs)
> (voir [docs/screenshots](docs/screenshots/README.md)). Lance-le après
> `docker compose up` pour les produire/mettre à jour.

| Tableau de bord | Patrons |
| --- | --- |
| ![Tableau de bord](docs/screenshots/dashboard.png) | ![Patrons](docs/screenshots/patterns.png) |

| Kanban des projets | Stock |
| --- | --- |
| ![Kanban](docs/screenshots/kanban.png) | ![Stock](docs/screenshots/stash.png) |

| Mon année en mailles | Succès |
| --- | --- |
| ![Statistiques](docs/screenshots/stats.png) | ![Succès](docs/screenshots/achievements.png) |

| Assistant IA | Calendrier |
| --- | --- |
| ![Assistant](docs/screenshots/assistant.png) | ![Calendrier](docs/screenshots/calendar.png) |

---

## Architecture

```text
┌─────────────┐     ┌────────────────────┐
│  Navigateur │     │   App Android       │
│   / PWA     │     │   (Capacitor)       │
└──────┬──────┘     └─────────┬──────────┘
       │  HTTPS                │  HTTPS (Bearer)
       └───────────┬──────────┘
                   ▼
        ┌────────────────────┐   ┌──────────────────┐
        │  app (SvelteKit)   │──▶│ db (Postgres +   │
        │  UI + API + auth   │   │     pgvector)    │
        └─────────┬──────────┘   └──────────────────┘
                  │ (optionnel, GPU)
     ┌────────────┼─────────────┐
     ▼            ▼             ▼
 ┌────────┐  ┌─────────┐   ┌──────────┐
 │ ollama │  │ vision  │   │ whisper  │
 │ (LLM)  │  │ (OCR)   │   │ (STT)    │
 └────────┘  └─────────┘   └──────────┘
```

- **Frontend + backend** : SvelteKit (adapter-node), une seule base de code,
  réutilisée par l'app Android.
- **Base** : PostgreSQL 16 + `pgvector` (relationnel + recherche sémantique).
- **ORM** : Drizzle (migrations appliquées au démarrage).
- **IA** : sidecars Docker activés à la demande (voir plus bas).

---

## Prérequis

| Élément | Nécessaire pour |
| --- | --- |
| Docker Engine + Compose v2 | tout |
| Git | récupérer le code |
| Pilote NVIDIA + nvidia-container-toolkit | IA (optionnel) |

Le socle fonctionne **sans GPU**. Le GPU n'est requis que pour l'IA.

---

## Démarrage rapide

```bash
git clone git@github.com:lguerard/tricouture.git
cd tricouture
cp .env.example .env
# éditer .env : mot de passe Postgres + AUTH_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

Ouvre <http://localhost:3000> puis crée ton compte sur `/register`
(le **premier compte créé devient administrateur**).

> Les migrations de base sont appliquées automatiquement au démarrage.

---

## Configuration

Variables principales du fichier `.env` :

| Variable | Description |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | identifiants base |
| `DATABASE_URL` | URL de connexion (host = `db`) |
| `ORIGIN` | URL publique réelle (doit correspondre au navigateur) |
| `AUTH_SECRET` | secret de session (`openssl rand -hex 32`) |
| `OLLAMA_URL` | URL du LLM (vide = IA désactivée proprement) |
| `OLLAMA_CHAT_MODEL` / `OLLAMA_EMBED_MODEL` | modèles utilisés |
| `VISION_URL` / `WHISPER_URL` | sidecars IA vision/voix |
| `CLOUDFLARE_TUNNEL_TOKEN` | exposition via Cloudflare (optionnel) |

---

## IA locale (GPU)

Lance l'application avec les services IA :

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Cela ajoute `ollama` (LLM), `vision` (OCR) et `whisper` (voix). Les modèles
sont téléchargés au premier démarrage. Détails (toolkit NVIDIA, VRAM, modèles)
dans le [guide d'auto-hébergement](docs/SELF-HOSTING.md#6-activer-lia-locale-gpu--optionnel).

---

## Multi-utilisateur et partage

Tricouture est **multi-utilisateur** par conception :

- chaque ressource (patron, laine, projet, succès…) porte un `owner_id` ;
- toutes les requêtes filtrent par utilisateur connecté : **personne ne voit
  les données d'un autre par défaut** ;
- l'authentification accepte un **cookie** (web) ou un **jeton Bearer** (mobile).

**Partage de patrons :** le propriétaire d'un patron peut l'activer en
**« Partagé »** depuis sa page. Les autres comptes le voient alors dans
*Patrons → Partagés avec moi*, peuvent l'ouvrir et **consulter/télécharger ses
fichiers** (la route média autorise la lecture des fichiers d'un patron
partagé). La **suppression** et la **modification du partage** restent
réservées au propriétaire.

> Statut : logique validée par la vérification de types et la compilation.
> Un test de bout en bout nécessite une instance lancée (Postgres) — voir
> [Développement](#développement).

---

## Application Android

L'app est une **coque Capacitor** (`mobile/`) qui charge ton serveur. Elle est
compilée par **GitHub Actions** — aucun SDK Android à installer en local.

1. (Recommandé) définis la variable de dépôt **`SERVER_URL`**
   (*Settings → Actions → Variables*), ex. `https://tricouture.exemple.fr`.
2. Onglet *Actions* → **Build Android APK** → *Run workflow*
   (ou un tag déclenche la [release](#versions-et-releases)).
3. Récupère l'artefact `tricouture-android-debug` (`app-debug.apk`),
   installe-le sur le téléphone (autoriser les sources inconnues).

Si `SERVER_URL` n'est pas définie, l'app demande l'URL au premier lancement.

---

## Exposer sur Internet

Guide complet (pas-à-pas) : **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**.

- **Cloudflare Tunnel** (recommandé) — aucun port à ouvrir, HTTPS auto.
- **Tailscale** — accès privé chiffré (famille).
- **Caddy** — reverse proxy + Let's Encrypt.

### Sous-domaine ou sous-chemin ?

Le plus simple est un **sous-domaine** (ex. `tricouture.exemple.fr`) :
aucune configuration supplémentaire, compatible directement avec le tunnel
Cloudflare.

Héberger sous un **sous-chemin** (ex. `exemple.fr/tricouture`) nécessite de
définir `paths.base` dans SvelteKit et de reconstruire. Si tu veux cette
option, ouvre une demande : elle implique une adaptation des liens internes.

---

## Développement

```bash
# Base seule via Docker
docker compose up -d db

cd app
npm install
export DATABASE_URL=postgres://tricouture:change-me-please@localhost:5432/tricouture
npm run db:migrate     # applique les migrations
npm run dev            # http://localhost:5173

npm run check          # vérification de types (svelte-check)
npm run build          # build de production
```

Conventions de contribution : voir le format de commits dans `AGENTS.md`
(commits conventionnels, travail sur `dev`, merge sur `main`).

---

## Versions et releases

Chaque **push sur `main`** déclenche le workflow *Release* :

1. [git-cliff](https://git-cliff.org) calcule la version et le changelog à
   partir des commits conventionnels (`cliff.toml`) ;
2. l'**APK Android** est recompilé ;
3. une **GitHub Release** est publiée (tag, notes, APK attaché).

---

## Feuille de route

- ✅ Socle (patrons, stock, projets, Kanban)
- ✅ Motivation (stats, objectifs, succès, calendrier)
- ✅ IA texte (traduction, copilote, génération)
- ✅ IA vision/voix (OCR étiquette, compteur vocal)
- ✅ App Android (Capacitor) + CI release
- ⏳ Aperçu coloris (Stable Diffusion)
- ⏳ Recherche sémantique (peuplement des embeddings)
- ⏳ Mood boards, plugins natifs (code-barres, push)
