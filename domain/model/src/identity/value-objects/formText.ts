/**
 * Texto de un campo que llega de un formulario o del Excel: se recorta, un número (cédula escrita como número) cuenta
 * como texto y lo vacío es null. Los formularios mandan '' en los opcionales vacíos, y '' rompía la validación de
 * correo, el INTEGER de edad y los UUID de organización/localidad.
 */
export const formText = (v: unknown): string | null => {
  const text = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return text === '' ? null : text
}
