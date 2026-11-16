const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const allow = require('../middleware/roleGuard');
const { need, httpError } = require('../utils/validators');

r.use(auth);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// Salary statements. Owner full, Accountant manage, Manager view. Nobody else.
r.get('/', can('salary', 1), ah(async (req, res) => {
  const args = []; let w = '';
  const filters = [];
  if (req.query.month) { filters.push('s.salary_month=?'); args.push(req.query.month); }
  if (req.query.agent_id) { filters.push('UPPER(TRIM(ag.agent_code))=UPPER(TRIM(?))'); args.push(req.query.agent_id); }
  if (req.query.caretaker_id) { filters.push('s.caretaker_id=?'); args.push(req.query.caretaker_id); }
  if (req.query.caretaker_name) { filters.push('c.name LIKE ?'); args.push('%' + req.query.caretaker_name + '%'); }
  if (req.query.agent_name) { filters.push('au.name LIKE ?'); args.push('%' + req.query.agent_name + '%'); }
  if (req.query.customer_name) { filters.push('l.customer_name LIKE ?'); args.push('%' + req.query.customer_name + '%'); }
  if (req.query.payment_status === 'pending') filters.push('COALESCE(s.amount_paid,0)=0');
  if (req.query.payment_status === 'partially_paid') filters.push('COALESCE(s.amount_paid,0)>0 AND s.amount_paid<s.amount');
  if (req.query.payment_status === 'paid') filters.push('s.amount_paid>=s.amount');
  if (req.user.role === 'accountant') { filters.push("j.status NOT IN ('completed','cancelled')"); filters.push("s.approval_status='approved'"); }
  if (filters.length) w = 'WHERE ' + filters.join(' AND ');
  const [rows] = await db.query(`
    SELECT s.*, c.name AS caretaker_name, l.customer_name, j.agent_id, ag.agent_code, au.name AS agent_name,
      c.phone AS caretaker_phone, j.start_date, j.end_date, j.caretaker_salary AS monthly_salary,
      COALESCE((SELECT SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half_day' THEN 0.5 ELSE 0 END) FROM attendance a WHERE a.caretaker_id=s.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=s.salary_month),0) AS present_days,
      COALESCE((SELECT SUM(a.status='absent') FROM attendance a WHERE a.caretaker_id=s.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=s.salary_month),0) AS absent_days,
      COALESCE((SELECT SUM(a.status='leave') FROM attendance a WHERE a.caretaker_id=s.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=s.salary_month),0) AS leave_days,
      GREATEST(s.amount-COALESCE(s.amount_paid,0),0) AS pending_amount,
      CASE WHEN COALESCE(s.amount_paid,0)=0 THEN 'pending' WHEN s.amount_paid>=s.amount THEN 'paid' ELSE 'partially_paid' END AS payment_status
    FROM salary_payments s JOIN caretakers c ON c.id=s.caretaker_id JOIN jobs j ON j.id=s.job_id JOIN leads l ON l.id=j.lead_id
    LEFT JOIN agents ag ON ag.id=j.agent_id LEFT JOIN users au ON au.id=ag.user_id
    ${w} ORDER BY s.id DESC`, args);
  res.json(rows);
}));

// Jobs that still need a salary statement for the month, with attendance days to help the accountant
r.get('/due', allow('owner', 'manager'), ah(async (req, res) => {
  const month = req.query.month;
  if (!MONTH.test(month || '')) throw httpError(400, 'month must be YYYY-MM');
  const [rows] = await db.query(`
    SELECT j.id AS job_id, j.caretaker_id, c.name AS caretaker_name, l.customer_name, j.caretaker_salary,
      DAY(LAST_DAY(CONCAT(?, '-01'))) AS calendar_days,
      (SELECT COALESCE(SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half_day' THEN 0.5 ELSE 0 END),0)
         FROM attendance a WHERE a.caretaker_id=j.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=?) AS days_present,
      (SELECT COALESCE(SUM(a.status='absent'),0) FROM attendance a WHERE a.caretaker_id=j.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=?) AS days_absent,
      (SELECT COALESCE(SUM(a.status='leave'),0) FROM attendance a WHERE a.caretaker_id=j.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=?) AS days_leave,
      ROUND(j.caretaker_salary / DAY(LAST_DAY(CONCAT(?, '-01'))) * (SELECT COALESCE(SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half_day' THEN 0.5 ELSE 0 END),0) FROM attendance a WHERE a.caretaker_id=j.caretaker_id AND DATE_FORMAT(a.att_date,'%Y-%m')=?), 2) AS salary_payable
    FROM jobs j JOIN caretakers c ON c.id=j.caretaker_id JOIN leads l ON l.id=j.lead_id
    WHERE j.status IN ('accepted','in_progress','completed')
      AND NOT EXISTS (SELECT 1 FROM salary_payments s WHERE s.job_id=j.id AND s.salary_month=?)`, [month, month, month, month, month, month, month]);
  res.json(rows);
}));

