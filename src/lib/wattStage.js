import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  LoadingManager,
  MathUtils,
  PerspectiveCamera,
  PropertyBinding,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

const FOV = 35
const CAM_DIST = 3
const HOME = { x: 0, y: 0.08, scale: 0.8, rotY: 0 }

// Texturas que el FBX referencia por ruta externa (no vienen embebidas).
// Se resuelven por nombre de archivo contra lo que haya en src/assets/.
const ASSET_TEXTURES = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.split('/').pop().toLowerCase(), url]),
)
const WHITE_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

/**
 * Escena three.js con fondo transparente, pensada para ir encima del video
 * de la camara. Watt se normaliza a 1 unidad de alto con los pies en y=0.
 */
export class WattStage {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)

    this.scene = new Scene()
    this.camera = new PerspectiveCamera(FOV, 1, 0.05, 50)
    this.camera.position.set(0, 0.5, CAM_DIST)
    this.camera.lookAt(0, 0.5, 0)

    this.scene.add(new HemisphereLight(0xffffff, 0x9a9aa8, 2.4))
    const key = new DirectionalLight(0xffffff, 1.6)
    key.position.set(1.5, 2.5, 2.5)
    this.scene.add(key)

    // `root` recibe los gestos (mover, escalar, girar); el modelo va adentro.
    this.root = new Group()
    this.scene.add(this.root)
    this.resetTransform()

    this.poses = new Map()
    this.targets = null
    this.size = { w: 0, h: 0 }
    this.last = performance.now()
    this.frame = this.frame.bind(this)
    this.raf = requestAnimationFrame(this.frame)
  }

  async load(url) {
    // El FBX guarda la ruta de la textura de la PC donde se exporto
    // (C:\Users\...\gatoieeee.png). La buscamos por nombre en src/assets/
    // y, si no esta, usamos un pixel blanco: sin esto Watt se ve negro.
    const missing = new Set()
    const manager = new LoadingManager()
    manager.setURLModifier((u) => {
      if (u === url || u.startsWith('data:') || u.startsWith('blob:')) return u
      const name = decodeURIComponent(u).split(/[\\/]/).pop().toLowerCase()
      if (ASSET_TEXTURES[name]) return ASSET_TEXTURES[name]
      missing.add(name)
      return WHITE_PX
    })
    const model = await new FBXLoader(manager).loadAsync(url)
    if (missing.size) {
      console.warn(`[watt] Faltan texturas: ${[...missing].join(', ')}. Copialas a src/assets/.`)
    }
    this.missingTextures = [...missing]

    const box = new Box3().setFromObject(model)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const s = 1 / size.y
    model.scale.setScalar(s)
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s)
    this.root.add(model)

    // Cada pose es un clip de un solo keyframe: guardamos ese keyframe por
    // hueso y lo interpolamos a mano, sin AnimationMixer.
    for (const clip of model.animations) {
      this.poses.set(clip.name, extractPose(model, clip))
    }
    return [...this.poses.keys()]
  }

  setPose(name, instant = false) {
    const pose = this.poses.get(name)
    if (!pose) return
    this.targets = pose
    if (instant) for (const t of pose) t.node[t.prop].copy(t.value)
  }

  // --- gestos ---

  moveBy(dxPx, dyPx) {
    const worldPerPx =
      (2 * CAM_DIST * Math.tan(MathUtils.degToRad(FOV / 2))) / this.canvas.clientHeight
    this.root.position.x += dxPx * worldPerPx
    this.root.position.y -= dyPx * worldPerPx
  }

  scaleBy(factor) {
    this.root.scale.setScalar(MathUtils.clamp(this.root.scale.x * factor, 0.25, 4))
  }

  rotateBy(rad) {
    this.root.rotation.y += rad
  }

  resetTransform() {
    this.root.position.set(HOME.x, HOME.y, 0)
    this.root.scale.setScalar(HOME.scale)
    this.root.rotation.set(0, HOME.rotY, 0)
  }

  /** Un dedo mueve; dos dedos escalan (pellizco) y giran; rueda escala. */
  attachGestures(el) {
    const pts = new Map()
    let prev = null

    const measure = () => {
      const list = [...pts.values()]
      if (!list.length) return null
      const mid = {
        x: list.reduce((s, p) => s + p.x, 0) / list.length,
        y: list.reduce((s, p) => s + p.y, 0) / list.length,
      }
      const m = { n: list.length, mid }
      if (list.length >= 2) {
        const [a, b] = list
        m.dist = Math.hypot(b.x - a.x, b.y - a.y)
        m.angle = Math.atan2(b.y - a.y, b.x - a.x)
      }
      return m
    }

    const down = (e) => {
      el.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      prev = measure()
    }
    const move = (e) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const cur = measure()
      if (prev && cur.n === prev.n) {
        this.moveBy(cur.mid.x - prev.mid.x, cur.mid.y - prev.mid.y)
        if (cur.n >= 2 && prev.dist > 0) {
          this.scaleBy(cur.dist / prev.dist)
          let d = cur.angle - prev.angle
          if (d > Math.PI) d -= 2 * Math.PI
          if (d < -Math.PI) d += 2 * Math.PI
          this.rotateBy(d)
        }
      }
      prev = cur
    }
    const up = (e) => {
      pts.delete(e.pointerId)
      prev = measure()
    }
    const wheel = (e) => {
      e.preventDefault()
      this.scaleBy(Math.exp(-e.deltaY * 0.001))
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }

  // --- render ---

  resizeIfNeeded() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h || (w === this.size.w && h === this.size.h)) return
    this.size = { w, h }
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  frame(now) {
    this.raf = requestAnimationFrame(this.frame)
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now

    if (this.targets) {
      const k = 1 - Math.exp(-dt * 10)
      for (const t of this.targets) {
        if (t.prop === 'quaternion') t.node.quaternion.slerp(t.value, k)
        else t.node[t.prop].lerp(t.value, k)
      }
    }
    this.renderNow()
  }

  /**
   * Renderiza y devuelve el canvas. Llamarlo justo antes de drawImage: el
   * buffer de WebGL solo es valido hasta que el navegador compone el frame.
   */
  renderNow() {
    this.resizeIfNeeded()
    this.renderer.render(this.scene, this.camera)
    return this.canvas
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
  }
}

function extractPose(root, clip) {
  const out = []
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = PropertyBinding.parseTrackName(track.name)
    const node = PropertyBinding.findNode(root, nodeName)
    if (!node) continue
    const v = track.values
    if (propertyName === 'quaternion') {
      out.push({ node, prop: 'quaternion', value: new Quaternion(v[0], v[1], v[2], v[3]) })
    } else if (propertyName === 'position' || propertyName === 'scale') {
      out.push({ node, prop: propertyName, value: new Vector3(v[0], v[1], v[2]) })
    }
  }
  return out
}
