import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { AR_HEIGHT } from './wattStage'

/** Safari en iOS abre AR Quick Look con <a rel="ar">. */
export function supportsQuickLook() {
  return document.createElement('a').relList?.supports?.('ar') ?? false
}

/**
 * Genera un USDZ de Watt en la pose indicada, a AR_HEIGHT metros de alto y
 * con el punto mas bajo en el piso. Quick Look no soporta esqueletos con
 * poses a eleccion, asi que "horneamos" la deformacion en una malla estatica.
 */
export async function buildPoseUSDZ(stage, poseName) {
  const pose = stage.poses.get(poseName)
  const { mesh, lift } = stage

  // Aplicar la pose final un instante (sin transicion), hornear y restaurar.
  const saved = pose.map((t) => t.node[t.prop].clone())
  for (const t of pose) t.node[t.prop].copy(t.value)
  stage.root.updateMatrixWorld(true)
  mesh.skeleton.update()
  const geometry = bakeSkinnedGeometry(mesh)
  const rel = new Matrix4().copy(lift.matrixWorld).invert().multiply(mesh.matrixWorld)
  pose.forEach((t, i) => t.node[t.prop].copy(saved[i]))
  stage.root.updateMatrixWorld(true)

  geometry.applyMatrix4(
    new Matrix4()
      .makeScale(AR_HEIGHT, AR_HEIGHT, AR_HEIGHT)
      .multiply(new Matrix4().makeTranslation(0, stage.poseLift.get(poseName) ?? 0, 0))
      .multiply(rel),
  )

  const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const material = new MeshStandardMaterial({
    color: src.color,
    map: src.map,
    roughness: 0.55,
    metalness: 0,
  })

  const data = await new USDZExporter().parseAsync(new Mesh(geometry, material), {
    quickLookCompatible: true,
  })
  return URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }))
}

/** Abre Quick Look. Llamarlo sincronicamente dentro de un toque del usuario. */
export function openQuickLook(url) {
  const a = document.createElement('a')
  a.rel = 'ar'
  a.href = url
  // Safari exige que el enlace contenga una imagen para tratarlo como AR.
  a.appendChild(document.createElement('img'))
  a.click()
}

/** Aplica los huesos a cada vertice (misma cuenta que el shader de skinning). */
function bakeSkinnedGeometry(mesh) {
  const src = mesh.geometry
  const pos = src.attributes.position
  const nrm = src.attributes.normal
  const skinIndex = src.attributes.skinIndex
  const skinWeight = src.attributes.skinWeight
  const boneMatrices = mesh.skeleton.boneMatrices

  const outPos = new Float32Array(pos.count * 3)
  const outNrm = new Float32Array(pos.count * 3)
  const blend = new Matrix4()
  const bone = new Matrix4()
  const full = new Matrix4()
  const normalMatrix = new Matrix3()
  const v = new Vector3()

  for (let i = 0; i < pos.count; i++) {
    blend.elements.fill(0)
    for (let j = 0; j < 4; j++) {
      const w = skinWeight.getComponent(i, j)
      if (!w) continue
      bone.fromArray(boneMatrices, skinIndex.getComponent(i, j) * 16)
      for (let k = 0; k < 16; k++) blend.elements[k] += w * bone.elements[k]
    }
    full.copy(mesh.bindMatrixInverse).multiply(blend).multiply(mesh.bindMatrix)

    v.fromBufferAttribute(pos, i).applyMatrix4(full).toArray(outPos, i * 3)
    if (nrm) {
      normalMatrix.getNormalMatrix(full)
      v.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize().toArray(outNrm, i * 3)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(outPos, 3))
  if (nrm) geometry.setAttribute('normal', new BufferAttribute(outNrm, 3))
  if (src.attributes.uv) geometry.setAttribute('uv', src.attributes.uv.clone())
  if (src.index) geometry.setIndex(src.index.clone())
  // Sin grupos: Watt tiene un solo material.
  return geometry
}
