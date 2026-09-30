# Despliegue en la Raspberry Pi + Cloudflare

Guía para dejar RNR Quest corriendo en una **Raspberry Pi 5 (8 GB)** expuesta
con **Cloudflare Tunnel**. Pensado para eventos de ~150 personas (Taller de
Directivos, RNR).

```
Teléfonos ──HTTPS──▶ Cloudflare ──túnel──▶ Raspberry Pi
                                             ├─ API Node (puerto 8787, solo localhost)
                                             ├─ quest.db (SQLite)
                                             └─ files/  (fotos)
Frontend: Cloudflare Pages (opción A) o la misma Pi (opción B)
```

## 1. Almacenamiento

- **Espacio:** una foto ocupa ~0,5 MB (el teléfono la reduce antes de subirla)
  más una miniatura de ~30 KB. 150 personas × 15 fotos ≈ **1,2 GB por evento**.
  32 GB alcanzan de sobra.
- **Si los 32 GB son una microSD**, pon `DATA_DIR` en un **SSD o pendrive USB 3**.
  Las microSD se corrompen con cortes de luz y escrituras constantes. Como
  mínimo, activa los backups (sección 6) hacia un disco USB.

## 2. Sistema y Node

Raspberry Pi OS Lite **64 bits**. Node **22.13 o superior** (el servidor usa
`node:sqlite`, que viene con Node: no hay que compilar nada).

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node --version    # v22.13 o mayor
```

## 3. Instalar la aplicación

```bash
sudo mkdir -p /srv/rnr-quest && sudo chown $USER /srv/rnr-quest
git clone https://github.com/clousck/RNR2026-XR-Experience.git /srv/rnr-quest/app
cd /srv/rnr-quest/app/server
npm ci --omit=dev
cp .env.example .env
nano .env    # completar (ver abajo)
```

En `.env`:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `127.0.0.1` (solo el túnel habla con la API) |
| `DATA_DIR` | carpeta en el SSD, p. ej. `/mnt/ssd/rnr-quest` |
| `APP_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `CORS_ORIGINS` | dominio del frontend, p. ej. `https://quest.tudominio.org` |
| `STATIC_DIR` | solo en la opción B (ver sección 5) |

Crear el primer administrador (pide la contraseña):

```bash
npm run create-admin -- --username victor --name "Víctor" --role admin
```

Los demás (el SAC team) se crean desde el panel → **Usuarios**, con rol
*moderador* (revisan fotos) o *admin* (editan retos y ajustes).

## 4. Servicio systemd

`/etc/systemd/system/rnr-quest.service`:

```ini
[Unit]
Description=RNR Quest API
After=network-online.target

[Service]
WorkingDirectory=/srv/rnr-quest/app/server
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/index.js
Restart=always
RestartSec=3
User=pi
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rnr-quest
curl http://127.0.0.1:8787/api/health     # {"ok":true,...}
journalctl -u rnr-quest -f                # logs
```

## 5. Cloudflare

Con el dominio ya en Cloudflare, se instala `cloudflared` en la Pi:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cf.deb
sudo dpkg -i cf.deb
cloudflared tunnel login
cloudflared tunnel create rnr-quest
```

### Opción A (recomendada): frontend en Cloudflare Pages + API en la Pi

- Frontend rápido desde la CDN. Si la Pi se cae, la página igual abre y avisa
  que el servidor no responde.
- Túnel solo para la API. `~/.cloudflared/config.yml`:

  ```yaml
  tunnel: rnr-quest
  credentials-file: /home/pi/.cloudflared/<id>.json
  ingress:
    - hostname: api.tudominio.org
      service: http://127.0.0.1:8787
    - service: http_status:404
  ```

  ```bash
  cloudflared tunnel route dns rnr-quest api.tudominio.org
  sudo cloudflared service install
  ```

- En Cloudflare Pages (proyecto conectado a este repo): **Settings → Environment
  variables** → `VITE_API_URL = https://api.tudominio.org/api`, y redesplegar.
  Agregar el dominio `quest.tudominio.org` al proyecto.
- En `.env` de la Pi: `CORS_ORIGINS=https://quest.tudominio.org`.

### Opción B: todo en la Pi (un solo dominio)

- Compilar el frontend en la Pi: `cd /srv/rnr-quest/app && npm ci && npm run build`.
- En `.env`: `STATIC_DIR=/srv/rnr-quest/app/dist` (y `CORS_ORIGINS` vacío).
- En el túnel, `hostname: quest.tudominio.org` → `http://127.0.0.1:8787`.

### Notas de Cloudflare

- Las fotos se sirven con `Cache-Control: private`: Cloudflare **no** las guarda
  en su caché. Solo las ve quien recibe una URL firmada de la API.
- El plan gratuito acepta subidas de hasta 100 MB; las fotos pesan ~0,5 MB.

## 6. Backups

```bash
# Instantánea de la base + copia incremental de fotos, cada 15 min:
crontab -e
*/15 * * * * cd /srv/rnr-quest/app/server && /usr/bin/npm run backup -- /mnt/usb/rnr-quest-backup >> /tmp/backup.log 2>&1
```

Conserva las últimas 48 instantáneas de la base. Para restaurar: detener el
servicio, copiar una instantánea como `DATA_DIR/quest.db`, copiar `files/` y
arrancar.

Después del evento, descarga el ZIP de fotos desde el panel (Galería →
Descargar ZIP) y guárdalo aparte.

## 7. Antes del evento (checklist)

1. `npm run loadtest` contra un evento de prueba desde **otra** red (mide la Pi
   y el túnel juntos). Ver `server/scripts/loadtest.js`.
2. Crear el evento (o **duplicar** el del Taller), cargar Ramas y retos, revisar
   niveles y logros.
3. Imprimir los QR (Ajustes → Imprimir QRs): el de entrada va en carteles; cada
   checkpoint, en su lugar. Bajo cada QR va el código en texto.
4. Probar con un teléfono **con datos móviles** (no el wifi de la casa): entrar,
   foto, QR, AR.
5. El día: **Abrir evento**, moderadores con sesión iniciada (Moderar funciona
   bien desde el teléfono), ranking en la pantalla grande (Ranking → Pantalla
   grande).
6. Al terminar: **Cerrar evento** (congela el ranking; la galería sigue visible).

## 8. Actualizar

```bash
cd /srv/rnr-quest/app && git pull
cd server && npm ci --omit=dev
sudo systemctl restart rnr-quest
```

La base se migra sola al arrancar (`PRAGMA user_version`).
