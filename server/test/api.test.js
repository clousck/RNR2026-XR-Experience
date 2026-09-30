import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { hashPassword } from '../src/auth.js'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { now, openDb } from '../src/db.js'
import { LocalStorage } from '../src/storage.js'

// JPG minimo valido para las subidas (solo importa la cabecera FFD8FF).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9])

let dir, db, app

async function call(method, path, { token, body, form } = {}) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await app.request(`/api${path}`, { method, headers, body: payload })
  const type = res.headers.get('content-type') || ''
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.arrayBuffer(), res }
}

function photoForm(clientId, extra = {}) {
  const form = new FormData()
  form.set('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'p.jpg')
  form.set('thumb', new Blob([JPEG], { type: 'image/jpeg' }), 't.jpg')
  form.set('clientId', clientId)
  form.set('width', '2048')
  form.set('height', '1536')
  for (const [k, v] of Object.entries(extra)) form.set(k, v)
  return form
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'quest-test-'))
  db = openDb(':memory:')
  const config = loadConfig({ DATA_DIR: dir })
  app = createApp({ db, storage: new LocalStorage(join(dir, 'files')), config })
  db.run(
    `INSERT INTO admins (username, name, password_hash, role, created_at) VALUES ('root', 'Root', :hash, 'admin', :t)`,
    { hash: await hashPassword('password123'), t: now() },
  )
  db.run(
    `INSERT INTO admins (username, name, password_hash, role, created_at) VALUES ('mod', 'Mod', :hash, 'moderator', :t)`,
    { hash: await hashPassword('password123'), t: now() },
  )
})

