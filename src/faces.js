import cara1 from './assets/watt-cara-1.png'
import cara2 from './assets/watt-cara-2.png'
import cara3 from './assets/watt-cara-3.png'

// Caras de Watt: cada una es la textura completa del modelo, con otra boca
// y otros ojos. La primera es la de inicio.
export const FACES = [
  { id: 'tranquilo', label: 'Tranquilo', emoji: '😺', url: cara1 },
  { id: 'feliz', label: 'Feliz', emoji: '😸', url: cara2 },
  { id: 'mareado', label: 'Mareado', emoji: '😵', url: cara3 },
]

// ?cara=2 en la URL elige la cara inicial (1, 2, 3 o el id).
export function initialFace() {
  const wanted = new URLSearchParams(window.location.search).get('cara')
  const match = FACES.find((f, i) => f.id === wanted || String(i + 1) === wanted)
  return (match ?? FACES[0]).id
}
