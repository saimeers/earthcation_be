import {
  isStaleMinute, minuteOf, recordSample, systemClock,
  type Buckets, type Clock, type MetricsStore, type MinuteBucket, type RouteSample,
} from '@earthcation/model'

/**
 * Cubetas de la ventana en la memoria del proceso (cada instancia mide lo suyo). Es el único estado mutable de
 * las métricas: cada cubeta se reemplaza entera, no se edita, así quien las lee nunca ve una a medias.
 */
export class InMemoryMetricsStore implements MetricsStore {
  private readonly minutes = new Map<number, MinuteBucket>()

  constructor(private readonly clock: Clock = systemClock) {}

  record(route: string, ms: number, failed: boolean): void {
    const now = minuteOf(this.clock.now())
    const bucket = this.minutes.get(now) ?? new Map<string, RouteSample>()
    this.minutes.set(now, new Map(bucket).set(route, recordSample(bucket.get(route), ms, failed)))
    this.prune(now)
  }

  buckets(): Buckets {
    return new Map(this.minutes)
  }

  private prune(now: number): void {
    ;[...this.minutes.keys()].filter((m) => isStaleMinute(m, now)).forEach((m) => this.minutes.delete(m))
  }
}
