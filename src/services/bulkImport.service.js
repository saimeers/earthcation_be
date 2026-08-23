const XLSX = require('xlsx');
const { Op } = require('sequelize');
const { User, UserProfile, Organization, Location } = require('../models');
const { hashPassword } = require('../utils/hash.utils');
const { generateRandomPassword } = require('../utils/password.utils');

// Coincide con el formato oficial ANM (Base de Datos Anual de Personal Capacitado y
// Entrenado en Estándares de Competencias en Seguridad y Salvamento Minero). Se busca
// la fila de encabezado por contenido en vez de asumir un índice fijo, para tolerar
// pequeñas variaciones del mismo formato entre versiones del archivo.
const HEADER_MARKER = 'DOCUMENTO DE IDENTIDAD';

// El Excel real trae celdas con \r\n embebido, tildes inconsistentes y espacios extra
// dentro del mismo encabezado (ej. "CORREO\r\nELECTRONICO", "CORREO ELECTRÓNICO") —
// se normaliza todo (mayúsculas, sin tildes, espacios colapsados) antes de comparar.
function normalize(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeaderRowIndex(rows) {
  const marker = normalize(HEADER_MARKER);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((cell) => normalize(cell).includes(marker))) return i;
  }
  return -1;
}

// Row4 del formato ANM tiene títulos de sección en celdas combinadas: solo la primera
// columna de cada sección trae texto, el resto queda vacío hasta la siguiente sección.
// "Carry-forward" reconstruye a qué sección pertenece cada columna.
function buildSectionTitles(headerRow) {
  const sections = new Array(headerRow.length).fill('');
  let current = '';
  for (let i = 0; i < headerRow.length; i++) {
    if (normalize(headerRow[i])) current = normalize(headerRow[i]);
    sections[i] = current;
  }
  return sections;
}

// Encuentra TODAS las columnas cuyo (título de sección + subencabezado propio) contenga
// TODOS los fragmentos dados — evita colisiones entre columnas con palabras en común
// (ej. "NOMBRE" aparece tanto en "NOMBRE(S) Y APELLIDOS" como en "...EMPRESA... NOMBRE").
function findColumns(sectionTitles, subHeaderRow, ...requiredParts) {
  const parts = requiredParts.map(normalize);
  const matches = [];
  for (let i = 0; i < subHeaderRow.length; i++) {
    const combined = `${sectionTitles[i]} ${normalize(subHeaderRow[i])}`;
    if (parts.every((p) => combined.includes(p))) matches.push(i);
  }
  return matches;
}

function findColumn(sectionTitles, subHeaderRow, ...requiredParts) {
  const matches = findColumns(sectionTitles, subHeaderRow, ...requiredParts);
  return matches.length ? matches[0] : -1;
}

function splitFullName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1]
  };
}