r.post('/', allow('owner', 'manager'), ah(async (req, res) => {
  need(req.body, ['job_id', 'salary_month']);
  if (!MONTH.test(req.body.salary_month)) throw httpError(400, 'salary_month must be YYYY-MM');
  const [[j]] = await db.query('SELECT id, caretaker_id, caretaker_salary FROM jobs WHERE id=?', [req.body.job_id]);
  if (!j || !j.caretaker_id) throw httpError(404, 'Job with a caretaker not found');
  const amount = req.body.amount ?? j.caretaker_salary;
  const [x] = await db.query('INSERT INTO salary_payments (job_id,caretaker_id,salary_month,amount,created_by) VALUES (?,?,?,?,?)',
    [j.id, j.caretaker_id, req.body.salary_month, amount, req.user.id]);
  await db.query("UPDATE caretakers SET fixed_salary=?, salary_approval_status='pending' WHERE id=?", [amount, j.caretaker_id]);
  res.locals.audit = { action: 'salary.create', entity: 'salary', id: x.insertId, details: { amount } };
  res.status(201).json({ id: x.insertId, status: 'pending', amount });
}));

r.get('/history', can('salary', 1), ah(async (req, res) => {
  const args = []; const where = ["t.transaction_type='caretaker_salary'"];
  if (req.query.caretaker_id) { where.push('s.caretaker_id=?'); args.push(req.query.caretaker_id); }
  if (req.query.agent_id) { where.push('UPPER(TRIM(ag.agent_code))=UPPER(TRIM(?))'); args.push(req.query.agent_id); }
  if (req.query.month) { where.push('s.salary_month=?'); args.push(req.query.month); }
  if (req.query.payment_date) { where.push('t.payment_date=?'); args.push(req.query.payment_date); }
  const [rows] = await db.query(`
    SELECT t.id AS transaction_id, t.amount AS payment_amount, t.payment_date, t.method, t.reference_no, t.remarks,
      s.salary_month, s.amount AS salary_payable, s.amount_paid, s.caretaker_id, c.name AS caretaker_name,
      j.agent_id, ag.agent_code, au.name AS agent_name, l.customer_name,
      CASE WHEN s.amount_paid>=s.amount THEN 'paid' ELSE 'partially_paid' END AS payment_status
    FROM accountant_transactions t JOIN salary_payments s ON s.id=t.source_id
    JOIN caretakers c ON c.id=s.caretaker_id JOIN jobs j ON j.id=s.job_id JOIN leads l ON l.id=j.lead_id
    LEFT JOIN agents ag ON ag.id=j.agent_id LEFT JOIN users au ON au.id=ag.user_id
    WHERE ${where.join(' AND ')} ORDER BY t.id DESC`, args);
  res.json(rows);
}));

r.patch('/:id/approve', can('salary', 2), ah(async (req, res) => {
  const [[s]] = await db.query('SELECT caretaker_id,approval_status FROM salary_payments WHERE id=?', [req.params.id]);
  if (!s) throw httpError(404, 'Salary statement not found');
  if (s.approval_status !== 'pending') throw httpError(400, 'Salary approval already decided');
  await db.query("UPDATE salary_payments SET approval_status='approved', approved_by=?, approved_at=NOW() WHERE id=?", [req.user.id, req.params.id]);
  await db.query("UPDATE caretakers SET salary_approval_status='approved' WHERE id=?", [s.caretaker_id]);
  res.json({ ok: true, approval_status: 'approved' });
}));

