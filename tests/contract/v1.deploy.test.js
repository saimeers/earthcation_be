import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const request = require('supertest')
const { send, contract, app } = require('../support/contract.cjs')
const { tokenFor } = require('../support/auth.cjs')

// Despliegue del juego de punta a punta con el almacenamiento local (sin S3 ni R2): crear versión, subir el
// ZIP por la API, publicar en segundo plano, vista previa en /play-local, activar y borrar.
const s = inject('seed')
const dev = s.developer
const snap = async (res) => expect(contract(await res)).toMatchSnapshot()

// Build WebGL mínimo, comprimido como lo deja Unity dentro de una carpeta, con basura de macOS
const webglZip = () => {
  const zip = new AdmZip()
  zip.addFile('MiBuild/index.html', Buffer.from('<script>createUnityInstance(c, { productVersion: "1.2.3" })</script>'))
  for (const f of ['x.loader.js', 'x.framework.js.br', 'x.wasm.br', 'x.data.br']) zip.addFile(`MiBuild/Build/${f}`, Buffer.from(f))
  zip.addFile('MiBuild/TemplateData/style.css', Buffer.from('body{}'))
  zip.addFile('__MACOSX/MiBuild/._index.html', Buffer.from('x'))
  return zip.toBuffer()
}

const putZip = (id, body) => request(app).put(`/api/deploy/versions/${id}/upload`)
  .set('Authorization', `Bearer ${tokenFor(dev)}`).set('Content-Type', 'application/zip').send(body)