const parseExcel = async (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx === -1) {
    const error = new Error('No se encontró la fila de encabezado esperada en el Excel (formato ANM)');
    error.status = 400;
    throw error;
  }

  // El formato ANM parte el encabezado en dos filas por celdas combinadas (headerIdx y headerIdx+1).
  const headerRow = rows[headerIdx];
  const subHeaderRow = rows[headerIdx + 1] || [];
  const sectionTitles = buildSectionTitles(headerRow);

  const colNumeroDoc = findColumn(sectionTitles, subHeaderRow, 'NUMERO');
  const colNombre = findColumn(sectionTitles, subHeaderRow, 'NOMBRE(S)', 'APELLIDO');
  const colEdad = findColumn(sectionTitles, subHeaderRow, 'EDAD');
  const colEmpresa = findColumn(sectionTitles, subHeaderRow, 'EMPRESA', 'NOMBRE');
  const colMunicipioResidencia = findColumn(sectionTitles, subHeaderRow, 'MUNICIPIO DE RESIDENCIA');
  const colDepartamentoResidencia = findColumn(sectionTitles, subHeaderRow, 'DEPARTAMENTO DE RESIDENCIA');
  // Hay dos columnas "CORREO ELECTRÓNICO" (una de la empresa, otra del socorredor/persona) —
  // la del socorredor siempre viene DESPUÉS de las columnas de residencia en el formato ANM.
  const correoColumns = findColumns(sectionTitles, subHeaderRow, 'CORREO', 'ELECTRONICO');
  const colCorreoSocorredor = colMunicipioResidencia !== -1
    ? correoColumns.find((c) => c > colMunicipioResidencia) ?? -1
    : correoColumns[correoColumns.length - 1] ?? -1;

  const missing = [];
  if (colNumeroDoc === -1) missing.push('número de documento');
  if (colNombre === -1) missing.push('nombre completo');
  if (missing.length) {
    const error = new Error(`No se encontraron las columnas requeridas en el Excel: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }

  const dataRows = rows.slice(headerIdx + 2);

  const cedulasInFile = new Set();
  const results = [];

  for (const row of dataRows) {
    const cedula = String(row[colNumeroDoc] ?? '').trim();
    if (!cedula) continue; // fila vacía/de relleno del formato, se ignora silenciosamente

    const { first_name, last_name } = splitFullName(row[colNombre]);
    const age = colEdad !== -1 && row[colEdad] !== '' ? Number(row[colEdad]) : null;
    // El correo NO es único (varios trabajadores comparten el de la empresa) — la
    // cédula es el identificador real, así que un correo repetido no es un problema.
    const email = colCorreoSocorredor !== -1 ? String(row[colCorreoSocorredor] ?? '').trim() : '';
    const organization_name = colEmpresa !== -1 ? String(row[colEmpresa] ?? '').trim() : '';
    const location_municipality = colMunicipioResidencia !== -1 ? String(row[colMunicipioResidencia] ?? '').trim() : '';
    const location_department = colDepartamentoResidencia !== -1 ? String(row[colDepartamentoResidencia] ?? '').trim() : '';

    let status = 'ok';
    let message = '';

    if (!first_name) {
      status = 'missing_required';
      message = 'Falta el nombre';
    } else if (cedulasInFile.has(cedula)) {
      status = 'duplicate_in_file';
      message = 'Cédula repetida en el archivo';
    } else {
      const existing = await User.findOne({ where: { cedula } });
      if (existing) {
        status = 'duplicate_in_db';
        message = 'La cédula ya está registrada en el sistema';
      }
    }

    cedulasInFile.add(cedula);

    results.push({
      cedula, first_name, last_name, age, email,
      organization_name, location_municipality, location_department,
      status, message
    });
  }

  return results;
};

// Comparación insensible a mayúsculas/espacios — el Excel casi nunca escribe el nombre
// EXACTO igual a como ya está guardado en BD (ej. "CARBONES LA GARITA COAL SAS" vs
// "Carbones La Garita Coal S.A.S."). Con match exacto se creaban duplicados silenciosos.
const findOrCreateOrganization = async (name) => {
  if (!name) return { id: null, wasCreated: false };
  const trimmed = name.trim();
  const existing = await Organization.findOne({ where: { name: { [Op.iLike]: trimmed } } });
  if (existing) return { id: existing.id, wasCreated: false };
  const org = await Organization.create({ name: trimmed, type: 'institución' });
  return { id: org.id, wasCreated: true };
};

const findOrCreateLocation = async (municipality, department) => {
  if (!municipality || !department) return { id: null, wasCreated: false };
  const muni = municipality.trim();
  const dept = department.trim();
  const existing = await Location.findOne({
    where: { municipality: { [Op.iLike]: muni }, department: { [Op.iLike]: dept } }
  });
  if (existing) return { id: existing.id, wasCreated: false };
  const location = await Location.create({ municipality: muni, department: dept, country: 'Colombia' });
  return { id: location.id, wasCreated: true };
};

const confirmImport = async (rows) => {
  const created = [];
  const skipped = [];
  const errors = [];

  for (const row of rows) {
    try {
      const cedula = String(row.cedula ?? '').trim();
      if (!cedula || !row.first_name) {
        skipped.push({ cedula, reason: 'Datos incompletos' });
        continue;
      }

      const existing = await User.findOne({ where: { cedula } });
      if (existing) {
        skipped.push({ cedula, reason: 'Cédula ya registrada' });
        continue;
      }

      const password_hash = await hashPassword(generateRandomPassword());

      const user = await User.create({
        username: cedula,
        cedula,
        first_name: row.first_name,
        last_name: row.last_name || '',
        age: row.age || null,
        email: row.email || null,
        role: 'player',
        password_hash
      });

      const org = await findOrCreateOrganization(row.organization_name);
      const loc = await findOrCreateLocation(row.location_municipality, row.location_department);

      await UserProfile.create({ user_id: user.id, organization_id: org.id, location_id: loc.id });

      created.push({
        cedula,
        user_id: user.id,
        organization_created: org.wasCreated ? row.organization_name : null,
        location_created: loc.wasCreated ? `${row.location_municipality}, ${row.location_department}` : null
      });
    } catch (err) {
      errors.push({ cedula: row.cedula, reason: err.message });
    }
  }

  return { created, skipped, errors };
};

module.exports = { parseExcel, confirmImport };
