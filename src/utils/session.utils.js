const generateSessionCode = () => {
    return String(Math.floor(Math.random() * 1000)).padStart(3, '0'); // ej: "042"
};

module.exports = { generateSessionCode };