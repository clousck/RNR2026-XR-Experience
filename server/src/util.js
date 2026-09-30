/** Error con codigo HTTP y un codigo estable que el frontend puede traducir. */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message, code = 'invalid') => new HttpError(400, code, message)
export const notFound = (message = 'No encontrado') => new HttpError(404, 'not_found', message)
export const forbidden = (message = 'No autorizado', code = 'forbidden') => new HttpError(403, code, message)
export const conflict = (message, code = 'conflict') => new HttpError(409, code, message)

// --- validacion de entrada ---
// Pequeños validadores en vez de una libreria: la API es chica.

export function str(value, field, { min = 0, max = 500, required = true } = {}) {
  if (value == null || value === '') {
    if (required && min > 0) throw badRequest(`Falta «${field}»`)
    return required ? '' : null
  }
  if (typeof value !== 'string') throw badRequest(`«${field}» debe ser texto`)
  const text = value.trim()
  if (text.length < min) throw badRequest(`«${field}» es muy corto`)
  if (text.length > max) throw badRequest(`«${field}» es muy largo (máx. ${max})`)
  return text
}

export function int(value, field, { min = -Infinity, max = Infinity, required = true } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`Falta «${field}»`)
    return null
  }
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`«${field}» no es válido`)
  return n
}

export function oneOf(value, field, options) {
  if (!options.includes(value)) throw badRequest(`«${field}» debe ser: ${options.join(', ')}`)
  return value
}

export function isoDate(value, field) {
  if (value == null || value === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw badRequest(`«${field}» no es una fecha válida`)
  return d.toISOString()
}

/** Solo aplica los campos presentes en `body` (para PATCH). */
export function pick(body, validators) {
  const out = {}
  for (const [key, validate] of Object.entries(validators)) {
    if (Object.hasOwn(body, key)) out[key] = validate(body[key])
  }
  return out
}

export async function jsonBody(c) {
  try {
    const body = await c.req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch {
    throw badRequest('Cuerpo JSON inválido')
  }
}

// --- limite de peticiones en memoria (suficiente para una sola Pi) ---

export function createRateLimiter() {
  const hits = new Map()
  const timer = setInterval(() => {
    const t = Date.now()
    for (const [k, v] of hits) if (v.reset < t) hits.delete(k)
  }, 60_000)
  timer.unref()
  return function limit(key, max, windowMs) {
    const t = Date.now()
    let entry = hits.get(key)
    if (!entry || entry.reset < t) {
      entry = { count: 0, reset: t + windowMs }
      hits.set(key, entry)
    }
    entry.count++
    if (entry.count > max) {
      throw new HttpError(429, 'rate_limited', 'Demasiados intentos. Espera un momento.')
    }
  }
}

/** IP real detras de Cloudflare Tunnel. */
export function clientIp(c) {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.env?.incoming?.socket?.remoteAddress ||
    'local'
  )
}

export function bearer(c) {
  const h = c.req.header('authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff]
export const isJpeg = (buf) => buf.length > 3 && JPEG_MAGIC.every((b, i) => buf[i] === b)

export const slugify = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
