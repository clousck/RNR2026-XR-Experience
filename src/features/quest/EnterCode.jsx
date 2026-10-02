import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { resolveJoinCode } from '../../api/quest'
import { session } from './session'
import { ErrorBox } from './ui'
import './quest.css'

/** /entrar: para quien no escaneo el QR y tiene el codigo del cartel. */
export default function EnterCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const mine = session.slugs()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { slug } = await resolveJoinCode(code)
      navigate(`/e/${slug}?c=${encodeURIComponent(code.trim())}`)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="quest">
      <section className="screen join">
        <div className="join-hero">
          <p className="eyebrow">SAC Quest</p>
          <h1>Entra a tu evento</h1>
          <p className="muted">Escribe el código que aparece en los carteles del evento.</p>
        </div>
        <form className="card form" onSubmit={submit}>
          <label>
            Código del evento
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="Ej. K7PQ2M"
              required
              autoFocus
            />
          </label>
          <ErrorBox error={error} />
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Buscando…' : 'Entrar'}
          </button>
        </form>
        {mine.length > 0 && (
          <div className="card">
            <h2>Tus eventos</h2>
            <ul className="plain-list">
              {mine.map((slug) => (
                <li key={slug}>
                  <Link to={`/e/${slug}`}>{slug}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
