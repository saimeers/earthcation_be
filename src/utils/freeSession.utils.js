const { TrainingSession, SessionUser, UserProfile, Location } = require('../models');

// Sesión común "Juego libre": quien juega sin código de sala cae en la de su ubicación (la del
// perfil); sin ubicación, en una global. No tiene instructor ni código (no se une por código), siempre
// está activa. Se crea la primera vez que se necesita y el jugador queda inscrito en ella.
const getOrCreateFreeSession = async (userId) => {
  const profile = await UserProfile.findOne({
    where: { user_id: userId },
    include: [{ model: Location, as: 'location' }]
  });
  const location = profile?.location || null;

  const [session] = await TrainingSession.findOrCreate({
    where: { is_free_play: true, location_id: location ? location.id : null },
    defaults: {
      name: location ? `Juego libre – ${location.municipality}` : 'Juego libre',
      status: 'active',
      started_at: new Date(),
      instructor_id: null,
      code: null
    }
  });

  await SessionUser.findOrCreate({ where: { session_id: session.id, user_id: userId } });
  return session.id;
};

// session_id que llega del juego, o la sesión libre si vino vacío
const resolveSessionId = async (userId, sessionId) => sessionId || getOrCreateFreeSession(userId);

module.exports = { getOrCreateFreeSession, resolveSessionId };
