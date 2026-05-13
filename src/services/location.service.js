const { Location } = require('../models');
const { Op } = require('sequelize');

const getAll = async () => {
    return Location.findAll({ where: { is_active: true }, order: [['department', 'ASC'], ['municipality', 'ASC']] });
};

const getById = async (id) => {
    const where = {
        id,
        is_active: true
    };

    const location = await Location.findOne({ where });

    if (!location) {
        const error = new Error('Localidad no encontrada');
        error.status = 404;
        throw error;
    }

    return location;
};

const search = async ({ municipality, department, country }) => {
    const where = { is_active: true };
    if (municipality) where.municipality = { [Op.iLike]: `%${municipality}%` };
    if (department)   where.department   = { [Op.iLike]: `%${department}%` };
    if (country)      where.country      = { [Op.iLike]: `%${country}%` };
    return Location.findAll({ where, order: [['department', 'ASC'], ['municipality', 'ASC']] });
};

const create = async ({ municipality, department, country }) => {
    const existing = await Location.findOne({ where: { municipality, department } });
    if (existing) {
        const error = new Error('Ya existe esa localidad');
        error.status = 409;
        throw error;
    }
    return Location.create({ municipality, department, country });
};

const update = async (id, data) => {
    const location = await Location.findByPk(id);
    if (!location) {
        const error = new Error('Localidad no encontrada');
        error.status = 404;
        throw error;
    }
    return location.update(data);
};

const disable = async (id) => {
    const location = await Location.findByPk(id);
    if (!location) {
        const error = new Error('Localidad no encontrada');
        error.status = 404;
        throw error;
    }
    await location.update({ is_active: false });
    return { message: 'Localidad deshabilitada correctamente' };
};

const enable = async (id) => {
    const location = await Location.findByPk(id);
    if (!location) {
        const error = new Error('Localidad no encontrada');
        error.status = 404;
        throw error;
    }
    await location.update({ is_active: true });
    return { message: 'Localidad habilitada correctamente' };
};

module.exports = { getAll, getById, search, create, update, disable, enable };