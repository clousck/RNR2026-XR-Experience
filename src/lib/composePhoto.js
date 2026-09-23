/**
 * Junta el frame actual de la camara y el render de Watt en un JPG que
 * reproduce exactamente lo que se ve en pantalla (mismo recorte que
 * object-fit: cover, mismo espejado de la camara frontal).
 */
export function composePhoto({ video, mirror, stage, viewW, viewH, rotation = 0 }) {
  const gl = stage.renderNow()
  const hasVideo = video && video.videoWidth > 0

  // Region visible del video, en pixeles del video.
  let sx = 0, sy = 0, sw = viewW, sh = viewH
  if (hasVideo) {
    const vw = video.videoWidth
    const vh = video.videoHeight
    const cover = Math.max(viewW / vw, viewH / vh)
    sw = viewW / cover
    sh = viewH / cover
    sx = (vw - sw) / 2
    sy = (vh - sh) / 2
  }

  // Resolucion de salida: la nativa del video, subiendo hasta x2 si el
  // canvas de Watt tiene mas detalle, para que no salga pixelado.
  const k = Math.min(2, Math.max(1, gl.width / sw))
  const outW = Math.round(sw * k)
  const outH = Math.round(sh * k)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')

  if (hasVideo) {
    if (mirror) {
      ctx.translate(outW, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, outH)
    g.addColorStop(0, '#2b3a55')
    g.addColorStop(1, '#0f1115')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, outW, outH)
  }

  // Volvemos a renderizar justo antes de copiar: el buffer de WebGL solo es
  // valido dentro de esta misma tarea.
  ctx.drawImage(stage.renderNow(), 0, 0, outW, outH)

  return toJpeg(rotateCanvas(canvas, rotation))
}

/**
 * Gira la imagen para que quede derecha cuando el telefono estaba de lado y
 * la pagina no roto. `rotation` = cuanto giro el telefono en sentido
 * antihorario; la imagen se gira lo mismo en el mismo sentido.
 */
export function rotateCanvas(src, rotation) {
  const deg = ((rotation % 360) + 360) % 360
  if (!deg) return src
  const sideways = deg === 90 || deg === 270
  const out = document.createElement('canvas')
  out.width = sideways ? src.height : src.width
  out.height = sideways ? src.width : src.height
  const ctx = out.getContext('2d')
  ctx.translate(out.width / 2, out.height / 2)
  // En canvas el angulo positivo es horario: negativo = antihorario.
  ctx.rotate((-deg * Math.PI) / 180)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return out
}

export function toJpeg(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la foto'))), 'image/jpeg', 0.92),
  )
}
