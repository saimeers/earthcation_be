const locationService = require('../services/location.service');

const getAll = async (req, res, next) => {
    try {
        const data = await locationService.getAll();
        res.json(data);
    } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
    try {
        const data = await locationService.getById(req.params.id);
        res.json(data);
    } catch (err) { next(err); }
};

const search = async (req, res, next) => {
    try {
        const { municipality, department, country } = req.query;
        const data = await locationService.search({ municipality, department, country });
        res.json(data);
    } catch (err) { next(err); }
};

const create = async (req, res, next) => {
    try {
        const { municipality, department, country } = req.body;
        if (!municipality || !department) {
            return res.status(400).json({ error: 'Municipio y departamento son requeridos' });
        }
        const data = await locationService.create({ municipality, department, country });
        res.status(201).json({ message: 'Localidad creada', data });
    } catch (err) { next(err); }
};

const update = async (req, res, next) => {
    try {
        const data = await locationService.update(req.params.id, req.body);
        res.json({ message: 'Localidad actualizada', data });
    } catch (err) { next(err); }
};

const disable = async (req, res, next) => {
    try {
        const result = await locationService.disable(req.params.id);
        res.json(result);
    } catch (err) { next(err); }
};

const enable = async (req, res, next) => {
    try {
        const result = await locationService.enable(req.params.id);
        res.json(result);
    } catch (err) { next(err); }
};

module.exports = { getAll, getById, search, create, update, disable, enable };