import { Link } from 'react-router'
import { listChallenges, reorderChallenges, updateChallenge } from '../../api/admin'
import { useAsync } from '../../shared/useAsync'
import { DIFFICULTY_LABEL, ErrorBox, Spinner, TYPE_LABEL } from '../quest/ui'
import { useAdmin, useEventAdmin } from './AdminContext'

export const CH_STATUS = { draft: 'Borrador', active: 'Activo', inactive: 'Inactivo' }

export default function ChallengesAdmin() {
  const { event } = useEventAdmin()
  const { isAdmin } = useAdmin()
  const { data, error, loading, reload, setData } = useAsync(() => listChallenges(event.id), [event.id])
  const list = data?.challenges ?? []
  const base = `/admin/e/${event.id}`

  const toggle = async (ch) => {
    const status = ch.status === 'active' ? 'inactive' : 'active'
    const { challenge } = await updateChallenge(ch.id, { status })
    setData((d) => ({ challenges: d.challenges.map((c) => (c.id === ch.id ? challenge : c)) }))
  }

  const move = async (index, delta) => {
    const next = [...list]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    setData({ challenges: next })
    await reorderChallenges(event.id, next.map((c) => c.id)).catch(reload)
  }

  return (
    <section className="admin-page">
      <div className="toolbar">
        <h2>Retos ({list.length})</h2>
        {isAdmin && (
          <div className="row">
            {list.some((c) => c.type === 'QR') && (
              <Link className="btn" to={`${base}/imprimir`}>
                🖨️ Imprimir QRs
              </Link>
            )}
            <Link className="btn primary" to={`${base}/retos/nuevo`}>
              + Nuevo reto
            </Link>
          </div>
        )}
      </div>
      <ErrorBox error={error} retry={reload} />
      {loading && !data && <Spinner />}

      <ul className="admin-list">
        {list.map((c, i) => (
          <li key={c.id} className={`card ch-row st-${c.status}`}>
            {isAdmin && (
              <div className="order-btns">
                <button className="btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  ↑
                </button>
                <button className="btn small" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
                  ↓
                </button>
              </div>
            )}
            <span className="ch-icon">{c.icon || '⭐'}</span>
            <div className="ch-row-body">
              <Link to={`${base}/retos/${c.id}`}>
                <strong>{c.title}</strong>
              </Link>
              <span className="muted small">
                {TYPE_LABEL[c.type]} · {c.points} XP · {DIFFICULTY_LABEL[c.difficulty]}
                {c.category && ` · ${c.category}`}
                {c.visibility === 'secret' && ' · 🤫 secreto'}
                {c.unlockRule && ' · 🔒 con desbloqueo'}
                {c.requiresApproval ? ' · 👀 revisión' : ' · ⚡ automático'}
              </span>
              <span className="muted small">
                ✓ {c.counts.approved} · ⏳ {c.counts.pending} · ✕ {c.counts.rejected}
                {c.maxCompletions && ` · cupo ${c.maxCompletions}`}
              </span>
            </div>
            <div className="ch-row-side">
              <span className={`pill st-${c.status}`}>{CH_STATUS[c.status]}</span>
              {isAdmin && (
                <button className="btn small" onClick={() => toggle(c)}>
                  {c.status === 'active' ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!loading && !list.length && <p className="empty">Crea el primer reto del evento.</p>}
    </section>
  )
}
