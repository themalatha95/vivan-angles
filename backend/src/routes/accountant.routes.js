const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const allow = require('../middleware/roleGuard');
const { need, oneOf, httpError } = require('../utils/validators');

r.use(auth);
r.use(allow('owner', 'accountant'));

r.get('/followups', ah(async (req, res) => {
  const args = []; const where = ["status='pending'"];
  if (req.query.category) { where.push('category=?'); args.push(req.query.category); }
  const [manual] = await db.query(`SELECT id,category,entity_id,entity_name,pending_amount,follow_up_date,contact_method,response,commitment_date,next_follow_up,status FROM accountant_followups WHERE ${where.join(' AND ')} ORDER BY COALESCE(next_follow_up,follow_up_date),id DESC`, args);
  const [automatic] = await db.query(`
    SELECT 'customer' category,j.id entity_id,l.customer_name entity_name,
      GREATEST(j.customer_amount-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.job_id=j.id AND p.status='verified'),0),0) pending_amount,
      NULL follow_up_date,NULL contact_method,NULL response,NULL commitment_date,NULL next_follow_up,'pending' status
    FROM jobs j JOIN leads l ON l.id=j.lead_id WHERE j.status NOT IN ('completed','cancelled')
      AND j.customer_amount>COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.job_id=j.id AND p.status='verified'),0)
    UNION ALL
    SELECT 'agent',c.agent_id,u.name,GREATEST(c.amount-COALESCE(c.amount_paid,0),0),NULL,NULL,NULL,NULL,NULL,'pending'
    FROM commissions c JOIN agents a ON a.id=c.agent_id JOIN users u ON u.id=a.user_id
    WHERE c.status='approved' AND c.amount>COALESCE(c.amount_paid,0)
    UNION ALL
    SELECT 'caretaker',s.caretaker_id,ct.name,GREATEST(s.amount-COALESCE(s.amount_paid,0),0),NULL,NULL,NULL,NULL,NULL,'pending'
    FROM salary_payments s JOIN caretakers ct ON ct.id=s.caretaker_id
    WHERE s.approval_status='approved' AND s.amount>COALESCE(s.amount_paid,0)`);
  res.json([...manual, ...automatic]);
}));

r.post('/followups', ah(async (req, res) => {
  need(req.body, ['category','entity_name','pending_amount','follow_up_date','contact_method']);
  oneOf(req.body.category, ['customer','agent','caretaker'], 'category');
  oneOf(req.body.contact_method, ['call','whatsapp','email','other'], 'contact_method');
  const [x] = await db.query(`INSERT INTO accountant_followups (category,entity_id,entity_name,pending_amount,follow_up_date,contact_method,response,commitment_date,next_follow_up,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`,
    [req.body.category, req.body.entity_id || null, req.body.entity_name, req.body.pending_amount, req.body.follow_up_date, req.body.contact_method, req.body.response || null, req.body.commitment_date || null, req.body.next_follow_up || null, req.user.id]);
  res.status(201).json({ id: x.insertId });
}));

r.patch('/followups/:id/resolve', ah(async (req, res) => {
  await db.query("UPDATE accountant_followups SET status='resolved' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
}));

r.get('/daily-report', ah(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const [[received]] = await db.query("SELECT COALESCE(SUM(amount),0) total,COUNT(DISTINCT job_id) customers FROM payments WHERE status='verified' AND payment_date=?", [date]);
  const [[paid]] = await db.query("SELECT COALESCE(SUM(amount),0) total FROM accountant_transactions WHERE transaction_type IN ('agent_commission','caretaker_salary') AND payment_date=?", [date]);
  const [[pending]] = await db.query("SELECT COUNT(*) total FROM payments WHERE status='pending'");
  const [[followups]] = await db.query("SELECT SUM(category='customer') customers,SUM(category='agent') agents,SUM(category='caretaker') caretakers FROM accountant_followups WHERE status='pending'");
  const [[committed]] = await db.query("SELECT COALESCE(SUM(pending_amount),0) total FROM accountant_followups WHERE status='pending'");
  const [history] = await db.query('SELECT * FROM accountant_daily_reports WHERE report_date=? ORDER BY id DESC', [date]);
  res.json({ date, summary: { received: received.total, customers: received.customers, paid: paid.total, net: Number(received.total) - Number(paid.total), pending_transactions: pending.total, followups, committed: committed.total }, history });
}));

r.post('/daily-report', ah(async (req, res) => {
  need(req.body, ['report_date']);
  const s = req.body.summary || {};
  const f = s.followups || {};
  const [x] = await db.query(`INSERT INTO accountant_daily_reports (report_date,total_received,total_paid,net_cash_movement,pending_transactions,customer_followups,agent_followups,caretaker_followups,payments_committed,next_follow_up_dates,manager_issues,remarks,submitted_to_manager,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.body.report_date, s.received || 0, s.paid || 0, s.net || 0, s.pending_transactions || 0, f.customers || 0, f.agents || 0, f.caretakers || 0, s.committed || 0, req.body.next_follow_up_dates || null, req.body.manager_issues || null, req.body.remarks || null, req.body.submitted_to_manager ? 1 : 0, req.user.id]);
  res.status(201).json({ id: x.insertId });
}));

module.exports = r;
