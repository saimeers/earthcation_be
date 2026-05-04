const { Organization, UserProfile } = require('../models');
const { Op } = require('sequelize');

const getAll = async () => {
    return Organization.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
};

const getById = async (id) => {
    const org = await Organization.findByPk(id, {
        include: [{ model: UserProfile, as: 'members' }]
    });
    if (!org) {
        const error = new Error('Organización no encontrada');
        error.status = 404;
        throw error;
    }
    return org;
};

const search = async ({ name, type }) => {
    const where = { is_active: true };
    if (name) where.name = { [Op.iLike]: `%${name}%` };
    if (type) where.type = { [Op.iLike]: `%${type}%` };
    return Organization.findAll({ where, order: [['name', 'ASC']] });
};

const getTypes = async () => {
    const results = await Organization.findAll({
        attributes: ['type'],
        where:  { is_active: true, type: { [Op.ne]: null } },
        group:  ['type'],
        order:  [['type', 'ASC']]
    });
    return results.map(r => r.type);
};

const create = async ({ name, type }) => {
    const existing = await Organization.findOne({ where: { name } });
    if (existing) {
        const error = new Error('Ya existe una organización con ese nombre');
        error.status = 409;
        throw error;
    }
    return Organization.create({ name, type });
};

const update = async (id, data) => {
    const org = await Organization.findByPk(id);
    if (!org) {
        const error = new Error('Organización no encontrada');
        error.status = 404;
        throw error;
    }
    return org.update(data);
};

const disable = async (id) => {
    const org = await Organization.findByPk(id);
    if (!org) {
        const error = new Error('Organización no encontrada');
        error.status = 404;
        throw error;
    }
    await org.update({ is_active: false });
    return { message: 'Organización deshabilitada correctamente' };
};

const enable = async (id) => {
    const org = await Organization.findByPk(id);
    if (!org) {
        const error = new Error('Organización no encontrada');
        error.status = 404;
        throw error;
    }
    await org.update({ is_active: true });
    return { message: 'Organización habilitada correctamente' };
};

module.exports = { getAll, getById, search, getTypes, create, update, disable, enable };