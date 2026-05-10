const crypto = require('crypto');

const generateRandomPassword = () => {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$';
  const all     = upper + lower + digits + special;

  // Garantiza al menos uno de cada tipo
  const pick = (chars) => chars[crypto.randomInt(0, chars.length)];
  const rest = Array.from({ length: 6 }, () => pick(all)).join('');

  return [pick(upper), pick(lower), pick(digits), pick(special), rest]
    .join('')
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
};

module.exports = { generateRandomPassword };