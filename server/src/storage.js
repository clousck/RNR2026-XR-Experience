import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Almacenamiento de archivos en el disco local (la Pi).
 * Cualquier otro destino (R2, S3…) solo tiene que implementar estos
 * mismos metodos: put, stat, stream, copy, remove, removePrefix.
 */
export class LocalStorage {
  constructor(root) {
    this.root = resolve(root)
  }

  path(key) {
    const full = resolve(join(this.root, key))
    if (!full.startsWith(this.root + sep)) throw new Error(`clave invalida: ${key}`)
    return full
  }

  async put(key, data) {
    const full = this.path(key)
    await mkdir(dirname(full), { recursive: true })
    // Se escribe a un temporal y se renombra: nunca queda un JPG a medias.
    const tmp = `${full}.${process.pid}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, full)
  }

  async stat(key) {
    try {
      const s = await stat(this.path(key))
      return s.isFile() ? { size: s.size, mtime: s.mtime } : null
    } catch {
      return null
    }
  }

  stream(key) {
    return createReadStream(this.path(key))
  }

  async copy(fromKey, toKey) {
    const to = this.path(toKey)
    await mkdir(dirname(to), { recursive: true })
    await copyFile(this.path(fromKey), to)
  }

  async remove(...keys) {
    await Promise.all(keys.filter(Boolean).map((k) => rm(this.path(k), { force: true })))
  }

  async removePrefix(prefix) {
    await rm(this.path(prefix), { recursive: true, force: true })
  }
}
