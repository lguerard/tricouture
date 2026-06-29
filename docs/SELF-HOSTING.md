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

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Cela ajoute :
- **ollama** — modèles de texte (traduction, copilote, génération de patron) ;
- **ollama-pull** — télécharge les modèles au 1er démarrage (`qwen2.5:7b` + `nomic-embed-text`),
  puis s'arrête ;
- **vision** — OCR d'étiquettes de pelote (EasyOCR) ;
- **whisper** — transcription vocale (compteur de rangs mains-libres).

> Premier démarrage long : téléchargement des modèles (plusieurs Go) et build des images
> PyTorch. Surveille avec `docker compose logs -f ollama-pull vision whisper`.

### 6.3 Notes VRAM (RTX 3080 = 10 Go)

- `qwen2.5:7b` quantifié ≈ 5–6 Go ; `nomic-embed-text` ≈ 0,3 Go.
- Ollama décharge les modèles inactifs automatiquement.
- vision et whisper chargent leurs modèles à la première requête. Si tu veux limiter la
  pression mémoire, utilise les services un par un (ils ne tournent à fond que pendant l'usage).
- Pour changer de modèle : `OLLAMA_CHAT_MODEL=llama3.1:8b` dans `.env`, puis relance.

> Si `OLLAMA_URL` est vide dans `.env`, les boutons d'IA affichent un message clair au lieu
> de planter : le socle reste pleinement utilisable.

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
   - *Public hostname* : `tricouture.mondomaine.fr`
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
   ORIGIN=https://tricouture.mondomaine.fr
   ```
   puis `docker compose ... up -d` à nouveau pour recharger l'app.

5. Ouvre `https://tricouture.mondomaine.fr` — c'est en ligne, en HTTPS, sans avoir ouvert le
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
tricouture.mondomaine.fr {
    reverse_proxy app:3000
}
```

Ajoute un service Caddy au compose (image `caddy:2`), monte le `Caddyfile`, expose `80:80`
et `443:443`, et mets `ORIGIN=https://tricouture.mondomaine.fr`. Inconvénient : il faut ouvrir
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

### Compiler l'APK

1. Pousse le dépôt sur GitHub.
2. (Recommandé) Définis l'URL de ton serveur : *Settings → Secrets and variables → Actions →
   Variables → New variable* : nom `SERVER_URL`, valeur `https://tricouture.mondomaine.fr`.
3. Lance le workflow : onglet *Actions* → **Build Android APK** → *Run workflow*
   (tu peux y saisir l'URL à la volée si tu n'as pas créé la variable).
   Un tag `v*` (`git tag v0.1.0 && git push --tags`) déclenche aussi le build.
4. Récupère l'artefact **`tricouture-android-debug`** (contient `app-debug.apk`).

### Installer sur le téléphone

1. Transfère `app-debug.apk` sur le téléphone (câble, Drive, etc.).
2. Ouvre-le : Android demandera d'**autoriser l'installation depuis cette source** → accepte.
3. Au lancement : si `SERVER_URL` était défini, l'app se connecte directement ; sinon, elle
   affiche un champ pour saisir l'URL de ton serveur (mémorisée ensuite).

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
| Scan/voix sans effet | services `vision`/`whisper` non prêts | `docker compose logs -f vision whisper` |
| APK ne se connecte pas | mauvaise URL / HTTP bloqué | vérifier `SERVER_URL`, préférer HTTPS |
