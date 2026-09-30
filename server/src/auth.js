import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

// Sin 0/O, 1/I/L: los codigos se dictan y se escriben a mano.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function randomCode(length) {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}
/** Codigo para recuperar la cuenta en otro telefono (se muestra XXXX-XXXX). */
export const recoveryCode = () => randomCode(8)
/** Normaliza lo que escribe la persona: minusculas, espacios, guiones. */
export const normalizeCode = (text) =>
  String(text ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

// --- contraseñas de administradores (scrypt) ---

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(expected, actual)
}

// --- URLs firmadas ---
// Las fotos no son publicas: la API entrega URLs con vencimiento y firma
// solo a participantes y administradores con sesion. Asi un <img src> funciona
// sin cabeceras de autenticacion.

const WINDOW = 6 * 3600

/**
 * Vencimiento redondeado a ventanas de 6 h: la misma foto tiene la misma
 * URL durante horas, asi el navegador la reutiliza desde su cache.
 */
export const mediaExpiry = (nowSec = Math.floor(Date.now() / 1000)) =>
  (Math.floor(nowSec / WINDOW) + 2) * WINDOW

export function sign(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 27)
}

export function verifySignature(secret, payload, signature, exp) {
  if (!signature || !exp || Number(exp) < Date.now() / 1000) return false
  const expected = Buffer.from(sign(secret, payload))
  const actual = Buffer.from(String(signature))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
