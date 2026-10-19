import { describe, it, expect } from 'vitest'
import { findRoot, headersFor, inspectBuild } from '../../src/contexts/deployment/build'
import { canRemove, toNewVersion, withinLimit } from '../../src/contexts/deployment/domain'
import { makeDeployment } from '../../src/contexts/deployment/application'

const entry = (name, text = name) => ({ name, isDirectory: false, read: () => Buffer.from(text) })
const unityFiles = (root, ext = '.br') =>
  ['x.loader.js', `x.framework.js${ext}`, `x.wasm${ext}`, `x.data${ext}`].map((f) => entry(`${root}Build/${f}`))

describe('build WebGL', () => {
  it('headers por archivo', () => {
    expect(headersFor('Build/x.wasm.br')).toEqual({ contentType: 'application/wasm', contentEncoding: 'br', cacheControl: 'public, max-age=31536000, immutable' })
    expect(headersFor('index.html')).toEqual({ contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache' })
    expect(headersFor('Build/x.data.unityweb').contentType).toBe('application/octet-stream')
  })

  it('raíz = carpeta del index menos anidado', () => {
    expect(findRoot(['A/B/index.html', 'A/index.html', 'A/Build/x'])).toBe('A/')
    expect(findRoot(['index.html'])).toBe('')
    expect(findRoot(['nada.txt'])).toBeNull()
  })

  it('manifiesto, compresión y avisos', () => {
    const ok = inspectBuild([entry('B/index.html', 'productVersion: "2.0"'), ...unityFiles('B/'), entry('__MACOSX/B/._x')])
    expect(ok.value.manifest).toMatchObject({ root: 'B/', compression: 'brotli', productVersion: '2.0', warnings: [] })
    const gz = inspectBuild([entry('index.html'), ...unityFiles('', '.gz'), entry('ServiceWorker.js')])
    expect(gz.value.manifest).toMatchObject({ compression: 'gzip', productVersion: null })
    expect(gz.value.manifest.warnings).toHaveLength(1)
    expect(inspectBuild([entry('index.html'), ...unityFiles('', '.unityweb')]).value.manifest.warnings[0]).toContain('Decompression Fallback')
  })

  it('lo que falta se dice en el error', () => {
    expect(inspectBuild([entry('index.html'), entry('Build/x.loader.js')]))
      .toEqual({ ok: false, error: 'Al build le falta: framework, wasm, data en la carpeta Build/' })
  })
})

describe('reglas de versión', () => {
  it('etiqueta, tamaño y límite', () => {
    expect(toNewVersion({ label: ' 1.4.0 ', size_bytes: '10', notes: ' ' })).toEqual({ ok: true, value: { label: '1.4.0', notes: null, sizeBytes: 10 } })
    expect(toNewVersion({ label: 'a/b', size_bytes: 1 }).error.code).toBe('VERSION_LABEL_INVALID')
    expect(toNewVersion({ label: '1', size_bytes: 1.5 }).error.code).toBe('VERSION_SIZE_REQUIRED')
    expect(withinLimit(2 * 1024 * 1024, 1).error).toMatchObject({ kind: 'too_large', message: 'El ZIP supera el máximo de 1 MB' })
  })

  it('no se borra la activa ni la que se está publicando', () => {
    const v = { id: 'a', status: 'ready' }
    expect(canRemove(v, 'a').error.code).toBe('VERSION_ACTIVE')
    expect(canRemove({ ...v, status: 'processing' }, null).error.code).toBe('VERSION_PUBLISHING')
    expect(canRemove(v, null).ok).toBe(true)
  })
})

describe('casos de uso del despliegue', () => {
  const setup = (overrides = {}) => {
    const rows = new Map()
    const files = new Map()
    const tasks = []
    const local = (driver) => ({
      driver, put: async (k, b) => { files.set(k, b) }, getBuffer: async (k) => files.get(k), size: async (k) => files.get(k)?.length ?? null,
      remove: async (k) => { files.delete(k) }, removePrefix: async (p) => { for (const k of files.keys()) if (k.startsWith(p)) files.delete(k) },
      presignPut: async (k) => `https://s3/${k}`,
    })
    const deps = {
      versions: {
        find: async (id) => rows.get(id) ?? null, view: async (id) => rows.get(id) ?? null, list: async () => [...rows.values()],
        create: async (id, v) => { rows.set(id, { id, label: v.label, status: 'uploading', s3Key: v.s3Key }); return rows.get(id) },
        startProcessing: async (id, from) => { const r = rows.get(id); if (r.status !== from) return false; r.status = 'processing'; return true },
        markReady: async (id, p) => { Object.assign(rows.get(id), { status: 'ready', r2Prefix: p.prefix, manifest: p.manifest }) },
        markFailed: async (id, error) => { Object.assign(rows.get(id), { status: 'failed', error }) },
        failInterrupted: async () => {}, remove: async (id) => { rows.delete(id) },
        activeId: async () => null, activate: async (_id, _at, write) => { await write() },
      },
      storage: { originals: () => local('local'), published: () => local('local') },
      config: { maxMb: () => 1, playUrl: () => 'https://play', signingSecret: () => undefined },
      readZip: (zip) => (zip.toString() === 'zip' ? [entry('index.html'), ...unityFiles('')] : null),
      sign: (secret, payload) => `${secret}|${payload}`,
      enqueue: (task) => { tasks.push(task) },
      newId: () => 'v1', now: () => 1_000_000, log: { info: () => {}, error: () => {} },
      ...overrides,
    }
    return { d: makeDeployment(deps), rows, files, run: () => Promise.all(tasks.splice(0).map((t) => t())) }
  }

  it('subir, publicar, previsualizar y activar', async () => {
    const { d, rows, files, run } = setup()
    expect((await d.create('u', { label: '1.0', size_bytes: 3 })).value.upload.mode).toBe('api')
    expect(await d.receiveZip('v1', Buffer.from('zip'))).toEqual({ ok: true, value: null })
    expect((await d.complete('v1')).ok).toBe(true)
    expect((await d.complete('v1')).error.code).toBe('VERSION_BUSY')
    await run()
    expect(rows.get('v1').status).toBe('ready')
    expect([...files.keys()].filter((k) => k.startsWith('builds/v1/'))).toHaveLength(5)
    expect((await d.preview('v1', 'http://api')).value.url).toBe(`http://api/play-local/v/v1/?t=8200.local-dev|preview:v1:8200`)
    expect((await d.activate('v1')).ok).toBe(true)
    expect(JSON.parse(files.get('current.json'))).toMatchObject({ version_id: 'v1', prefix: 'builds/v1/' })
  })

  it('ZIP que no es ZIP queda fallido; con R2 sin secreto no hay vista previa', async () => {
    const { d, rows, run } = setup()
    await d.create('u', { label: '1.0', size_bytes: 3 })
    await d.receiveZip('v1', Buffer.from('nope'))
    await d.complete('v1')
    await run()
    expect(rows.get('v1')).toMatchObject({ status: 'failed', error: 'El archivo no es un ZIP válido' })
    rows.get('v1').status = 'ready'
    const r2 = setup({ storage: { originals: () => ({ driver: 's3' }), published: () => ({ driver: 'r2' }) } })
    r2.rows.set('v1', rows.get('v1'))
    expect((await r2.d.preview('v1', 'x')).error).toMatchObject({ kind: 'unavailable' })
    expect((await r2.d.receiveZip('v1', Buffer.from('zip'))).error.code).toBe('UPLOAD_PRESIGNED_ONLY')
  })
})
