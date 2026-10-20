import { describe, expect, it } from 'vitest'
import { ActivationPointer, BuildInspection, InvalidBuildError, type ZipEntry } from '../../src'

const entry = (name: string, text = name): ZipEntry => ({ name, isDirectory: false, read: () => new TextEncoder().encode(text) })
const unityFiles = (root: string, ext = '.br') =>
  ['x.loader.js', `x.framework.js${ext}`, `x.wasm${ext}`, `x.data${ext}`].map((f) => entry(`${root}Build/${f}`))

describe('BuildInspection', () => {
  it('headers por archivo', () => {
    expect(BuildInspection.headersFor('Build/x.wasm.br'))
      .toEqual({ contentType: 'application/wasm', contentEncoding: 'br', cacheControl: 'public, max-age=31536000, immutable' })
    expect(BuildInspection.headersFor('index.html')).toEqual({ contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache' })
    expect(BuildInspection.headersFor('Build/x.data.unityweb').contentType).toBe('application/octet-stream')
    expect(BuildInspection.headersFor('TemplateData/x.JS.gz')).toMatchObject({ contentType: 'application/javascript', contentEncoding: 'gzip' })
    expect(BuildInspection.headersFor('.htaccess').contentType).toBe('application/octet-stream')
  })

  it('raíz = carpeta del index menos anidado', () => {
    expect(BuildInspection.findRoot(['A/B/index.html', 'A/index.html', 'A/Build/x'])).toBe('A/')
    expect(BuildInspection.findRoot(['index.html'])).toBe('')
    expect(BuildInspection.findRoot(['nada.txt'])).toBeNull()
  })

  it('manifiesto, compresión y avisos', () => {
    const ok = BuildInspection.inspect([entry('B/index.html', 'productVersion: "2.0"'), ...unityFiles('B/'), entry('__MACOSX/B/._x')])
    expect(ok.manifest).toMatchObject({ root: 'B/', compression: 'brotli', productVersion: '2.0', warnings: [] })
    expect(ok.files.map((f) => f.path)).toEqual(['Build/x.data.br', 'Build/x.framework.js.br', 'Build/x.loader.js', 'Build/x.wasm.br', 'index.html'])
    const gz = BuildInspection.inspect([entry('index.html'), ...unityFiles('', '.gz'), entry('ServiceWorker.js')])
    expect(gz.manifest).toMatchObject({ compression: 'gzip', productVersion: null })
    expect(gz.manifest.warnings).toHaveLength(1)
    expect(BuildInspection.inspect([entry('index.html'), ...unityFiles('', '.unityweb')]).manifest.warnings[0]).toContain('Decompression Fallback')
    expect(BuildInspection.inspect([entry('index.html'), ...unityFiles('', '')]).manifest.compression).toBe('none')
  })

  it('lo que falta se dice en el error', () => {
    expect(() => BuildInspection.inspect([entry('index.html'), entry('Build/x.loader.js')]))
      .toThrow('Al build le falta: framework, wasm, data en la carpeta Build/')
    expect(() => BuildInspection.inspect([entry('Build/x.loader.js')])).toThrow(InvalidBuildError)
  })
})

describe('ActivationPointer', () => {
  it('lee la carpeta del puntero y tolera uno roto', () => {
    expect(ActivationPointer.prefixOf('{"prefix":"builds/a/"}')).toBe('builds/a/')
    expect(ActivationPointer.prefixOf('{"prefix":1}')).toBeNull()
    expect(ActivationPointer.prefixOf('null')).toBeNull()
    expect(ActivationPointer.prefixOf('no es json')).toBeNull()
  })
})
