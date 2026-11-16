const r = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const nextLoginId = require('../utils/loginId');
const { tempPassword, checkStrength } = require('../utils/password');
const { need } = require('../utils/validators');

r.use(auth);

// Owner / Manager create agents; login ID is generated like agent001@vivanangels.com
r.post('/', can('agents', 2), ah(async (req, res) => {
  need(req.body, ['name', 'phone']);
  const { name, phone, area = null, commission_rate_pct = 10 } = req.body;
  const email = (req.body.email || (await nextLoginId('agent'))).toLowerCase();
  const pw = req.body.password || tempPassword();
  if (req.body.password) checkStrength(pw);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query("INSERT INTO users (name,email,phone,password_hash,role,must_change_password) VALUES (?,?,?,?, 'agent', 1)",
      [name, email, phone, await bcrypt.hash(pw, 10)]);
    const code = 'AG' + String(u.insertId).padStart(4, '0');
    const [a] = await conn.query('INSERT INTO agents (user_id,agent_code,area,commission_rate_pct,created_by) VALUES (?,?,?,?,?)',
      [u.insertId, code, area, commission_rate_pct, req.user.id]);
    await conn.commit();
    res.locals.audit = { action: 'agent.create', entity: 'agent', id: a.insertId, details: { code, login_id: email } };
    res.status(201).json({ id: a.insertId, agent_code: code, login_id: email, temp_password: pw });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

r.get('/', can('agents', 1), ah(async (req, res) => {
  const [rows] = await db.query(`
    SELECT a.id, a.agent_code, a.area, a.commission_rate_pct, u.name, u.phone, u.email AS login_id, u.status,
      (SELECT COUNT(*) FROM leads l WHERE l.agent_id=a.id) AS total_leads,
      (SELECT COUNT(*) FROM leads l WHERE l.agent_id=a.id AND l.status='confirmed') AS confirmed_leads,
      (SELECT COUNT(*) FROM caretakers c WHERE c.registered_by=a.id) AS caretakers_registered,
      (SELECT COUNT(*) FROM caretakers c WHERE c.registered_by=a.id AND c.availability='assigned') AS caretakers_working,
      (SELECT COUNT(*) FROM caretakers c WHERE c.registered_by=a.id AND c.availability<>'assigned') AS caretakers_not_working,
      (SELECT COALESCE(SUM(amount),0) FROM commissions c WHERE c.agent_id=a.id) AS total_commission
    FROM agents a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC`);
  // Commission figures are hidden from telecallers
  if (req.user.role === 'telecaller') rows.forEach((x) => { delete x.commission_rate_pct; delete x.total_commission; });
  res.json(rows);
}));

r.patch('/:id/status', can('agents', 2), ah(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'status must be active or inactive' });
  await db.query('UPDATE users u JOIN agents a ON a.user_id=u.id SET u.status=? WHERE a.id=?', [status, req.params.id]);
  res.locals.audit = { action: 'agent.' + status, entity: 'agent', id: Number(req.params.id) };
  res.json({ ok: true });
}));

module.exports = r;
