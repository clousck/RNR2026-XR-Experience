import { useEffect, useRef, useState } from 'react'

const MESSAGES = {
  NotAllowedError: 'Permiso de cámara denegado. Habilítalo en los ajustes del navegador y recarga.',
  NotFoundError: 'No se encontró ninguna cámara.',
  NotReadableError: 'La cámara está siendo usada por otra app.',
  OverconstrainedError: 'Esta cámara no está disponible.',
}

/**
 * Abre la camara (`user` = frontal, `environment` = trasera) y la conecta al
 * <video> de videoRef. `enabled: false` no pide la camara (modo ?nocam).
 */
export function useCamera(facing, enabled = true) {
  const videoRef = useRef(null)
  const [state, setState] = useState({ status: 'starting', error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let stream
    let cancelled = false

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('Este navegador no permite usar la cámara (se necesita HTTPS).'), {
            name: 'Unsupported',
          })
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) return
        const video = videoRef.current
        video.srcObject = stream
        await video.play().catch(() => {})
        setState({ status: 'ready', error: null })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: MESSAGES[e.name] ?? e.message })
      }
    }
    start()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [facing, enabled, attempt])

  return { videoRef, ...state, retry: () => setAttempt((n) => n + 1) }
}
