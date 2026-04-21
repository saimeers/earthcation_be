const analyticsService = require('../services/analytics.service');

const byOrganization = async (req, res, next) => {
  try {
    const data = await analyticsService.getByOrganization(req.params.orgId);
    res.json(data);
  } catch (err) { next(err); }
};

const byLocation = async (req, res, next) => {
  try {
    const { department, municipality } = req.query;
    const data = await analyticsService.getByLocation({ department, municipality });
    res.json(data);
  } catch (err) { next(err); }
};

const overview = async (req, res, next) => {
  try {
    const data = await analyticsService.getOverview();
    res.json(data);
  } catch (err) { next(err); }
};

module.exports = { byOrganization, byLocation, overview };