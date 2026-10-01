import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig, publicUrl } from '../src/config.js'

test('APP_DOMAIN se normaliza a una URL https', () => {
  assert.equal(publicUrl('quest.ieee.org'), 'https://quest.ieee.org')
  assert.equal(publicUrl(' https://quest.ieee.org/ '), 'https://quest.ieee.org')
  assert.equal(publicUrl('http://localhost:4173'), 'http://localhost:4173')
  assert.equal(publicUrl(''), '')
})

test('CORS usa APP_DOMAIN por defecto y CORS_ORIGINS si se define', () => {
  assert.deepEqual(loadConfig({ APP_DOMAIN: 'quest.ieee.org' }).corsOrigins, ['https://quest.ieee.org'])
  assert.equal(loadConfig({ APP_DOMAIN: 'quest.ieee.org' }).appUrl, 'https://quest.ieee.org')
  assert.deepEqual(
    loadConfig({ APP_DOMAIN: 'quest.ieee.org', CORS_ORIGINS: 'https://a.org, https://b.org' }).corsOrigins,
    ['https://a.org', 'https://b.org'],
  )
  assert.deepEqual(loadConfig({}).corsOrigins, [], 'sin dominio (desarrollo): cualquier origen')
})

test('en producción el APP_SECRET es obligatorio', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /APP_SECRET/)
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', APP_SECRET: 'x'.repeat(32) }))
})
