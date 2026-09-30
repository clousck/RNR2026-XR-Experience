import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { API_BASE, mediaUrl } from '../../api/client'
import { exportPhotos, listChallenges, listSubmissions, listTeams } from '../../api/admin'
import { useAsync } from '../../shared/useAsync'
import { ErrorBox, Spinner } from '../quest/ui'
import { useEventAdmin } from './AdminContext'

/** Todas las fotos del evento, con filtros, descarga individual y ZIP. */
export default function GalleryAdmin() {
  const { event } = useEventAdmin()
  const [params, setParams] = useSearchParams()
  const filters = {
    status: params.get('status') ?? 'approved',
    challengeId: params.get('challengeId') ?? '',
    teamId: params.get('teamId') ?? '',
    participantId: params.get('participantId') ?? '',
  }
  const challenges = useAsync(() => listChallenges(event.id), [event.id])
  const teams = useAsync(() => listTeams(event.id), [event.id])
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const key = params.toString()

  const load = useCallback(
    async (from = null) => {
      setLoading(true)
      setError(null)
      try {
        const res = await listSubmissions(event.id, {
          status: filters.status === 'all' ? '' : filters.status,
          challengeId: filters.challengeId,
          teamId: filters.teamId,
          participantId: filters.participantId,
          photos: '1',
          cursor: from,
          limit: 60,
        })
        setItems((prev) => (from ? [...prev, ...res.items] : res.items))
        setCursor(res.nextCursor)
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
      }
    },
    // key resume los filtros de la URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event.id, key],
  )

  useEffect(() => {
    load()
  }, [load])

  const setFilter = (name) => (e) => {
    const next = new URLSearchParams(params)
    if (e.target.value) next.set(name, e.target.value)
    else next.delete(name)
    setParams(next, { replace: true })
  }

  const downloadZip = async () => {
    setExporting(true)
    try {
      const { url, count } = await exportPhotos(event.id, {
        status: filters.status === 'approved' ? 'approved' : 'all',
        challengeId: filters.challengeId,
        teamId: filters.teamId,
      })
      if (!count) {
        window.alert('No hay fotos con estos filtros.')
        return
      }
      window.location.href = `${API_BASE}/${url}`
    } catch (e) {
      setError(e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="admin-page">
      <div className="toolbar wrap">
        <select value={filters.status} onChange={setFilter('status')} aria-label="Estado">
          <option value="approved">Aprobadas</option>
          <option value="pending">Pendientes</option>
          <option value="rejected">Rechazadas</option>
          <option value="all">Todas</option>
        </select>
        <select value={filters.challengeId} onChange={setFilter('challengeId')} aria-label="Reto">
          <option value="">Todos los retos</option>
          {challenges.data?.challenges
            .filter((c) => c.type !== 'QR')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.title}
              </option>
            ))}
        </select>
        <select value={filters.teamId} onChange={setFilter('teamId')} aria-label={event.settings.teamLabel}>
          <option value="">Todas las {event.settings.teamLabel}s</option>
          {teams.data?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {filters.participantId && (
          <button className="btn small" onClick={setFilter('participantId')} value="">
            Quitar filtro de persona ✕
          </button>
        )}
        <button className="btn primary" onClick={downloadZip} disabled={exporting}>
          {exporting ? 'Preparando…' : '⬇ Descargar ZIP'}
        </button>
      </div>
      <p className="muted small">El ZIP incluye las fotos aprobadas (o todas) según el reto y la {event.settings.teamLabel} elegidos.</p>

      <ErrorBox error={error} retry={() => load()} />
      <div className="admin-grid">
        {items.map((s) => (
          <figure key={s.id} className="admin-photo">
            <a href={mediaUrl(s.photo.url)} target="_blank" rel="noreferrer">
              <img src={mediaUrl(s.photo.thumbUrl)} alt="" loading="lazy" />
            </a>
            <figcaption>
              <strong>{s.participant.alias}</strong>
              <span className="muted small">
                {s.challenge.icon} {s.challenge.title}
              </span>
              <span className="row small">
                {s.photo.likes > 0 && <span>♥ {s.photo.likes}</span>}
                {s.status !== 'approved' && <span className={`pill ${s.status === 'pending' ? 'warn' : 'bad'}`}>{s.status === 'pending' ? 'pendiente' : 'rechazada'}</span>}
                <a href={mediaUrl(s.photo.downloadUrl)} className="dl">
                  ⬇
                </a>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {loading && <Spinner />}
      {!loading && !items.length && <p className="empty">No hay fotos con estos filtros.</p>}
      {cursor && !loading && (
        <button className="btn block" onClick={() => load(cursor)}>
          Cargar más
        </button>
      )}
    </section>
  )
}
