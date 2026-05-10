const userService = require('../services/user.service')

const createByAdmin = async (req, res, next) => {
  try {
    const result = await userService.createByAdmin(req.body)
    res.status(201).json(result)
  } catch (err) { next(err) }
}

const getAll = async (req, res, next) => {
  try {
    const { role, organization_id, location_id } = req.query
    const users = await userService.getAll({ role, organization_id, location_id })
    res.json(users)
  } catch (err) { next(err) }
}

const getById = async (req, res, next) => {
  try {
    const user = await userService.getById(req.params.id)
    res.json(user)
  } catch (err) { next(err) }
}

const update = async (req, res, next) => {
  try {
    const user = await userService.update(req.params.id, req.user.id, req.user.role, req.body)
    res.json({ message: 'Usuario actualizado', user })
  } catch (err) { next(err) }
}

const disable = async (req, res, next) => {
  try {
    const result = await userService.disable(req.params.id)
    res.json(result)
  } catch (err) { next(err) }
}

const enable = async (req, res, next) => {
  try {
    const result = await userService.enable(req.params.id)
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = { getAll, getById, update, disable, enable, createByAdmin }