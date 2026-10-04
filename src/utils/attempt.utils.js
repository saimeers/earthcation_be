// Porcentajes por intento: cada vez que el jugador entra o reintenta un nivel es un intento nuevo
// (level_attempts), y su % de éxito es el de ESE intento, no la suma de todo su historial. Así, si
// en el primer intento mitigó 2 de 4 riesgos (50 %) y al reintentar mitigó 4 de 4, su % pasa a
// ser 100 % en vez de 75 %. La meta del jugador es reintentar hasta llegar al 100 %.
//
// Las filas de user_risk_progress sin attempt_id (el juego no pudo abrir el intento, p. ej. sin
// conexión a /api/telemetry) se agrupan por sesión y día como si fueran un intento.

const levelOf = (row) => row.risk?.level_id ?? row.risk?.level?.id ?? row.level_id ?? null;

const dayOf = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

const attemptKey = (row) =>
  row.attempt_id ?? `sin-intento:${row.session_id ?? ''}:${dayOf(row.recorded_at)}`;

/** % de éxito de un conjunto de resultados. */
const summarize = (rows) => {
  const total = rows.length;
  const mitigated = rows.filter(r => r.is_mitigated).length;
  return { total, mitigated, percentage: total > 0 ? Math.round((mitigated / total) * 100) : 0 };
};

/**
 * Agrupa resultados en intentos por jugador y nivel.
 * @returns {Map<string, { user_id, level_id, attempts: Array<{ key, rows, last_at }> }>}
 *          clave `${user_id}|${level_id}`, intentos ordenados del más viejo al más reciente
 */
const groupAttempts = (rows) => {
  const byUserLevel = new Map();
  for (const row of rows) {
    const plain = row.get ? row.get({ plain: true }) : row;
    const level_id = levelOf(plain);
    const ulKey = `${plain.user_id}|${level_id}`;
    if (!byUserLevel.has(ulKey)) byUserLevel.set(ulKey, { user_id: plain.user_id, level_id, attempts: new Map() });
    const attempts = byUserLevel.get(ulKey).attempts;
    const key = attemptKey(plain);
    if (!attempts.has(key)) attempts.set(key, { key, rows: [], last_at: null });
    const a = attempts.get(key);
    a.rows.push(row);
    const at = plain.recorded_at ? new Date(plain.recorded_at) : null;
    if (at && (!a.last_at || at > a.last_at)) a.last_at = at;
  }
  for (const entry of byUserLevel.values()) {
    entry.attempts = [...entry.attempts.values()].sort((a, b) => (a.last_at ?? 0) - (b.last_at ?? 0));
  }
  return byUserLevel;
};

/** Solo las filas del último intento de cada jugador en cada nivel. */
const latestAttemptRows = (rows) => {
  const out = [];
  for (const entry of groupAttempts(rows).values()) {
    const last = entry.attempts[entry.attempts.length - 1];
    if (last) out.push(...last.rows);
  }
  return out;
};

/**
 * Resumen por nivel del último intento de cada jugador.
 * @returns {Array<{ user_id, level_id, attempts_count, total, mitigated, percentage, last_at, rows }>}
 */
const latestAttemptByLevel = (rows) =>
  [...groupAttempts(rows).values()].map(entry => {
    const last = entry.attempts[entry.attempts.length - 1];
    return {
      user_id: entry.user_id,
      level_id: entry.level_id,
      attempts_count: entry.attempts.length,
      last_at: last.last_at,
      rows: last.rows,
      ...summarize(last.rows),
    };
  });

module.exports = { summarize, groupAttempts, latestAttemptRows, latestAttemptByLevel, levelOf };
