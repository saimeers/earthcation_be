// API pública del modelo de dominio: solo lo exportado aquí se puede importar desde otros paquetes
export * from './shared/errors/DomainError'
export * from './shared/gateways/Cache'
export * from './shared/gateways/Clock'

export * from './identity/AuthenticatedUser'
export * from './identity/errors/AuthErrors'
export * from './identity/gateways/TokenVerifier'

export * from './catalog/Organization'
export * from './catalog/Location'
export * from './catalog/errors/CatalogErrors'
export * from './catalog/gateways/OrganizationRepository'
export * from './catalog/gateways/LocationRepository'

// ── vark ──
export * from './vark/Style'
export * from './vark/VarkResult'
export * from './vark/VarkAnswers'
export * from './vark/errors/VarkErrors'
export * from './vark/gateways/VarkRepository'

// ── observability ──
export * from './observability/UserAgent'
export * from './observability/BotDetector'
export * from './observability/Visit'
export * from './observability/LoginEvent'
export * from './observability/VisitStats'
export * from './observability/Metrics'
export * from './observability/Health'
export * from './observability/errors/ObservabilityErrors'
export * from './observability/gateways/VisitRepository'
export * from './observability/gateways/LoginEventRepository'
export * from './observability/gateways/VisitStatsReadModel'
export * from './observability/gateways/MetricsStore'
export * from './observability/gateways/HealthProbe'
export * from './observability/gateways/RuntimeInfo'
