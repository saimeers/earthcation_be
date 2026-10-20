// Estadísticas de visitas e inicios de sesión para el panel (página Visitas): read model que agrega Postgres.

const DAY_MS = 86400000
const WINDOWS: readonly number[] = [7, 30, 90]

/** Ventana de días que puede pedir el panel: 7, 30 o 90 (cualquier otra cosa, 30). */
export class VisitWindow {
  private constructor(readonly days: number) {}

  static of(days: unknown): VisitWindow {
    return new VisitWindow(WINDOWS.includes(Number(days)) ? Number(days) : 30)
  }

  /** Desde cuándo cuenta la ventana. */
  since(now: Date): Date {
    return new Date(now.getTime() - this.days * DAY_MS)
  }
}

export interface Count { readonly key: string; readonly count: number }
export interface PlaceCount { readonly country: string; readonly region: string; readonly count: number }
export interface CityCount extends PlaceCount { readonly city: string; readonly lat: number | null; readonly lng: number | null }
export interface VersionCount { readonly id: string; readonly label: string; readonly count: number }

export interface VisitTotals {
  readonly visits: number
  readonly unique: number
  readonly viaQr: number
  readonly visitors: number
  /** Escáneres y robots descartados. */
  readonly bots: number
}

export interface LoginStats {
  readonly byRole: readonly { readonly role: string; readonly count: number; readonly users: number }[]
  readonly perDay: readonly { readonly day: string; readonly count: number }[]
  readonly regions: readonly PlaceCount[]
  readonly devices: readonly Count[]
}

export interface VisitAggregates {
  readonly totals: VisitTotals
  readonly perDay: readonly { readonly day: string; readonly visits: number; readonly unique: number }[]
  readonly countries: readonly Count[]
  readonly regions: readonly PlaceCount[]
  readonly cities: readonly CityCount[]
  readonly devices: readonly Count[]
  readonly os: readonly Count[]
  readonly browsers: readonly Count[]
  readonly versions: readonly VersionCount[]
  readonly logins: LoginStats
}

export interface VisitStats extends VisitAggregates {
  readonly days: number
  /** Inicio de la ventana en ISO (el valor pasa por la caché como JSON). */
  readonly since: string
}

/** Pone la etiqueta a cada versión contada; las que ya no existen salen como "Borrada". */
export const labelVersions = (counts: readonly Count[], labels: ReadonlyMap<string, string>): VersionCount[] =>
  counts.map((c) => ({ id: c.key, label: labels.get(c.key) ?? 'Borrada', count: c.count }))
