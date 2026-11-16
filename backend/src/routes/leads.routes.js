const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const allow = require('../middleware/roleGuard');
const { need, oneOf, httpError, SERVICES } = require('../utils/validators');

r.use(auth);

// Telecallers see ONLY leads assigned to them; agents only their own; others see all
const scope = (u) => (u.role === 'agent' ? { w: '(l.agent_id=? OR EXISTS (SELECT 1 FROM lead_agent_assignments la_scope WHERE la_scope.lead_id=l.id AND la_scope.agent_id=?))', a: [u.agentId, u.agentId] } : u.role === 'telecaller' ? { w: 'l.assigned_to=?', a: [u.id] } : null);

async function accessibleLead(req) {
  const [[l]] = await db.query('SELECT * FROM leads WHERE id=?', [req.params.id]);
  if (!l) throw httpError(404, 'Lead not found');
  if (req.user.role === 'agent') { const [[assigned]] = await db.query('SELECT lead_id FROM lead_agent_assignments WHERE lead_id=? AND agent_id=?', [l.id, req.user.agentId]); if (l.agent_id !== req.user.agentId && !assigned) throw httpError(403, 'Not your lead'); }
  if (req.user.role === 'telecaller' && l.assigned_to !== req.user.id) throw httpError(403, 'This lead is not assigned to you');
  return l;
}

r.post('/', can('leads', 2), ah(async (req, res) => {
  need(req.body, ['customer_name', 'phone', 'service_type', 'budget']);
  oneOf(req.body.service_type, SERVICES, 'service_type');
  if (Number(req.body.budget) <= 0) throw httpError(400, 'budget must be greater than 0');
  const u = req.user;
  let agentId = null, assignedTo = null;
  const agentIds = Array.from(new Set((Array.isArray(req.body.agent_ids) ? req.body.agent_ids : (req.body.agent_id ? [req.body.agent_id] : [])).map(Number).filter(Boolean)));
  if (u.role === 'agent') agentId = u.agentId;
  else if (u.role === 'telecaller') { assignedTo = u.id; agentId = agentIds[0] || null; }
  else { agentId = agentIds[0] || null; assignedTo = req.body.assigned_to || null; }
  if (agentIds.length) { const [agents] = await db.query('SELECT id FROM agents WHERE id IN (?)', [agentIds]); if (agents.length !== agentIds.length) throw httpError(400, 'One or more agents are invalid'); }
  const { customer_name, phone, address = null, area = null, service_type, budget } = req.body;
  const [x] = await db.query(
    'INSERT INTO leads (agent_id,assigned_to,created_by,customer_name,phone,address,area,service_type,budget) VALUES (?,?,?,?,?,?,?,?,?)',
    [agentId, assignedTo, u.id, customer_name, phone, address, area, service_type, budget]);
  for (const id of (u.role === 'agent' ? [u.agentId] : agentIds)) await db.query('INSERT IGNORE INTO lead_agent_assignments (lead_id,agent_id) VALUES (?,?)', [x.insertId, id]);
  res.locals.audit = { action: 'lead.create', entity: 'lead', id: x.insertId };
  res.status(201).json({ id: x.insertId, status: 'new' });
}));

r.get('/', can('leads', 1), ah(async (req, res) => {
  const where = [], args = [];
  const s = scope(req.user);
  if (s) { where.push(s.w); args.push(...s.a); }
  if (req.query.status) { where.push('l.status=?'); args.push(req.query.status); }
  if (req.query.service_type) { where.push('l.service_type=?'); args.push(req.query.service_type); }
  if (req.user.role === 'accountant') {
    where.push("l.status='confirmed'");
    where.push("EXISTS (SELECT 1 FROM payments paid_customer JOIN jobs paid_job ON paid_job.id=paid_customer.job_id WHERE paid_job.lead_id=l.id AND paid_customer.status='verified')");
    where.push("(j.status IS NULL OR j.status NOT IN ('completed','cancelled'))");
  }
  const [rows] = await db.query(`
    SELECT l.*, au.name AS agent_name, tu.name AS telecaller_name, j.id AS job_id,
      j.customer_amount AS total_customer_payment,
      COALESCE((SELECT SUM(p_received.amount) FROM payments p_received WHERE p_received.job_id=j.id AND p_received.status='verified'),0) AS amount_received,
      GREATEST(j.customer_amount-COALESCE((SELECT SUM(p_due.amount) FROM payments p_due WHERE p_due.job_id=j.id AND p_due.status='verified'),0),0) AS pending_customer_payment,
      j.start_date AS service_start_date, j.end_date AS service_end_date, j.agent_commission,
      ct.name AS caretaker_name, COALESCE(ct.fixed_salary, j.caretaker_salary) AS caretaker_fixed_salary,
      COALESCE(p.status, 'pending') AS customer_payment_status, COALESCE(p.payment_date, p.verified_at) AS customer_payment_date,
      COALESCE(s.status, 'pending') AS caretaker_payment_status, COALESCE(s.payment_date, s.paid_at) AS caretaker_salary_payment_date,
      COALESCE(cm.status, 'pending') AS agent_commission_payment_status,
      (SELECT COUNT(*) FROM lead_calls c WHERE c.lead_id=l.id) AS calls
    FROM leads l LEFT JOIN agents a ON a.id=l.agent_id LEFT JOIN users au ON au.id=a.user_id
    LEFT JOIN users tu ON tu.id=l.assigned_to LEFT JOIN jobs j ON j.lead_id=l.id
    LEFT JOIN caretakers ct ON ct.id=j.caretaker_id
    LEFT JOIN payments p ON p.id=(SELECT MAX(p2.id) FROM payments p2 WHERE p2.job_id=j.id)
    LEFT JOIN salary_payments s ON s.id=(SELECT MAX(s2.id) FROM salary_payments s2 WHERE s2.job_id=j.id)
    LEFT JOIN commissions cm ON cm.id=(SELECT MAX(cm2.id) FROM commissions cm2 WHERE cm2.job_id=j.id)
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.id DESC`, args);
  res.json(rows);
}));

