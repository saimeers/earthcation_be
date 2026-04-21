const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase(); // ej: "A3FX9KQZ"
};

module.exports = { generateSessionCode };