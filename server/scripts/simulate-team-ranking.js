// Simula el ranking por Rama con la formula propuesta y lo compara con el
// actual (suma). No modifica nada: solo lee la base.
//
//   node scripts/simulate-team-ranking.js              escenarios sinteticos
//   node scripts/simulate-team-ranking.js --real       datos de DATA_DIR/quest.db
//
// En la Pi, sin reconstruir la imagen (la base esta dentro del contenedor):
//   docker compose exec -T app node --input-type=module --disable-warning=ExperimentalWarning - --real < server/scripts/simulate-team-ranking.js
//
// Autocontenido a proposito (sin imports del proyecto) para poder pasarlo
// por stdin al contenedor.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// --- formulas ---

const WEIGHTS = [1, 0.6, 0.4, 0.25, 0.15]
const BONUS_PER_ACTIVE = 10
const BONUS_MAX = 100

/** members: [{ xp, active }] (active = al menos un reto aprobado con puntos) */
function current(members) {
  return members.reduce((s, m) => s + m.xp, 0)
}

function proposed(members) {
  const top = members.map((m) => m.xp).sort((a, b) => b - a)
  const main = WEIGHTS.reduce((s, w, i) => s + w * (top[i] ?? 0), 0)
  const active = members.filter((m) => m.active).length
  const bonus = Math.min(active * BONUS_PER_ACTIVE, BONUS_MAX)
  return { score: main + bonus, main, bonus, active }
}

// --- salida ---

const pad = (s, n) => String(s).padEnd(n)
const num = (v, n = 7) => String(Math.round(v * 10) / 10).padStart(n)

function compare(title, teams) {
  const rows = teams.map((t) => ({ ...t, cur: current(t.members), ...proposed(t.members) }))
  const curRank = new Map([...rows].sort((a, b) => b.cur - a.cur).map((r, i) => [r.name, i + 1]))
  rows.sort((a, b) => b.score - a.score)
  const w = Math.max(20, ...rows.map((r) => r.name.length + 2))
  console.log(`\n=== ${title} ===`)
  console.log(
    `${pad('#', 3)}${pad('Rama', w)}${pad('inscr.', 7)}${pad('activos', 8)}${'suma'.padStart(7)}  ${'top5'.padStart(7)}${'bonus'.padStart(7)}${'score'.padStart(8)}  antes`,
  )
  rows.forEach((r, i) => {
    const before = curRank.get(r.name)
    const move = before === i + 1 ? '=' : before > i + 1 ? `↑${before - i - 1}` : `↓${i + 1 - before}`
    console.log(
      `${pad(i + 1, 3)}${pad(r.name, w)}${pad(r.members.length, 7)}${pad(r.active, 8)}${num(r.cur)}  ${num(r.main)}${num(r.bonus)}${num(r.score, 8)}  #${before} ${move}`,
    )
  })
  return rows
}

// --- datos reales ---

function real() {
  const file = join(resolve(process.env.DATA_DIR || './data'), 'quest.db')
  if (!existsSync(file)) {
    console.error(`No existe ${file}. Define DATA_DIR o corre dentro del contenedor.`)
    process.exit(1)
  }
  const db = new DatabaseSync(file, { readOnly: true })
  for (const ev of db.prepare('SELECT id, name FROM events ORDER BY id').all()) {
    const people = db
      .prepare(
        `SELECT p.id, p.team_id, t.name AS team,
                COALESCE(SUM(s.points_awarded), 0) AS xp,
                SUM(CASE WHEN s.points_awarded > 0 THEN 1 ELSE 0 END) AS scored
           FROM participants p
           JOIN teams t ON t.id = p.team_id
           LEFT JOIN submissions s ON s.participant_id = p.id AND s.status = 'approved'
          WHERE p.event_id = ? AND p.banned = 0
          GROUP BY p.id`,
      )
      .all(ev.id)
    const teams = new Map()
    for (const t of db.prepare('SELECT name FROM teams WHERE event_id = ?').all(ev.id)) teams.set(t.name, [])
    for (const p of people) teams.get(p.team).push({ xp: p.xp, active: p.scored > 0 })
    compare(`${ev.name} (datos reales, ${people.length} inscritos con Rama)`, [...teams].map(([name, members]) => ({ name, members })))
  }
  db.close()
}

