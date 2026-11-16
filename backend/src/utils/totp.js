// Time-based one-time passwords (RFC 6238), compatible with Google Authenticator / Microsoft Authenticator
const crypto = require('crypto');
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const enc = (buf) => {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};
const dec = (s) => {
  let bits = '';
  for (const c of s.toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const hotp = (secret, counter) => {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', dec(secret)).update(b).digest();
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
};
const step = () => Math.floor(Date.now() / 30000);
exports.newSecret = () => enc(crypto.randomBytes(20));
exports.now = (secret) => hotp(secret, step());
exports.verify = (secret, code) => [-1, 0, 1].some((d) => hotp(secret, step() + d) === String(code || '').trim());
exports.uri = (secret, account) =>
  `otpauth://totp/Vivan%20Angels:${encodeURIComponent(account)}?secret=${secret}&issuer=Vivan%20Angels`;
