import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { LocalStorage } from './storage.js'

try {
  process.loadEnvFile()
} catch {
  // sin .env: se usan las variables del sistema (systemd)
}

const config = loadConfig()
mkdirSync(config.dataDir, { recursive: true })
const db = openDb(join(config.dataDir, 'quest.db'))
const storage = new LocalStorage(join(config.dataDir, 'files'))
const app = createApp({ db, storage, config })

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`RNR Quest API en http://${config.host}:${info.port}/api  (datos: ${config.dataDir})`)
  if (!config.production) console.log('Modo desarrollo: APP_SECRET de prueba.')
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
