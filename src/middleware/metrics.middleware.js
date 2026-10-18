// Métricas en memoria de las últimas 15 min por ruta (latencia p50/p95 y errores 5xx), para la página
// "Salud del servicio". Cubetas de 1 minuto: no crece con el tráfico ni necesita Redis (cada
// instancia mide lo suyo; con una sola instancia en Railway basta).
const WINDOW_MIN = 15;
const MAX_SAMPLES_PER_BUCKET = 400; // por ruta y minuto, suficiente para un percentil razonable

const buckets = new Map(); // minuto -> Map(ruta -> { durations: number[], count, errors })

const minuteNow = () => Math.floor(Date.now() / 60000);

const prune = () => {
  const oldest = minuteNow() - WINDOW_MIN;
  for (const m of buckets.keys()) if (m < oldest) buckets.delete(m);
};

// '/api/sessions/123/progress' -> '/api/sessions/:id/progress' (agrupa por ruta, no por recurso)
const routeKey = (req) => {
  const base = req.baseUrl || '';
  const path = req.route?.path ?? req.path;
  return `${req.method} ${base}${path}`.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id');
};

const metrics = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const m = minuteNow();
    if (!buckets.has(m)) { buckets.set(m, new Map()); prune(); }
    const key = routeKey(req);
    const b = buckets.get(m);
    const r = b.get(key) ?? { durations: [], count: 0, errors: 0 };
    r.count++;
    if (res.statusCode >= 500) r.errors++;
    if (r.durations.length < MAX_SAMPLES_PER_BUCKET) r.durations.push(ms);
    b.set(key, r);
  });
  next();
};

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

/** Resumen de los últimos 15 min: global y por ruta, ordenado por más lentas. */
const snapshot = () => {
  prune();
  const routes = new Map();
  const all = [];
  let count = 0, errors = 0;
  const perMinute = [];
  for (const [m, b] of [...buckets.entries()].sort((a, c) => a[0] - c[0])) {
    let mc = 0, me = 0;
    for (const [key, r] of b) {
      const agg = routes.get(key) ?? { durations: [], count: 0, errors: 0 };
      agg.durations.push(...r.durations); agg.count += r.count; agg.errors += r.errors;
      routes.set(key, agg);
      all.push(...r.durations); count += r.count; errors += r.errors; mc += r.count; me += r.errors;
    }
    perMinute.push({ minute: new Date(m * 60000).toISOString(), requests: mc, errors: me });
  }
  all.sort((a, b) => a - b);
  const round = (v) => (v == null ? null : Math.round(v));
  return {
    window_minutes: WINDOW_MIN,
    requests: count,
    errors,
    p50_ms: round(percentile(all, 0.5)),
    p95_ms: round(percentile(all, 0.95)),
    per_minute: perMinute,
    routes: [...routes.entries()].map(([route, r]) => {
      const d = r.durations.sort((a, b) => a - b);
      return { route, requests: r.count, errors: r.errors, p50_ms: round(percentile(d, 0.5)), p95_ms: round(percentile(d, 0.95)) };
    }).sort((a, b) => (b.p95_ms ?? 0) - (a.p95_ms ?? 0)).slice(0, 25),
  };
};

module.exports = { metrics, snapshot };
