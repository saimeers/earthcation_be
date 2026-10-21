/**
 * Qué se tocó, sin datos personales: los nombres de los campos que vinieron con valor y, si cambió, el rol (un dato de
 * permisos, no personal). Nunca los valores de nombre, cédula, correo ni contraseña.
 */
export const fieldChanges = (fields: object): Record<string, unknown> => {
  const entries = Object.entries(fields as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '')
  const role = (fields as { role?: unknown }).role
  return { fields: entries.map(([k]) => k).sort(), ...(typeof role === 'string' && role !== '' && { role }) }
}
