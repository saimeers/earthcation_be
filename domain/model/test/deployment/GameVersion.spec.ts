import { describe, expect, it } from 'vitest'
import {
  ActivationPointer, GameVersion, VersionActiveError, VersionBusyError, VersionLabelInvalidError, VersionNotUploadingError,
  VersionPublishingError, VersionSizeRequiredError, ZipTooLargeError, type GameVersionProps, type VersionStatus,
} from '../../src'

const version = (status: VersionStatus, extra: Partial<GameVersionProps> = {}) => GameVersion.restore({
  id: 'a', label: '1.0', notes: null, status, originalKey: 'originals/a.zip', publishedPrefix: null, manifest: null,
  sizeBytes: 10, error: null, uploadedBy: 'u', publishedAt: null, activatedAt: null, createdAt: new Date(0), updatedAt: new Date(0),
  ...extra,
})

const manifest = { root: '', compression: 'brotli' as const, productVersion: '1.2', totalBytes: 3, files: [], warnings: [] }

describe('GameVersion.prepare', () => {
  it('etiqueta, notas, tamaño y límite', () => {
    expect(GameVersion.prepare('v1', { label: ' 1.4.0 ', sizeBytes: '10', notes: ' ', uploadedBy: 'u' }, 500)).toEqual({
      id: 'v1', label: '1.4.0', notes: null, sizeBytes: 10, originalKey: 'originals/v1.zip', uploadedBy: 'u',
    })
    expect(GameVersion.prepare('v1', { label: 2, sizeBytes: 1, notes: ' n ', uploadedBy: 'u' }, 1)).toMatchObject({ label: '2', notes: 'n' })
    expect(() => GameVersion.prepare('v', { label: 'a/b', sizeBytes: 1, notes: null, uploadedBy: 'u' }, 1)).toThrow(VersionLabelInvalidError)
    expect(() => GameVersion.prepare('v', { label: '1', sizeBytes: 1.5, notes: null, uploadedBy: 'u' }, 1)).toThrow(VersionSizeRequiredError)
    expect(() => GameVersion.prepare('v', { label: '1', sizeBytes: 2 * 1024 * 1024, notes: null, uploadedBy: 'u' }, 1))
      .toThrow(new ZipTooLargeError(1))
    expect(new ZipTooLargeError(1).message).toBe('El ZIP supera el máximo de 1 MB')
  })

  it('la etiqueta se valida antes que el tamaño', () => {
    expect(() => GameVersion.prepare('v', { label: '', sizeBytes: undefined, notes: null, uploadedBy: 'u' }, 1)).toThrow(VersionLabelInvalidError)
  })
})

describe('GameVersion: máquina de estados', () => {
  it('el ZIP solo llega en uploading; completar desde uploading o failed', () => {
    expect(() => { version('processing').assertAwaitingZip() }).toThrow(VersionNotUploadingError)
    const failed = version('failed', { error: 'x' })
    expect(failed.startProcessing(20)).toBe('failed')
    expect(failed.toProps()).toMatchObject({ status: 'processing', error: null, sizeBytes: 20 })
    expect(() => failed.startProcessing(20)).toThrow(VersionBusyError)
    expect(() => { version('ready').assertCanComplete() }).toThrow('La versión ya se está publicando o está lista')
  })

  it('lista: queda con su carpeta y manifiesto; se activa y se previsualiza', () => {
    const v = version('processing')
    expect(() => { v.activate(new Date(1)) }).toThrow('Solo se puede activar una versión lista')
    expect(() => { v.assertCanPreview() }).toThrow('La versión aún no está lista')
    v.markReady(manifest, 42, new Date(5))
    expect(v.toProps()).toMatchObject({ status: 'ready', publishedPrefix: 'builds/a/', manifest: { publishMs: 42 }, publishedAt: new Date(5) })
    expect(v.productVersion).toBe('1.2')
    v.activate(new Date(0))
    expect(JSON.parse(ActivationPointer.of(v))).toEqual({ version_id: 'a', label: '1.0', prefix: 'builds/a/', activated_at: '1970-01-01T00:00:00.000Z' })
  })

  it('fallida guarda el motivo', () => {
    const v = version('processing')
    v.markFailed('roto')
    expect(v.toProps()).toMatchObject({ status: 'failed', error: 'roto' })
  })

  it('no se borra la activa ni la que se está publicando', () => {
    expect(() => { version('ready').assertCanRemove('a') }).toThrow(VersionActiveError)
    expect(() => { version('processing').assertCanRemove(null) }).toThrow(VersionPublishingError)
    expect(() => { version('ready').assertCanRemove('b') }).not.toThrow()
  })

  it('una fila vieja sin clave usa la del ZIP de siempre', () => {
    expect(version('uploading', { originalKey: null }).storedOriginalKey).toBe('originals/a.zip')
  })
})
