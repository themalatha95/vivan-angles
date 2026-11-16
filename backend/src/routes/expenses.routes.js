const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const { need, oneOf, httpError } = require('../utils/validators');

r.use(auth);

r.get('/', can('expenses', 1), ah(async (req, res) => {
  const args = []; let w = '';
  if (req.query.month) { w = "WHERE DATE_FORMAT(e.expense_date,'%Y-%m')=?"; args.push(req.query.month); }
  const [rows] = await db.query(`SELECT e.*, u.name AS created_by_name FROM expenses e JOIN users u ON u.id=e.created_by ${w} ORDER BY e.expense_date DESC, e.id DESC`, args);
  res.json(rows);
}));

// Create only. There is intentionally no edit-amount or delete endpoint.
r.post('/', can('expenses', 2), ah(async (req, res) => {
  need(req.body, ['category', 'description', 'amount', 'expense_date']);
  oneOf(req.body.category, ['office', 'marketing', 'travel', 'staff_salary', 'utilities', 'other'], 'category');
  if (Number(req.body.amount) <= 0) throw httpError(400, 'amount must be greater than 0');
  const [x] = await db.query('INSERT INTO expenses (category,description,amount,expense_date,created_by) VALUES (?,?,?,?,?)',
    [req.body.category, req.body.description, req.body.amount, req.body.expense_date, req.user.id]);
  res.locals.audit = { action: 'expense.create', entity: 'expense', id: x.insertId, details: { amount: req.body.amount } };
  res.status(201).json({ id: x.insertId });
}));

module.exports = r;
