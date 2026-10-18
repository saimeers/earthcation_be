/**
 * Dispositivo, sistema y navegador a partir del user-agent. Aproximado a propósito (sin librería):
 * alcanza para ver si los mineros juegan en celular o en PC.
 */
const parseUserAgent = (ua = '') => {
  const s = String(ua);
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s) ? 'tablet'
    : /Mobi|iPhone|iPod|Android|Windows Phone/i.test(s) ? 'mobile'
    : s ? 'desktop' : null;
  const os = /Windows/i.test(s) ? 'Windows'
    : /Android/i.test(s) ? 'Android'
    : /iPhone|iPad|iPod/i.test(s) ? 'iOS'
    : /CrOS/i.test(s) ? 'ChromeOS'
    : /Mac OS X|Macintosh/i.test(s) ? 'macOS'
    : /Linux/i.test(s) ? 'Linux' : s ? 'Otro' : null;
  const browser = /Edg\//i.test(s) ? 'Edge'
    : /OPR\/|Opera/i.test(s) ? 'Opera'
    : /SamsungBrowser/i.test(s) ? 'Samsung'
    : /Firefox|FxiOS/i.test(s) ? 'Firefox'
    : /Chrome|CriOS/i.test(s) ? 'Chrome'
    : /Safari/i.test(s) ? 'Safari' : s ? 'Otro' : null;
  return { device, os, browser };
};

module.exports = { parseUserAgent };
