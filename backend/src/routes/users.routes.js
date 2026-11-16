const r = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const nextLoginId = require('../utils/loginId');
const { tempPassword, checkStrength } = require('../utils/password');
const { need, oneOf, httpError } = require('../utils/validators');
const allow = require('../middleware/roleGuard');

r.use(auth);

// Names only (for assigning leads). Any role that manages leads may use this.
r.get('/staff', can('leads', 2), ah(async (req, res) => {
  oneOf(req.query.role, ['telecaller', 'manager'], 'role');
  const [rows] = await db.query("SELECT id, name FROM users WHERE role=? AND status='active' ORDER BY name", [req.query.role]);
  res.json(rows);
}));

// Managers can create and manage telecaller accounts without access to full user administration.
r.get('/telecallers', allow('owner', 'manager'), ah(async (req, res) => {
  const [rows] = await db.query("SELECT id,name,email,phone,status,last_login_at,created_at FROM users WHERE role='telecaller' ORDER BY name");
  res.json(rows);
}));
r.post('/telecallers', allow('owner', 'manager'), ah(async (req, res) => {
  need(req.body, ['name', 'phone']);
  const email = (req.body.email || (await nextLoginId('telecaller'))).toLowerCase();
  const pw = req.body.password || tempPassword(); if (req.body.password) checkStrength(pw);
  const [x] = await db.query('INSERT INTO users (name,email,phone,password_hash,role,must_change_password) VALUES (?,?,?,?,?,1)', [req.body.name, email, req.body.phone, await bcrypt.hash(pw, 10), 'telecaller']);
  res.locals.audit = { action: 'telecaller.create', entity: 'user', id: x.insertId, details: { login_id: email } };
  res.status(201).json({ id: x.insertId, login_id: email, temp_password: pw });
}));
r.patch('/telecallers/:id/status', allow('owner', 'manager'), ah(async (req, res) => {
  oneOf(req.body.status, ['active', 'inactive'], 'status');
  await db.query("UPDATE users SET status=? WHERE id=? AND role='telecaller'", [req.body.status, req.params.id]);
  res.locals.audit = { action: 'telecaller.' + req.body.status, entity: 'user', id: Number(req.params.id) }; res.json({ ok: true });
}));

// Everything below: Owner only (users module, full)
r.use(can('users', 3));

r.get('/', ah(async (req, res) => {
  const [rows] = await db.query(
    'SELECT id,name,email,phone,role,status,last_login_at,totp_enabled,must_change_password,created_at FROM users ORDER BY id');
  res.json(rows);
}));

r.post('/', ah(async (req, res) => {
  need(req.body, ['name', 'phone', 'role']);
  oneOf(req.body.role, ['manager', 'telecaller', 'accountant'], 'role'); // agents via Agents page, caretakers via approval, single Owner
  const email = (req.body.email || (await nextLoginId(req.body.role))).toLowerCase();
  const pw = req.body.password || tempPassword();
  if (req.body.password) checkStrength(pw);
  const [x] = await db.query(
    'INSERT INTO users (name,email,phone,password_hash,role,must_change_password) VALUES (?,?,?,?,?,1)',
    [req.body.name, email, req.body.phone, await bcrypt.hash(pw, 10), req.body.role]);
  res.locals.audit = { action: 'user.create', entity: 'user', id: x.insertId, details: { role: req.body.role, login_id: email } };
  res.status(201).json({ id: x.insertId, login_id: email, temp_password: pw });
}));

async function target(req) {
  const [[u]] = await db.query('SELECT id, role FROM users WHERE id=?', [req.params.id]);
  if (!u) throw httpError(404, 'User not found');
  return u;
}

r.patch('/:id/status', ah(async (req, res) => {
  const u = await target(req);
  oneOf(req.body.status, ['active', 'inactive'], 'status');
  if (u.role === 'owner' || u.id === req.user.id) throw httpError(400, 'The Owner account cannot be deactivated');
  await db.query('UPDATE users SET status=? WHERE id=?', [req.body.status, u.id]);
  res.locals.audit = { action: 'user.' + req.body.status, entity: 'user', id: u.id };
  res.json({ ok: true });
}));

r.post('/:id/reset-password', ah(async (req, res) => {
  const u = await target(req);
  const pw = tempPassword();
  await db.query('UPDATE users SET password_hash=?, must_change_password=1, failed_attempts=0, locked_until=NULL WHERE id=?',
    [await bcrypt.hash(pw, 10), u.id]);
  res.locals.audit = { action: 'user.reset_password', entity: 'user', id: u.id };
  res.json({ ok: true, temp_password: pw });
}));

module.exports = r;
