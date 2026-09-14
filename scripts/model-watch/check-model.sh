#!/usr/bin/env bash
# Verification mensuelle : un nouveau modele Ollama fait-il mieux que
# l'actuel, tout en tenant sur le GPU ? Voir scripts/model-watch/README.md.
#
# A lancer via cron depuis le HOST (a besoin de nvidia-smi pour mesurer la
# VRAM, et de docker compose pour redemarrer l'app si le modele change).
# Idempotent et sans argument.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

for bin in docker jq curl awk nvidia-smi node; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "model-watch: '$bin' est requis mais introuvable dans PATH" >&2
    exit 1
  fi
done

if [ ! -f .env ]; then
  echo "model-watch: .env introuvable dans $REPO_ROOT" >&2
  exit 1
fi

set -a
source .env
set +a

if [ -z "${MODEL_WATCH_TOKEN:-}" ]; then
  echo "model-watch: MODEL_WATCH_TOKEN absent de .env -- voir scripts/model-watch/README.md" >&2
  exit 1
fi

APP_URL="${MODEL_WATCH_APP_URL:-http://localhost:3000}"
HEADROOM="${MODEL_WATCH_VRAM_HEADROOM_GB:-1.0}"
OLD_MODEL="${OLLAMA_CHAT_MODEL:-qwen2.5:7b}"
echo "model-watch: modèle actuel = $OLD_MODEL"

VRAM_TOTAL_MIB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)"
VRAM_TOTAL_GB="$(awk -v m="$VRAM_TOTAL_MIB" 'BEGIN{printf "%.2f", m/1024}')"
VRAM_BUDGET_GB="$(awk -v t="$VRAM_TOTAL_GB" -v h="$HEADROOM" 'BEGIN{printf "%.2f", t-h}')"
echo "model-watch: VRAM totale ${VRAM_TOTAL_GB} Go -- budget candidats ${VRAM_BUDGET_GB} Go"

echo "model-watch: démarrage de l'évaluation…"
START_RESP="$(curl -sS -X POST "$APP_URL/api/cron/model-watch" \
  -H "Authorization: Bearer $MODEL_WATCH_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"vramTotalGb\":$VRAM_TOTAL_GB,\"vramBudgetGb\":$VRAM_BUDGET_GB}")"

if [ "$(echo "$START_RESP" | jq -r '.ok')" != "true" ]; then
  echo "model-watch: échec du démarrage : $(echo "$START_RESP" | jq -r '.error // "inconnu"')" >&2
  exit 1
fi

# Peut prendre bien plus d'une heure (plusieurs modeles a telecharger, un a
# la fois) : on sonde plutot que de garder une requete HTTP ouverte tout ce
# temps.
echo "model-watch: évaluation en cours (peut prendre longtemps -- téléchargement de modèles)…"
STATUS='{"running":true}'
while [ "$(echo "$STATUS" | jq -r '.running')" = "true" ]; do
  sleep 30
  STATUS="$(curl -sS "$APP_URL/api/cron/model-watch" -H "Authorization: Bearer $MODEL_WATCH_TOKEN")"
done

RESULT="$(echo "$STATUS" | jq -c '.result')"
OK="$(echo "$RESULT" | jq -r '.ok')"
if [ "$OK" != "true" ]; then
  echo "model-watch: échec de l'évaluation : $(echo "$RESULT" | jq -r '.error')" >&2
  node "$SCRIPT_DIR/send-report.mjs" --old-model "$OLD_MODEL" --new-model "$OLD_MODEL" --error "$(echo "$RESULT" | jq -r '.error')"
  exit 1
fi

WINNER="$(echo "$RESULT" | jq -r '.winner // empty')"
NEW_MODEL="$OLD_MODEL"

if [ -n "$WINNER" ] && [ "$WINNER" != "$OLD_MODEL" ]; then
  echo "model-watch: nouveau modèle retenu : $WINNER (ancien : $OLD_MODEL)"
  if grep -q '^OLLAMA_CHAT_MODEL=' .env; then
    sed -i.bak "s|^OLLAMA_CHAT_MODEL=.*|OLLAMA_CHAT_MODEL=${WINNER}|" .env && rm -f .env.bak
  else
    echo "OLLAMA_CHAT_MODEL=${WINNER}" >> .env
  fi
  docker compose up -d --no-deps app
  sleep 5
  DOCKER_STATUS="$(docker compose ps app --format '{{.Status}}' 2>/dev/null || echo inconnu)"
  echo "model-watch: app redémarrée avec $WINNER -- statut : $DOCKER_STATUS"
  NEW_MODEL="$WINNER"
else
  echo "model-watch: aucun candidat n'a fait significativement mieux -- pas de changement."
fi

echo "$RESULT" | node "$SCRIPT_DIR/send-report.mjs" --old-model "$OLD_MODEL" --new-model "$NEW_MODEL"
