# Despliegue en la Raspberry Pi + Cloudflare

Guía detallada. El resumen está en el [README](../README.md#instalación).
Pensado para una **Raspberry Pi 5 (8 GB)** y eventos de ~150 personas; sirve
igual para cualquier servidor Debian/Ubuntu.

```
Teléfonos ──HTTPS──▶ Cloudflare ──túnel──▶ Raspberry Pi
                                             └─ servicio rnr-quest (127.0.0.1:8787)
                                                 ├─ página (dist/) y API (/api)
                                                 ├─ quest.db (SQLite)
                                                 └─ files/   (fotos)
```

## 1. Antes de empezar

- **Dominio en Cloudflare.** Compra el dominio (en Cloudflare o en otro lado y
  cambia sus DNS a Cloudflare). Elige el nombre que verán los participantes,
  p. ej. `quest.ieee-ecuador.org`: ese es el `APP_DOMAIN`.
- **Sistema.** Raspberry Pi OS Lite **64 bits** (con Raspberry Pi Imager:
  activar SSH, usuario y wifi). Conectar la Pi por cable si se puede.
- **Almacenamiento.** Una foto ocupa ~0,5 MB más una miniatura de ~30 KB:
  150 personas × 15 fotos ≈ **1,2 GB por evento**. 32 GB alcanzan, pero **si son
  una microSD, pon los datos en un SSD o pendrive USB 3** (`--data-dir`): las
  microSD se corrompen con cortes de luz y escrituras constantes.

## 2. Instalar

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/clousck/RNR2026-XR-Experience.git ~/rnr-quest
cd ~/rnr-quest
./deploy/setup.sh --domain quest.tudominio.org --data-dir /mnt/ssd/rnr-quest
```

`setup.sh` hace, en orden (se puede volver a correr sin perder nada):

1. Instala Node.js 22 si falta (hace falta ≥ 22.13: el servidor usa `node:sqlite`,
   no hay que compilar nada).
2. `npm ci` y `npm run build` de la página; `npm ci --omit=dev` del servidor.
3. Crea `server/.env` desde `server/.env.example` con `APP_DOMAIN`, `DATA_DIR`,
   `STATIC_DIR` (la API sirve la página), `HOST=127.0.0.1` y un `APP_SECRET`
   aleatorio. Si ya existía, conserva el `APP_SECRET`.
4. Si no hay usuarios del panel, pide el primero (rol admin).
5. Instala y arranca el servicio systemd `rnr-quest`, y comprueba `/api/health`.

### Publicar con Cloudflare Tunnel

```bash
./deploy/cloudflare-tunnel.sh
```

Instala `cloudflared`, muestra un enlace para autorizar tu cuenta (se puede
abrir desde otra computadora; elige el dominio), crea el túnel `rnr-quest`,
apunta `APP_DOMAIN` a la Pi y lo deja como servicio. **No hay que abrir puertos
en el router** ni tener IP fija: la Pi se conecta hacia Cloudflare.

Al terminar: `https://quest.tudominio.org/admin`.

## 3. Configuración (`server/.env`)

| Variable | Para qué |
|---|---|
| `APP_DOMAIN` | **El dominio.** QR, CORS y túnel salen de acá. |
| `APP_SECRET` | Firma las URLs de las fotos. No compartirlo. Si cambia, solo vencen los enlaces viejos. |
| `DATA_DIR` | Base y fotos. |
| `STATIC_DIR` | Carpeta `dist/` de la página (la pone `setup.sh`). Vacío = solo API. |
| `HOST`, `PORT` | `127.0.0.1:8787`: solo el túnel llega a la API. |
| `CORS_ORIGINS` | Solo si el frontend está en otro dominio (ver sección 6). |
| `MAX_PHOTO_MB` | Límite por foto (10). |

No hay API keys: el proyecto no usa servicios externos. Tras editar el archivo:
`sudo systemctl restart rnr-quest`.

**Cambiar de dominio:** editar `APP_DOMAIN`, correr
`./deploy/cloudflare-tunnel.sh`, reiniciar el servicio y **reimprimir los QR**.

## 4. Usuarios del panel

El primero lo crea `setup.sh`. Los demás, desde el panel → **Usuarios**:
*moderador* (revisa fotos, gestiona participantes, descarga) o *admin* (además
edita retos y ajustes). Para restablecer una contraseña desde la Pi:

```bash
cd ~/rnr-quest/server && npm run create-admin -- --username victor
```

## 5. Backups

```bash
crontab -e
# cada 15 min: instantánea de la base + copia incremental de las fotos
*/15 * * * * cd /home/pi/rnr-quest/server && npm run backup -- /media/usb/rnr-quest-backup >> /tmp/rnr-backup.log 2>&1
```

Conserva las últimas 48 instantáneas. Para restaurar: `sudo systemctl stop
rnr-quest`, copiar una instantánea como `DATA_DIR/quest.db` y la carpeta
`files/`, y `sudo systemctl start rnr-quest`.

Después del evento, descarga además el ZIP de fotos (panel → Galería →
Descargar ZIP) y guárdalo aparte.

## 6. Opción: frontend en Cloudflare Pages

Útil si se quiere que la página cargue desde la CDN aunque la Pi esté apagada
(solo mostraría "sin conexión"). Requiere dos nombres:

1. API en la Pi con su propio nombre, p. ej. `api.tudominio.org`: poner ese
   nombre en `hostname` de `/etc/cloudflared/config.yml` (o usarlo como
   `APP_DOMAIN` al correr el script del túnel) y dejar `STATIC_DIR` vacío.
2. En `server/.env`: `APP_DOMAIN=quest.tudominio.org` (donde abren los
   participantes, para los QR) y `CORS_ORIGINS=https://quest.tudominio.org`.
3. Proyecto de Cloudflare Pages conectado al repo (ver README → *Deploy en
   Cloudflare Pages*) con la variable `VITE_API_URL=https://api.tudominio.org/api`
   y el dominio personalizado `quest.tudominio.org`.

Con una sola Pi y ~150 personas, la instalación normal (todo en la Pi) es más
simple y suficiente.

## 7. Antes del evento (checklist)

1. Prueba de carga desde **otra** red (mide la Pi y el túnel juntos), contra un
   evento de prueba (`npm run seed-demo` crea uno):
   `cd server && npm run loadtest -- --url https://quest.tudominio.org/api --code <código>`
2. Crear el evento (o **duplicar** el del Taller), cargar Ramas y retos, revisar
   niveles y logros.
3. Imprimir los QR (Ajustes → Imprimir QRs): el de entrada en carteles, cada
   checkpoint en su lugar. Bajo cada QR va el código en texto.
4. Probar con un teléfono **con datos móviles**: entrar, foto, QR, AR.
5. El día: **Abrir evento**; moderadores con sesión iniciada (Moderar funciona
   bien desde el teléfono); ranking en la pantalla grande (Ranking → Pantalla grande).
6. Al terminar: **Cerrar evento** (congela el ranking; la galería sigue visible).

## 8. Actualizar y problemas comunes

```bash
cd ~/rnr-quest && ./deploy/update.sh     # git pull + build + reinicio; la base se migra sola
```

| Síntoma | Revisar |
|---|---|
| La página no abre | `sudo systemctl status rnr-quest cloudflared` · `journalctl -u rnr-quest -n 50` |
| `https://dominio` da error 1033 / 502 | El túnel no llega a la Pi: `sudo systemctl restart cloudflared` |
| Los QR muestran `localhost` | Falta `APP_DOMAIN` en `server/.env` (el panel lo avisa en Ajustes) |
| "APP_SECRET debe tener al menos 32 caracteres" | Volver a correr `./deploy/setup.sh` |
| Disco lleno | Panel → Resumen muestra los MB de fotos; `df -h` |
