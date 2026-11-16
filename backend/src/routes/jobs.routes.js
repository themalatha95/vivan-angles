const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const allow = require('../middleware/roleGuard');
const { need, httpError } = require('../utils/validators');
const { splitMoney, r2 } = require('../utils/money');

r.use(auth);

// Money visibility by role. Company margin is Owner-only; salary is hidden from agents; caretakers see only their salary.
function shape(job, role) {
  const j = { ...job };
  if (role === 'manager') delete j.company_margin;
  if (role === 'agent') { delete j.caretaker_salary; delete j.company_margin; }
  if (role === 'caretaker') { delete j.customer_amount; delete j.agent_commission; delete j.company_margin; }
  return j;
}

r.post('/', can('jobs', 2), ah(async (req, res) => {
  need(req.body, ['lead_id', 'caretaker_id', 'caretaker_salary']);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[lead]] = await conn.query('SELECT * FROM leads WHERE id=? FOR UPDATE', [req.body.lead_id]);
    if (!lead) throw httpError(404, 'Lead not found');
    if (lead.status !== 'confirmed') throw httpError(400, 'Only confirmed leads can become jobs');
    const [[ct]] = await conn.query('SELECT * FROM caretakers WHERE id=? FOR UPDATE', [req.body.caretaker_id]);
    if (!ct) throw httpError(404, 'Caretaker not found');
    if (ct.status !== 'approved') throw httpError(400, 'Caretaker is not approved');
    const [[docs]] = await conn.query(`SELECT COUNT(DISTINCT doc_type) AS verified FROM caretaker_documents
      WHERE caretaker_id=? AND status='approved' AND doc_type IN
      ('aadhaar','photo','police_verification','bank_proof')`, [ct.id]);
    if (Number(docs.verified) < 4) throw httpError(400, 'Caretaker must have all 4 required documents verified before job allocation');
    if (ct.availability !== 'available') throw httpError(400, 'Caretaker is already assigned');

    let rate = 0;
    if (lead.agent_id) { const [[ag]] = await conn.query('SELECT commission_rate_pct FROM agents WHERE id=?', [lead.agent_id]); rate = ag.commission_rate_pct; }
    const customer = req.body.customer_amount ?? lead.budget;
    const commission = lead.agent_id ? (req.body.agent_commission ?? r2(customer * rate / 100)) : 0; // no agent = no commission
    const m = splitMoney({ customer, salary: req.body.caretaker_salary, commission });

    const [x] = await conn.query(
      `INSERT INTO jobs (lead_id,agent_id,caretaker_id,service_type,start_date,end_date,status,
        customer_amount,caretaker_salary,agent_commission,company_margin,created_by)
       VALUES (?,?,?,?,?,?, 'assigned', ?,?,?,?,?)`,
      [lead.id, lead.agent_id, ct.id, lead.service_type, req.body.start_date || null, req.body.end_date || null,
       m.customer_amount, m.caretaker_salary, m.agent_commission, m.company_margin, req.user.id]);
    await conn.query("UPDATE caretakers SET availability='assigned' WHERE id=?", [ct.id]);
    await conn.commit();
    res.locals.audit = { action: 'job.create', entity: 'job', id: x.insertId, details: m };
    res.status(201).json(shape({ id: x.insertId, status: 'assigned', ...m }, req.user.role));
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

r.get('/', can('jobs', 1), ah(async (req, res) => {
  const where = [], args = [];
  if (req.user.role === 'agent') { where.push('j.agent_id=?'); args.push(req.user.agentId); }
  if (req.user.role === 'caretaker') { where.push('j.caretaker_id=?'); args.push(req.user.caretakerId); }
  if (req.query.status) { where.push('j.status=?'); args.push(req.query.status); }
  const [rows] = await db.query(`
    SELECT j.*, l.customer_name, l.phone AS customer_phone, l.address, l.area,
      c.name AS caretaker_name, au.name AS agent_name
    FROM jobs j JOIN leads l ON l.id=j.lead_id
    LEFT JOIN caretakers c ON c.id=j.caretaker_id
    LEFT JOIN agents a ON a.id=j.agent_id LEFT JOIN users au ON au.id=a.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY j.id DESC`, args);
  res.json(rows.map((j) => shape(j, req.user.role)));
}));

async function myJob(req) {
  const [[j]] = await db.query('SELECT * FROM jobs WHERE id=?', [req.params.id]);
  if (!j) throw httpError(404, 'Job not found');
  if (j.caretaker_id !== req.user.caretakerId) throw httpError(403, 'Not your job');
  return j;
}

r.patch('/:id/accept', allow('caretaker'), ah(async (req, res) => {
  const j = await myJob(req);
  if (j.status !== 'assigned') throw httpError(400, 'Job is not waiting for acceptance');
  await db.query("UPDATE jobs SET status='accepted' WHERE id=?", [j.id]);
  res.locals.audit = { action: 'job.accept', entity: 'job', id: j.id };
  res.json({ ok: true, status: 'accepted' });
}));

r.patch('/:id/complete', allow('caretaker'), ah(async (req, res) => {
  const j = await myJob(req);
  if (!['accepted', 'in_progress'].includes(j.status)) throw httpError(400, 'Job must be accepted first');
  await db.query("UPDATE jobs SET status='completed' WHERE id=?", [j.id]);
  await db.query("UPDATE caretakers SET availability='available' WHERE id=?", [j.caretaker_id]);
  res.locals.audit = { action: 'job.complete', entity: 'job', id: j.id };
  res.json({ ok: true, status: 'completed' });
}));

r.patch('/:id/cancel', can('jobs', 2), ah(async (req, res) => {
  const [[j]] = await db.query('SELECT * FROM jobs WHERE id=?', [req.params.id]);
  if (!j) throw httpError(404, 'Job not found');
  if (['completed', 'cancelled'].includes(j.status)) throw httpError(400, 'Job already closed');
  await db.query("UPDATE jobs SET status='cancelled' WHERE id=?", [j.id]);
  if (j.caretaker_id) await db.query("UPDATE caretakers SET availability='available' WHERE id=?", [j.caretaker_id]);
  res.locals.audit = { action: 'job.cancel', entity: 'job', id: j.id };
  res.json({ ok: true, status: 'cancelled' });
}));

module.exports = r;
