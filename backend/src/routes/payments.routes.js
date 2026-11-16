const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const upload = require('../middleware/upload');
const { makePdf } = require('../utils/caretakerPdf');
const { need, oneOf, httpError } = require('../utils/validators');

r.use(auth);

r.get('/', can('payments', 1), ah(async (req, res) => {
  const args = []; const where = [];
  let sql = `SELECT p.*, l.customer_name, l.phone, l.service_type, j.customer_amount, j.start_date, j.end_date,
    COALESCE((SELECT SUM(p2.amount) FROM payments p2 WHERE p2.job_id=j.id AND p2.status='verified'),0) AS amount_received,
    GREATEST(j.customer_amount-COALESCE((SELECT SUM(p3.amount) FROM payments p3 WHERE p3.job_id=j.id AND p3.status='verified'),0),0) AS amount_due,
    CASE WHEN COALESCE((SELECT SUM(p4.amount) FROM payments p4 WHERE p4.job_id=j.id AND p4.status='verified'),0)>=j.customer_amount THEN 'paid'
      WHEN COALESCE((SELECT SUM(p5.amount) FROM payments p5 WHERE p5.job_id=j.id AND p5.status='verified'),0)>0 THEN 'partially_paid' ELSE 'pending' END AS customer_payment_status,
    j.agent_commission, s.status AS caretaker_payment_status, s.payment_date AS caretaker_payment_date,
    s.approval_status AS salary_approval_status, cm.status AS commission_payment_status, cm.payment_date AS commission_payment_date
    FROM payments p JOIN jobs j ON j.id=p.job_id JOIN leads l ON l.id=j.lead_id
    LEFT JOIN caretakers c ON c.id=j.caretaker_id
    LEFT JOIN agents ag ON ag.id=j.agent_id LEFT JOIN users au ON au.id=ag.user_id
    LEFT JOIN salary_payments s ON s.job_id=j.id AND s.salary_month=p.billing_month
    LEFT JOIN commissions cm ON cm.payment_id=p.id`;
  if (req.query.status) { where.push('p.status=?'); args.push(req.query.status); }
  if (req.query.agent_id) { where.push('UPPER(TRIM(ag.agent_code))=UPPER(TRIM(?))'); args.push(req.query.agent_id); }
  if (req.query.caretaker_id) { where.push('j.caretaker_id=?'); args.push(req.query.caretaker_id); }
  if (req.user.role === 'accountant') { where.push("j.status NOT IN ('completed','cancelled')"); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  const [rows] = await db.query(sql + ' ORDER BY p.id DESC', args);
  res.json(rows);
}));

// Jobs that can be billed (limited fields: Accountant has no access to job allocation itself)
r.get('/jobs', can('payments', 2), ah(async (req, res) => {
  const [rows] = await db.query(`
    SELECT j.id, j.status, j.customer_amount, j.start_date, l.customer_name, l.phone,
      tele.name AS telecaller_name, agent.name AS agent_name, c.name AS caretaker_name,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.job_id=j.id AND p.status='verified'),0) AS amount_received,
      GREATEST(j.customer_amount-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.job_id=j.id AND p.status='verified'),0),0) AS pending_amount
      FROM jobs j JOIN leads l ON l.id=j.lead_id
      LEFT JOIN users tele ON tele.id=l.created_by
      LEFT JOIN agents ag ON ag.id=j.agent_id LEFT JOIN users agent ON agent.id=ag.user_id
      LEFT JOIN caretakers c ON c.id=j.caretaker_id
    WHERE j.status NOT IN ('created','cancelled') ORDER BY j.id DESC`);
  res.json(rows);
}));

r.get('/:id/receipt', can('payments', 1), ah(async (req, res) => {
  const [[p]] = await db.query(`SELECT p.*,l.customer_name,l.phone,l.service_type,j.customer_amount,c.name caretaker_name,au.name agent_name FROM payments p JOIN jobs j ON j.id=p.job_id JOIN leads l ON l.id=j.lead_id LEFT JOIN caretakers c ON c.id=j.caretaker_id LEFT JOIN agents ag ON ag.id=j.agent_id LEFT JOIN users au ON au.id=ag.user_id WHERE p.id=?`, [req.params.id]);
  if (!p) throw httpError(404, 'Payment not found');
  const lines = [`Receipt number: ${p.receipt_no || `RCPT-${p.id}`}`, `Customer: ${p.customer_name}`, `Phone: ${p.phone || '-'}`, `Service: ${p.service_type}`, `Caretaker: ${p.caretaker_name || '-'}`, `Agent: ${p.agent_name || '-'}`, `Amount received: ₹${p.amount}`, `Payment date: ${p.payment_date || '-'}`, `Payment mode: ${p.method}`, `Transaction ID: ${p.reference_no || '-'}`, `Status: ${p.status}`];
  res.setHeader('Content-Disposition', `attachment; filename="${p.receipt_no || `receipt-${p.id}`}.pdf"`); res.type('application/pdf').send(makePdf('Vivan Angels Customer Payment Receipt', lines));
}));

r.post('/', can('payments', 2), ah(async (req, res) => {
  need(req.body, ['job_id', 'billing_month', 'amount']);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.body.billing_month)) throw httpError(400, 'billing_month must be YYYY-MM');
  const [[j]] = await db.query('SELECT status,customer_amount FROM jobs WHERE id=?', [req.body.job_id]);
  if (!j) throw httpError(404, 'Job not found');
  if (['created', 'cancelled'].includes(j.status)) throw httpError(400, 'Job is not active');
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Payment amount must be greater than zero');
  const [[received]] = await db.query("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE job_id=? AND status='verified'", [req.body.job_id]);
  if (amount > Math.max(Number(j.customer_amount) - Number(received.total), 0)) throw httpError(400, 'Payment cannot exceed the pending customer balance');
  if (['bank_transfer', 'upi'].includes(req.body.method || 'upi') && !String(req.body.reference_no || '').trim()) throw httpError(400, 'Transaction reference is required for bank transfer or UPI');
  const [x] = await db.query('INSERT INTO payments (job_id,billing_month,amount,method,reference_no,payment_date,next_due_date,remarks) VALUES (?,?,?,?,?,?,?,?)',
    [req.body.job_id, req.body.billing_month, amount, req.body.method || 'upi', req.body.reference_no || null, req.body.payment_date || null, req.body.next_due_date || null, req.body.remarks || null]);
  const receiptNo = `RCPT-${new Date().getFullYear()}-${String(x.insertId).padStart(6, '0')}`;
  await db.query('UPDATE payments SET receipt_no=? WHERE id=?', [receiptNo, x.insertId]);
  await db.query(`INSERT INTO accountant_transactions (transaction_type,source_id,amount,payment_date,method,reference_no,remarks,created_by) VALUES ('customer_payment',?,?,?,?,?,?,?)`,
    [x.insertId, amount, req.body.payment_date, req.body.method || 'upi', req.body.reference_no || null, req.body.remarks || null, req.user.id]);
  res.locals.audit = { action: 'payment.record', entity: 'payment', id: x.insertId, details: { amount: req.body.amount } };
  res.status(201).json({ id: x.insertId, receipt_no: receiptNo, status: 'pending' });
}));

