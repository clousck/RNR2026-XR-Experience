import { useEffect, useRef } from 'react'
import { WattStage } from '../lib/wattStage'
import wattUrl from '../assets/watt.fbx?url'

/**
 * Canvas transparente con Watt. Expone la instancia de WattStage en
 * stageRef para que el padre maneje gestos, AR y la captura de la foto.
 */
export default function WattCanvas({ stageRef, pose, initialPose, face, initialFace, allFaces, onLoaded, onError }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const stage = new WattStage(canvasRef.current)
    let disposed = false

    stage
      .load(wattUrl, { texture: initialFace })
      .then(() => {
        if (disposed) return
        stage.setPose(initialPose, true)
        stageRef.current = stage
        // Las otras caras se precargan para que el cambio sea instantaneo.
        stage.preloadTextures(allFaces).catch((e) => console.warn('[watt] no se pudo precargar una cara', e))
        // Solo en dev: permite inspeccionar la escena desde la consola.
        if (import.meta.env.DEV) window.__watt = stage
        onLoaded?.()
      })
      .catch((e) => !disposed && onError?.(e))

    return () => {
      disposed = true
      stage.dispose()
      stageRef.current = null
    }
    // Solo al montar: pose y cara se cambian en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    stageRef.current?.setPose(pose)
  }, [pose, stageRef])

  useEffect(() => {
    stageRef.current?.setFace(face)
  }, [face, stageRef])

  return <canvas ref={canvasRef} className="watt-canvas" />
}
