import { BotDetector } from './BotDetector'
import { matching, numberOrNull, place, text, type Fields } from './fields'
import { UserAgent, type DeviceInfo } from './UserAgent'

export interface VisitProps extends DeviceInfo {
  /** HMAC(VISIT_SALT, ip) que calcula el Worker: nunca se guarda la IP. */
  readonly visitor: string | null
  readonly versionId: string | null
  /** Código de la sala cuando se abrió desde el QR. */
  readonly sessionCode: string | null
  readonly country: string | null
  readonly region: string | null
  readonly city: string | null
  /** Centro de datos de Cloudflare que atendió. */
  readonly colo: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly asn: number | null
  readonly asOrg: string | null
  readonly isBot: boolean
  isUnique: boolean
}

// Recargar o volver a abrir en menos de 30 min no es otra visita única
const UNIQUE_WINDOW_SECONDS = 1800

const whereFrom = (b: Fields) => ({
  country: text(b.country, 2), region: place(b.region, 80), city: text(b.city, 80), colo: text(b.colo, 8),
  latitude: numberOrNull(b.latitude), longitude: numberOrNull(b.longitude),
})

const networkOf = (b: Fields) => {
  const asOrg = text(b.as_organization, 120)
  return { asn: Number.isInteger(b.asn) ? (b.asn as number) : null, asOrg, isBot: BotDetector.isBot(b.user_agent, asOrg) }
}

/** Una apertura del juego publicado, tal como la reporta el Worker de Cloudflare al servir el index. */
export class Visit {
  static readonly UNIQUE_WINDOW_SECONDS = UNIQUE_WINDOW_SECONDS

  private constructor(private readonly props: VisitProps) {}

  /** Normaliza el cuerpo del Worker: lo que no tiene la forma esperada queda en null. */
  static fromWorker(b: Fields): Visit {
    return new Visit({
      visitor: text(b.visitor, 64),
      versionId: matching(b.version_id, /^[0-9a-f-]{36}$/i),
      sessionCode: matching(b.session_code, /^\d{3}$/),
      ...whereFrom(b), ...networkOf(b), ...UserAgent.of(b.user_agent).deviceInfo(),
      isUnique: false,
    })
  }

  get visitor(): string | null { return this.props.visitor }
  get isBot(): boolean { return this.props.isBot }
  get isUnique(): boolean { return this.props.isUnique }

  /** Clave a consultar para saber si es la primera apertura en la ventana; null si no hace falta preguntar. */
  get uniqueKey(): string | null {
    return this.props.isBot || this.props.visitor === null ? null : `visit:${this.props.visitor}`
  }

  /** Un robot nunca es único; sin visitante (sin clave que consultar) siempre lo es. */
  markUnique(firstInWindow = true): void {
    this.props.isUnique = !this.props.isBot && firstInWindow
  }

  toProps(): Readonly<VisitProps> { return { ...this.props } }
}
