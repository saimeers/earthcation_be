/** Cuerpo tal como lo manda el Worker (snake_case); el dominio normaliza cada campo. */
export interface IngestVisitCommand {
  readonly fields: Readonly<Record<string, unknown>>
}
