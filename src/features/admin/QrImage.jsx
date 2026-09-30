import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Codigo QR como imagen (se genera en el navegador, sin servicios externos). */
export default function QrImage({ value, size = 220, className = '' }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [value, size])
  if (!src) return <div className={`qr-img ${className}`} style={{ width: size, height: size }} />
  return <img className={`qr-img ${className}`} src={src} width={size} height={size} alt={`QR: ${value}`} />
}

/** URL publica del frontend (donde abre el QR). */
export const appOrigin = () => window.location.origin
export const eventJoinUrl = (event) => `${appOrigin()}/e/${event.slug}?c=${event.joinCode}`
export const checkpointUrl = (event, challenge) => `${appOrigin()}/e/${event.slug}/q/${challenge.qrCode}`

/** Fechas ISO ↔ <input type="datetime-local"> (hora local del navegador). */
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)
