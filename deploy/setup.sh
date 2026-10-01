#!/usr/bin/env bash
# Instala RNR Quest en un servidor Linux: Raspberry Pi OS (64 bits), Debian o Ubuntu.
# Deja la API y la pagina corriendo en un solo servicio (systemd), escuchando
# solo en localhost; Cloudflare Tunnel la publica (deploy/cloudflare-tunnel.sh).
#
# Uso, desde la carpeta del repo:
#   ./deploy/setup.sh --domain quest.tudominio.org [--data-dir /mnt/ssd/rnr-quest]
#
# Se puede volver a correr: no pisa la base, las fotos ni el APP_SECRET.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
ENV_FILE="$SERVER_DIR/.env"
SERVICE=rnr-quest
RUN_USER="$(id -un)"
DOMAIN=""
DATA_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

# Lee o escribe una variable de server/.env
get_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
set_env() {
  if grep -qE "^#? ?$1=" "$ENV_FILE"; then
    sed -i -E "s|^#? ?$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

# ---------- 1. Node ----------
node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'
}
if ! node_ok; then
  step "Instalando Node.js 22 (hace falta 22.13 o más nuevo)"
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates git
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node $(node --version)"

# ---------- 2. Dependencias y compilacion ----------
step "Instalando dependencias y compilando la página"
cd "$REPO_DIR"
npm ci
npm run build
cd "$SERVER_DIR"
npm ci --omit=dev

# ---------- 3. Configuracion (server/.env) ----------
step "Configurando server/.env"
[ -f "$ENV_FILE" ] || cp "$SERVER_DIR/.env.example" "$ENV_FILE"

CURRENT_DOMAIN="$(get_env APP_DOMAIN)"
if [ -z "$DOMAIN" ]; then
  if [ -n "$CURRENT_DOMAIN" ] && [ "$CURRENT_DOMAIN" != "quest.tudominio.org" ]; then
    DOMAIN="$CURRENT_DOMAIN"
  else
    read -rp "Dominio donde abrirán los participantes (ej. quest.ieee-ecuador.org): " DOMAIN
  fi
fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%/}"
[ -n "$DOMAIN" ] || { echo "Falta el dominio." >&2; exit 1; }

[ -n "$DATA_DIR" ] || DATA_DIR="$(get_env DATA_DIR)"
[ -n "$DATA_DIR" ] || DATA_DIR="/var/lib/rnr-quest"

set_env APP_DOMAIN "$DOMAIN"
set_env NODE_ENV production
set_env HOST 127.0.0.1
set_env DATA_DIR "$DATA_DIR"
set_env STATIC_DIR "$REPO_DIR/dist"
if [ -z "$(get_env APP_SECRET)" ]; then
  set_env APP_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  echo "APP_SECRET generado."
fi
[ -n "$(get_env PORT)" ] || set_env PORT 8787
chmod 600 "$ENV_FILE"
PORT="$(get_env PORT)"

sudo mkdir -p "$DATA_DIR"
sudo chown "$RUN_USER" "$DATA_DIR"
echo "Dominio: $DOMAIN · datos: $DATA_DIR"

# ---------- 4. Primer administrador ----------
ADMINS="$(node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite')
  try { console.log(new DatabaseSync(process.argv[1]).prepare('SELECT COUNT(*) n FROM admins').get().n) }
  catch { console.log(0) }" "$DATA_DIR/quest.db")"
if [ "$ADMINS" = "0" ]; then
  step "Creando el primer administrador del panel"
  read -rp "Usuario (ej. victor): " ADMIN_USER
  read -rp "Nombre visible: " ADMIN_NAME
  npm run --silent create-admin -- --username "$ADMIN_USER" --name "${ADMIN_NAME:-$ADMIN_USER}" --role admin
fi

# ---------- 5. Servicio systemd ----------
step "Instalando el servicio $SERVICE"
sudo tee /etc/systemd/system/$SERVICE.service > /dev/null <<EOF
[Unit]
Description=RNR Quest (API + página)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$SERVER_DIR
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning src/index.js
Restart=always
RestartSec=3
User=$RUN_USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE >/dev/null
sudo systemctl restart $SERVICE

for _ in $(seq 1 15); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "✓ RNR Quest responde en http://127.0.0.1:$PORT"
else
  echo "✗ El servicio no responde. Revisa: journalctl -u $SERVICE -n 50" >&2
  exit 1
fi

cat <<EOF

Listo. Siguientes pasos:
  1. Publicarlo en https://$DOMAIN con Cloudflare:   ./deploy/cloudflare-tunnel.sh
  2. Backups automáticos (recomendado), con crontab -e:
       */15 * * * * cd $SERVER_DIR && npm run backup -- /ruta/al/disco-usb >> /tmp/rnr-backup.log 2>&1
  3. Panel: https://$DOMAIN/admin
Logs: journalctl -u $SERVICE -f · Actualizar: ./deploy/update.sh
EOF
