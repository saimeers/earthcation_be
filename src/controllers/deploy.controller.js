const deployService = require('../services/deploy.service');

const LABEL_RE = /^[\w.\- ]{1,40}$/;

const list = async (req, res, next) => {
  try { res.json(await deployService.listVersions()); } catch (err) { next(err); }
};

const status = async (req, res, next) => {
  try { res.json(await deployService.getStatus()); } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const label = String(req.body.label ?? '').trim();
    const size = Number(req.body.size_bytes);
    if (!LABEL_RE.test(label)) return res.status(400).json({ error: 'Versión inválida: usa letras, números, punto o guion (máx. 40)' });
    if (!Number.isInteger(size) || size <= 0) return res.status(400).json({ error: 'size_bytes es requerido' });
    const result = await deployService.createVersion(req.user.id, {
      label, notes: req.body.notes?.trim().slice(0, 2000), size_bytes: size,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
};

const upload = async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Envía el ZIP en el cuerpo (application/zip)' });
    await deployService.saveLocalUpload(req.params.id, req.body);
    res.json({ message: 'ZIP recibido' });
  } catch (err) { next(err); }
};

const complete = async (req, res, next) => {
  try { res.json(await deployService.completeUpload(req.params.id)); } catch (err) { next(err); }
};

const activate = async (req, res, next) => {
  try {
    const version = await deployService.activate(req.params.id);
    res.json({ message: `Versión ${version.label} activa`, version });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await deployService.removeVersion(req.params.id);
    res.json({ message: 'Versión eliminada' });
  } catch (err) { next(err); }
};

const preview = async (req, res, next) => {
  try { res.json(await deployService.previewUrl(req.params.id, `${req.protocol}://${req.get('host')}`)); } catch (err) { next(err); }
};

module.exports = { list, status, create, upload, complete, activate, remove, preview };
