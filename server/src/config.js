import { resolve } from 'node:path'

/**
 * Configuracion desde variables de entorno (ver .env.example).
 * Nada del evento vive aca: los eventos se crean desde el panel.
 */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const secret = env.APP_SECRET || ''
  if (production && secret.length < 32) {
    throw new Error('APP_SECRET debe tener al menos 32 caracteres en produccion')
  }
  return {
    production,
    port: Number(env.PORT || 8787),
    host: env.HOST || '0.0.0.0',
    dataDir: resolve(env.DATA_DIR || './data'),
    // Firma las URLs de las fotos. En desarrollo se usa uno fijo.
    secret: secret || 'dev-secret-no-usar-en-produccion-0000',
    // Origenes permitidos para CORS (el frontend en Cloudflare Pages).
    // Vacio = cualquiera: la API usa tokens bearer, no cookies.
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Opcional: carpeta del frontend compilado (dist/) para servir todo
    // desde la Pi con un solo dominio.
    staticDir: env.STATIC_DIR ? resolve(env.STATIC_DIR) : '',
    maxPhotoBytes: Number(env.MAX_PHOTO_MB || 10) * 1024 * 1024,
  }
}