r.post('/:id/proof', can('payments', 2), ah(async (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'Payment proof file is required' });
    await db.query('UPDATE payments SET proof_url=? WHERE id=?', ['/uploads/documents/' + req.file.filename, req.params.id]);
    res.json({ ok: true, proof_url: '/uploads/documents/' + req.file.filename });
  });
}));

// Verify (or reject). Verification AUTOMATICALLY creates the agent commission (if the job has an agent).
r.patch('/:id/verify', can('payments', 2), ah(async (req, res) => {
  oneOf(req.body.action, ['verify', 'reject'], 'action');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query('SELECT * FROM payments WHERE id=? FOR UPDATE', [req.params.id]);
    if (!p) throw httpError(404, 'Payment not found');
    if (p.status !== 'pending') throw httpError(400, 'Payment already ' + p.status);
    let commission = null;
    if (req.body.action === 'verify') {
      await conn.query("UPDATE payments SET status='verified', verified_by=?, verified_at=NOW() WHERE id=?", [req.user.id, p.id]);
      const [[j]] = await conn.query('SELECT agent_id, agent_commission FROM jobs WHERE id=?', [p.job_id]);
      if (j.agent_id) {
        const [[existing]] = await conn.query('SELECT id,amount,agent_id FROM commissions WHERE job_id=? ORDER BY id LIMIT 1', [p.job_id]);
        if (existing) commission = existing;
        else {
          const [c] = await conn.query('INSERT INTO commissions (agent_id,job_id,payment_id,billing_month,amount) VALUES (?,?,?,?,?)',
            [j.agent_id, p.job_id, p.id, p.billing_month, j.agent_commission]);
          commission = { id: c.insertId, amount: j.agent_commission, agent_id: j.agent_id };
        }
      }
    } else {
      await conn.query("UPDATE payments SET status='rejected', verified_by=?, verified_at=NOW() WHERE id=?", [req.user.id, p.id]);
    }
    await conn.commit();
    res.locals.audit = { action: 'payment.' + req.body.action, entity: 'payment', id: p.id };
    res.json({ ok: true, status: req.body.action === 'verify' ? 'verified' : 'rejected', commission });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

module.exports = r;
