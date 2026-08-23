const { Location } = require('../models');
const catalog = require('../data/colombia-municipios.json');

// Catálogo oficial de municipios/departamentos de Colombia (33 departamentos, 1104 municipios),
// basado en el dataset abierto de marcovega/colombia-json (fuente DANE), con el ajuste de Bogotá
// como su propio departamento "Bogotá D.C." en vez de un municipio de Cundinamarca. Se corre en
// cada boot — es idempotente (findOrCreate por municipio+departamento normalizado), así que no
// hace falta un flag de "ya sembrado". Necesario para que el import por Excel deje de crear filas
// nuevas libres (ver `bulkImport.service.js#findOrCreateLocation`) y en cambio mapee contra este
// catálogo cerrado.
const seedMunicipios = async () => {
  const existing = await Location.findAll({ attributes: ['municipality', 'department'] });
  const existingKeys = new Set(
    existing.map(l => `${(l.municipality || '').trim().toLowerCase()}|${(l.department || '').trim().toLowerCase()}`)
  );

  const toCreate = [];
  for (const { departamento, municipios } of catalog) {
    for (const municipio of municipios) {
      const key = `${municipio.trim().toLowerCase()}|${departamento.trim().toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toCreate.push({ municipality: municipio, department: departamento, country: 'Colombia', is_active: true });
    }
  }

  if (toCreate.length === 0) return { created: 0 };

  await Location.bulkCreate(toCreate);
  return { created: toCreate.length };
};

module.exports = { seedMunicipios };
