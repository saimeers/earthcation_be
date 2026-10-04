// Coordenadas de municipios (DIVIPOLA del DANE, datos.gov.co dataset gdxc-w37w) para ubicar
// localidades en el mapa. Los nombres de la BD vienen del catálogo propio (seedMunicipios) y no
// siempre coinciden letra a letra con DIVIPOLA ("Bogotá D.C." vs "BOGOTÁ, D.C.", "Tumaco" vs
// "SAN ANDRÉS DE TUMACO"), así que se compara normalizado y con tolerancia.
const MUNICIPIOS = require('../data/colombia-municipios-coords.json');

const normalize = (text) => String(text ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

const DEPT_ALIASES = {
  'BOGOTA D C': 'BOGOTA D C',
  'BOGOTA': 'BOGOTA D C',
  'SAN ANDRES Y PROVIDENCIA': 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
  'SAN ANDRES': 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
  'VALLE': 'VALLE DEL CAUCA',
  'NORTE SANTANDER': 'NORTE DE SANTANDER',
};

// Nombres que no se resuelven solos (el catálogo usa el nombre popular, DIVIPOLA el oficial)
const MUNI_ALIASES = {
  'TOLU VIEJO': 'SAN JOSE DE TOLUVIEJO',
  'SAN ANTONIO DE PALMITO': 'PALMITO',
};

const levenshtein = (a, b) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
};

const stripArticles = (n) => n.replace(/\(.*?\)/g, ' ').replace(/\b(EL|LA|LOS|LAS)\b/g, ' ').replace(/\s+/g, ' ').trim();

const STOPWORDS = new Set(['EL', 'LA', 'LOS', 'LAS', 'DE', 'DEL', 'Y', 'SAN', 'SANTA', 'SANTO', 'ISLAS', 'ISLA']);
const keyTokens = (n) => new Set(stripArticles(n).split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t)));

// Índice por departamento normalizado
const byDept = {};
for (const m of MUNICIPIOS) {
  const d = normalize(m.department);
  (byDept[d] ??= []).push({ ...m, norm: normalize(m.municipality) });
}

const resolveDept = (department) => {
  const d = normalize(department);
  const aliased = DEPT_ALIASES[d] ?? d;
  if (byDept[aliased]) return aliased;
  let best = null, bestDist = Infinity;
  for (const key of Object.keys(byDept)) {
    const dist = levenshtein(aliased, key);
    if (dist < bestDist) { bestDist = dist; best = key; }
  }
  return bestDist <= 3 ? best : null;
};

const cache = new Map();

/**
 * Coordenadas de un municipio. Devuelve { lat, lng, code, exact } o null si no se encuentra.
 * Sin municipio (o sin coincidencia) cae a la capital del departamento con exact = false.
 */
const coordsFor = (municipality, department) => {
  const key = `${municipality}|${department}`;
  if (cache.has(key)) return cache.get(key);

  let result = null;
  const dept = resolveDept(department);
  if (dept) {
    const list = byDept[dept];
    const m0 = normalize(municipality);
    const m = MUNI_ALIASES[m0] ?? m0;
    let hit = m && list.find(x => x.norm === m);
    // "Tumaco" ↔ "SAN ANDRÉS DE TUMACO", "Cartagena" ↔ "CARTAGENA DE INDIAS"
    if (!hit && m) hit = list.find(x => x.norm.endsWith(' ' + m) || x.norm.startsWith(m + ' '));
    // Sin artículos ni paréntesis: "El Peñol" ↔ "PEÑOL", "La Gloria (Cesar)" ↔ "LA GLORIA"
    if (!hit && m) {
      const bare = stripArticles(m);
      hit = list.find(x => stripArticles(x.norm) === bare || x.norm.replace(/ /g, '') === m.replace(/ /g, ''));
    }
    // Palabras distintivas en común: "Santo Domingo de Silos" ↔ "SILOS", "Mompós" ↔ "SANTA CRUZ DE MOMPOX"
    if (!hit && m) {
      const mine = keyTokens(m);
      let best = null, bestScore = 0, tie = false;
      for (const x of list) {
        const theirs = keyTokens(x.norm);
        const shared = [...mine].filter(t => [...theirs].some(u => u === t || levenshtein(t, u) <= 1)).length;
        const score = shared / Math.max(1, Math.min(mine.size, theirs.size));
        if (score > bestScore) { bestScore = score; best = x; tie = false; }
        else if (score === bestScore && score > 0) tie = true;
      }
      if (best && bestScore >= 1 && !tie) hit = best;
    }
    if (!hit && m) {
      let bestDist = Infinity;
      for (const x of list) {
        const dist = levenshtein(m, x.norm);
        if (dist < bestDist) { bestDist = dist; hit = x; }
      }
      if (bestDist > 2) hit = null;
    }
    if (hit) result = { lat: hit.lat, lng: hit.lng, code: hit.code, exact: true };
    else {
      // Capital del departamento: el código DIVIPOLA termina en 001
      const capital = list.find(x => x.code.endsWith('001')) ?? list[0];
      result = { lat: capital.lat, lng: capital.lng, code: capital.code, exact: false };
    }
  }
  cache.set(key, result);
  return result;
};

module.exports = { coordsFor, normalize };