const settled = async (id) => {
  for (let i = 0; i < 100; i++) {
    const v = (await send('get', '/api/deploy/versions', dev)).body.find((x) => x.id === id)
    if (v.status !== 'processing') return v
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('la publicación no terminó')
}

const create = (label, size) => send('post', '/api/deploy/versions', dev, { label, size_bytes: size, notes: '  Notas de prueba  ' })

describe('despliegue con almacenamiento local', () => {
  const zip = webglZip()
  let id

  it('crear versión, subir el ZIP y publicar', async () => {
    const created = await create('1.2.3', zip.length)
    expect(contract(created)).toMatchSnapshot()
    id = created.body.version.id
    expect(created.body.upload).toEqual({
      mode: 'api', method: 'PUT', url: `/api/deploy/versions/${id}/upload`, headers: { 'Content-Type': 'application/zip' },
    })
    expect(created.body.version.notes).toBe('Notas de prueba')
    await snap(send('post', `/api/deploy/versions/${id}/complete`, dev))
    await snap(putZip(id, zip))
    await snap(send('post', `/api/deploy/versions/${id}/complete`, dev))
    await snap(send('post', `/api/deploy/versions/${id}/complete`, dev))
    const ready = await settled(id)
    expect(ready).toMatchObject({ status: 'ready', r2_prefix: `builds/${id}/`, error: null, is_active: false })
    expect(ready.manifest).toMatchObject({ root: 'MiBuild/', compression: 'brotli', product_version: '1.2.3', warnings: [] })
    expect(ready.manifest.files.map((f) => f.path)).toEqual([
      'Build/x.data.br', 'Build/x.framework.js.br', 'Build/x.loader.js', 'Build/x.wasm.br', 'index.html', 'TemplateData/style.css',
    ])
    await snap(send('get', '/api/deploy/versions', dev))
  })

  it('vista previa servida por /play-local', async () => {
    const preview = await send('get', `/api/deploy/versions/${id}/preview`, dev)
    expect(contract(preview)).toMatchSnapshot()
    expect(preview.body.url).toMatch(new RegExp(`/play-local/v/${id}/\\?t=\\d+\\.[\\w-]+$`))
    const index = await request(app).get(`/play-local/v/${id}/`)
    expect([index.status, index.headers['content-type'], index.headers['cache-control']]).toEqual([200, 'text/html; charset=utf-8', 'no-cache'])
    const wasm = await request(app).get(`/play-local/v/${id}/Build/x.wasm.br`).buffer(true).parse((res, cb) => res.on('data', () => {}).on('end', () => cb(null)))
    expect([wasm.headers['content-type'], wasm.headers['content-encoding'], wasm.headers['cache-control']])
      .toEqual(['application/wasm', 'br', 'public, max-age=31536000, immutable'])
    expect((await request(app).get(`/play-local/v/${id}`)).headers.location).toBe(`/play-local/v/${id}/`)
    expect((await request(app).get(`/play-local/v/${id}/no-existe.js`)).status).toBe(404)
  })

  it('activar, estado y versión activa protegida', async () => {
    await snap(putZip(id, zip))
    await snap(send('post', `/api/deploy/versions/${id}/activate`, dev))
    const status = await send('get', '/api/deploy/status', dev)
    expect(contract(status)).toMatchSnapshot()
    expect(status.body.active).toMatchObject({ id, label: '1.2.3', product_version: '1.2.3' })
    expect((await request(app).get('/play-local/')).status).toBe(200)
    await snap(send('delete', `/api/deploy/versions/${id}`, dev))
  })

  it('ZIP inválido queda fallido con el motivo, se reintenta y se borra', async () => {
    const bad = (await create('roto', 10)).body.version.id
    await putZip(bad, Buffer.from('no es un zip'))
    await send('post', `/api/deploy/versions/${bad}/complete`, dev)
    expect(await settled(bad)).toMatchObject({ status: 'failed', error: 'El archivo no es un ZIP válido' })
    await snap(send('post', `/api/deploy/versions/${bad}/activate`, dev))
    await snap(send('get', `/api/deploy/versions/${bad}/preview`, dev))
    await snap(send('post', `/api/deploy/versions/${bad}/complete`, dev))
    await settled(bad)
    await snap(send('delete', `/api/deploy/versions/${bad}`, dev))
    expect((await send('get', '/api/deploy/versions', dev)).body.some((v) => v.id === bad)).toBe(false)
  })

  it('build sin wasm, sin index y con plantilla PWA', async () => {
    const cases = [
      [(z) => z.deleteFile('MiBuild/Build/x.wasm.br'), { error: 'Al build le falta: wasm en la carpeta Build/' }],
      [(z) => z.deleteFile('MiBuild/index.html'), { error: 'El ZIP no tiene index.html: comprime la carpeta del build WebGL' }],
    ]
    for (const [change, expected] of cases) {
      const z = new AdmZip(webglZip())
      change(z)
      const v = (await create('caso', 10)).body.version.id
      await putZip(v, z.toBuffer())
      await send('post', `/api/deploy/versions/${v}/complete`, dev)
      expect(await settled(v)).toMatchObject({ status: 'failed', ...expected })
    }
    const pwa = new AdmZip()
    pwa.addFile('index.html', Buffer.from('<html></html>'))
    pwa.addFile('ServiceWorker.js', Buffer.from(''))
    for (const f of ['x.loader.js', 'x.framework.js', 'x.wasm', 'x.data']) pwa.addFile(`Build/${f}`, Buffer.from(f))
    const v = (await create('pwa', 10)).body.version.id
    await putZip(v, pwa.toBuffer())
    await send('post', `/api/deploy/versions/${v}/complete`, dev)
    const done = await settled(v)
    expect(done.manifest).toMatchObject({ root: '', compression: 'none', product_version: null })
    expect(done.manifest.warnings).toHaveLength(2)
  })

  it('validaciones al crear y subir', async () => {
    await snap(create('1.0', 600 * 1024 * 1024))
    await snap(create('versión con / barra', 10))
    await snap(putZip('00000000-0000-0000-0000-000000000000', zip))
    await snap(request(app).put(`/api/deploy/versions/${id}/upload`).set('Authorization', `Bearer ${tokenFor(dev)}`))
    await snap(send('delete', '/api/deploy/versions/00000000-0000-0000-0000-000000000000', dev))
    await snap(send('get', '/api/deploy/versions/00000000-0000-0000-0000-000000000000/preview', dev))
  })
})
