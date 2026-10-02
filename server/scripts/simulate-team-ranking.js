// Simula el Score de Rama propuesto (maximo 300 puntos):
//   desempeño 150 + participacion 75 + retos colectivos 75
// con los tamaños reales de las Ramas. No toca la base ni el sistema.
//
//   node scripts/simulate-team-ranking.js

// --- configuracion del modelo (lo que despues iria en events.settings) ---

const CONFIG = {
  max: { performance: 150, participation: 75, collective: 75 },
  top: [1, 0.6, 0.4, 0.25, 0.15], // aporte de los 5 mejores al desempeño
  participationRef: 10, // activos con los que la participacion llega al maximo
}

// Inscritos por Rama (formulario del evento), de mayor a menor.
const SIZES = [29, 18, 9, 8, 8, 5, 4, 4, 4, 2, 2, 1, 1, 1, 1, 1, 1]
// Con Ramas unidas (maximo 5 personas): 2+2+1 y 1+1+1+1+1.
const SIZES_MERGED = [29, 18, 9, 8, 8, 5, 4, 4, 4, '5u', '5u']

// --- modelo ---

const isActive = (m) => m.xp > 0
const topSum = CONFIG.top.reduce((a, b) => a + b, 0)

/** Puntos de una Rama. xpPossible = XP que puede juntar una persona con todos los retos. */
function scoreTeam(members, goals, xpPossible, cfg = CONFIG) {
  const xs = members.map((m) => m.xp).sort((a, b) => b - a)
  const weighted = cfg.top.reduce((s, w, i) => s + w * (xs[i] ?? 0), 0)
  const active = members.filter(isActive).length
  const goalTotal = goals.reduce((s, g) => s + g.points, 0)
  const met = goals.filter((g) => members.filter((m) => m.done.has(g.challengeId)).length >= g.n)
  const perf = cfg.max.performance * Math.min(1, weighted / (topSum * xpPossible))
  const part = cfg.max.participation * Math.min(1, Math.log(1 + active) / Math.log(1 + cfg.participationRef))
  const coll = cfg.max.collective * (met.reduce((s, g) => s + g.points, 0) / goalTotal)
  return { active, perf, part, coll, score: perf + part + coll }
}

// --- catalogo supuesto ---

// 12 retos, 300 XP en total; el 13 es la foto grupal (0 XP, solo cuenta para la Rama).
const POINTS = [10, 20, 20, 20, 30, 20, 30, 40, 30, 20, 30, 30]
const XP = POINTS.reduce((a, b) => a + b, 0)
const GROUP_PHOTO = 13
// Ningun reto colectivo pide mas de 5 miembros.
const GOALS = [
  { name: '3 o más miembros completan el reto 2', points: 30, challengeId: 2, n: 3 },
  { name: '5 o más miembros completan el reto 4', points: 40, challengeId: 4, n: 5 },
  { name: 'Foto grupal de la Rama aprobada', points: 30, challengeId: GROUP_PHOTO, n: 1 },
]

/** Una persona hace los retos en orden hasta llegar a su XP objetivo. */
function member(target) {
  const done = new Set()
  let xp = 0
  POINTS.forEach((p, i) => {
    if (xp + p <= target) {
      xp += p
      done.add(i + 1)
    }
  })
  return { xp, done }
}

// Generador con semilla: los resultados son repetibles.
function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Rama al azar: cada inscrito participa con probabilidad `rate` y, si
 * participa, su XP sale de la misma distribucion para todas las Ramas
 * (muchos con poco, pocos con mucho). Asi solo cambian tamaño y ganas.
 */
function randomTeam(size, rate, rand) {
  const members = Array.from({ length: size }, () => member(rand() < rate ? 10 + 290 * rand() ** 2 : 0))
  const active = members.filter(isActive)
  // La foto grupal necesita al menos 3 activos y que se organicen (70 %).
  if (active.length >= 3 && rand() < 0.7) active[0].done.add(GROUP_PHOTO)
  return members
}

const pad = (s, n) => String(s).padEnd(n)
const num = (v, n = 7, d = 0) => v.toFixed(d).padStart(n)