after(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('flujo completo', () => {
  let admin, mod, eventId, joinCode, teamA, teamB
  let photoCh, arCh, qrCh, secretQr, lockedCh, limitedCh
  let ana, beto

  test('login de administradores', async () => {
    const bad = await call('POST', '/admin/login', { body: { username: 'root', password: 'nope' } })
    assert.equal(bad.status, 401)
    admin = (await call('POST', '/admin/login', { body: { username: 'root', password: 'password123' } })).data.token
    mod = (await call('POST', '/admin/login', { body: { username: 'mod', password: 'password123' } })).data.token
    assert.ok(admin && mod)
    assert.equal((await call('GET', '/admin/events')).status, 401)
  })

  test('crear evento con equipos y retos', async () => {
    const forbidden = await call('POST', '/admin/events', { token: mod, body: { name: 'X' } })
    assert.equal(forbidden.status, 403, 'un moderador no crea eventos')

    const { status, data } = await call('POST', '/admin/events', { token: admin, body: { name: 'Taller de Directivos 2027' } })
    assert.equal(status, 201)
    assert.equal(data.event.slug, 'taller-de-directivos-2027')
    assert.equal(data.event.status, 'draft')
    assert.match(data.event.joinCode, /^[A-Z2-9]{6}$/)
    eventId = data.event.id
    joinCode = data.event.joinCode

    const badges = await call('GET', `/admin/events/${eventId}/badges`, { token: admin })
    assert.equal(badges.data.badges.length, 4, 'se crean los badges por defecto')

    const teams = await call('POST', `/admin/events/${eventId}/teams`, { token: admin, body: { names: ['Rama A', 'Rama B', 'Rama A'] } })
    assert.equal(teams.data.teams.length, 2)
    ;[teamA, teamB] = teams.data.teams.map((t) => t.id)

    const mk = async (body) => (await call('POST', `/admin/events/${eventId}/challenges`, { token: admin, body: { status: 'active', ...body } })).data.challenge
    photoCh = await mk({ type: 'PHOTO', title: 'Conoce una nueva Rama', points: 20, category: 'Networking', requiresApproval: true })
    arCh = await mk({ type: 'AR', title: 'Encuentra a Watt', points: 15, requiresApproval: false })
    qrCh = await mk({ type: 'QR', title: 'Checkpoint', points: 10, requiresApproval: false })
    secretQr = await mk({ type: 'QR', title: 'Secreto', points: 40, visibility: 'secret', requiresApproval: false })
    lockedCh = await mk({ type: 'PHOTO', title: 'Nivel 2', points: 5, unlockRule: { afterChallenges: [photoCh.id] } })
    limitedCh = await mk({ type: 'PHOTO', title: 'Solo uno', points: 5, maxCompletions: 1, requiresApproval: false })
    assert.equal(photoCh.requiresPhoto, true)
    assert.equal(qrCh.requiresPhoto, false)
    assert.match(qrCh.qrCode, /^[A-Z2-9]{6}$/)
  })

  test('un evento en borrador no es visible; abierto sí', async () => {
    assert.equal((await call('GET', '/events/taller-de-directivos-2027')).status, 404)
    await call('PATCH', `/admin/events/${eventId}`, { token: admin, body: { status: 'open' } })
    const { data } = await call('GET', '/events/taller-de-directivos-2027')
    assert.equal(data.event.name, 'Taller de Directivos 2027')
    assert.equal(data.event.joinCode, undefined, 'no se filtra el código')
    assert.equal(data.teams.length, 2)
    const code = await call('GET', `/join-codes/${joinCode.toLowerCase()}`)
    assert.equal(code.data.slug, 'taller-de-directivos-2027')
  })

  test('unirse al evento', async () => {
    const slug = '/events/taller-de-directivos-2027'
    const noCode = await call('POST', `${slug}/join`, { body: { alias: 'Ana', teamId: teamA, consent: true, code: 'XXXXXX' } })
    assert.equal(noCode.status, 403)
    const noConsent = await call('POST', `${slug}/join`, { body: { alias: 'Ana', teamId: teamA, code: joinCode } })
    assert.equal(noConsent.status, 400)
    const noTeam = await call('POST', `${slug}/join`, { body: { alias: 'Ana', consent: true, code: joinCode } })
    assert.equal(noTeam.status, 400)

    const ok = await call('POST', `${slug}/join`, { body: { alias: '  Ana  ', teamId: teamA, consent: true, code: joinCode } })
    assert.equal(ok.status, 201)
    ana = ok.data.token
    assert.equal(ok.data.me.alias, 'Ana')
    assert.equal(ok.data.me.level.name, 'Chispa')
    assert.match(ok.data.me.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)

    const dup = await call('POST', `${slug}/join`, { body: { alias: 'ANA', teamId: teamB, consent: true, code: joinCode } })
    assert.equal(dup.status, 409)
    beto = (await call('POST', `${slug}/join`, { body: { alias: 'Beto', teamId: teamB, consent: true, code: joinCode } })).data.token
  })

  test('lista de retos: secreto oculto, bloqueado con pista', async () => {
    const { data } = await call('GET', '/events/taller-de-directivos-2027/challenges', { token: ana })
    const byId = new Map(data.challenges.map((c) => [c.id, c]))
    assert.ok(!byId.has(secretQr.id), 'el secreto no aparece')
    assert.equal(byId.get(photoCh.id).state, 'available')
    assert.equal(byId.get(lockedCh.id).state, 'locked')
    assert.match(byId.get(lockedCh.id).lockedHint, /Conoce una nueva Rama/)
    assert.equal(byId.get(qrCh.id).qrCode, undefined, 'no se filtra el código del QR')
    assert.equal((await call('GET', '/events/taller-de-directivos-2027/challenges')).status, 401)
  })

  test('foto con aprobación queda pendiente; reintento idempotente', async () => {
    const path = `/events/taller-de-directivos-2027/challenges/${photoCh.id}/submissions`
    const first = await call('POST', path, { token: ana, form: photoForm('client-000001') })
    assert.equal(first.status, 201)
    assert.equal(first.data.submission.status, 'pending')
    assert.equal(first.data.me.xp, 0)
    assert.equal(first.data.me.pending, 1)

    const retry = await call('POST', path, { token: ana, form: photoForm('client-000001') })
    assert.equal(retry.status, 200)
    assert.equal(retry.data.submission.id, first.data.submission.id)

    const again = await call('POST', path, { token: ana, form: photoForm('client-000002') })
    assert.equal(again.status, 409)
    assert.equal(again.data.error.code, 'already_pending')

    const notJpeg = new FormData()
    notJpeg.set('photo', new Blob(['hola']), 'p.jpg')
    notJpeg.set('thumb', new Blob([JPEG]), 't.jpg')
    notJpeg.set('clientId', 'client-000003')
    const bad = await call('POST', `/events/taller-de-directivos-2027/challenges/${arCh.id}/submissions`, { token: ana, form: notJpeg })
    assert.equal(bad.status, 400)
  })

  test('las fotos pendientes no aparecen en la galería', async () => {
    const { data } = await call('GET', '/events/taller-de-directivos-2027/gallery', { token: beto })
    assert.equal(data.items.length, 0)
    const mine = await call('GET', '/events/taller-de-directivos-2027/me/submissions', { token: ana })
    assert.equal(mine.data.items[0].status, 'pending')
    assert.match(mine.data.items[0].photo.url, /^media\/events\/\d+\/photos\/.+\.jpg\?exp=\d+&sig=/)
  })

  test('moderar: aprobar da XP y desbloquea retos', async () => {
    const queue = await call('GET', `/admin/events/${eventId}/submissions?status=pending`, { token: mod })
    assert.equal(queue.data.items.length, 1)
    assert.equal(queue.data.pending, 1)
    const sub = queue.data.items[0]
    assert.equal(sub.participant.alias, 'Ana')

    const approved = await call('POST', `/admin/submissions/${sub.id}/review`, { token: mod, body: { decision: 'approve' } })
    assert.equal(approved.data.submission.status, 'approved')
    assert.equal(approved.data.submission.reviewer, 'Mod')
    assert.equal(approved.data.pending, 0)

    const { data } = await call('GET', '/events/taller-de-directivos-2027/challenges', { token: ana })
    assert.equal(data.me.xp, 20)
    assert.equal(data.challenges.find((c) => c.id === lockedCh.id).state, 'available')
    assert.equal(data.me.badges.find((b) => b.name === 'Primer paso').earned, true)
  })

  test('foto aprobada: visible en galería, likes y descarga firmada', async () => {
    const { data } = await call('GET', '/events/taller-de-directivos-2027/gallery', { token: beto })
    assert.equal(data.items.length, 1)
    const photo = data.items[0]
    assert.equal(photo.alias, 'Ana')
    assert.equal(photo.mine, false)
    assert.equal(data.filters.challenges.length, 1)

    const like = await call('POST', `/events/taller-de-directivos-2027/photos/${photo.id}/like`, { token: beto })
    assert.deepEqual(like.data, { liked: true, likes: 1 })
    await call('POST', `/events/taller-de-directivos-2027/photos/${photo.id}/like`, { token: beto })
    const unlike = await call('DELETE', `/events/taller-de-directivos-2027/photos/${photo.id}/like`, { token: beto })
    assert.deepEqual(unlike.data, { liked: false, likes: 0 })

    const img = await call('GET', `/${photo.url}`)
    assert.equal(img.status, 200)
    assert.equal(img.res.headers.get('content-type'), 'image/jpeg')
    const tampered = await call('GET', `/${photo.url.replace(/sig=./, 'sig=X')}`)
    assert.equal(tampered.status, 403)
  })

  test('AR sin aprobación suma XP al instante', async () => {
    const res = await call('POST', `/events/taller-de-directivos-2027/challenges/${arCh.id}/submissions`, {
      token: ana,
      form: photoForm('client-ar-0001', { capturedWith: 'ar' }),
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.submission.status, 'approved')
    assert.equal(res.data.me.xp, 35)
    assert.equal(res.data.me.badges.find((b) => b.name === 'Amigo de Watt').earned, true)
  })

  test('QR: reclamar, repetir y revelar un secreto', async () => {
    const claim = await call('POST', `/events/taller-de-directivos-2027/qr/${qrCh.qrCode.toLowerCase()}`, { token: ana })
    assert.equal(claim.status, 200)
    assert.equal(claim.data.already, false)
    assert.equal(claim.data.me.xp, 45)
    const again = await call('POST', `/events/taller-de-directivos-2027/qr/${qrCh.qrCode}`, { token: ana })
    assert.equal(again.data.already, true)
    assert.equal(again.data.me.xp, 45)

    const secret = await call('POST', `/events/taller-de-directivos-2027/qr/${secretQr.qrCode}`, { token: ana })
    assert.equal(secret.data.challenge.title, 'Secreto')
    const { data } = await call('GET', '/events/taller-de-directivos-2027/challenges', { token: ana })
    assert.equal(data.challenges.find((c) => c.id === secretQr.id).state, 'approved', 'ya escaneado: ahora se ve')
    assert.equal(data.me.badges.find((b) => b.name === 'Explorador').earned, true)

    const wrong = await call('POST', '/events/taller-de-directivos-2027/qr/ZZZZZZ', { token: ana })
    assert.equal(wrong.status, 404)
  })

  test('límite de participantes', async () => {
    const path = `/events/taller-de-directivos-2027/challenges/${limitedCh.id}/submissions`
    assert.equal((await call('POST', path, { token: beto, form: photoForm('client-lim-01') })).status, 201)
    const full = await call('POST', path, { token: ana, form: photoForm('client-lim-02') })
    assert.equal(full.status, 409)
    assert.equal(full.data.error.code, 'full')
  })

  test('rechazar quita los puntos y permite reintentar', async () => {
    const list = await call('GET', `/admin/events/${eventId}/submissions?challengeId=${limitedCh.id}`, { token: admin })
    const sub = list.data.items[0]
    await call('POST', `/admin/submissions/${sub.id}/review`, { token: admin, body: { decision: 'reject', reason: 'Foto borrosa' } })
    const { data } = await call('GET', '/events/taller-de-directivos-2027/challenges', { token: beto })
    const ch = data.challenges.find((c) => c.id === limitedCh.id)
    assert.equal(ch.state, 'rejected')
    assert.equal(ch.rejectReason, 'Foto borrosa')
    assert.equal(data.me.xp, 0)
    // El rechazo libera el cupo.
    const retry = await call('POST', `/events/taller-de-directivos-2027/challenges/${limitedCh.id}/submissions`, {
      token: beto,
      form: photoForm('client-lim-03'),
    })
    assert.equal(retry.status, 201)
  })

  test('ranking individual y por equipo', async () => {
    const { data } = await call('GET', '/events/taller-de-directivos-2027/ranking', { token: beto })
    assert.equal(data.participants[0].alias, 'Ana')
    assert.equal(data.participants[0].xp, 85)
    assert.equal(data.me.alias, 'Beto')
    assert.equal(data.me.rank, 2)
    assert.equal(data.teams[0].name, 'Rama A')
  })

  test('recuperar la cuenta en otro teléfono', async () => {
    const me = (await call('GET', '/events/taller-de-directivos-2027/me', { token: beto })).data.me
    const rec = await call('POST', '/events/taller-de-directivos-2027/recover', { body: { code: me.recoveryCode.toLowerCase() } })
    assert.equal(rec.status, 200)
    assert.equal(rec.data.me.alias, 'Beto')
    assert.equal((await call('GET', '/events/taller-de-directivos-2027/me', { token: beto })).status, 401, 'el token viejo queda inválido')
    beto = rec.data.token
  })

  test('borrar mi foto quita los puntos', async () => {
    const mine = await call('GET', '/events/taller-de-directivos-2027/me/submissions', { token: ana })
    const ar = mine.data.items.find((s) => s.challenge.type === 'AR')
    const del = await call('DELETE', `/events/taller-de-directivos-2027/me/submissions/${ar.id}`, { token: ana })
    assert.equal(del.data.me.xp, 70)
    const other = await call('DELETE', `/events/taller-de-directivos-2027/me/submissions/${ar.id}`, { token: beto })
    assert.equal(other.status, 404)
  })

  test('suspender a un participante', async () => {
    const list = await call('GET', `/admin/events/${eventId}/participants`, { token: mod })
    const b = list.data.participants.find((p) => p.alias === 'Beto')
    await call('PATCH', `/admin/participants/${b.id}`, { token: mod, body: { banned: true } })
    const res = await call('GET', '/events/taller-de-directivos-2027/me', { token: beto })
    assert.equal(res.status, 403)
    assert.equal(res.data.error.code, 'banned')
    await call('PATCH', `/admin/participants/${b.id}`, { token: mod, body: { banned: false } })
  })

  test('estadísticas y exportación ZIP', async () => {
    const stats = await call('GET', `/admin/events/${eventId}/stats`, { token: mod })
    assert.equal(stats.data.totals.participants, 2)
    assert.ok(stats.data.byChallenge.length >= 6)

    const exp = await call('POST', `/admin/events/${eventId}/export`, { token: mod, body: { status: 'approved' } })
    assert.equal(exp.data.count, 2, 'la de Ana y el reintento de Beto (auto-aprobado)')
    const zip = await call('GET', `/${exp.data.url}`)
    assert.equal(zip.status, 200)
    assert.equal(zip.res.headers.get('content-type'), 'application/zip')
    assert.equal(Buffer.from(zip.data).subarray(0, 2).toString(), 'PK')
    const forged = await call('GET', `/${exp.data.url.replace('status=approved', 'status=all')}`)
    assert.equal(forged.status, 403)
  })

  test('duplicar el evento para la RNR', async () => {
    const dup = await call('POST', `/admin/events/${eventId}/duplicate`, { token: admin, body: { name: 'RNR 2027' } })
    assert.equal(dup.status, 201)
    const newId = dup.data.event.id
    assert.equal(dup.data.event.slug, 'rnr-2027')
    assert.notEqual(dup.data.event.joinCode, joinCode)
    const list = (await call('GET', `/admin/events/${newId}/challenges`, { token: admin })).data.challenges
    assert.equal(list.length, 6)
    assert.ok(list.every((c) => c.status === 'draft'), 'los retos copiados empiezan en borrador')
    const newPhoto = list.find((c) => c.title === 'Conoce una nueva Rama')
    const newLocked = list.find((c) => c.title === 'Nivel 2')
    assert.deepEqual(newLocked.unlockRule, { afterChallenges: [newPhoto.id] })
    const teams = (await call('GET', `/admin/events/${newId}/teams`, { token: admin })).data.teams
    assert.equal(teams.length, 2)
  })

  test('cerrar el evento bloquea nuevos envíos', async () => {
    await call('PATCH', `/admin/events/${eventId}`, { token: admin, body: { status: 'closed' } })
    const res = await call('POST', `/events/taller-de-directivos-2027/qr/${qrCh.qrCode}`, { token: beto })
    assert.equal(res.status, 403)
    assert.equal(res.data.error.code, 'event_closed')
    const join = await call('POST', '/events/taller-de-directivos-2027/join', { body: { alias: 'Caro', teamId: teamA, consent: true, code: joinCode } })
    assert.equal(join.status, 403)
    // La galería y el ranking siguen disponibles.
    assert.equal((await call('GET', '/events/taller-de-directivos-2027/ranking', { token: ana })).status, 200)
  })
})
