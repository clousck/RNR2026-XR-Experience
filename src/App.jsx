import { useCallback, useEffect, useRef, useState } from 'react'
import WattCanvas from './components/WattCanvas'
import { useCamera } from './lib/useCamera'
import { composePhoto } from './lib/composePhoto'
import { POSES, initialPose } from './poses'
import './App.css'

const START_POSE = initialPose()
// ?nocam: no pide la camara (util para probar en escritorio / capturas).
const NO_CAM = new URLSearchParams(window.location.search).has('nocam')
const COUNTDOWN = 3

export default function App() {
  const stageRef = useRef(null)
  const viewRef = useRef(null)
  const [facing, setFacing] = useState('user')
  const [pose, setPose] = useState(START_POSE)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [count, setCount] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [notice, setNotice] = useState(null)

  const { videoRef, status: camStatus, error: camError, retry: retryCam } = useCamera(facing, !NO_CAM)
  const mirror = facing === 'user'

  const capture = useCallback(async () => {
    const stage = stageRef.current
    const view = viewRef.current
    if (!stage || !view) return
    setFlashKey((k) => k + 1)
    try {
      const blob = await composePhoto({
        video: NO_CAM ? null : videoRef.current,
        mirror,
        stage,
        viewW: view.clientWidth,
        viewH: view.clientHeight,
      })
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch (e) {
      setNotice(e.message)
    }
  }, [videoRef, mirror])

  // Cuenta regresiva 3 → 2 → 1 → foto.
  useEffect(() => {
    if (count === null) return
    const id = setTimeout(() => {
      if (count > 1) {
        setCount(count - 1)
      } else {
        setCount(null)
        capture()
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [count, capture])

  const closePhoto = () => {
    URL.revokeObjectURL(photo.url)
    setPhoto(null)
  }

  const fileName = () => `foto-con-watt-${Date.now()}.jpg`

  const download = () => {
    const a = document.createElement('a')
    a.href = photo.url
    a.download = fileName()
    a.click()
  }

  // Web Share abre la hoja de compartir del sistema, donde aparece WhatsApp.
  // Solo mandamos el archivo: si se agrega texto, algunas apps descartan la imagen.
  const share = async () => {
    const file = new File([photo.blob], fileName(), { type: 'image/jpeg' })
    if (!navigator.canShare?.({ files: [file] })) {
      download()
      setNotice('Tu navegador no permite compartir directo: la foto se descargó, súbela desde la galería.')
      return
    }
    try {
      await navigator.share({ files: [file] })
    } catch (e) {
      if (e.name !== 'AbortError') setNotice('No se pudo compartir. Prueba con Descargar.')
    }
  }

  const counting = count !== null

  return (
    <main className="booth">
      <div className="view" ref={viewRef}>
        {NO_CAM ? (
          <div className="backdrop" />
        ) : (
          <video
            ref={videoRef}
            className={mirror ? 'camera mirror' : 'camera'}
            playsInline
            muted
            autoPlay
          />
        )}
        <WattCanvas
          stageRef={stageRef}
          pose={pose}
          initialPose={START_POSE}
          onLoaded={() => setLoaded(true)}
          onError={(e) => setLoadError(e.message || String(e))}
        />
      </div>

      {!loaded && !loadError && <div className="overlay-msg">Cargando a Watt…</div>}
      {loadError && <div className="overlay-msg error">No se pudo cargar a Watt: {loadError}</div>}

      {!NO_CAM && camStatus === 'error' && (
        <div className="banner">
          {camError}
          <button onClick={retryCam}>Reintentar</button>
        </div>
      )}

      {notice && (
        <div className="banner" onClick={() => setNotice(null)}>
          {notice}
          <button>OK</button>
        </div>
      )}

      <header className="top-bar">
        <button className="icon-btn" onClick={() => stageRef.current?.resetTransform()} aria-label="Centrar a Watt">
          ⟲
        </button>
        {loaded && <p className="hint">Arrastra para mover · pellizca para agrandar y girar</p>}
        {!NO_CAM && (
          <button
            className="icon-btn"
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            aria-label="Cambiar cámara"
          >
            ⇄
          </button>
        )}
      </header>

      <footer className="bottom-bar">
        <div className="poses">
          {POSES.map((p) => (
            <button
              key={p.clip}
              className={p.clip === pose ? 'pose active' : 'pose'}
              onClick={() => setPose(p.clip)}
              disabled={!loaded}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          className="shutter"
          onClick={() => setCount(COUNTDOWN)}
          disabled={!loaded || counting}
          aria-label="Tomar foto en 3 segundos"
        >
          <span>{COUNTDOWN}s</span>
        </button>
      </footer>

      {counting && (
        <div className="countdown" key={count}>
          {count}
        </div>
      )}
      {flashKey > 0 && <div className="flash" key={flashKey} />}

      {photo && (
        <div className="preview">
          <img src={photo.url} alt="Tu foto con Watt" />
          <p className="preview-hint">Toca Compartir, elige WhatsApp y el grupo de la gincana.</p>
          <div className="preview-actions">
            <button className="primary" onClick={share}>Compartir</button>
            <button onClick={download}>Descargar</button>
            <button onClick={closePhoto}>Otra foto</button>
          </div>
        </div>
      )}
    </main>
  )
}
