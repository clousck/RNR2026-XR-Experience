import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../../api/client'
import { getGallery, setLike } from '../../api/quest'
import { useQuest } from './QuestContext'
import { ErrorBox, Screen, Spinner } from './ui'

export default function GalleryScreen() {
  const { slug, token, event } = useQuest()
  const [filters, setFilters] = useState({ challengeId: '', teamId: '' })
  const [items, setItems] = useState([])
  const [options, setOptions] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // indice de la foto abierta
  const sentinel = useRef(null)
  const seq = useRef(0)

  const load = useCallback(
    async (before = null) => {
      const id = ++seq.current
      setLoading(true)
      setError(null)
      try {
        const res = await getGallery(slug, token, { ...filters, before })
        if (id !== seq.current) return
        setItems((prev) => (before ? [...prev, ...res.items] : res.items))
        setCursor(res.nextCursor)
        if (res.filters) setOptions((o) => o ?? res.filters)
      } catch (e) {
        if (id === seq.current) setError(e)
      } finally {
        if (id === seq.current) setLoading(false)
      }
    },
    [slug, token, filters],
  )

  useEffect(() => {
    load()
  }, [load])

  // Carga la siguiente pagina al llegar al final.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !cursor) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) load(cursor)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, loading, load])

  const toggleLike = async (photo) => {
    const liked = !photo.liked
    const patch = (p) => (p.id === photo.id ? { ...p, liked, likes: p.likes + (liked ? 1 : -1) } : p)
    setItems((list) => list.map(patch))
    try {
      const res = await setLike(slug, token, photo.id, liked)
      setItems((list) => list.map((p) => (p.id === photo.id ? { ...p, ...res } : p)))
    } catch {
      setItems((list) => list.map((p) => (p.id === photo.id ? photo : p)))
    }
  }

  const current = open != null ? items[open] : null

  return (
    <Screen title="Galería">
      <div className="filters">
        <select
          value={filters.challengeId}
          onChange={(e) => setFilters((f) => ({ ...f, challengeId: e.target.value }))}
          aria-label="Filtrar por reto"
        >
          <option value="">Todos los retos</option>
          {options?.challenges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.title}
            </option>
          ))}
        </select>
        {options?.teams.length > 0 && (
          <select
            value={filters.teamId}
            onChange={(e) => setFilters((f) => ({ ...f, teamId: e.target.value }))}
            aria-label={`Filtrar por ${event.settings.teamLabel}`}
          >
            <option value="">Todas las {event.settings.teamLabel}s</option>
            {options.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ErrorBox error={error} retry={() => load()} />

      <div className="grid">
        {items.map((p, i) => (
          <button key={p.id} className="tile" onClick={() => setOpen(i)} aria-label={`Foto de ${p.alias}`}>
            <img src={mediaUrl(p.thumbUrl)} alt="" loading="lazy" />
            {p.likes > 0 && <span className="tile-likes">♥ {p.likes}</span>}
          </button>
        ))}
      </div>
      <div ref={sentinel} />
      {loading && <Spinner />}
      {!loading && !items.length && !error && <p className="empty">Aún no hay fotos aprobadas aquí.</p>}

      {current && (
        <PhotoViewer
          photo={current}
          likesEnabled={event.settings.likes}
          onLike={() => toggleLike(current)}
          onClose={() => setOpen(null)}
          onPrev={open > 0 ? () => setOpen(open - 1) : null}
          onNext={open < items.length - 1 ? () => setOpen(open + 1) : null}
        />
      )}
    </Screen>
  )
}

export function PhotoViewer({ photo, likesEnabled, onLike, onClose, onPrev, onNext }) {
  const touch = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  // Deslizar a los lados cambia de foto.
  const onTouchStart = (e) => (touch.current = e.touches[0].clientX)
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - (touch.current ?? 0)
    if (dx > 60) onPrev?.()
    if (dx < -60) onNext?.()
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button className="viewer-close" onClick={onClose} aria-label="Cerrar">
        ✕
      </button>
      <img src={mediaUrl(photo.url)} alt={`Foto de ${photo.alias}`} />
      <div className="viewer-info">
        <div>
          <strong>{photo.alias}</strong>
          {photo.team && <span className="muted"> · {photo.team}</span>}
          <p className="muted small">
            {photo.challenge.icon} {photo.challenge.title}
          </p>
        </div>
        {likesEnabled && (
          <button className={photo.liked ? 'like on' : 'like'} onClick={onLike} aria-pressed={photo.liked}>
            ♥ {photo.likes}
          </button>
        )}
      </div>
      {onPrev && (
        <button className="viewer-nav prev" onClick={onPrev} aria-label="Anterior">
          ‹
        </button>
      )}
      {onNext && (
        <button className="viewer-nav next" onClick={onNext} aria-label="Siguiente">
          ›
        </button>
      )}
    </div>
  )
}
