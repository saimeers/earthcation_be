/** Una fila de la vista previa, tal vez editada por el admin antes de confirmar. */
export interface ImportRowInput {
  readonly cedula: unknown
  readonly firstName: unknown
  readonly lastName?: unknown
  readonly age?: unknown
  readonly email?: unknown
  readonly organizationName?: unknown
  readonly locationMunicipality?: unknown
  readonly locationDepartment?: unknown
}

export interface ConfirmBulkImportCommand {
  readonly rows: readonly ImportRowInput[]
}

export interface ImportedEntry {
  readonly cedula: string
  readonly userId: string
  /** Nombre de la organización si se creó por esta fila. */
  readonly organizationCreated: string | null
  /** "Municipio, Departamento" si la localidad se creó por esta fila. */
  readonly locationCreated: string | null
  /** "Municipio, Departamento" si no se parecía a nada del catálogo (el admin lo revisa). */
  readonly locationNoMatch: string | null
}

export interface SkippedEntry {
  readonly cedula: unknown
  readonly reason: string
}

export interface ImportReport {
  readonly created: ImportedEntry[]
  readonly skipped: SkippedEntry[]
  readonly errors: SkippedEntry[]
}
