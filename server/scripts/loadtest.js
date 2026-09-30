// Prueba de carga: simula N participantes entrando a la vez, subiendo fotos
// a los retos de foto y consultando retos, ranking y galeria.
//   npm run loadtest -- --url https://api.tudominio.org/api --slug demo --code ABC123 --users 150
// Usar contra un evento de prueba (crea participantes "carga-N"), p. ej. el
// de `npm run seed-demo`. Correrlo desde otra maquina mide tambien la red.
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8787/api' },
    slug: { type: 'string', default: 'demo' },
    code: { type: 'string' },
    users: { type: 'string', default: '150' },
    photos: { type: 'string', default: '3' },
    kb: { type: 'string', default: '500' },
  },
})
if (!values.code) {
  console.error('Falta --code (codigo del evento). Ver `npm run seed-demo`.')
  process.exit(1)
}

const API = values.url.replace(/\/$/, '')
const USERS = Number(values.users)
const PHOTOS = Number(values.photos)
const run = Date.now().toString(36)

// "Foto" de ~500 KB: cabecera JPG + bytes aleatorios (el servidor solo valida la cabecera).
const photo = Buffer.alloc(Number(values.kb) * 1024)
for (let i = 0; i < photo.length; i++) photo[i] = (Math.random() * 256) | 0
photo[0] = 0xff
photo[1] = 0xd8
photo[2] = 0xff
const thumb = photo.subarray(0, 30 * 1024)

const timings = {}
const errors = {}
async function timed(name, fn) {
  const t = performance.now()
  try {
    return await fn()
  } catch (e) {
    errors[name] = (errors[name] ?? 0) + 1
    if ((errors[name] ?? 0) <= 3) console.error(`  ${name}: ${e.message}`)
    return null
  } finally {
    ;(timings[name] ??= []).push(performance.now() - t)
  }
}

async function call(path, { token, body, form, method } = {}) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${path}`, {
    method: method ?? (body || form ? 'POST' : 'GET'),
    headers,
    body: form ?? (body && JSON.stringify(body)),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${res.status} ${data?.error?.message ?? ''}`)
  return data
}

const ev = `/events/${values.slug}`
const { teams } = await call(ev)

async function participant(i) {
  const joined = await timed('join', () =>
    call(`${ev}/join`, {
      body: { alias: `carga-${run}-${i}`, teamId: teams[i % teams.length]?.id, consent: true, code: values.code },
    }),
  )
  if (!joined) return
  const { token } = joined
  const home = await timed('retos', () => call(`${ev}/challenges`, { token }))
  const targets = (home?.challenges ?? [])
    .filter((c) => (c.type === 'PHOTO' || c.type === 'AR') && c.state === 'available')
    .slice(0, PHOTOS)
  for (const c of targets) {
    const form = new FormData()
    form.set('photo', new Blob([photo], { type: 'image/jpeg' }), 'p.jpg')
    form.set('thumb', new Blob([thumb], { type: 'image/jpeg' }), 't.jpg')
    form.set('clientId', `load-${run}-${i}-${c.id}`)
    form.set('width', '2048')
    form.set('height', '1536')
    await timed('subir foto', () => call(`${ev}/challenges/${c.id}/submissions`, { token, form }))
    await timed('retos', () => call(`${ev}/challenges`, { token }))
  }
  await timed('ranking', () => call(`${ev}/ranking`, { token }))
  await timed('galeria', () => call(`${ev}/gallery`, { token }))
}

console.log(`${USERS} participantes · ${PHOTOS} fotos de ${values.kb} KB c/u → ${API}`)
const start = performance.now()
await Promise.all(Array.from({ length: USERS }, (_, i) => participant(i)))
const secs = (performance.now() - start) / 1000

const pct = (arr, p) => arr.toSorted((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))]
console.log(`\nTotal: ${secs.toFixed(1)} s\n`)
console.log('operacion      n     p50 ms   p95 ms   max ms   errores')
for (const [name, arr] of Object.entries(timings)) {
  console.log(
    `${name.padEnd(12)} ${String(arr.length).padStart(4)} ${pct(arr, 0.5).toFixed(0).padStart(9)} ${pct(arr, 0.95)
      .toFixed(0)
      .padStart(8)} ${Math.max(...arr).toFixed(0).padStart(8)} ${String(errors[name] ?? 0).padStart(9)}`,
  )
}