r.patch('/:id/status', can('leads', 2), ah(async (req, res) => {
  const l = await accessibleLead(req);
  oneOf(req.body.status, ['new', 'follow_up', 'confirmed', 'lost'], 'status');
  const [[j]] = await db.query('SELECT id FROM jobs WHERE lead_id=?', [l.id]);
  if (j) throw httpError(400, 'A job already exists for this lead; status is locked');
  if (req.body.status === 'lost' && !req.body.lost_reason) throw httpError(400, 'lost_reason is required');
  await db.query('UPDATE leads SET status=?, lost_reason=? WHERE id=?',
    [req.body.status, req.body.status === 'lost' ? req.body.lost_reason : null, l.id]);
  res.locals.audit = { action: 'lead.status', entity: 'lead', id: l.id, details: { status: req.body.status } };
  res.json({ ok: true, status: req.body.status });
}));

// Owner/Manager assign a lead to an agent and/or a telecaller
r.patch('/:id/assign', allow('owner', 'manager', 'telecaller'), ah(async (req, res) => {
  const [[l]] = await db.query('SELECT id,assigned_to FROM leads WHERE id=?', [req.params.id]);
  if (!l) throw httpError(404, 'Lead not found');
  if (req.user.role === 'telecaller' && l.assigned_to !== req.user.id) throw httpError(403, 'This lead is not assigned to you');
  const agentIds = Array.from(new Set((Array.isArray(req.body.agent_ids) ? req.body.agent_ids : (req.body.agent_id ? [req.body.agent_id] : [])).map(Number).filter(Boolean)));
  const agent = agentIds[0] || null, tele = req.body.assigned_to || null;
  if (tele) { const [[t]] = await db.query("SELECT id FROM users WHERE id=? AND role='telecaller' AND status='active'", [tele]); if (!t) throw httpError(400, 'Invalid telecaller'); }
  if (agentIds.length) { const [agents] = await db.query('SELECT id FROM agents WHERE id IN (?)', [agentIds]); if (agents.length !== agentIds.length) throw httpError(400, 'One or more agents are invalid'); }
  await db.query('UPDATE leads SET agent_id=?, assigned_to=? WHERE id=?', [agent, tele, l.id]);
  await db.query('DELETE FROM lead_agent_assignments WHERE lead_id=?', [l.id]);
  for (const id of agentIds) await db.query('INSERT INTO lead_agent_assignments (lead_id,agent_id) VALUES (?,?)', [l.id, id]);
  res.locals.audit = { action: 'lead.assign', entity: 'lead', id: l.id, details: { agent, telecaller: tele } };
  res.json({ ok: true });
}));

// Call records (follow-ups)
r.post('/:id/calls', can('leads', 2), ah(async (req, res) => {
  const l = await accessibleLead(req);
  need(req.body, ['outcome']);
  oneOf(req.body.outcome, ['answered', 'no_answer', 'callback', 'interested', 'not_interested', 'other'], 'outcome');
  const [x] = await db.query('INSERT INTO lead_calls (lead_id,user_id,outcome,note,next_date) VALUES (?,?,?,?,?)',
    [l.id, req.user.id, req.body.outcome, req.body.note || null, req.body.next_date || null]);
  res.locals.audit = { action: 'lead.call', entity: 'lead', id: l.id };
  res.status(201).json({ id: x.insertId });
}));

r.get('/:id/calls', can('leads', 1), ah(async (req, res) => {
  const l = await accessibleLead(req);
  const [rows] = await db.query(
    'SELECT c.*, u.name AS user_name FROM lead_calls c JOIN users u ON u.id=c.user_id WHERE c.lead_id=? ORDER BY c.id DESC', [l.id]);
  res.json(rows);
}));

module.exports = r;
