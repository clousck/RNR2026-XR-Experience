import { useEffect, useState } from 'react'

const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// ?rot=90 fuerza la rotacion (para probar en escritorio).
const FORCED = new URLSearchParams(window.location.search).get('rot')

function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0
  return ((a % 360) + 360) % 360
}

/**
 * Cuanto esta girado el telefono (0, 90, 180 o 270 grados, antihorario)
 * respecto de la pantalla, cuando el navegador NO roto la pagina, por
 * ejemplo con la rotacion automatica desactivada. Si la pagina si roto, el
 * navegador ya lo resolvio y devuelve 0.
 *
 * Se calcula con la gravedad del acelerometro. Ojo: iOS reporta la gravedad
 * con el signo invertido respecto de Android y de la especificacion.
 */
export function useDeviceRotation() {
  const [rotation, setRotation] = useState(() => (FORCED ? Number(FORCED) : 0))

  useEffect(() => {
    if (FORCED) return
    let physical = 0

    const update = () => setRotation(screenAngle() === 0 ? physical : 0)

    const onMotion = (e) => {
      const g = e.accelerationIncludingGravity
      if (g?.x == null || g?.y == null) return
      const sign = IS_IOS ? -1 : 1
      const x = g.x * sign
      const y = g.y * sign
      // Telefono casi horizontal (sobre una mesa): no hay "arriba" claro.
      if (Math.hypot(x, y) < 5) return
      const angle = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
      const snapped = (Math.round(angle / 90) % 4) * 90
      // Histeresis: solo cambia cuando queda claramente en otro cuadrante.
      const off = Math.abs(((angle - snapped + 540) % 360) - 180)
      if (snapped !== physical && off < 30) {
        physical = snapped
        update()
      }
    }

    window.addEventListener('devicemotion', onMotion)
    screen.orientation?.addEventListener('change', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('devicemotion', onMotion)
      screen.orientation?.removeEventListener('change', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return rotation
}

/** iOS 13+ exige permiso para el acelerometro, pedido desde un toque. */
export async function requestMotionPermission() {
  const request = globalThis.DeviceMotionEvent?.requestPermission
  if (typeof request !== 'function') return
  try {
    await request.call(DeviceMotionEvent)
  } catch {
    // Sin permiso: la foto sigue la orientacion de la pantalla.
  }
}
