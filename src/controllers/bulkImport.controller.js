const bulkImportService = require('../services/bulkImport.service');

const parse = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'El archivo Excel es requerido' });
    const rows = await bulkImportService.parseExcel(req.file.buffer);
    res.json({ rows });
  } catch (err) { next(err); }
};

const confirm = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows debe ser un arreglo no vacío' });
    }
    const result = await bulkImportService.confirmImport(rows);
    res.status(201).json(result);
  } catch (err) { next(err); }
};

module.exports = { parse, confirm };
