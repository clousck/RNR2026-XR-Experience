#!/usr/bin/env bash
# Actualiza RNR Quest a la ultima version de main y reinicia el servicio.
# La base de datos se migra sola al arrancar; las fotos no se tocan.
#   ./deploy/update.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
git pull --ff-only
npm ci
npm run build
(cd server && npm ci --omit=dev)
sudo systemctl restart rnr-quest

PORT="$(grep -E '^PORT=' server/.env | cut -d= -f2-)"
for _ in $(seq 1 15); do
  curl -fsS "http://127.0.0.1:${PORT:-8787}/api/health" >/dev/null 2>&1 && { echo "✓ Actualizado y funcionando"; exit 0; }
  sleep 1
done
echo "✗ No responde. Revisa: journalctl -u rnr-quest -n 50" >&2
exit 1
