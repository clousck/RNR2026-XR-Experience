/**
 * Prepara una foto para subirla: la reduce a un tamaño razonable, genera
 * una miniatura y la vuelve a codificar en JPG. Esto:
 *  - baja una foto de 4–12 MB a ~0.5 MB (clave con el wifi de un evento),
 *  - aplica la orientacion EXIF (el navegador ya la respeta al decodificar),
 *  - elimina los metadatos EXIF, incluida la ubicacion GPS.
 */
export const PHOTO_MAX = 2048
export const THUMB_MAX = 480

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      // algunos Safari no aceptan opciones o ciertos formatos: probar con <img>
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toJpeg(source, srcW, srcH, max, quality) {
  const scale = Math.min(1, max / Math.max(srcW, srcH))
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        // Liberar la memoria del canvas pronto: iOS tiene un limite total.
        canvas.width = canvas.height = 0
        if (b) resolve({ blob: b, width: w, height: h })
        else reject(new Error('No se pudo procesar la imagen.'))
      },
      'image/jpeg',
      quality,
    ),
  )
}

export async function prepareImage(blob) {
  let source
  try {
    source = await decode(blob)
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con otra foto.')
  }
  const w = source.width
  const h = source.height
  try {
    const photo = await toJpeg(source, w, h, PHOTO_MAX, 0.85)
    const thumb = await toJpeg(source, w, h, THUMB_MAX, 0.75)
    return { photo: photo.blob, thumb: thumb.blob, width: photo.width, height: photo.height }
  } finally {
    source.close?.()
  }
}
