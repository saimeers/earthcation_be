const { User, UserProfile, UserRiskProgress, VarkResult, Organization, Location } = require('../models');
const { Op } = require('sequelize');

const getByOrganization = async (organizationId) => {
  const profiles = await UserProfile.findAll({
    where: { organization_id: organizationId },
    include: [
      { association: 'user', attributes: ['id', 'first_name', 'last_name', 'cedula'] },
    ]
  });

  return Promise.all(profiles.map(async (p) => {
    const progress = await UserRiskProgress.findAll({ where: { user_id: p.user_id } });
    const vark     = await VarkResult.findOne({ where: { user_id: p.user_id } });
    const mitigated = progress.filter(r => r.is_mitigated).length;

    return {
      user:           p.user,
      dominant_style: vark?.dominant_style || null,
      total_attempts: progress.length,
      mitigated,
      percentage:     progress.length > 0 ? Math.round((mitigated / progress.length) * 100) : 0
    };
  }));
};

const getByLocation = async ({ department, municipality }) => {
  const where = {};
  if (department)  where.department  = department;
  if (municipality) where.municipality = municipality;

  const locations = await Location.findAll({ where });
  const locationIds = locations.map(l => l.id);

  const profiles = await UserProfile.findAll({
    where: { location_id: { [Op.in]: locationIds } },
    include: [
      { association: 'user',     attributes: ['id', 'first_name', 'last_name', 'cedula'] },
      { association: 'location', attributes: ['municipality', 'department'] }
    ]
  });

  return Promise.all(profiles.map(async (p) => {
    const progress  = await UserRiskProgress.findAll({ where: { user_id: p.user_id } });
    const vark      = await VarkResult.findOne({ where: { user_id: p.user_id } });
    const mitigated = progress.filter(r => r.is_mitigated).length;

    return {
      user:           p.user,
      location:       p.location,
      dominant_style: vark?.dominant_style || null,
      total_attempts: progress.length,
      mitigated,
      percentage:     progress.length > 0 ? Math.round((mitigated / progress.length) * 100) : 0
    };
  }));
};

const getOverview = async () => {
  const totalUsers       = await User.count();
  const totalPlayers     = await User.count({ where: { role: 'player' } });
  const totalInstructors = await User.count({ where: { role: 'instructor' } });
  const totalAttempts    = await UserRiskProgress.count();
  const totalMitigated   = await UserRiskProgress.count({ where: { is_mitigated: true } });

  const varkCounts = await VarkResult.findAll({
    attributes: [
      'dominant_style',
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
    ],
    group: ['dominant_style']
  });

  return {
    users: {
      total:       totalUsers,
      players:     totalPlayers,
      instructors: totalInstructors
    },
    progress: {
      total_attempts: totalAttempts,
      total_mitigated: totalMitigated,
      global_percentage: totalAttempts > 0
        ? Math.round((totalMitigated / totalAttempts) * 100)
        : 0
    },
    vark_distribution: varkCounts.map(v => ({
      style: v.dominant_style,
      count: parseInt(v.dataValues.count)
    }))
  };
};

module.exports = { getByOrganization, getByLocation, getOverview };