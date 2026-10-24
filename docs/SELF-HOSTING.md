# Guide d'auto-hébergement de Tricouture

Ce guide explique, étape par étape, comment installer Tricouture sur ton propre serveur,
activer l'IA locale (GPU), l'exposer sur Internet en toute sécurité (avec **Cloudflare Tunnel**
ou une alternative), faire des sauvegardes, et installer l'application Android.

Aucune connaissance avancée n'est requise : suis les sections dans l'ordre.

---

## 1. Prérequis

Sur la machine serveur (ton i9-9900K + RTX 3080 convient parfaitement) :

| Élément | Pourquoi | Comment vérifier |
|---|---|---|
| **Docker Engine** + **Docker Compose v2** | exécute l'application | `docker --version` et `docker compose version` |
| **Git** | récupérer le code | `git --version` |
| (GPU/IA) **Pilote NVIDIA** | accélération IA | `nvidia-smi` |
| (GPU/IA) **nvidia-container-toolkit** | donne le GPU aux conteneurs | voir §6 |

> Le **socle** (patrons, stock, projets, Kanban, motivation) fonctionne **sans GPU**.
> Le GPU n'est nécessaire que pour les fonctions d'IA (traduction, copilote, scan, voix).

### Installer Docker (Ubuntu / Debian)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # se déconnecter/reconnecter ensuite
```

---

## 2. Récupérer le code

```bash
git clone <URL_DU_DEPOT> tricouture
cd tricouture
```

---

## 3. Configurer l'environnement (`.env`)

Copie le modèle puis édite-le :

```bash
cp .env.example .env
nano .env
```

Renseigne au minimum :

```ini
POSTGRES_USER=tricouture
POSTGRES_PASSWORD=<un mot de passe long et aléatoire>
POSTGRES_DB=tricouture
DATABASE_URL=postgres://tricouture:<le_même_mot_de_passe>@db:5432/tricouture

# Adresse publique finale (voir §7). En local au début :
ORIGIN=http://localhost:3000

# Secret de session — génère-le :
AUTH_SECRET=<colle ici le résultat de: openssl rand -hex 32>
```

Génère les secrets :

```bash
openssl rand -hex 32      # -> AUTH_SECRET
openssl rand -base64 24   # -> POSTGRES_PASSWORD (puis recopie dans DATABASE_URL)
```

> ⚠️ `ORIGIN` doit correspondre à l'URL réellement utilisée par les navigateurs (sinon
> les cookies de session et les formulaires seront rejetés). On le met à jour en §7.

### Configurer l'URL publique (Docker)

L'URL de ton instance est **lue au runtime** depuis la variable d'environnement
`ORIGIN` (jamais codée en dur dans l'image). Trois façons de la définir :

1. **Dans `.env`** (recommandé) — le `docker-compose.yml` l'injecte dans le
   conteneur `app` :

   ```ini
   # .env
   ORIGIN=https://tricouture.exemple.fr
   ```

2. **À la volée** sur la ligne de commande :

   ```bash
   ORIGIN=https://tricouture.exemple.fr docker compose up -d
   ```

3. **En dur dans le compose** (déconseillé) — sous `services.app.environment`.

Après modification, recharge le conteneur :

```bash
docker compose up -d        # relit .env et recrée le conteneur app
```

- En **local**, garde `http://localhost:3000`.
- En **production**, mets l'URL HTTPS publique (le cookie de session passe
  alors automatiquement en `Secure`).
