export const cellText = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''

/**
 * El Excel real trae celdas con \r\n embebido, tildes inconsistentes y espacios extra dentro del mismo encabezado
 * ("CORREO\r\nELECTRONICO", "CORREO ELECTRÓNICO"): se compara en mayúsculas, sin tildes y con los espacios colapsados.
 */
export const normalize = (v: unknown): string =>
  cellText(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
