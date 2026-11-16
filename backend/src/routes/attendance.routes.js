const r = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const { need, oneOf, httpError } = require('../utils/validators');

r.use(auth);

r.get('/', can('attendance', 1), ah(async (req, res) => {
  const month = req.query.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw httpError(400, 'month must be YYYY-MM');
  const args = [month]; const filters = [];
  if (req.query.caretaker_id) { filters.push('a.caretaker_id=?'); args.push(req.query.caretaker_id); }
  if (req.query.agent_id) { filters.push('UPPER(TRIM(ag.agent_code))=UPPER(TRIM(?))'); args.push(req.query.agent_id); }
  if (req.query.customer_name) { filters.push('l.customer_name LIKE ?'); args.push('%' + req.query.customer_name + '%'); }
  const [rows] = await db.query(`
    SELECT a.id, a.caretaker_id, c.name AS caretaker_name, ag.id AS agent_id, au.name AS agent_name, l.customer_name,
      DATE_FORMAT(a.att_date,'%Y-%m-%d') AS att_date, a.status, a.note
    FROM attendance a JOIN caretakers c ON c.id=a.caretaker_id
    LEFT JOIN agents ag ON ag.id=c.registered_by LEFT JOIN users au ON au.id=ag.user_id
    LEFT JOIN jobs j ON j.caretaker_id=c.id AND j.status NOT IN ('completed','cancelled') LEFT JOIN leads l ON l.id=j.lead_id
    WHERE DATE_FORMAT(a.att_date,'%Y-%m')=? ${filters.length ? 'AND ' + filters.join(' AND ') : ''} ORDER BY a.att_date DESC, c.name`, args);
  res.json(rows);
}));

// Owner full, Manager manage. Re-marking the same day updates it.
r.post('/', can('attendance', 2), ah(async (req, res) => {
  need(req.body, ['caretaker_id', 'att_date', 'status']);
  oneOf(req.body.status, ['present', 'absent', 'leave', 'half_day'], 'status');
  await db.query(
    `INSERT INTO attendance (caretaker_id,att_date,status,note,marked_by) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note), marked_by=VALUES(marked_by)`,
    [req.body.caretaker_id, req.body.att_date, req.body.status, req.body.note || null, req.user.id]);
  res.locals.audit = { action: 'attendance.mark', entity: 'attendance', id: Number(req.body.caretaker_id), details: { date: req.body.att_date, status: req.body.status } };
  res.json({ ok: true });
}));

module.exports = r;
