import { useEffect, useRef } from 'react'
import { WattStage } from '../lib/wattStage'
import wattUrl from '../assets/watt.fbx?url'

/**
 * Canvas transparente con Watt. Expone la instancia de WattStage en
 * stageRef para que el padre pueda capturar la foto o resetear la posicion.
 */
export default function WattCanvas({ stageRef, pose, initialPose, onLoaded, onError }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const stage = new WattStage(canvasRef.current)
    const detach = stage.attachGestures(canvasRef.current)
    let disposed = false

    stage
      .load(wattUrl)
      .then(() => {
        if (disposed) return
        stage.setPose(initialPose, true)
        stageRef.current = stage
        onLoaded?.()
      })
      .catch((e) => !disposed && onError?.(e))

    return () => {
      disposed = true
      detach()
      stage.dispose()
      stageRef.current = null
    }
    // Solo al montar: la pose se cambia en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    stageRef.current?.setPose(pose)
  }, [pose, stageRef])

  return <canvas ref={canvasRef} className="watt-canvas" />
}
