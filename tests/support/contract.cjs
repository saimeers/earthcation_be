const request = require('supertest');
const app = require('../../dist/src/app');
const { tokenFor } = require('./auth.cjs');

// Contrato = estado HTTP + forma del JSON (claves y tipos), no los valores: ids, fechas y códigos de sala
// cambian en cada corrida, pero si un campo desaparece, cambia de tipo o de nombre, el snapshot falla.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const scalarType = (v) => {
  if (v === null) return 'null';
  if (typeof v !== 'string') return typeof v;
  if (UUID.test(v)) return 'uuid';
  if (ISO_DATE.test(v)) return 'date';
  return 'string';
};

const mergeTypes = (a, b) => {
  if (a === undefined) return b;
  if (typeof a === 'string' && typeof b === 'string') {
    return [...new Set([...a.split(' | '), ...b.split(' | ')])].sort().join(' | ');
  }
  if (Array.isArray(a) && Array.isArray(b)) return [mergeTypes(a[0], b[0])].filter(x => x !== undefined);
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return Object.fromEntries(keys.map(k => [k, k in a && k in b ? mergeTypes(a[k], b[k]) : mergeTypes(a[k] ?? b[k], 'absent')]));
  }
  return mergeTypes(JSON.stringify(a), JSON.stringify(b));
};

const shape = (v) => {
  if (Array.isArray(v)) return v.length ? [v.map(shape).reduce(mergeTypes)] : [];
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, shape(v[k])]));
  }
  return scalarType(v);
};

const send = (method, url, who, body) => {
  const req = request(app)[method](url);
  if (who) req.set('Authorization', `Bearer ${tokenFor(who)}`);
  return body === undefined ? req : req.send(body);
};

const contract = (res) => ({
  status: res.status,
  type: (res.headers['content-type'] || '').split(';')[0],
  body: res.headers['content-type']?.includes('json') ? shape(res.body) : undefined,
});

module.exports = { shape, send, contract, app };