- L'**app Android** ne dépend pas de `ORIGIN` : elle demande son URL au premier
  lancement (ou via la variable d'Actions `SERVER_URL`, voir §11).

---

## 4. Démarrer le socle

```bash
docker compose up -d --build
```

Ce qui se passe :
1. Postgres démarre (image `pgvector/pgvector:pg16`).
2. Le conteneur `app` se construit, **applique les migrations automatiquement** (extension
   `vector` activée + tables créées), puis lance le serveur.

Vérifie :

```bash
docker compose ps          # les deux services doivent être "running"/"healthy"
docker compose logs -f app # doit afficher "Migrations appliquées."
```

Ouvre **http://localhost:3000** (ou `http://IP_DU_SERVEUR:3000` depuis le réseau local).

---

## 5. Créer le premier compte

Va sur `/register`. **Le tout premier compte créé devient administrateur.**
Crée ensuite les comptes des autres membres du foyer si besoin (multi-utilisateur natif).

### 5.1 Changer un mot de passe

*Mon compte* dans le menu latéral : mot de passe actuel + nouveau mot de passe
(8 caractères minimum). Les autres appareils sont déconnectés, le navigateur
courant reste connecté.

### 5.2 Réinitialiser un mot de passe oublié

Il n'y a **pas de SMTP** sur un serveur auto-hébergé, donc pas d'e-mail de
réinitialisation. À la place, un administrateur génère un **lien à usage
unique** (valable 24 h) depuis *Utilisateurs* → **Lien de réinitialisation**,
et le transmet par le canal de son choix (Signal, SMS, de vive voix…). Le lien
n'est affiché qu'une fois.

Si **plus aucun administrateur** ne peut se connecter, le déblocage se fait
depuis le serveur :

```bash
# lister les comptes existants
docker compose exec app node scripts/reset-password.js

# générer un lien de réinitialisation à usage unique
docker compose exec app node scripts/reset-password.js toi@exemple.fr

# ou fixer directement un nouveau mot de passe
docker compose exec app node scripts/reset-password.js toi@exemple.fr 'nouveau-mdp'
```

Le lien imprimé utilise `ORIGIN` : vérifie que cette variable pointe bien sur
l'URL publique, sinon le lien affiché ne sera pas ouvrable depuis l'extérieur.

---

## 6. Activer l'IA locale (GPU) — optionnel

### 6.1 Installer le toolkit NVIDIA pour conteneurs

```bash
# Ubuntu/Debian
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Test : `docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi`

### 6.2 Lancer avec les services IA

L'override `docker-compose.gpu.yml` ajoute les sidecars GPU. Pour le LLM (Ollama), deux modes
au choix — **un seul Ollama par GPU** : deux instances gardent chacune leur propre copie du
modèle (~8 Go) en VRAM, ce qu'une carte de 10 Go ne supporte pas.

#### Mode A — Ollama fourni par cet override (profil `local-ollama`)

Si aucun autre Ollama ne tourne sur la machine :

```bash
# dans .env
COMPOSE_PROFILES=local-ollama
OLLAMA_URL=http://ollama:11434

docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Le profil active :
- **ollama** — modèles de texte et d'image (traduction, copilote, génération de patron,
  scan d'étiquette), image épinglée sur une version précise (voir le commentaire dans
  `docker-compose.gpu.yml` pour la mettre à jour) et réglée pour économiser la VRAM
  (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_MAX_LOADED_MODELS=2`
  pour garder le petit modèle d'embedding à côté du modèle de chat,
  `OLLAMA_KEEP_ALIVE=5m`, `OLLAMA_CONTEXT_LENGTH` = `OLLAMA_NUM_CTX`) ;
- **ollama-pull** — télécharge les modèles au 1er démarrage (`gemma4:12b` + `nomic-embed-text`),
  puis s'arrête.

#### Mode B — réutiliser un Ollama existant (recommandé si le GPU en a déjà un)

Si un autre stack fait déjà tourner Ollama sur ce GPU (par ex. celui d'une autre app),
laisse le profil `local-ollama` **désactivé** (pas de `COMPOSE_PROFILES`, ou sans
`local-ollama`) et pointe `OLLAMA_URL` vers cet Ollama. Rien dans l'override ne dépend du
service `ollama`, l'app démarre donc sans lui.

- Ollama publié sur le host (port 11434) :
  ```
  OLLAMA_URL=http://host.docker.internal:11434
  ```
  avec, dans un `docker-compose.override.yml` :
  ```yaml
  services:
    app:
      extra_hosts:
        - "host.docker.internal:host-gateway"
  ```
- Ollama sur le réseau Docker d'un autre stack (sans port publié) : rattache l'app à ce
  réseau dans `docker-compose.override.yml` (nom du réseau : `docker network ls`) :
  ```yaml
  services:
    app:
      networks: [default, autre_stack]
  networks:
    autre_stack:
      external: true
      name: autrestack_default   # nom réel du réseau
  ```
  puis `OLLAMA_URL=http://ollama:11434` (nom du service/conteneur Ollama sur ce réseau).

Ensuite :
- télécharge les modèles sur cet Ollama : `docker exec <conteneur-ollama> ollama pull gemma4:12b`
  puis `... ollama pull nomic-embed-text` ;
- garde **le même `OLLAMA_NUM_CTX`** (8192 par défaut) que les autres apps qui l'utilisent :
  Ollama recharge le modèle à chaque changement de taille de contexte entre deux requêtes ;
- les réglages VRAM (flash attention, cache KV, keep-alive, nombre de modèles chargés) se
  font alors sur **cet** Ollama, pas ici.

Dans les deux modes, l'override ajoute aussi :
- **whisper** — transcription vocale (compteur de rangs mains-libres), modèle
  `WHISPER_MODEL` (`large-v3-turbo` par défaut), téléchargé à la 1re requête dans le volume
  `whisper-cache`.

Le scan d'étiquette de pelote et le motif d'une photo passent par le modèle de chat
(`OLLAMA_CHAT_MODEL`, qui doit accepter les images — c'est le cas de `gemma4:12b`) ; la
couleur dominante d'une photo est calculée par l'app elle-même, sans GPU. L'ancien service
`vision` (EasyOCR) n'existe plus : `VISION_URL` peut être retiré du `.env` (ignoré sinon).

> Premier démarrage long : téléchargement des modèles (plusieurs Go) et build des images
> PyTorch. Surveille avec `docker compose logs -f ollama-pull whisper`.

### 6.3 Notes VRAM (RTX 3080 = 10 Go)

- `gemma4:12b` (Gemma 4 12B, texte + image) ≈ 8 Go de poids ; `nomic-embed-text` ≈ 0,3 Go.
  C'est le plus gros poste : sur une carte de 10 Go partagée avec d'autres services, il
  ne reste pas de place pour un second LLM chargé en même temps.
- Ollama décharge les modèles inactifs automatiquement.
- whisper charge son modèle (~1-1,5 Go) à la première requête et le libère après
  `WHISPER_IDLE_UNLOAD_SECONDS` (300 s par défaut) sans requête ; la 1re commande vocale après
  une pause attend donc quelques secondes le rechargement.
- Pour changer de modèle : `OLLAMA_CHAT_MODEL=qwen3:8b` (par exemple) dans `.env`, puis relance.
- Recherche par le sens : l'app note quel modèle d'embedding (`OLLAMA_EMBED_MODEL`) et quels
  préfixes ont produit les vecteurs stockés. Si ça change (autre modèle, ou mise à jour de
  l'app), les anciens vecteurs sont effacés au premier usage et la page *Mon compte* propose
  de réindexer (bouton existant) ; chaque patron/laine modifié est aussi réindexé.

> Si `OLLAMA_URL` est vide dans `.env`, les boutons d'IA affichent un message clair au lieu
> de planter : le socle reste pleinement utilisable.

### 6.4 Évaluer un modèle (optionnel)

Tricouture sait noter un modèle Ollama sur **ses propres tâches IA**, avec ses
prompts, ses requêtes (`think: false`, même `num_ctx`, schéma JSON,
température 0) et ses analyseurs de production :

| Tâche | Cas tirés de la base | Note |
|---|---|---|
| `label` | laines avec une photo et au moins 3 champs d'étiquette remplis | marque, nom, coloris, composition, grosseur, métrage, poids |
| `pieces` | patrons avec texte extrait et pièces enregistrées | pièces retrouvées, rangs et quantités |
| `pattern_info` | patrons avec texte extrait et au moins 3 infos remplies | type, créateur·rice, langue, difficulté, tailles, jauge, métrage |
| `translation` | extraits de patrons en anglais | nombres et termes de tricot conservés, sortie en français |

Les fiches modifiées après leur création passent en premier, puis les plus
récentes, 12 par tâche au plus. Une tâche avec moins de 3 cas en base est
complétée par des cas fournis (`app/src/lib/server/ai/model-eval/cases.ts`).

Le point d'accès, protégé par `MODEL_WATCH_TOKEN` (vide = désactivé) :

```bash
docker compose exec app sh -c 'wget -qO- --header "Authorization: Bearer $MODEL_WATCH_TOKEN" \
  --header "Content-Type: application/json" --post-data "{\"model\":\"gemma4:12b\",\"dry\":true}" \
  http://localhost:3000/api/cron/model-eval'
```

`dry: true` compte les cas sans appeler le modèle ; sans lui, la réponse
(quelques minutes) donne une note sur 100 par tâche et la vitesse mesurée.
Le modèle doit déjà être dans Ollama : c'est la **veille des modèles** du
dépôt `server_setup` (service `model-watch`) qui découvre, télécharge et
compare les modèles chaque mois, pour Popote, Paperless et Tricouture à la fois.

---

## 7. Exposer sur Internet en toute sécurité

Trois options, de la plus recommandée à la plus manuelle. **Choisis-en une.**

### Option A — Cloudflare Tunnel (recommandé) 🥇

Avantages : **aucun port à ouvrir** sur ta box, HTTPS automatique, ton IP reste cachée,
protection Cloudflare devant. Idéal derrière une box grand public / CGNAT.

Prérequis : un nom de domaine géré par Cloudflare (gratuit). Place ton domaine sur Cloudflare
(change les serveurs DNS chez ton registrar pour ceux indiqués par Cloudflare).

**Étapes :**

1. **Crée un tunnel** dans le dashboard Cloudflare → *Zero Trust* → *Networks* → *Tunnels* →
   *Create a tunnel* → *Cloudflared*. Donne-lui un nom (ex. `tricouture`). Cloudflare te
   fournit un **token**.

2. **Configure le routage public** dans l'assistant du tunnel :
   - *Public hostname* : `tricouture.exemple.fr`
   - *Service* : `HTTP://app:3000`
   (le tunnel tourne dans le même réseau Docker que l'app, il joint donc `app:3000`.)

3. **Ajoute le service `cloudflared`** via le fichier override fourni :

   `docker-compose.cloudflared.yml` est inclus. Mets ton token dans `.env` :

   ```ini
   CLOUDFLARE_TUNNEL_TOKEN=<le token fourni par Cloudflare>
   ```

   Puis lance (en ajoutant l'override à ta commande habituelle) :

   ```bash
   docker compose \
     -f docker-compose.yml \
     -f docker-compose.gpu.yml \
     -f docker-compose.cloudflared.yml \
     up -d
   ```

4. **Mets à jour `ORIGIN`** dans `.env` :

   ```ini
   ORIGIN=https://tricouture.exemple.fr
   ```
   puis `docker compose ... up -d` à nouveau pour recharger l'app.

5. Ouvre `https://tricouture.exemple.fr` — c'est en ligne, en HTTPS, sans avoir ouvert le
   moindre port. 🎉

> Bonus sécurité : dans *Zero Trust → Access*, tu peux exiger une authentification Cloudflare
> (email OTP, Google…) **devant** Tricouture, en plus du login applicatif.

### Option B — Tailscale (accès privé, le plus simple) 🥈

Si tu n'as **pas besoin d'un accès public** (juste toi + ta famille sur vos appareils),
Tailscale crée un réseau privé chiffré (WireGuard) sans rien exposer.

1. Crée un compte sur tailscale.com, installe Tailscale sur le serveur **et** sur ton téléphone :
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
2. Note l'IP Tailscale du serveur (ex. `100.x.y.z`) : `tailscale ip -4`.
3. Accède à `http://100.x.y.z:3000` depuis n'importe quel appareil connecté à ton Tailnet.
4. `ORIGIN=http://100.x.y.z:3000` dans `.env` (ou active **Tailscale HTTPS** /
   *MagicDNS* pour une vraie URL HTTPS `https://serveur.ton-tailnet.ts.net`).

C'est l'option la plus sûre pour un usage perso/familial : rien n'est public.

### Option C — Reverse proxy Caddy + redirection de port 🥉

Si tu as un domaine pointant sur ton IP publique et que tu peux **rediriger les ports 80/443**
de ta box vers le serveur, Caddy gère le HTTPS Let's Encrypt automatiquement.

`Caddyfile` minimal :

```caddy
tricouture.exemple.fr {
    reverse_proxy app:3000
}
```

Ajoute un service Caddy au compose (image `caddy:2`), monte le `Caddyfile`, expose `80:80`
et `443:443`, et mets `ORIGIN=https://tricouture.exemple.fr`. Inconvénient : il faut ouvrir
des ports (impossible derrière CGNAT) — d'où la préférence pour l'option A.

---

## 8. Sauvegardes

Deux choses à sauvegarder : **la base** et **les fichiers** (PDF/photos).

```bash
# Base de données (dump compressé daté)
docker compose exec -T db pg_dump -U tricouture tricouture | gzip > backup-$(date +%F).sql.gz

# Fichiers média (volume Docker)
docker run --rm -v tricouture_media:/data -v "$PWD":/backup alpine \
  tar czf /backup/media-$(date +%F).tar.gz -C /data .
```

**Restauration de la base :**

```bash
gunzip -c backup-AAAA-MM-JJ.sql.gz | docker compose exec -T db psql -U tricouture tricouture
```

Automatise via une tâche `cron` quotidienne pointant vers un script qui exécute les deux commandes.

---

## 9. Mises à jour

```bash
cd tricouture
git pull
docker compose up -d --build          # (+ -f docker-compose.gpu.yml si tu utilises l'IA)
```

Les migrations de base s'appliquent automatiquement au redémarrage du conteneur `app`.

---

## 10. Bonnes pratiques de sécurité

- **Change** `POSTGRES_PASSWORD` et `AUTH_SECRET` (jamais les valeurs d'exemple).
- Postgres **n'est pas exposé** à l'hôte (aucun `ports:` sur `db`) : ne l'ouvre pas.
- En production, `ORIGIN` doit être en **HTTPS** : le cookie de session passe alors en `Secure`.
- Garde Docker et les images à jour (`docker compose pull` régulièrement).
- Sauvegarde avant chaque mise à jour majeure.

---

## 11. Application Android

L'app Android est une **coque Capacitor** qui charge ton serveur. Elle se compile via GitHub
Actions (aucun environnement Android à installer en local).

> Par défaut, **aucune URL n'est codée en dur** : l'app demande l'adresse du
> serveur au premier lancement et la mémorise. Tu n'as donc rien à configurer
> pour compiler une APK générique.

### Compiler l'APK

1. Pousse le dépôt sur GitHub.
2. Lance le workflow : onglet *Actions* → **Build Android APK** → *Run workflow*.
   Un tag déclenche aussi le build via la release.
3. Récupère l'artefact **`tricouture-android-debug`** (contient `app-debug.apk`).

> Optionnel — figer l'URL au build : *Settings → Secrets and variables →
> Actions → Variables → New variable*, nom `SERVER_URL`, valeur
> `https://tricouture.exemple.fr`. Cette variable reste privée (elle n'est pas
> versionnée). Sans elle, l'app affiche l'écran de saisie d'URL.

### Installer sur le téléphone

1. Transfère `app-debug.apk` sur le téléphone (câble, Drive, etc.).
2. Ouvre-le : Android demandera d'**autoriser l'installation depuis cette source** → accepte.
3. Au lancement, **saisis l'URL de ton serveur** (mémorisée ensuite). Si
   `SERVER_URL` avait été défini au build, l'app se connecte directement.

> La caméra (scan d'étiquette) et le micro (compteur vocal) demanderont une autorisation au
> premier usage. L'APK debug n'est pas signé pour le Play Store : c'est une installation
> directe (« sideload »), parfaite pour un usage personnel/familial.

---

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `app` redémarre en boucle | DB pas prête / `DATABASE_URL` faux | vérifier `.env`, `docker compose logs db` |
| Page blanche après login distant | `ORIGIN` ≠ URL réelle | corriger `ORIGIN`, `up -d` |
| Boutons IA → « service indisponible » | GPU non lancé / `OLLAMA_URL` vide | lancer l'override `gpu`, vérifier `nvidia-smi` |
| `nvidia-smi` KO dans un conteneur | toolkit non installé | refaire §6.1 |
| Scan d'étiquette en échec | `OLLAMA_CHAT_MODEL` sans entrée image, ou Ollama non prêt | utiliser un modèle multimodal (`gemma4:12b`), `docker compose logs -f ollama` |
| Voix sans effet | service `whisper` non prêt | `docker compose logs -f whisper` |
| APK ne se connecte pas | mauvaise URL / HTTP bloqué | vérifier `SERVER_URL`, préférer HTTPS |
