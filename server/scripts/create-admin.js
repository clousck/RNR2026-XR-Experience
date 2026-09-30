// Crea (o actualiza la contraseña de) un usuario del panel.
//   npm run create-admin -- --username victor --name "Victor" --role admin
// La contraseña se pide por consola (o ADMIN_PASSWORD para automatizar).
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { hashPassword } from '../src/auth.js'
import { loadConfig } from '../src/config.js'
import { now, openDb } from '../src/db.js'

try {
  process.loadEnvFile()
} catch {
  // sin .env
}

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'admin' },
  },
})
if (!values.username) {
  console.error('Uso: npm run create-admin -- --username <usuario> [--name "Nombre"] [--role admin|moderator]')
  process.exit(1)
}

let password = process.env.ADMIN_PASSWORD
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  password = await rl.question('Contraseña (mín. 8 caracteres): ')
  rl.close()
}
if (!password || password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.')
  process.exit(1)
}

const config = loadConfig()
const db = openDb(join(config.dataDir, 'quest.db'))
const username = values.username.toLowerCase()
const hash = await hashPassword(password)
const existing = db.get('SELECT id FROM admins WHERE username = :username', { username })
if (existing) {
  db.run('UPDATE admins SET password_hash = :hash, active = 1 WHERE id = :id', { hash, id: existing.id })
  db.run('DELETE FROM admin_sessions WHERE admin_id = :id', { id: existing.id })
  console.log(`Contraseña actualizada para «${username}».`)
} else {
  db.run(
    `INSERT INTO admins (username, name, password_hash, role, created_at)
     VALUES (:username, :name, :hash, :role, :t)`,
    { username, name: values.name || username, hash, role: values.role === 'moderator' ? 'moderator' : 'admin', t: now() },
  )
  console.log(`Usuario «${username}» creado (${values.role}).`)
}
db.close()
