const crypto = require('crypto');
const { httpError } = require('./validators');
exports.tempPassword = () => crypto.randomBytes(5).toString('hex'); // 10 chars
exports.checkStrength = (p) => {
  if (typeof p !== 'string' || p.length < 8) throw httpError(400, 'Password must be at least 8 characters');
};
