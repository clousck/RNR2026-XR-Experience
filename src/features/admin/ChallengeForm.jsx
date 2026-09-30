import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { mediaUrl } from '../../api/client'
import {
  createChallenge,
  deleteChallenge,
  deleteChallengeImage,
  getChallenge,
  listChallenges,
  regenerateQr,
  updateChallenge,
  uploadChallengeImage,
} from '../../api/admin'
import { prepareImage } from '../../shared/imageResize'
import { ErrorBox, Spinner } from '../quest/ui'
import { useAdmin, useEventAdmin } from './AdminContext'
import QrImage, { checkpointUrl, fromLocalInput, toLocalInput } from './QrImage'

const EMPTY = {
  type: 'PHOTO',
  title: '',
  description: '',
  icon: '📷',
  points: 20,
  category: '',
  difficulty: 'easy',
  status: 'active',
  visibility: 'visible',
  requiresApproval: true,
  availableFrom: '',
  availableUntil: '',
  maxCompletions: '',
  afterChallenges: [],
  minXp: '',
}

const TYPES = [
  ['PHOTO', '📷 Foto', 'La persona toma una foto con la cámara del teléfono.'],
  ['AR', '🐱 AR con Watt', 'Abre la cámara con Watt y la foto resultante es la evidencia.'],
  ['QR', '📍 Checkpoint QR', 'Se completa escaneando un QR impreso. No lleva foto.'],
]

const ICONS = ['📷', '🤝', '🐱', '📍', '🎤', '🧑‍🤝‍🧑', '🌐', '💡', '⚡', '🏆', '🎯', '🔒', '🍕', '🎉', '🤖', '🔌']

function toForm(c) {
  return {
    type: c.type,
    title: c.title,
    description: c.description,
    icon: c.icon,
    points: c.points,
    category: c.category,
    difficulty: c.difficulty,
    status: c.status,
    visibility: c.visibility,
    requiresApproval: c.requiresApproval,
    availableFrom: toLocalInput(c.availableFrom),
    availableUntil: toLocalInput(c.availableUntil),
    maxCompletions: c.maxCompletions ?? '',
    afterChallenges: c.unlockRule?.afterChallenges ?? [],
    minXp: c.unlockRule?.minXp ?? '',
  }
}

function toBody(f) {
  return {
    type: f.type,
    title: f.title,
    description: f.description,
    icon: f.icon,
    points: Number(f.points) || 0,
    category: f.category,
    difficulty: f.difficulty,
    status: f.status,
    visibility: f.visibility,
    requiresApproval: f.requiresApproval,
    availableFrom: fromLocalInput(f.availableFrom),
    availableUntil: fromLocalInput(f.availableUntil),
    maxCompletions: f.maxCompletions === '' ? null : Number(f.maxCompletions),
    unlockRule: { afterChallenges: f.afterChallenges, minXp: Number(f.minXp) || 0 },
  }
}