// Create a RazorpayX Payout Link. The caretaker enters their bank/UPI details
// through the secure link; the salary stays pending until the provider confirms it.
r.post('/:id/payout-link', allow('owner', 'accountant'), ah(async (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw httpError(503, 'RazorpayX payout is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env');
  const [[s]] = await db.query(`SELECT s.*, c.name AS caretaker_name, c.email AS caretaker_email, c.phone AS caretaker_phone
    FROM salary_payments s JOIN caretakers c ON c.id=s.caretaker_id WHERE s.id=?`, [req.params.id]);
  if (!s) throw httpError(404, 'Salary statement not found');
  const pending = Number(s.amount) - Number(s.amount_paid || 0);
  if (s.approval_status !== 'approved') throw httpError(400, 'Salary must be approved before transfer');
  if (pending <= 0) throw httpError(400, 'Salary is already fully paid');
  const payload = {
    amount: Math.round(pending * 100), currency: 'INR', purpose: 'salary',
    description: `Vivan Angels salary - ${s.salary_month}`,
    reference_id: `SALARY-${s.id}-${Date.now()}`.slice(0, 40),
    contact: { name: s.caretaker_name, email: s.caretaker_email || undefined, contact: s.caretaker_phone || undefined, type: 'employee', reference_id: `caretaker-${s.caretaker_id}` },
    send_sms: false, send_email: false,
    notes: { salary_id: String(s.id), caretaker_id: String(s.caretaker_id) }
  };
  const response = await fetch('https://api.razorpay.com/v1/payout-links', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw httpError(502, data?.error?.description || 'RazorpayX could not create the payout link');
  await db.query('UPDATE salary_payments SET payout_provider=\'razorpayx\', provider_payout_id=?, provider_status=?, payout_url=? WHERE id=?', [data.id, data.status || 'issued', data.short_url || null, s.id]);
  res.status(201).json({ ok: true, status: data.status || 'issued', payout_id: data.id, payout_url: data.short_url, amount: pending });
}));

// Refresh the provider status. Only a processed payout marks the salary paid.
r.post('/:id/payout-status', allow('owner', 'accountant'), ah(async (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw httpError(503, 'RazorpayX payout is not configured');
  const [[s]] = await db.query('SELECT * FROM salary_payments WHERE id=?', [req.params.id]);
  if (!s || !s.provider_payout_id) throw httpError(404, 'No RazorpayX payout exists for this salary');
  const response = await fetch(`https://api.razorpay.com/v1/payout-links/${encodeURIComponent(s.provider_payout_id)}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') } });
  const data = await response.json();
  if (!response.ok) throw httpError(502, data?.error?.description || 'Could not read payout status');
  const status = data.status || 'issued';
  if (status === 'processed' && s.status !== 'paid') {
    const amount = Number(s.amount) - Number(s.amount_paid || 0);
    const reference = data.payout_id || data.utr || data.id;
    await db.query("UPDATE salary_payments SET status='paid', amount_paid=amount, paid_at=NOW(), payment_date=CURDATE(), method='bank_transfer', reference_no=?, provider_status=? WHERE id=?", [reference, status, s.id]);
    const [[tx]] = await db.query("SELECT id FROM accountant_transactions WHERE transaction_type='caretaker_salary' AND source_id=? AND reference_no=? LIMIT 1", [s.id, reference]);
    if (!tx) await db.query("INSERT INTO accountant_transactions (transaction_type,source_id,amount,payment_date,method,reference_no,remarks,created_by) VALUES ('caretaker_salary',?,?,CURDATE(),'bank_transfer',?,'RazorpayX payout',?)", [s.id, amount, reference, req.user.id]);
  } else await db.query('UPDATE salary_payments SET provider_status=? WHERE id=?', [status, s.id]);
  res.json({ ok: true, status, payout_id: data.payout_id || data.id, utr: data.utr || null });
}));

r.patch('/:id/pay', allow('owner', 'accountant'), ah(async (req, res) => {
  const [[s]] = await db.query('SELECT *, amount-COALESCE(amount_paid,0) AS pending_amount FROM salary_payments WHERE id=?', [req.params.id]);
  if (!s) throw httpError(404, 'Salary statement not found');
  if (s.status === 'paid' || Number(s.pending_amount) <= 0) throw httpError(400, 'Already paid');
  if (s.approval_status !== 'approved') throw httpError(400, 'Salary must be approved by the Manager before payment');
  const amount = Number(req.body.amount || s.pending_amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number(s.pending_amount)) throw httpError(400, 'Payment amount must be within the pending salary balance');
  if (['bank_transfer', 'upi'].includes(req.body.method || 'upi') && !String(req.body.reference_no || '').trim()) throw httpError(400, 'Transaction reference is required for bank transfer or UPI');
  const paid = Number(s.amount_paid || 0) + amount;
  const status = paid >= Number(s.amount) ? 'paid' : 'pending';
  await db.query("UPDATE salary_payments SET status=?, amount_paid=?, paid_at=IF(?='paid',NOW(),paid_at), payment_date=?, method=?, reference_no=? WHERE id=?", [status, paid, status, req.body.payment_date || new Date().toISOString().slice(0, 10), req.body.method || 'upi', req.body.reference_no || null, req.params.id]);
  await db.query(`INSERT INTO accountant_transactions (transaction_type,source_id,amount,payment_date,method,reference_no,remarks,created_by) VALUES ('caretaker_salary',?,?,?,?,?,?,?)`,
    [req.params.id, amount, req.body.payment_date || new Date().toISOString().slice(0, 10), req.body.method || 'upi', req.body.reference_no || null, req.body.remarks || null, req.user.id]);
  await db.query("UPDATE caretakers SET salary_payment_date=CURDATE() WHERE id=?", [s.caretaker_id]);
  res.locals.audit = { action: 'salary.paid', entity: 'salary', id: Number(req.params.id) };
  res.json({ ok: true, status, amount_paid: paid, pending_amount: Math.max(Number(s.amount) - paid, 0) });
}));

module.exports = r;
