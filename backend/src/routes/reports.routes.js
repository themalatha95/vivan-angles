const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const allow = require('../middleware/roleGuard');

r.use(auth);

const num = (label, value, tone) => ({ label, value, tone });
const money = (label, value, tone) => ({ label, value, money: true, tone });
const toMap = (rows) => Object.fromEntries(rows.map((x) => [x.status, x.n]));
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const thisMonth = () => new Date().toISOString().slice(0, 7);

// Dashboard content depends on the role
r.get('/dashboard', ah(async (req, res) => {
  const { role, id, agentId } = req.user;
  const sections = [];

  if (['owner', 'manager'].includes(role)) {
    const [leads] = await db.query('SELECT status, COUNT(*) n FROM leads GROUP BY status');
    const [jobs] = await db.query('SELECT status, COUNT(*) n FROM jobs GROUP BY status');
    const [cts] = await db.query('SELECT status, COUNT(*) n FROM caretakers GROUP BY status');
    const [[ag]] = await db.query('SELECT COUNT(*) n FROM agents');
    const [[pp]] = await db.query("SELECT COUNT(*) n FROM payments WHERE status='pending'");
    const L = toMap(leads), J = toMap(jobs), C = toMap(cts);
    sections.push({ title: 'Operations', stats: [
      num('Agents', ag.n), num('Total leads', sum(L)), num('Confirmed leads', L.confirmed || 0),
      num('Active jobs', (J.assigned || 0) + (J.accepted || 0) + (J.in_progress || 0)),
      num('Caretakers awaiting approval', C.pending || 0), num('Payments to verify', pp.n)] });
    sections.push({ title: 'Lead pipeline', stats: ['new', 'follow_up', 'confirmed', 'lost'].map((s) => num(s.replace('_', ' '), L[s] || 0)) });
  }

  if (role === 'owner') {
    const [[f]] = await db.query(`
      SELECT COALESCE(SUM(p.amount),0) AS rev, COALESCE(SUM(j.caretaker_salary),0) AS sal,
             COALESCE(SUM(j.agent_commission),0) AS com, COALESCE(SUM(j.company_margin),0) AS mar
      FROM payments p JOIN jobs j ON j.id=p.job_id WHERE p.status='verified'`);
    const [[ex]] = await db.query("SELECT COALESCE(SUM(amount),0) AS t FROM expenses WHERE DATE_FORMAT(expense_date,'%Y-%m')=?", [thisMonth()]);
    sections.push({ title: 'Verified payments: four separate money fields', stats: [
      money('Customer payments received', f.rev), money('Caretaker salary', f.sal), money('Agent commission', f.com), money('Company margin', f.mar, 'good')] });
    sections.push({ title: 'This month', stats: [money('Expenses', ex.t)] });
  }

  if (role === 'accountant') {
    const m = thisMonth();
    const [[collections]] = await db.query("SELECT COALESCE(SUM(p.amount),0) t FROM payments p JOIN jobs j ON j.id=p.job_id WHERE p.status='verified' AND j.status NOT IN ('completed','cancelled')");
    const [[pendingCustomer]] = await db.query(`SELECT COALESCE(SUM(GREATEST(j.customer_amount-COALESCE((SELECT SUM(p2.amount) FROM payments p2 WHERE p2.job_id=j.id AND p2.status='verified'),0),0)),0) t
      FROM jobs j JOIN leads l ON l.id=j.lead_id WHERE l.status='confirmed' AND j.status NOT IN ('completed','cancelled')`);
    const [[pp]] = await db.query("SELECT COUNT(*) n FROM payments p JOIN jobs j ON j.id=p.job_id WHERE p.status='pending' AND j.status NOT IN ('completed','cancelled')");
    const [[sp]] = await db.query("SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM salary_payments s JOIN jobs j ON j.id=s.job_id WHERE s.status<>'paid' AND j.status NOT IN ('completed','cancelled')");
    const [cm] = await db.query("SELECT status, COALESCE(SUM(CASE WHEN status='paid' THEN amount_paid ELSE amount END),0) n FROM commissions GROUP BY status");
    const C = toMap(cm);
    const [[commissionTotal]] = await db.query("SELECT COALESCE(SUM(c.amount),0) t FROM commissions c JOIN jobs j ON j.id=c.job_id WHERE j.status NOT IN ('completed','cancelled')");
    const [[salaryTotal]] = await db.query("SELECT COALESCE(SUM(s.amount),0) t FROM salary_payments s JOIN jobs j ON j.id=s.job_id WHERE j.status NOT IN ('completed','cancelled')");
    const [[paidCommission]] = await db.query("SELECT COALESCE(SUM(c.amount_paid),0) t FROM commissions c JOIN jobs j ON j.id=c.job_id WHERE j.status NOT IN ('completed','cancelled')");
    const [[paidSalary]] = await db.query("SELECT COALESCE(SUM(s.amount_paid),0) t FROM salary_payments s JOIN jobs j ON j.id=s.job_id WHERE j.status NOT IN ('completed','cancelled')");
    const [[rv]] = await db.query("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE status='verified' AND billing_month=?", [m]);
    const [[ex]] = await db.query("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE DATE_FORMAT(expense_date,'%Y-%m')=?", [m]);
    sections.push({ title: 'Accountant financial summary', stats: [
      money('Total customer collections', collections.t), money('Pending customer payments', pendingCustomer.t, pendingCustomer.t ? 'bad' : 'good'),
      money('Total agent commissions', commissionTotal.t), money('Paid agent commissions', paidCommission.t), money('Pending agent commissions', Math.max(Number(commissionTotal.t) - Number(paidCommission.t), 0)),
      money('Total caretaker salaries', salaryTotal.t), money('Paid caretaker salaries', paidSalary.t), money('Pending caretaker salaries', Math.max(Number(salaryTotal.t) - Number(paidSalary.t), 0)), money('Total payments completed', Number(paidCommission.t) + Number(paidSalary.t), 'good')
    ] });
    sections.push({ title: 'Finance to-do', stats: [
      num('Payments to verify', pp.n), num('Salary statements unpaid', sp.n), money('Salary unpaid amount', sp.t),
      money('Commission to approve', C.calculated || 0), money('Commission to pay', C.approved || 0)] });
    sections.push({ title: 'This month', stats: [money('Customer payments verified', rv.t), money('Expenses', ex.t)] });
  }

  if (role === 'telecaller') {
    const [leads] = await db.query('SELECT status, COUNT(*) n FROM leads WHERE assigned_to=? GROUP BY status', [id]);
    const [services] = await db.query('SELECT service_type, COUNT(*) n FROM leads WHERE assigned_to=? GROUP BY service_type', [id]);
    const [[today]] = await db.query('SELECT COUNT(*) n FROM lead_calls WHERE user_id=? AND DATE(created_at)=CURDATE()', [id]);
    const [[due]] = await db.query(`
      SELECT COUNT(DISTINCT c.lead_id) n FROM lead_calls c
      WHERE c.user_id=? AND c.next_date IS NOT NULL AND c.next_date<=CURDATE()
        AND c.id=(SELECT MAX(id) FROM lead_calls WHERE lead_id=c.lead_id)`, [id]);
    const L = toMap(leads);
    sections.push({ title: 'My work', stats: [num('My leads', sum(L)), num('Calls today', today.n), num('Callbacks due', due.n, due.n ? 'bad' : '')] });
    sections.push({ title: 'My lead pipeline', stats: ['new', 'follow_up', 'confirmed', 'lost'].map((s) => num(s.replace('_', ' '), L[s] || 0)) });
    sections.push({ title: 'Leads by service category', stats: ['baby_care', 'patient_care', 'cooking', 'housekeeping'].map((s) => num(s.replace('_', ' '), (services.find((x) => x.service_type === s) || {}).n || 0)) });
  }

  if (role === 'agent') {
    const [leads] = await db.query('SELECT status, COUNT(*) n FROM leads WHERE agent_id=? GROUP BY status', [agentId]);
    const [com] = await db.query('SELECT status, COALESCE(SUM(amount),0) n FROM commissions WHERE agent_id=? GROUP BY status', [agentId]);
    const [[ct]] = await db.query('SELECT COUNT(*) n FROM caretakers WHERE registered_by=?', [agentId]);
    const [[jb]] = await db.query("SELECT COUNT(*) n FROM jobs WHERE agent_id=? AND status IN ('assigned','accepted','in_progress')", [agentId]);
    const L = toMap(leads), C = toMap(com);
    sections.push({ title: 'My work', stats: [num('My leads', sum(L)), num('Confirmed', L.confirmed || 0), num('Caretakers registered', ct.n), num('Active jobs', jb.n)] });
    sections.push({ title: 'My commission', stats: [money('Calculated', C.calculated || 0), money('Approved', C.approved || 0), money('Paid', C.paid || 0, 'good')] });
  }
  res.json({ role, sections });
}));

