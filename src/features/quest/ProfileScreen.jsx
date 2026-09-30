import { useState } from 'react'
import { Link } from 'react-router'
import { mediaUrl } from '../../api/client'
import { deleteMySubmission, getMySubmissions } from '../../api/quest'
import { useToast } from '../../shared/Toast'
import { useAsync } from '../../shared/useAsync'
import { useQuest } from './QuestContext'
import { ErrorBox, LevelBar, Screen, Spinner, StateBadge } from './ui'

const SUB_LABEL = { pending: 'En revisión', approved: 'Aprobada', rejected: 'Rechazada' }

export default function ProfileScreen() {
  const { slug, token, home, refresh, signOut } = useQuest()
  const { me } = home
  const toast = useToast()
  const subs = useAsync(() => getMySubmissions(slug, token), [slug, token])
  const [confirmOut, setConfirmOut] = useState(false)
  const earned = me.badges.filter((b) => b.earned).length

  const remove = async (s) => {
    const warn = s.status === 'approved' ? ` Perderás los ${s.pointsAwarded} XP de este reto.` : ''
    if (!window.confirm(`¿Borrar esta foto?${warn}`)) return
    try {
      await deleteMySubmission(slug, token, s.id)
      subs.setData((d) => ({ items: d.items.filter((x) => x.id !== s.id) }))
      refresh()
      toast('Foto borrada.')
    } catch (e) {
      toast(e.message, { tone: 'bad' })
    }
  }

  return (
    <Screen title="Mi perfil" className="profile">
      <div className="card">
        <h2 className="profile-name">{me.alias}</h2>
        {me.team && <p className="muted">{me.team.name}</p>}
        <LevelBar me={me} />
        <div className="stats-row">
          <div>
            <strong>{me.completed}</strong>
            <span>retos</span>
          </div>
          <div>
            <strong>#{me.rank ?? '–'}</strong>
            <span>ranking</span>
          </div>
          <div>
            <strong>
              {earned}/{me.badges.length}
            </strong>
            <span>logros</span>
          </div>
        </div>
      </div>

      {me.badges.length > 0 && (
        <>
          <h2 className="group-title">Logros</h2>
          <ul className="badges">
            {me.badges.map((b) => (
              <li key={b.id} className={b.earned ? 'earned' : ''} title={b.description}>
                <span className="badge-icon">{b.icon}</span>
                <strong>{b.name}</strong>
                <small>{b.description}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="group-title">Mis fotos</h2>
      <ErrorBox error={subs.error} retry={subs.reload} />
      {subs.loading && !subs.data && <Spinner />}
      {subs.data && (
        <ul className="my-subs">
          {subs.data.items.map((s) => (
            <li key={s.id}>
              {s.photo ? (
                <a href={mediaUrl(s.photo.url)} target="_blank" rel="noreferrer">
                  <img src={mediaUrl(s.photo.thumbUrl)} alt="" loading="lazy" />
                </a>
              ) : (
                <span className="no-photo">{s.challenge.icon || '📍'}</span>
              )}
              <div className="sub-body">
                <strong>{s.challenge.title}</strong>
                <StateBadge state={s.status} label={SUB_LABEL[s.status]} />
                {s.status === 'approved' && <span className="points">+{s.pointsAwarded}</span>}
                {s.rejectReason && <small className="muted">{s.rejectReason}</small>}
              </div>
              {s.photo && (
                <button className="icon-only" onClick={() => remove(s)} aria-label="Borrar foto">
                  🗑️
                </button>
              )}
            </li>
          ))}
          {!subs.data.items.length && <p className="empty">Aún no enviaste fotos.</p>}
        </ul>
      )}

      <Link className="btn block watt-link" to={`/e/${slug}/watt`}>
        🐱 Foto libre con Watt
      </Link>

      <div className="card recovery">
        <h2>Tu código de recuperación</h2>
        <p className="code">{me.recoveryCode}</p>
        <p className="muted small">
          Guárdalo (una captura de pantalla sirve). Con él puedes seguir jugando desde otro teléfono o si se borran los datos
          del navegador.
        </p>
      </div>

      {confirmOut ? (
        <div className="card">
          <p>Para volver a entrar necesitarás tu código de recuperación: <strong>{me.recoveryCode}</strong></p>
          <button className="btn danger block" onClick={() => signOut()}>
            Salir de este teléfono
          </button>
          <button className="link-btn" onClick={() => setConfirmOut(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button className="link-btn muted" onClick={() => setConfirmOut(true)}>
          Salir de este teléfono
        </button>
      )}
    </Screen>
  )
}