export default function ChallengeForm() {
  const { challengeId } = useParams()
  const { event } = useEventAdmin()
  const { isAdmin } = useAdmin()
  const navigate = useNavigate()
  const isNew = !challengeId
  const [form, setForm] = useState(EMPTY)
  const [challenge, setChallenge] = useState(null)
  const [others, setOthers] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const imageInput = useRef(null)
  const base = `/admin/e/${event.id}`

  useEffect(() => {
    listChallenges(event.id).then((r) => setOthers(r.challenges.filter((c) => String(c.id) !== challengeId)))
    if (isNew) return
    getChallenge(challengeId)
      .then(({ challenge }) => {
        setChallenge(challenge)
        setForm(toForm(challenge))
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [event.id, challengeId, isNew])

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isNew) {
        const { challenge } = await createChallenge(event.id, toBody(form))
        navigate(`${base}/retos/${challenge.id}`, { replace: true })
      } else {
        const { challenge } = await updateChallenge(challengeId, toBody(form))
        setChallenge(challenge)
        setSaved(true)
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const n = challenge.counts.approved + challenge.counts.pending
    const msg = n
      ? `Este reto tiene ${n} envíos. Borrarlo elimina sus fotos y los puntos ganados. ¿Seguro? (Para ocultarlo sin perder nada, desactívalo.)`
      : '¿Borrar este reto?'
    if (!window.confirm(msg)) return
    await deleteChallenge(challengeId)
    navigate(`${base}/retos`)
  }

  const onImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const { photo } = await prepareImage(file)
      const { challenge } = await uploadChallengeImage(challengeId, photo)
      setChallenge(challenge)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />
  const categories = [...new Set(others.map((c) => c.category).filter(Boolean))]
  const readOnly = !isAdmin

  return (
    <section className="admin-page narrow">
      <Link to={`${base}/retos`} className="muted small">
        ← Retos
      </Link>
      <h2>{isNew ? 'Nuevo reto' : form.title || 'Reto'}</h2>
      {readOnly && <p className="notice">Solo un administrador puede editar retos.</p>}

      <form className="card form" onSubmit={save}>
        <fieldset disabled={readOnly || busy}>
          <div className="type-picker">
            {TYPES.map(([value, label, help]) => (
              <label key={value} className={form.type === value ? 'on' : ''}>
                <input type="radio" name="type" value={value} checked={form.type === value} onChange={set('type')} />
                <strong>{label}</strong>
                <small>{help}</small>
              </label>
            ))}
          </div>

          <label>
            Título
            <input value={form.title} onChange={set('title')} required minLength={2} maxLength={80} placeholder="Conoce una nueva Rama" />
          </label>
          <label>
            Descripción (lo que la persona tiene que hacer)
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              maxLength={1000}
              placeholder="Encuentra a alguien de una Rama diferente y tómense una foto."
            />
          </label>

          <div className="form-grid">
            <label>
              Icono
              <input value={form.icon} onChange={set('icon')} maxLength={16} />
            </label>
            <label>
              Puntos (XP)
              <input type="number" min="0" max="10000" value={form.points} onChange={set('points')} required />
            </label>
            <label>
              Categoría
              <input value={form.category} onChange={set('category')} list="categories" maxLength={40} placeholder="Networking" />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              Dificultad
              <select value={form.difficulty} onChange={set('difficulty')}>
                <option value="easy">Fácil</option>
                <option value="medium">Media</option>
                <option value="hard">Difícil</option>
              </select>
            </label>
          </div>
          <div className="icon-picker">
            {ICONS.map((i) => (
              <button type="button" key={i} className={form.icon === i ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, icon: i }))}>
                {i}
              </button>
            ))}
          </div>

          <div className="form-grid">
            <label>
              Estado
              <select value={form.status} onChange={set('status')}>
                <option value="active">Activo (visible para participantes)</option>
                <option value="inactive">Inactivo (oculto)</option>
                <option value="draft">Borrador</option>
              </select>
            </label>
            <label>
              Visibilidad
              <select value={form.visibility} onChange={set('visibility')}>
                <option value="visible">Visible en la lista</option>
                <option value="secret">Secreto</option>
              </select>
            </label>
          </div>
          {form.visibility === 'secret' && (
            <p className="muted small">
              Un reto secreto no aparece en la lista hasta cumplir su condición de desbloqueo. Un checkpoint QR secreto sin
              condición aparece cuando alguien lo escanea.
            </p>
          )}

          {form.type !== 'QR' && (
            <label className="check">
              <input type="checkbox" checked={form.requiresApproval} onChange={set('requiresApproval')} />
              <span>Requiere aprobación de un moderador (recomendado para fotos)</span>
            </label>
          )}
          {form.type === 'QR' && (
            <label className="check">
              <input type="checkbox" checked={form.requiresApproval} onChange={set('requiresApproval')} />
              <span>Requiere confirmación de un moderador (normalmente no: el QR ya es la prueba)</span>
            </label>
          )}

          <details open={!!(form.availableFrom || form.availableUntil || form.maxCompletions)}>
            <summary>Horario y cupo</summary>
            <div className="form-grid">
              <label>
                Disponible desde
                <input type="datetime-local" value={form.availableFrom} onChange={set('availableFrom')} />
              </label>
              <label>
                Disponible hasta
                <input type="datetime-local" value={form.availableUntil} onChange={set('availableUntil')} />
              </label>
              <label>
                Límite de participantes
                <input type="number" min="1" value={form.maxCompletions} onChange={set('maxCompletions')} placeholder="Sin límite" />
              </label>
            </div>
          </details>

          <details open={!!(form.afterChallenges.length || form.minXp)}>
            <summary>Desbloqueo</summary>
            <p className="muted small">El reto aparece bloqueado (o escondido, si es secreto) hasta cumplir todo lo marcado.</p>
            <label>
              XP mínimo
              <input type="number" min="0" value={form.minXp} onChange={set('minXp')} placeholder="Sin mínimo" />
            </label>
            {others.length > 0 && <p className="muted small">Completar antes:</p>}
            <div className="check-list">
              {others.map((c) => (
                <label key={c.id} className="check">
                  <input
                    type="checkbox"
                    checked={form.afterChallenges.includes(c.id)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        afterChallenges: e.target.checked
                          ? [...f.afterChallenges, c.id]
                          : f.afterChallenges.filter((x) => x !== c.id),
                      }))
                    }
                  />
                  <span>
                    {c.icon} {c.title}
                  </span>
                </label>
              ))}
            </div>
          </details>
        </fieldset>

        <ErrorBox error={error} />
        {!readOnly && (
          <div className="row">
            <button className="btn primary" disabled={busy}>
              {isNew ? 'Crear reto' : 'Guardar cambios'}
            </button>
            {saved && <span className="saved">✓ Guardado</span>}
          </div>
        )}
      </form>

      {!isNew && challenge && (
        <>
          <div className="card">
            <h3>Imagen del reto (opcional)</h3>
            <p className="muted small">Reemplaza al icono en la app. Se recomienda cuadrada.</p>
            {challenge.imageUrl && <img className="ch-image-preview" src={mediaUrl(challenge.imageUrl)} alt="" />}
            {isAdmin && (
              <div className="row">
                <input ref={imageInput} type="file" accept="image/*" hidden onChange={onImage} />
                <button className="btn" onClick={() => imageInput.current.click()} disabled={busy}>
                  {challenge.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                </button>
                {challenge.imageUrl && (
                  <button className="btn" onClick={async () => setChallenge((await deleteChallengeImage(challenge.id)).challenge)}>
                    Quitar
                  </button>
                )}
              </div>
            )}
          </div>

          {challenge.type === 'QR' && challenge.qrCode && (
            <div className="card qr-card">
              <h3>Código QR del checkpoint</h3>
              <QrImage value={checkpointUrl(event, challenge)} size={200} />
              <p className="code-text">{challenge.qrCode}</p>
              <p className="muted small break">{checkpointUrl(event, challenge)}</p>
              <div className="row">
                <Link className="btn" to={`${base}/imprimir?reto=${challenge.id}`}>
                  🖨️ Imprimir
                </Link>
                {isAdmin && (
                  <button
                    className="btn"
                    onClick={async () => {
                      if (!window.confirm('El QR impreso actual dejará de funcionar. ¿Generar uno nuevo?')) return
                      setChallenge((await regenerateQr(challenge.id)).challenge)
                    }}
                  >
                    Generar otro código
                  </button>
                )}
              </div>
            </div>
          )}

          {isAdmin && (
            <button className="btn danger" onClick={remove}>
              Borrar reto
            </button>
          )}
        </>
      )}
    </section>
  )
}