// Finance report: Owner and Accountant. Four money fields stay separate.
r.get('/finance', allow('owner', 'accountant'), ah(async (req, res) => {
  const [monthly] = await db.query(`
    SELECT p.billing_month AS month, COUNT(*) AS payments, SUM(j.customer_amount) AS customer_amount,
      SUM(j.caretaker_salary) AS caretaker_salary, SUM(j.agent_commission) AS agent_commission, SUM(j.company_margin) AS company_margin
    FROM payments p JOIN jobs j ON j.id=p.job_id WHERE p.status='verified' GROUP BY p.billing_month ORDER BY p.billing_month DESC`);
  const [salary] = await db.query("SELECT salary_month AS month, SUM(amount) AS amount FROM salary_payments WHERE status='paid' GROUP BY salary_month ORDER BY salary_month DESC");
  const [expenses] = await db.query("SELECT DATE_FORMAT(expense_date,'%Y-%m') AS month, SUM(amount) AS amount FROM expenses GROUP BY month ORDER BY month DESC");
  res.json({ monthly, salary_paid: salary, expenses });
}));

// Operations report: Owner and Manager
r.get('/operations', allow('owner', 'manager'), ah(async (req, res) => {
  const [agents] = await db.query(`
    SELECT a.agent_code, u.name,
      (SELECT COUNT(*) FROM leads l WHERE l.agent_id=a.id) AS total_leads,
      (SELECT COUNT(*) FROM leads l WHERE l.agent_id=a.id AND l.status='confirmed') AS confirmed_leads,
      (SELECT COUNT(*) FROM caretakers c WHERE c.registered_by=a.id) AS caretakers_registered
    FROM agents a JOIN users u ON u.id=a.user_id`);
  const [jobs] = await db.query('SELECT status, COUNT(*) n FROM jobs GROUP BY status');
  const [att] = await db.query(`
    SELECT status, COUNT(*) n FROM attendance WHERE DATE_FORMAT(att_date,'%Y-%m')=? GROUP BY status`, [thisMonth()]);
  res.json({ agents, jobs: toMap(jobs), attendance_this_month: toMap(att) });
}));

// Call report: Owner/Manager see all telecallers; a telecaller sees only their own
r.get('/calls', allow('owner', 'manager', 'telecaller'), ah(async (req, res) => {
  const args = []; let w = 'WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
  if (req.user.role === 'telecaller') { w += ' AND c.user_id=?'; args.push(req.user.id); }
  const [rows] = await db.query(`
    SELECT u.name AS user_name, c.outcome, COUNT(*) AS n FROM lead_calls c JOIN users u ON u.id=c.user_id
    ${w} GROUP BY u.name, c.outcome ORDER BY u.name, c.outcome`, args);
  res.json(rows);
}));

module.exports = r;
