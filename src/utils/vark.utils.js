// Mapa de respuestas VARK por pregunta
const VARK_ANSWER_MAP = {
  q1: { A: 'reading', B: 'visual', C: 'auditory' },
  q2: { A: 'auditory', B: 'reading', C: 'visual'  },
  q3: { A: 'visual',   B: 'auditory', C: 'reading' },
  q4: { A: 'reading',  B: 'visual',  C: 'auditory' }
};

const DOMINANT_LABELS = {
  visual:   'Visual',
  auditory: 'Auditivo',
  reading:  'Lector/Escritor'
};

/**
 * Calcula los puntajes y el estilo dominante a partir de las respuestas
 * @param {Object} answers - { q1: "A", q2: "C", q3: "B", q4: "A" }
 * @returns {{ visual, auditory, reading, dominant_style }}
 */
const calculateVarkScores = (answers) => {
  const scores = { visual: 0, auditory: 0, reading: 0 };

  for (const [question, answer] of Object.entries(answers)) {
    const map = VARK_ANSWER_MAP[question];
    if (map && map[answer]) {
      scores[map[answer]]++;
    }
  }

  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

  return {
    visual_score:   scores.visual,
    auditory_score: scores.auditory,
    reading_score:  scores.reading,
    dominant_style: DOMINANT_LABELS[dominant]
  };
};

module.exports = { calculateVarkScores, VARK_ANSWER_MAP };