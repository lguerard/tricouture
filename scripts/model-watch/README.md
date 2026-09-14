# Surveillance mensuelle des modèles Ollama

Vérifie une fois par mois si un nouveau modèle Ollama ferait mieux que celui
utilisé pour l'analyse des pièces de patron (`OLLAMA_CHAT_MODEL`), tout en
tenant dans la VRAM du GPU. Si oui, bascule dessus automatiquement et
t'envoie un rapport (email si configuré, sinon fichier local) ; sinon,
t'envoie un rapport "rien de nouveau".

## Comment ça marche

1. `check-model.sh` (ce dossier, lancé sur le HOST via cron) :
   - mesure la VRAM totale du GPU en direct (`nvidia-smi`), moins une marge
     de sécurité (`MODEL_WATCH_VRAM_HEADROOM_GB`) ;
   - démarre l'évaluation via l'app elle-même : `POST /api/cron/model-watch`
     (authentifié par `MODEL_WATCH_TOKEN`, pas par une session — ce point
     n'a aucun sens depuis un navigateur, seulement depuis ce script) ;
   - un run complet peut prendre plus d'une heure (plusieurs modèles à
     télécharger, un par un), largement plus qu'une requête HTTP ne devrait
     rester ouverte : le script ne fait donc que démarrer le run, puis sonde
     `GET /api/cron/model-watch` toutes les 30 s jusqu'à ce qu'il soit fini.
2. Le run lui-même (`app/src/lib/server/ai/model-watch/`, exécuté **dans le
   processus de l'app**, seul endroit qui a le réseau vers Ollama et le vrai
   code d'extraction du projet) :
   - construit une liste de modèles candidats : une petite liste de familles
     reconnues (`candidates.ts:CURATED_FAMILIES`) plus une tentative de
     récupérer les nouveautés sur `ollama.com/library` (best effort — si le
     site a changé de structure, ça se dégrade juste vers la liste curée,
     sans planter) ;
   - pour chaque candidat, ne garde que la plus grosse variante qui tient
     dans le budget VRAM, d'après la taille **réelle** du manifest Ollama
     (pas une estimation à partir du nombre de paramètres) ;
   - télécharge (`ollama pull`) le modèle actuel et chaque candidat, puis
     fait tourner **le même prompt système et le même parsing JSON que la
     vraie app** (`PIECES_SYSTEM` / `piecesPrompt` / `parsePieces`) sur 3
     patrons de test (`cases.ts` : un tricot propre, une couture façon PDF
     scrapé avec en-têtes/pieds de page, un crochet façon transcription
     orale) ;
   - note chaque extraction avec `scoring.ts` (liste de pièces exploitable,
     bonnes pièces trouvées, nombre de pièces plausible, et — le point de
     cette fonctionnalité — le bon nombre de rangs ou la bonne quantité à
     couper sur la bonne pièce) ;
   - un candidat "gagne" s'il dépasse le score du modèle actuel d'au moins
     `MODEL_WATCH_MIN_IMPROVEMENT` points (5 par défaut, pour éviter de
     changer de modèle sur du bruit de mesure) ;
   - supprime (`ollama rm`) les candidats testés qui n'ont pas gagné, pour ne
     pas accumuler des dizaines de Go de modèles inutilisés. **Le modèle
     précédent n'est PAS supprimé** en cas de changement, pour que revenir
     en arrière soit instantané (pas besoin de re-télécharger).
3. `check-model.sh` lit le résultat final. S'il y a un gagnant :
   - modifie `OLLAMA_CHAT_MODEL=` dans `.env` ;
   - `docker compose up -d --no-deps app` (recrée le conteneur avec la
     nouvelle variable d'env — un simple `restart` ne suffit pas, Compose ne
     relit `.env` qu'à la création du conteneur).
4. `send-report.mjs` envoie le rapport par email (SMTP, voir plus bas) et en
   garde toujours une copie locale dans `reports/YYYY-MM-DD.txt`, même si
   l'email échoue.

## Revenir en arrière si le nouveau modèle déçoit

Le rapport de changement donne toujours l'ancien modèle. Pour revenir :
```
# Dans .env :
OLLAMA_CHAT_MODEL=<ancien modèle indiqué dans le rapport>
# Puis :
docker compose up -d --no-deps app
```
Le modèle précédent est toujours installé localement (non supprimé lors d'un
changement), donc ce redémarrage est immédiat.

## Installation

1. Générer un jeton et le mettre dans `.env` (`MODEL_WATCH_TOKEN`) :
   ```
   openssl rand -hex 32
   ```
   C'est ce qui protège `/api/cron/model-watch` — sans lui, la route répond
   503 et le run ne démarre jamais.
2. (optionnel) Configurer l'envoi d'email dans `.env` (voir la section
   "Surveillance mensuelle des modèles" de `.env.example`) —
   `MODEL_WATCH_SMTP_HOST` et `MODEL_WATCH_SMTP_TO` au minimum. Sans ça, le
   rapport est seulement écrit dans `scripts/model-watch/reports/`.
3. Vérifier que `jq` et `node` sont installés sur le host (`apt install jq
   nodejs`) — en plus de `docker`, `curl`, `awk` et `nvidia-smi`, déjà
   nécessaires pour le reste de l'auto-hébergement.
4. `docker compose up -d` pour que l'app reprenne `MODEL_WATCH_TOKEN` (ajouté
   à son environnement dans `docker-compose.yml`).
5. Ajouter une tâche cron (voir `crontab.example`, chemin à adapter) :
   `crontab -e` puis coller la ligne.
6. Tester manuellement avant de laisser tourner en cron — ça peut prendre du
   temps la première fois (téléchargement de plusieurs modèles) :
   ```
   ./scripts/model-watch/check-model.sh
   ```

## Limites à connaître

- Le "score" est une heuristique déterministe (pas un jugement par un autre
  LLM) : il mesure ce qui compte pour CETTE app (pièces exploitables, bons
  noms, bon nombre de rangs/quantité), pas une qualité générale du modèle.
  Un modèle peut être meilleur "en général" sans gagner ici, et inversement.
- La découverte de nouveaux modèles sur ollama.com est un scraping HTML
  best-effort : si le site change de structure, ça se dégrade silencieusement
  vers la liste curée (un avertissement apparaît dans le rapport).
- Chaque run peut télécharger plusieurs Go par candidat testé — surveiller
  `MODEL_WATCH_MAX_CANDIDATES` si la bande passante ou le disque sont
  limités.
- L'estimation VRAM (taille du manifest × 1.15 + 0.5 Go) est une marge
  raisonnable mais pas une garantie absolue ; `MODEL_WATCH_VRAM_HEADROOM_GB`
  existe pour ajuster la prudence. Elle ne tient pas compte de vision/
  whisper/sd s'ils tournent en même temps sur le même GPU — lance plutôt le
  check quand ils sont inactifs (cron de nuit, par défaut).
- `/api/cron/model-watch` n'exécute qu'un run à la fois (un deuxième
  `POST` pendant qu'un run est en cours répond `alreadyRunning: true` sans
  rien démarrer de plus) ; le résultat d'un run vit en mémoire dans le
  processus de l'app, donc un redémarrage de l'app pendant un run le perd.
