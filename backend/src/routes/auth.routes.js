const r = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const totp = require('../utils/totp');
const { MATRIX } = require('../utils/permissions');
const { checkStrength } = require('../utils/password');
const { need, httpError } = require('../utils/validators');
const nextLoginId = require('../utils/loginId');

// Public agent application. New applications stay inactive until an Owner or Manager activates them.
r.post('/agent-signup', ah(async (req, res) => {
  need(req.body, ['name', 'phone', 'password']); checkStrength(req.body.password);
  const email = (req.body.email || (await nextLoginId('agent'))).toLowerCase();
  const [[existing]] = await db.query('SELECT id FROM users WHERE email=? OR phone=?', [email, req.body.phone]);
  if (existing) throw httpError(409, 'An account with this email or phone already exists');
  const [[owner]] = await db.query("SELECT id FROM users WHERE role='owner' ORDER BY id LIMIT 1");
  if (!owner) throw httpError(500, 'Owner account is not configured');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query("INSERT INTO users (name,email,phone,password_hash,role,status,must_change_password) VALUES (?,?,?,?, 'agent','inactive',0)", [req.body.name, email, req.body.phone, await bcrypt.hash(req.body.password, 10)]);
    const code = 'AG' + String(u.insertId).padStart(4, '0');
    await conn.query('INSERT INTO agents (user_id,agent_code,area,commission_rate_pct,created_by) VALUES (?,?,?,?,?)', [u.insertId, code, req.body.area || null, req.body.commission_rate_pct || 10, owner.id]);
    await conn.commit();
    res.status(201).json({ ok: true, message: 'Agent application submitted. An Owner or Manager must activate your account before login.', login_id: email });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

async function history(userId, loginId, success, reason, req) {
  await db.query('INSERT INTO login_history (user_id,login_id,success,reason,ip,user_agent) VALUES (?,?,?,?,?,?)',
    [userId, loginId, success ? 1 : 0, reason || null, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]).catch(() => {});
}

async function profileIds(u) {
  let agentId = null, caretakerId = null;
  if (u.role === 'agent') { const [[a]] = await db.query('SELECT id FROM agents WHERE user_id=?', [u.id]); agentId = a ? a.id : null; }
  if (u.role === 'caretaker') { const [[c]] = await db.query('SELECT id FROM caretakers WHERE user_id=?', [u.id]); caretakerId = c ? c.id : null; }
  return { agentId, caretakerId };
}

const publicUser = (u, ids) => ({
  id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, ...ids,
  permissions: MATRIX[u.role] || {},
  must_change_password: !!u.must_change_password,
  totp_enabled: !!u.totp_enabled,
  twofa_required: u.role === 'owner' && !u.totp_enabled,
  last_login_at: u.last_login_at,
});

async function finish(u, req, res) {
  const ids = await profileIds(u);
  await db.query('UPDATE users SET last_login_at=NOW(), failed_attempts=0, locked_until=NULL WHERE id=?', [u.id]);
  await history(u.id, u.email || u.phone, true, null, req);
  const token = jwt.sign({ id: u.id, role: u.role, purpose: 'access', ...ids }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: publicUser(u, ids) });
}

// One login page for everyone: login ID can be the email (owner@vivanangels.com) or the phone number
r.post('/login', ah(async (req, res) => {
  const loginId = String(req.body.login || req.body.phone || '').trim().toLowerCase();
  need({ loginId, password: req.body.password }, ['loginId', 'password']);
  const [[u]] = await db.query(
    'SELECT *, (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked FROM users WHERE email=? OR phone=?', [loginId, loginId]);
  if (!u) { await history(null, loginId, false, 'unknown_user', req); throw httpError(401, 'Invalid login ID or password'); }
  if (u.status !== 'active') { await history(u.id, loginId, false, 'deactivated', req); throw httpError(403, 'Account is deactivated. Contact the owner.'); }
  if (u.is_locked) { await history(u.id, loginId, false, 'locked', req); throw httpError(429, 'Too many failed attempts. Try again in 15 minutes.'); }
  if (!(await bcrypt.compare(String(req.body.password), u.password_hash))) {
    const n = u.failed_attempts + 1;
    await db.query('UPDATE users SET failed_attempts=?, locked_until=IF(?>=5, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NULL) WHERE id=?',
      [n >= 5 ? 0 : n, n, u.id]);
    await history(u.id, loginId, false, 'bad_password', req);
    throw httpError(401, 'Invalid login ID or password');
  }
  if (u.totp_enabled) {
    const temp_token = jwt.sign({ id: u.id, purpose: '2fa' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return res.json({ need_2fa: true, temp_token });
  }
  await finish(u, req, res);
}));

r.post('/2fa/verify', ah(async (req, res) => {
  need(req.body, ['temp_token', 'code']);
  let p;
  try { p = jwt.verify(req.body.temp_token, process.env.JWT_SECRET); } catch { throw httpError(401, 'Session expired. Log in again.'); }
  if (p.purpose !== '2fa') throw httpError(401, 'Invalid token');
  const [[u]] = await db.query('SELECT * FROM users WHERE id=? AND status="active"', [p.id]);
  if (!u || !u.totp_enabled || !totp.verify(u.totp_secret, req.body.code)) {
    await history(p.id, 'user#' + p.id, false, 'bad_2fa_code', req);
    throw httpError(401, 'Invalid authentication code');
  }
  await finish(u, req, res);
}));

r.get('/me', auth, ah(async (req, res) => {
  const [[u]] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
  res.json(publicUser(u, await profileIds(u)));
}));

r.post('/change-password', auth, ah(async (req, res) => {
  need(req.body, ['old_password', 'new_password']);
  checkStrength(req.body.new_password);
  const [[u]] = await db.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.old_password), u.password_hash))) throw httpError(400, 'Current password is wrong');
  await db.query('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', [await bcrypt.hash(req.body.new_password, 10), req.user.id]);
  res.locals.audit = { action: 'password.change', entity: 'user', id: req.user.id };
  res.json({ ok: true });
}));

