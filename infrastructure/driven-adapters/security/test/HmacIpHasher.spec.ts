import { describe, expect, it } from 'vitest'
import { HmacIpHasher } from '../src'

describe('HmacIpHasher', () => {
  it('la misma IP y la misma sal dan la misma huella; otra sal, otra huella', () => {
    const a = new HmacIpHasher('sal-a').hash('10.0.0.1')
    expect(a).toBe(new HmacIpHasher('sal-a').hash('10.0.0.1'))
    expect(a).not.toBe(new HmacIpHasher('sal-b').hash('10.0.0.1'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('la huella no contiene la IP y una IP vacía no tiene huella', () => {
    expect(new HmacIpHasher('s').hash('190.60.10.2')).not.toContain('190')
    expect(new HmacIpHasher('s').hash(undefined)).toBeNull()
    expect(new HmacIpHasher('s').hash('')).toBeNull()
  })
})
