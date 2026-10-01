#!/usr/bin/env bash
# Publica RNR Quest en internet con Cloudflare Tunnel, en el dominio de
# APP_DOMAIN (server/.env). No abre puertos en el router: la Pi se conecta
# hacia Cloudflare. Requiere que el dominio ya este en tu cuenta de Cloudflare.
#
# Uso, despues de deploy/setup.sh:
#   ./deploy/cloudflare-tunnel.sh
#
# La primera vez abre un enlace para autorizar la cuenta de Cloudflare
# (se puede abrir desde otra computadora).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/server/.env"
TUNNEL=rnr-quest

get_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
step() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

DOMAIN="$(get_env APP_DOMAIN)"
PORT="$(get_env PORT)"; PORT="${PORT:-8787}"
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "quest.tudominio.org" ]; then
  echo "Primero configura APP_DOMAIN (corre ./deploy/setup.sh)." >&2
  exit 1
fi

# ---------- 1. cloudflared ----------
if ! command -v cloudflared >/dev/null 2>&1; then
  step "Instalando cloudflared"
  ARCH="$(dpkg --print-architecture)"   # arm64 en la Pi 5, amd64 en un PC
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH.deb"
  sudo dpkg -i /tmp/cloudflared.deb
fi

# ---------- 2. Autorizar la cuenta ----------
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  step "Autoriza tu cuenta de Cloudflare (elige el dominio de $DOMAIN)"
  cloudflared tunnel login
fi

# ---------- 3. Crear el tunel ----------
tunnel_id() {
  cloudflared tunnel list --name "$TUNNEL" --output json 2>/dev/null |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s||'[]');console.log(t[0]?.id||'')})"
}
ID="$(tunnel_id)"
if [ -z "$ID" ]; then
  step "Creando el túnel $TUNNEL"
  cloudflared tunnel create "$TUNNEL"
  ID="$(tunnel_id)"
fi
[ -n "$ID" ] || { echo "No se pudo obtener el id del túnel." >&2; exit 1; }
echo "Túnel $TUNNEL: $ID"

# ---------- 4. Configuracion del servicio ----------
step "Configurando el túnel para https://$DOMAIN → 127.0.0.1:$PORT"
sudo mkdir -p /etc/cloudflared
sudo cp "$HOME/.cloudflared/$ID.json" "/etc/cloudflared/$ID.json"
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $ID
credentials-file: /etc/cloudflared/$ID.json
ingress:
  - hostname: $DOMAIN
    service: http://127.0.0.1:$PORT
  - service: http_status:404
EOF

# ---------- 5. DNS ----------
step "Apuntando $DOMAIN al túnel"
if ! cloudflared tunnel route dns "$TUNNEL" "$DOMAIN"; then
  echo "Aviso: no se pudo crear el registro DNS. Si $DOMAIN ya existe en Cloudflare,"
  echo "bórralo en el panel de DNS y vuelve a correr este script."
fi

# ---------- 6. Servicio ----------
if systemctl list-unit-files cloudflared.service >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^cloudflared.service'; then
  sudo systemctl restart cloudflared
else
  sudo cloudflared service install
fi

step "Probando https://$DOMAIN"
for _ in $(seq 1 20); do
  curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1 && break
  sleep 3
done
if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
  echo "✓ https://$DOMAIN funciona. Panel: https://$DOMAIN/admin"
else
  echo "Todavía no responde (el DNS puede tardar unos minutos)."
  echo "Revisa: sudo systemctl status cloudflared · journalctl -u cloudflared -n 50"
fi
