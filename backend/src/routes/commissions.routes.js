const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const upload = require('../middleware/upload');
const { httpError } = require('../utils/validators');

r.use(auth);

// Owner/Accountant full or manage, Manager view, Agent only own
r.get('/', can('commission', 1), ah(async (req, res) => {
  const where = [], args = [];
  if (req.user.role === 'agent') { where.push('c.agent_id=?'); args.push(req.user.agentId); }
  if (req.query.month) { where.push('c.billing_month=?'); args.push(req.query.month); }
  if (req.query.agent_id) { where.push('UPPER(TRIM(a.agent_code))=UPPER(TRIM(?))'); args.push(req.query.agent_id); }
  if (req.query.caretaker_id) { where.push('j.caretaker_id=?'); args.push(req.query.caretaker_id); }
  if (req.user.role === 'accountant') where.push("j.status NOT IN ('completed','cancelled')");
  const [rows] = await db.query(`
    SELECT c.*, u.name AS agent_name, u.phone AS agent_phone, a.agent_code, l.customer_name,
      ct.id AS caretaker_id, ct.name AS caretaker_name, GREATEST(c.amount-COALESCE(c.amount_paid,0),0) AS pending_amount
    FROM commissions c JOIN agents a ON a.id=c.agent_id JOIN users u ON u.id=a.user_id
    JOIN jobs j ON j.id=c.job_id JOIN leads l ON l.id=j.lead_id
    LEFT JOIN caretakers ct ON ct.id=j.caretaker_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC`, args);
  res.json(rows);
}));

// Accountant records full or partial commission payments against the approved commission.
r.patch('/:id/pay', can('commission', 2), ah(async (req, res) => {
  const [[c]] = await db.query('SELECT *, amount-COALESCE(amount_paid,0) AS pending_amount FROM commissions WHERE id=?', [req.params.id]);
  if (!c) throw httpError(404, 'Commission not found');
  if (c.status !== 'approved') throw httpError(400, 'Commission must be approved before payment');
  if (Number(c.pending_amount) <= 0) throw httpError(400, 'Commission is already fully paid');
  const amount = Number(req.body.amount || c.pending_amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number(c.pending_amount)) throw httpError(400, 'Payment amount must be within the pending commission balance');
  const method = req.body.method || 'upi';
  if (['bank_transfer', 'upi'].includes(method) && !String(req.body.reference_no || '').trim()) throw httpError(400, 'Transaction reference is required for bank transfer or UPI');
  const paid = Number(c.amount_paid || 0) + amount;
  const status = paid >= Number(c.amount) ? 'paid' : 'approved';
  const paymentDate = req.body.payment_date || new Date().toISOString().slice(0, 10);
  const receiptNo = c.receipt_no || `COMM-${new Date().getFullYear()}-${String(c.id).padStart(6, '0')}`;
  await db.query('UPDATE commissions SET status=?, amount_paid=?, paid_at=IF(?="paid",NOW(),paid_at), payment_date=?, method=?, reference_no=?, receipt_no=? WHERE id=?', [status, paid, status, paymentDate, method, req.body.reference_no || null, receiptNo, req.params.id]);
  await db.query(`INSERT INTO accountant_transactions (transaction_type,source_id,amount,payment_date,method,reference_no,remarks,created_by) VALUES ('agent_commission',?,?,?,?,?,?,?)`,
    [req.params.id, amount, paymentDate, method, req.body.reference_no || null, req.body.remarks || null, req.user.id]);
  res.locals.audit = { action: 'commission.payment', entity: 'commission', id: Number(req.params.id), details: { amount, status } };
  res.json({ ok: true, status, receipt_no: receiptNo, amount_paid: paid, pending_amount: Math.max(Number(c.amount) - paid, 0) });
}));

r.post('/:id/proof', can('commission', 2), ah(async (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'Commission proof file is required' });
    await db.query('UPDATE commissions SET proof_url=? WHERE id=?', ['/uploads/documents/' + req.file.filename, req.params.id]);
    res.json({ ok: true });
  });
}));

// calculated -> approved -> paid (no delete route exists; database triggers also block deletes)
r.patch('/:id/status', can('commission', 2), ah(async (req, res) => {
  const [[c]] = await db.query('SELECT status FROM commissions WHERE id=?', [req.params.id]);
  if (!c) throw httpError(404, 'Commission not found');
  const next = { calculated: 'approved', approved: 'paid' }[c.status];
  if (!next || req.body.status !== next) throw httpError(400, `Allowed next status from "${c.status}" is "${next || 'none'}"`);
  await db.query('UPDATE commissions SET status=?, paid_at=IF(?="paid", NOW(), paid_at), payment_date=IF(?="paid", CURDATE(), payment_date) WHERE id=?', [next, next, next, req.params.id]);
  res.locals.audit = { action: 'commission.' + next, entity: 'commission', id: Number(req.params.id) };
  res.json({ ok: true, status: next });
}));

module.exports = r;
