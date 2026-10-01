# Despliegue con Docker

Alternativa a `deploy/setup.sh` (systemd): la misma app en un contenedor. Sirve
en la **Raspberry Pi 5** (arm64) y en cualquier PC/servidor (amd64). Lo que no
cambia (dominio, checklist del evento, Cloudflare Pages) está en
[deploy-pi.md](deploy-pi.md).

```
Teléfonos ──HTTPS──▶ Cloudflare ──túnel──▶ contenedor cloudflared
                                              └─▶ contenedor app (app:8787)
                                                   ├─ página (dist/) y API (/api)
                                                   └─ /data → quest.db + files/
```

| Archivo | Qué hace |
|---|---|
| `Dockerfile` | Compila la página, instala la API y arma una imagen con Node 22 que corre como usuario `node`. |
| `docker-compose.yml` | Servicio `app` (puerto solo en `127.0.0.1:8787`, datos en `/data`) y `cloudflared` (perfil `tunnel`). |
| `server/.env` | La misma configuración de siempre: `APP_DOMAIN`, `APP_SECRET` y, con Docker, `TUNNEL_TOKEN`. |

## 1. Instalar Docker (en la Pi)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER     # cerrar sesión y volver a entrar
```

## 2. Configurar

```bash
git clone https://github.com/clousck/RNR2026-XR-Experience.git ~/rnr-quest
cd ~/rnr-quest
cp server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # o: openssl rand -base64 32
nano server/.env      # APP_DOMAIN y APP_SECRET (el valor de arriba)
```

`HOST`, `PORT`, `DATA_DIR` y `STATIC_DIR` los fija `docker-compose.yml`; no
hace falta tocarlos.

## 3. Arrancar

```bash
mkdir -p backups                       # antes del primer arranque (ver Backups)
docker compose up -d --build
docker compose ps                      # app debe quedar "healthy"
curl http://127.0.0.1:8787/api/health
docker compose exec app npm run create-admin -- --username victor --name "Victor" --role admin
```

El primer `--build` en la Pi tarda unos minutos (instala dependencias y compila
la página).

### Datos en un SSD

Por defecto la base y las fotos van en el volumen de Docker `rnr-data` (dentro
de `/var/lib/docker`, o sea, en la microSD). Para ponerlos en un SSD:

```bash
sudo mkdir -p /mnt/ssd/rnr-quest && sudo chown 1000:1000 /mnt/ssd/rnr-quest
RNR_DATA_DIR=/mnt/ssd/rnr-quest docker compose up -d
```

Para no repetir la variable, ponla en un archivo `.env` en la raíz
(`RNR_DATA_DIR=/mnt/ssd/rnr-quest`). Ojo: ese `.env` es también el del
frontend; no copies ahí `.env.example` entero, porque su `VITE_API_URL` cambiaría
la compilación.

El `chown 1000` es porque el contenedor corre como el usuario `node` (uid 1000),
no como root.

## 4. Publicar con Cloudflare Tunnel

**Opción A: túnel en un contenedor (todo en Docker).**

1. Cloudflare → *Zero Trust* → *Networks* → *Tunnels* → *Create a tunnel* →
   *Cloudflared*, nombre `rnr-quest`. Copia el **token** (el texto largo después
   de `--token`).
2. En la pestaña *Public Hostname*: el dominio de `APP_DOMAIN` → servicio
   **HTTP**, URL **`app:8787`**.
3. En `server/.env`: `TUNNEL_TOKEN=<token>`.
4. `docker compose --profile tunnel up -d`

Para no escribir `--profile tunnel` cada vez: `COMPOSE_PROFILES=tunnel` en el
`.env` de la raíz.

**Opción B: `cloudflared` en el host.** `./deploy/cloudflare-tunnel.sh` funciona
igual: apunta a `127.0.0.1:8787`, que es donde Compose publica la app.

## 5. Backups

`backups/` (o `RNR_BACKUP_DIR`) se monta en el contenedor como `/backups`.
Créala **antes** del primer arranque: si no existe, Docker la crea como root y
el backup no puede escribir.

```bash
crontab -e
# cada 15 min: instantánea de la base + copia incremental de las fotos
*/15 * * * * cd /home/pi/rnr-quest && docker compose exec -T app npm run backup -- /backups >> /tmp/rnr-backup.log 2>&1
```

Para un pendrive: `RNR_BACKUP_DIR=/media/usb/rnr-quest-backup` (con `chown 1000:1000`).

Restaurar: `docker compose stop app`, copiar la instantánea como `quest.db` y la
carpeta `files/` en la carpeta de datos, `docker compose start app`. Con el
volumen por defecto se llega a esa carpeta así:
`docker run --rm -v rnr-quest_rnr-data:/data -v "$PWD/backups:/backups" busybox sh`.

## 6. Comandos útiles

| Para | Comando |
|---|---|
| Actualizar | `git pull && docker compose up -d --build` (la base se migra sola) |
| Ver logs | `docker compose logs -f app` (o `cloudflared`) |
| Reiniciar | `docker compose restart app` |
| Contraseña del panel | `docker compose exec app npm run create-admin -- --username victor` |
| Evento de prueba | `docker compose exec app npm run seed-demo` |
| Parar todo | `docker compose --profile tunnel down` (los datos quedan) |

`docker compose down -v` **borra el volumen con la base y las fotos**: no usarlo.

## 7. Problemas comunes

| Síntoma | Revisar |
|---|---|
| `app` se reinicia en bucle | `docker compose logs app`. Si dice "APP_SECRET debe tener al menos 32 caracteres", complétalo en `server/.env`. |
| `EACCES` en `/data` o `/backups` | La carpeta del host no es del uid 1000: `sudo chown -R 1000:1000 <carpeta>`. |
| Error 1033 / 502 en el dominio | `docker compose logs cloudflared`; en el panel del túnel la URL debe ser `app:8787`. |
| Los QR muestran `localhost` | Falta `APP_DOMAIN` en `server/.env`, luego `docker compose up -d`. |
| Cambié `server/.env` y no se nota | `docker compose up -d` (recrea el contenedor; `restart` no relee el archivo). |
