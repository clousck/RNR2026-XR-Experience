import { useCallback, useEffect, useRef, useState } from 'react'
import WattCanvas from './components/WattCanvas'
import { useCamera } from './lib/useCamera'
import { composePhoto } from './lib/composePhoto'
import { buildPoseUSDZ, openQuickLook, supportsQuickLook } from './lib/quickLook'
import { POSES, initialPose } from './poses'
import './App.css'

const START_POSE = initialPose()
// ?nocam: no pide la camara (util para probar en escritorio / capturas).
const NO_CAM = new URLSearchParams(window.location.search).has('nocam')
const COUNTDOWN = 3
// Controles que no deben disparar el "tocar el piso" de WebXR.
const UI_SELECTOR = 'button, .top-bar, .bottom-bar, .preview, .banner'

/**
 * Modos de AR, segun el dispositivo:
 *  - webxr:     Android/Chrome. Watt en el piso, poses y foto dentro de la pagina.
 *  - quicklook: iPhone/iPad. Quick Look con la pose elegida; la foto se toma
 *               con el boton de captura de Quick Look.
 *  - none:      solo el modo camara con Watt encima.
 */
async function detectAR() {
  if (navigator.xr?.isSessionSupported) {
    try {
      if (await navigator.xr.isSessionSupported('immersive-ar')) return 'webxr'
    } catch {
      // sigue con el siguiente modo
    }
  }
  return supportsQuickLook() ? 'quicklook' : 'none'
}

export default function App() {
  const stageRef = useRef(null)
  const boothRef = useRef(null)
  const viewRef = useRef(null)
  // Arranca con la trasera; el boton ⇄ cambia a la frontal (selfie).
  const [facing, setFacing] = useState('environment')
  const [pose, setPose] = useState(START_POSE)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [count, setCount] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [notice, setNotice] = useState(null)
  const [arMode, setArMode] = useState('checking')
  const [inAR, setInAR] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [usdz, setUsdz] = useState(null)

  const { videoRef, status: camStatus, error: camError, retry: retryCam } = useCamera(
    facing,
    !NO_CAM && !inAR,
  )
  const mirror = facing === 'user'

  useEffect(() => {
    detectAR().then(setArMode)
  }, [])

  // Gestos sobre toda la pagina (no solo el canvas): en AR el canvas no se ve
  // y lo que recibe los toques es el overlay.
  useEffect(() => {
    if (!loaded) return
    return stageRef.current.attachGestures(boothRef.current)
  }, [loaded])

  // En AR, tocar un boton no debe mover a Watt.
  useEffect(() => {
    const el = boothRef.current
    const block = (e) => e.target.closest?.(UI_SELECTOR) && e.preventDefault()
    el.addEventListener('beforexrselect', block)
    return () => el.removeEventListener('beforexrselect', block)
  }, [])

  // iPhone: el USDZ de la pose se genera por adelantado, porque Quick Look
  // tiene que abrirse sincronicamente dentro del toque.
  useEffect(() => {
    if (arMode !== 'quicklook' || !loaded) return
    let cancelled = false
    let url = null
    buildPoseUSDZ(stageRef.current, pose)
      .then((u) => {
        url = u
        if (cancelled) URL.revokeObjectURL(u)
        else setUsdz(u)
      })
      .catch((e) => !cancelled && setNotice(`No se pudo preparar el AR: ${e.message}`))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setUsdz(null)
    }
  }, [arMode, loaded, pose])

  const enterAR = async () => {
    if (arMode === 'quicklook') {
      if (usdz) openQuickLook(usdz)
      return
    }
    // ARCore necesita la camara: soltamos la de getUserMedia antes de pedir la sesion.
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop())
    try {
      const { cameraAccess } = await stageRef.current.startAR(boothRef.current, {
        onPlaced: () => setPlaced(true),
        onEnd: () => {
          setInAR(false)
          setPlaced(false)
          setCount(null)
        },
      })
      setInAR(true)
      if (!cameraAccess) {
        setNotice('Este teléfono no permite fotos dentro del AR: usa la captura de pantalla del teléfono.')
      }
    } catch (e) {
      setNotice(`No se pudo iniciar el AR: ${e.message}`)
      retryCam()
    }
  }

  const exitAR = () => stageRef.current?.endAR()

  const capture = useCallback(async () => {
    const stage = stageRef.current
    const view = viewRef.current
    if (!stage || !view) return
    setFlashKey((k) => k + 1)
    try {
      const blob = stage.ar
        ? await stage.captureAR()
        : await composePhoto({
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

  // Compartir o descargar desde dentro de la sesion AR no es fiable (la hoja
  // de compartir queda detras): primero se sale del AR.
  const leaveARFirst = async () => {
    if (stageRef.current?.ar) await stageRef.current.endAR()
  }

  const download = async () => {
    await leaveARFirst()
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
      await download()
      setNotice('Tu navegador no permite compartir directo: la foto se descargó, súbela desde la galería.')
      return
    }
    await leaveARFirst()
    try {
      await navigator.share({ files: [file] })
    } catch (e) {
      if (e.name !== 'AbortError') setNotice('No se pudo compartir. Prueba con Descargar.')
    }
  }

  const counting = count !== null
  const canShoot = loaded && !counting && (!inAR || placed)
  const showARButton = !inAR && (arMode === 'webxr' || arMode === 'quicklook')

  let hint = null
  if (inAR) hint = placed ? 'Toca el piso para moverlo · pellizca para agrandar y girar' : 'Apunta al piso y toca para poner a Watt'
  else if (loaded) hint = 'Arrastra para mover · pellizca para agrandar y girar'

  return (
    <main className={inAR ? 'booth in-ar' : 'booth'} ref={boothRef}>
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

      {!NO_CAM && !inAR && camStatus === 'error' && (
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
        {inAR ? (
          <button className="icon-btn" onClick={exitAR} aria-label="Salir del AR">
            ✕
          </button>
        ) : (
          <button className="icon-btn" onClick={() => stageRef.current?.resetTransform()} aria-label="Centrar a Watt">
            ⟲
          </button>
        )}
        {hint && <p className="hint">{hint}</p>}
        {!NO_CAM && !inAR && (
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
        {showARButton && (
          <button
            className="ar-btn"
            onClick={enterAR}
            disabled={!loaded || (arMode === 'quicklook' && !usdz)}
          >
            {arMode === 'quicklook' && loaded && !usdz ? 'Preparando AR…' : 'Poner a Watt en el piso (AR)'}
          </button>
        )}
        {arMode === 'quicklook' && !inAR && (
          <p className="ar-note">En AR, toma la foto con el botón de foto de esa pantalla o con una captura de pantalla.</p>
        )}
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
          disabled={!canShoot}
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
