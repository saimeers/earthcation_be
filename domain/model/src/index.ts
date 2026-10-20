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
