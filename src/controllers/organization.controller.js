const organizationService = require('../services/organization.service');

const getAll = async (req, res, next) => {
    try {
        const data = await organizationService.getAll();
        res.json(data);
    } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
    try {
        const data = await organizationService.getById(req.params.id);
        res.json(data);
    } catch (err) { next(err); }
};

const search = async (req, res, next) => {
    try {
        const { name, type } = req.query;
        const data = await organizationService.search({ name, type });
        res.json(data);
    } catch (err) { next(err); }
};

const getTypes = async (req, res, next) => {
    try {
        const data = await organizationService.getTypes();
        res.json(data);
    } catch (err) { next(err); }
};

const create = async (req, res, next) => {
    try {
        const { name, type } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const data = await organizationService.create({ name, type });
        res.status(201).json({ message: 'Organización creada', data });
    } catch (err) { next(err); }
};

const update = async (req, res, next) => {
    try {
        const data = await organizationService.update(req.params.id, req.body);
        res.json({ message: 'Organización actualizada', data });
    } catch (err) { next(err); }
};

const disable = async (req, res, next) => {
    try {
        const result = await organizationService.disable(req.params.id);
        res.json(result);
    } catch (err) { next(err); }
};

const enable = async (req, res, next) => {
    try {
        const result = await organizationService.enable(req.params.id);
        res.json(result);
    } catch (err) { next(err); }
};

module.exports = { getAll, getById, search, getTypes, create, update, disable, enable };