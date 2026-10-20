import { place, text, type Fields } from './fields'
import { UserAgent, type DeviceInfo } from './UserAgent'

/** País, región y ciudad del inicio de sesión según Cloudflare. */
export interface LoginPlace {
  readonly country: string | null
  readonly region: string | null
  readonly city: string | null
}

export interface LoginEventProps extends LoginPlace, DeviceInfo {
  readonly userId: string
  readonly role: string
}

/** Lo que se sabe de un inicio de sesión exitoso: quién, cabeceras y si la petición pasó por Cloudflare. */
export interface LoginRequest {
  readonly userId: string
  readonly role: string
  readonly headers: Fields
  /** Solo entonces se creen las cabeceras cf-* (cualquiera que llame directo al origen podría inventarlas). */
  readonly fromCloudflare: boolean
}

const NOWHERE: LoginPlace = { country: null, region: null, city: null }

// Node lee las cabeceras como latin1 y Cloudflare manda cf-ipcity/cf-region en UTF-8 ("CÃºcuta")
export const utf8Header = (v: unknown): unknown => {
  if (typeof v !== 'string' || !/[À-ÿ]/.test(v)) return v
  const fixed = Buffer.from(v, 'latin1').toString('utf8')
  return fixed.includes('�') ? v : fixed
}

const knownCountry = (c: string | null) => (c === 'XX' || c === 'T1' ? null : c)

/** Ubicación del login a partir de las cabeceras cf-*, que solo se creen si la petición llegó por Cloudflare. */
export const loginPlace = (h: Fields, fromCloudflare: boolean): LoginPlace => fromCloudflare
  ? {
    country: knownCountry(text(utf8Header(h['cf-ipcountry']), 2)),
    region: place(utf8Header(h['cf-region']), 80),
    city: text(utf8Header(h['cf-ipcity']), 80),
  }
  : NOWHERE

/** Inicio de sesión exitoso con su ubicación y dispositivo, para soporte y analítica. */
export class LoginEvent {
  private constructor(private readonly props: LoginEventProps) {}

  static fromRequest(r: LoginRequest): LoginEvent {
    return new LoginEvent({
      userId: r.userId, role: r.role,
      ...loginPlace(r.headers, r.fromCloudflare), ...UserAgent.of(r.headers['user-agent']).deviceInfo(),
    })
  }

  get userId(): string { return this.props.userId }

  toProps(): Readonly<LoginEventProps> { return { ...this.props } }
}