// ---- Two-factor authentication (authenticator app) ----
r.post('/2fa/setup', auth, ah(async (req, res) => {
  const [[u]] = await db.query('SELECT email, phone, totp_enabled FROM users WHERE id=?', [req.user.id]);
  if (u.totp_enabled) throw httpError(400, '2FA is already enabled');
  const secret = totp.newSecret();
  await db.query('UPDATE users SET totp_secret=? WHERE id=?', [secret, req.user.id]);
  const otpauth = totp.uri(secret, u.email || u.phone);
  let qr = null;
  try { qr = await require('qrcode').toDataURL(otpauth); } catch { /* qrcode package missing: manual key still works */ }
  res.json({ secret, otpauth, qr });
}));

r.post('/2fa/enable', auth, ah(async (req, res) => {
  need(req.body, ['code']);
  const [[u]] = await db.query('SELECT totp_secret FROM users WHERE id=?', [req.user.id]);
  if (!u.totp_secret || !totp.verify(u.totp_secret, req.body.code)) throw httpError(400, 'Code is not correct. Check your authenticator app.');
  await db.query('UPDATE users SET totp_enabled=1 WHERE id=?', [req.user.id]);
  res.locals.audit = { action: '2fa.enable', entity: 'user', id: req.user.id };
  res.json({ ok: true });
}));

r.post('/2fa/disable', auth, ah(async (req, res) => {
  need(req.body, ['password', 'code']);
  if (req.user.role === 'owner') throw httpError(403, 'The Owner account must keep two-factor authentication on');
  const [[u]] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.password), u.password_hash)) || !totp.verify(u.totp_secret, req.body.code)) {
    throw httpError(400, 'Password or code is wrong');
  }
  await db.query('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?', [req.user.id]);
  res.locals.audit = { action: '2fa.disable', entity: 'user', id: req.user.id };
  res.json({ ok: true });
}));

r.get('/login-history', auth, ah(async (req, res) => {
  const [rows] = await db.query(
    'SELECT success, reason, ip, user_agent, created_at FROM login_history WHERE user_id=? ORDER BY id DESC LIMIT 20', [req.user.id]);
  res.json(rows);
}));

module.exports = r;
