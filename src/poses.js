// Botones de pose. `clip` es el nombre exacto de la animacion dentro de
// watt.fbx; `label` es lo que se muestra en el boton.
//
// El FBX trae ademas "Armature|Action", "Action.001" y "Action.002": son
// copias exactas de la Pose T (restos de Blender), por eso no estan aca.
export const POSES = [
  { clip: 'Armature|Pose 1', label: 'Baile' },
  { clip: 'Armature|Pose 2', label: 'Tierno' },
  { clip: 'Armature|Pose 3', label: '¡Fuerza!' },
  { clip: 'Armature|Pose 4', label: 'Abrazo' },
  { clip: 'Armature|Pose 5', label: 'Acostado' },
  { clip: 'Armature|Pose 6', label: 'Pícaro' },
]

// ?pose=Pose%203 en la URL elige la pose inicial.
export function initialPose() {
  const wanted = new URLSearchParams(window.location.search).get('pose')
  const match = POSES.find((p) => p.clip === wanted || p.clip === `Armature|${wanted}`)
  return (match ?? POSES[0]).clip
}