/** rateOf(size, index) → probabilidad de participar de esa Rama */
function monteCarlo(title, sizes, rateOf, trials = 4000) {
  const rand = rng(42)
  const acc = sizes.map(() => ({ score: 0, perf: 0, part: 0, coll: 0, active: 0, wins: 0, podium: 0, rank: 0 }))
  for (let k = 0; k < trials; k++) {
    const rows = sizes.map((s, i) => scoreTeam(randomTeam(parseInt(s), rateOf(s, i), rand), GOALS, XP))
    const order = rows.map((r, i) => [r.score, i]).sort((a, b) => b[0] - a[0])
    order.forEach(([, i], pos) => {
      acc[i].rank += pos + 1
      if (pos === 0) acc[i].wins++
      if (pos < 3) acc[i].podium++
    })
    rows.forEach((r, i) => {
      for (const key of ['score', 'perf', 'part', 'coll', 'active']) acc[i][key] += r[key]
    })
  }
  console.log(`\n=== ${title} ===`)
  console.log(`${pad('Inscritos', 10)}${'activos'.padStart(8)}${'Desemp'.padStart(8)}${'Partic'.padStart(8)}${'Colect'.padStart(8)}${'TOTAL'.padStart(8)}${'puesto'.padStart(8)}${'gana'.padStart(7)}${'podio'.padStart(7)}`)
  console.log(`${pad('', 10)}${''.padStart(8)}${'/150'.padStart(8)}${'/75'.padStart(8)}${'/75'.padStart(8)}${'/300'.padStart(8)}`)
  sizes.forEach((s, i) => {
    const a = acc[i]
    const label = String(s).endsWith('u') ? `${parseInt(s)} (unidas)` : s
    console.log(
      `${pad(label, 10)}${num(a.active / trials, 8, 1)}${num(a.perf / trials, 8)}${num(a.part / trials, 8)}${num(a.coll / trials, 8)}${num(a.score / trials, 8)}${num(a.rank / trials, 8, 1)}${num((100 * a.wins) / trials, 6)}%${num((100 * a.podium) / trials, 6)}%`,
    )
  })
}

// --- salida ---

console.log(`Catálogo supuesto: ${POINTS.length} retos, ${XP} XP posibles para una persona.`)
console.log(`Desempeño máximo (150) = ${XP} × (${CONFIG.top.join(' + ')}) = ${topSum * XP} puntos ponderados.`)
console.log('Retos colectivos:')
GOALS.forEach((g) => console.log(`  · ${g.name} (${g.points} %)`))

console.log('\n=== Participación: puntos (de 75) según miembros activos ===')
console.log([1, 2, 3, 4, 5, 6, 8, 10, 15, 29].map((n) => `${n}→${scoreTeam(Array.from({ length: n }, () => member(10)), GOALS, XP).part.toFixed(0)}`).join('  '))

console.log('\n=== Topes: lo máximo que puede sacar una Rama según cuánta gente tiene (todos con todo el XP) ===')
for (const n of [1, 2, 3, 4, 5, 8, 10]) {
  const members = Array.from({ length: n }, () => member(XP))
  if (n >= 3) members[0].done.add(GROUP_PHOTO)
  const r = scoreTeam(members, GOALS, XP)
  console.log(`${pad(`${n} persona${n > 1 ? 's' : ''}`, 12)} desempeño ${num(r.perf, 4)} + participación ${num(r.part, 3)} + colectivo ${num(r.coll, 3)} = ${num(r.score, 4)} / 300`)
}

monteCarlo('Todas las Ramas participan igual (60 %) · promedio de 4000 eventos', SIZES, () => 0.6)
monteCarlo('La Rama de 29 participa poco (30 %); el resto 60 %', SIZES, (s) => (s === 29 ? 0.3 : 0.6))
monteCarlo('Las Ramas de 9 o menos participan mucho (90 %); las de 29 y 18, 60 %', SIZES, (s) => (parseInt(s) <= 9 ? 0.9 : 0.6))
monteCarlo('Con Ramas unidas (2+2+1 y 1+1+1+1+1) · todas 60 %', SIZES_MERGED, () => 0.6)
monteCarlo('Con Ramas unidas · las de 9 o menos participan mucho (90 %)', SIZES_MERGED, (s) => (parseInt(s) <= 9 ? 0.9 : 0.6))
