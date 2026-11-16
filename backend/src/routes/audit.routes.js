const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');

r.use(auth, can('users', 3));

r.get('/', ah(async (req, res) => {
  const where = [], args = [];
  if (req.query.user_id) { where.push('a.user_id=?'); args.push(req.query.user_id); }
  if (req.query.entity) { where.push('a.entity=?'); args.push(req.query.entity); }
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  const [rows] = await db.query(`
    SELECT a.id, a.created_at, u.name AS user_name, u.role AS user_role, a.action, a.entity, a.entity_id, a.status_code, a.ip, a.details
    FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ${limit}`, args);
  res.json(rows);
}));

r.get('/logins', ah(async (req, res) => {
  const [rows] = await db.query(`
    SELECT h.id, h.created_at, h.login_id, u.name AS user_name, h.success, h.reason, h.ip
    FROM login_history h LEFT JOIN users u ON u.id=h.user_id ORDER BY h.id DESC LIMIT 200`);
  res.json(rows);
}));

module.exports = r;