// --- escenarios sinteticos ---
// Escala supuesta: retos de 10-40 XP; quien hace todo llega a ~300 XP.

const team = (name, size, xps) => ({
  name,
  members: Array.from({ length: size }, (_, i) => ({ xp: xps[i] ?? 0, active: (xps[i] ?? 0) > 0 })),
})
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i))

function synthetic() {
  compare('Los 6 escenarios juntos', [
    team('1. Solo, muy activa', 1, [300]),
    team('2. 40 inscr., 1 juega', 40, [150]),
    team('3. 40 inscr., 5 juegan', 40, [200, 150, 120, 100, 80]),
    team('4. 40 inscr., 10 juegan', 40, [200, 150, 120, 100, 80, 70, 60, 50, 40, 30]),
    team('5. 40 inscr., 30 juegan poco', 40, range(30, (i) => 20 + (i % 3) * 10)),
    team('6. 3 personas muy activas', 3, [280, 260, 240]),
  ])

  console.log('\n=== Comprobaciones ===')
  const check = (ok, text) => console.log(`${ok ? '✓' : '✗'} ${text}`)

  // Inscritos sin actividad no suman
  const a = proposed(team('', 1, [100]).members).score
  const b = proposed(team('', 40, [100]).members).score
  check(a === b, `Inscritos sin actividad no dan ventaja: 1 inscrito = ${a}, 40 inscritos con 1 activo = ${b}`)

  // Trabajo que necesita una Rama de 40 para empatar con una persona sola
  const solo = proposed(team('', 1, [300]).members).score
  for (const k of [1, 5, 10]) {
    let x = 0
    while (proposed(team('', 40, range(k, () => x)).members).score < solo) x++
    console.log(`  Rama de 40 con ${k} activos empata a la persona sola de 300 XP con ${x} XP cada uno → ${x * k} XP en total (${((x * k) / 300).toFixed(1)}× el trabajo)`)
  }

  // Cada miembro activo extra suma algo
  const flat = []
  for (let n = 1; n <= 40; n++) {
    const s0 = proposed(team('', 40, range(n - 1, () => 100).concat([0])).members).score
    const s1 = proposed(team('', 40, range(n - 1, () => 100).concat([20])).members).score
    if (s1 <= s0) flat.push(n)
  }
  check(
    flat.length === 0,
    flat.length
      ? `Un miembro activo extra (con 20 XP, fuera del top 5) deja de sumar desde el activo n.º ${flat[0]}`
      : 'Cada miembro activo extra siempre suma algo',
  )

  // Una sola persona puede competir
  const typical = proposed(team('', 40, [200, 150, 120, 100, 80]).members).score
  const soloMax = proposed(team('', 1, [300]).members).score
  check(soloMax >= typical * 0.75, `Persona sola con 300 XP (${soloMax}) frente a una Rama de 5 activos típicos (${typical}): ${Math.round((soloMax / typical) * 100)} %`)

  // El bonus no domina
  for (const [name, xps] of [
    ['activos típicos', [200, 150, 120, 100, 80, 70, 60, 50, 40, 30]],
    ['30 activos con 20-40 XP', range(30, (i) => 20 + (i % 3) * 10)],
    ['10 activos con solo la selfie (10 XP)', range(10, () => 10)],
  ]) {
    const r = proposed(team('', 40, xps).members)
    console.log(`  Peso del bonus, ${name}: ${r.bonus} de ${r.score} (${Math.round((r.bonus / r.score) * 100)} %)`)
  }
}

if (process.argv.includes('--real')) real()
else synthetic()
