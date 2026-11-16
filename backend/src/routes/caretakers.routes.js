const r = require('express').Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const can = require('../middleware/can');
const allow = require('../middleware/roleGuard');
const upload = require('../middleware/upload');
const { tempPassword } = require('../utils/password');
const { need, oneOf, httpError, SERVICES } = require('../utils/validators');
const { makePdf, caretakerLines } = require('../utils/caretakerPdf');

const REQUIRED_DOCS = [
  ['aadhaar', 'Aadhaar Card'], ['photo', 'Passport-size Photograph'],
  ['police_verification', 'Police Verification'], ['bank_proof', 'Bank Passbook / Cancelled Cheque'],
];
const OPTIONAL_DOCS = [['experience_certificate', 'Experience / Training Certificate']];
const ALL_DOC_TYPES = REQUIRED_DOCS.map(([key]) => key).concat(OPTIONAL_DOCS.map(([key]) => key), 'other');
const SERVICE_LABELS = { elderly_care: 'Elderly Care', baby_care: 'Baby Care', patient_care: 'Patient Care', cooking: 'Cooking', housekeeping: 'Housekeeping' };

r.use(auth);

async function caretaker(id) {
  const [[c]] = await db.query(`
    SELECT c.*, au.name AS agent_name, a.agent_code AS agent_id,
      j.id AS current_job_id, l.customer_name AS assigned_customer, j.status AS current_job_status,
      DATE_FORMAT(j.start_date,'%Y-%m-%d') AS job_start_date, j.caretaker_salary AS monthly_salary,
      (SELECT COALESCE(SUM(cm.amount),0) FROM commissions cm JOIN jobs cj ON cj.id=cm.job_id WHERE cm.agent_id=c.registered_by AND cj.caretaker_id=c.id) AS commission_generated,
      j.agent_commission AS commission_amount,
      (SELECT cm.status FROM commissions cm JOIN jobs cj ON cj.id=cm.job_id WHERE cm.agent_id=c.registered_by AND cj.caretaker_id=c.id ORDER BY cm.id DESC LIMIT 1) AS commission_status,
      (SELECT GROUP_CONCAT(cs.service_type ORDER BY cs.service_type SEPARATOR ',') FROM caretaker_services cs WHERE cs.caretaker_id=c.id) AS services,
      (SELECT d.id FROM caretaker_documents d WHERE d.caretaker_id=c.id AND d.doc_type='photo' ORDER BY d.id DESC LIMIT 1) AS photo_document_id
    FROM caretakers c JOIN agents a ON a.id=c.registered_by JOIN users au ON au.id=a.user_id
    LEFT JOIN jobs j ON j.caretaker_id=c.id AND j.status IN ('assigned','accepted','in_progress')
    LEFT JOIN leads l ON l.id=j.lead_id WHERE c.id=?`, [id]);
  if (!c) throw httpError(404, 'Caretaker not found');
  c.service_label = SERVICE_LABELS[c.service_type] || c.service_type;
  return c;
}

async function ownCaretaker(req) {
  const c = await caretaker(req.params.id);
  if (req.user.role === 'agent' && c.registered_by !== req.user.agentId) throw httpError(403, 'Not your caretaker');
  if (req.user.role === 'caretaker' && c.user_id !== req.user.id) throw httpError(403, 'Not your profile');
  return c;
}

async function verification(caretakerId) {
  const [rows] = await db.query('SELECT id,doc_type,status,remarks,expiry_date,reviewed_at,file_url FROM caretaker_documents WHERE caretaker_id=?', [caretakerId]);
  const byType = Object.fromEntries(rows.map((d) => [d.doc_type, d]));
  const documents = REQUIRED_DOCS.map(([type, label]) => ({ type, label, required: true, ...(byType[type] || { status: 'not_uploaded' }) }));
  const optional = OPTIONAL_DOCS.map(([type, label]) => ({ type, label, required: false, ...(byType[type] || { status: 'not_uploaded' }) }));
  const allDocuments = [...documents, ...optional];
  const verified = documents.filter((d) => d.status === 'approved').length;
  const alerts = documents.filter((d) => d.status === 'not_uploaded').map((d) => `${d.label} is missing`);
  allDocuments.filter((d) => d.expiry_date && new Date(d.expiry_date) <= new Date(Date.now() + 30 * 86400000)).forEach((d) => alerts.push(`${d.label} expires within 30 days`));
  return { documents: allDocuments, verified, total: REQUIRED_DOCS.length, complete: verified === REQUIRED_DOCS.length, alerts };
}

r.post('/', allow('agent'), ah(async (req, res) => {
  const services = Array.isArray(req.body.services) && req.body.services.length ? req.body.services : [req.body.service_type];
  need(req.body, ['name', 'phone']); services.forEach((s) => oneOf(s, SERVICES, 'services'));
  const fields = ['name', 'phone', 'service_type', 'experience_years', 'area', 'expected_salary', 'email', 'date_of_birth', 'gender', 'address', 'city', 'emergency_contact', 'skills', 'languages', 'availability_type', 'joining_date'];
  const v = Object.fromEntries(fields.map((x) => [x, req.body[x] === '' ? null : req.body[x]]));
  v.service_type = services[0];
  const [x] = await db.query(`INSERT INTO caretakers (registered_by,name,phone,service_type,experience_years,area,expected_salary,email,date_of_birth,gender,address,city,emergency_contact,skills,languages,availability_type,joining_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.user.agentId, v.name, v.phone, v.service_type, v.experience_years || 0, v.area, v.expected_salary, v.email, v.date_of_birth, v.gender, v.address, v.city, v.emergency_contact, v.skills, v.languages, v.availability_type || 'full_time', v.joining_date]);
  const vaId = `VA-CT-${String(x.insertId).padStart(6, '0')}`;
  await db.query('UPDATE caretakers SET va_id=? WHERE id=?', [vaId, x.insertId]);
  for (const service of services) await db.query('INSERT INTO caretaker_services (caretaker_id,service_type) VALUES (?,?)', [x.insertId, service]);
  res.locals.audit = { action: 'caretaker.register', entity: 'caretaker', id: x.insertId }; res.status(201).json({ id: x.insertId, va_id: vaId, status: 'pending' });
}));

r.get('/', can('caretakers', 1), ah(async (req, res) => {
  const where = [], args = [];
  if (req.user.role === 'agent') { where.push('c.registered_by=?'); args.push(req.user.agentId); }
  if (req.query.status) { where.push('c.status=?'); args.push(req.query.status); }
  if (req.query.availability) { where.push('c.availability=?'); args.push(req.query.availability); }
  const [rows] = await db.query(`SELECT c.*, au.name AS agent_name, a.agent_code AS agent_id,
    (SELECT GROUP_CONCAT(cs.service_type ORDER BY cs.service_type SEPARATOR ',') FROM caretaker_services cs WHERE cs.caretaker_id=c.id) AS services,
    (SELECT d.id FROM caretaker_documents d WHERE d.caretaker_id=c.id AND d.doc_type='photo' ORDER BY d.id DESC LIMIT 1) AS photo_document_id,
    (SELECT j.agent_commission FROM jobs j WHERE j.caretaker_id=c.id ORDER BY j.id DESC LIMIT 1) AS commission_amount,
    (SELECT cm.status FROM commissions cm JOIN jobs j ON j.id=cm.job_id WHERE cm.agent_id=c.registered_by AND j.caretaker_id=c.id ORDER BY cm.id DESC LIMIT 1) AS commission_status,
    (SELECT COUNT(*) FROM caretaker_documents d WHERE d.caretaker_id=c.id) AS docs_total,
    (SELECT COUNT(*) FROM caretaker_documents d WHERE d.caretaker_id=c.id AND d.status='approved') AS docs_approved
    FROM caretakers c JOIN agents a ON a.id=c.registered_by JOIN users au ON au.id=a.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC`, args);
  if (req.user.role === 'telecaller') rows.forEach((x) => { delete x.expected_salary; }); res.json(rows);
}));

r.get('/:id/profile', ah(async (req, res) => {
  const c = await ownCaretaker(req); const [history] = await db.query(`SELECT id,customer_name,service_type,start_date,end_date,monthly_salary,status,notes FROM caretaker_job_history WHERE caretaker_id=? UNION ALL SELECT j.id,l.customer_name,j.service_type,j.start_date,j.end_date,j.caretaker_salary,j.status,NULL FROM jobs j JOIN leads l ON l.id=j.lead_id WHERE j.caretaker_id=? ORDER BY start_date DESC, id DESC`, [c.id, c.id]);
  res.json({ ...c, verification: await verification(c.id), history });
}));

r.patch('/:id/profile', ah(async (req, res) => {
  const c = await ownCaretaker(req); const allowed = ['name', 'phone', 'email', 'date_of_birth', 'gender', 'address', 'city', 'emergency_contact', 'skills', 'languages', 'availability_type', 'expected_salary', 'experience_years', 'service_type', 'joining_date'];
  let fields = allowed.filter((f) => Object.prototype.hasOwnProperty.call(req.body, f)); if (!fields.length) throw httpError(400, 'No profile fields supplied');
  if (req.user.role === 'caretaker') { for (const field of fields) await db.query('INSERT INTO caretaker_change_requests (caretaker_id,requested_by,field_name,old_value,requested_value) VALUES (?,?,?,?,?)', [c.id, req.user.id, field, c[field] ?? '', String(req.body[field])]); return res.status(202).json({ ok: true, message: 'Change request sent for admin approval' }); }
  if (req.user.role === 'agent') fields = fields.filter((f) => ['name', 'phone', 'email', 'address', 'city', 'emergency_contact', 'skills', 'languages'].includes(f));
  if (!fields.length) throw httpError(403, 'Your role cannot edit these profile fields');
  await db.query(`UPDATE caretakers SET ${fields.map((f) => `\`${f}\`=?`).join(',')} WHERE id=?`, [...fields.map((f) => req.body[f] === '' ? null : req.body[f]), c.id]);
  res.locals.audit = { action: 'caretaker.profile.update', entity: 'caretaker', id: c.id }; res.json({ ok: true });
}));

r.get('/:id/documents', ah(async (req, res) => {
  const c = await ownCaretaker(req); const v = await verification(c.id); const [extra] = await db.query("SELECT id,doc_type,status,remarks,expiry_date,reviewed_at,file_url FROM caretaker_documents WHERE caretaker_id=? AND doc_type='other'", [c.id]);
  res.json([...v.documents, ...extra.map((d) => ({ ...d, type: d.doc_type, label: 'Additional document', required: false }))]);
}));

r.post('/:id/documents', ah(async (req, res, next) => {
  if (!['owner', 'manager', 'agent', 'caretaker'].includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for your role' });
  try { await ownCaretaker(req); } catch (e) { return next(e); }
  upload.single('file')(req, res, async (err) => { if (err) return next(err); try { need(req.body, ['doc_type']); oneOf(req.body.doc_type, ALL_DOC_TYPES, 'doc_type'); if (!req.file) throw httpError(400, 'file is required'); const [x] = await db.query('INSERT INTO caretaker_documents (caretaker_id,doc_type,file_url,expiry_date) VALUES (?,?,?,?)', [req.params.id, req.body.doc_type, '/uploads/documents/' + req.file.filename, req.body.expiry_date || null]); res.locals.audit = { action: 'caretaker.document.upload', entity: 'caretaker', id: Number(req.params.id) }; res.status(201).json({ id: x.insertId, status: 'pending' }); } catch (e) { next(e); } });
}));

r.get('/documents/:docId/file', ah(async (req, res) => { const [[d]] = await db.query('SELECT file_url,caretaker_id FROM caretaker_documents WHERE id=?', [req.params.docId]); if (!d) throw httpError(404, 'Document not found'); await ownCaretaker({ ...req, params: { id: d.caretaker_id } }); res.sendFile(path.resolve(upload.dir, path.basename(d.file_url))); }));
r.patch('/documents/:docId', allow('owner', 'manager'), ah(async (req, res) => { oneOf(req.body.status, ['approved', 'rejected'], 'status'); await db.query('UPDATE caretaker_documents SET status=?, remarks=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?', [req.body.status, req.body.remarks || null, req.user.id, req.params.docId]); res.locals.audit = { action: 'caretaker.document.' + req.body.status, entity: 'caretaker_document', id: Number(req.params.docId) }; res.json({ ok: true }); }));

r.get('/:id/download/:kind', ah(async (req, res) => { const c = await ownCaretaker(req); const names = { registration: 'Caretaker Registration Form', profile: 'Caretaker Profile Sheet', checklist: 'Document Verification Checklist', background: 'Background Verification Form', medical: 'Medical Fitness Declaration', agreement: 'Caretaker Agreement', conduct: 'Code of Conduct', assignment: 'Customer Assignment Letter', joining: 'Job Joining Report', attendance: 'Monthly Attendance Sheet', salary: 'Salary Payment Statement', id_card: 'Caretaker ID Card' }; const title = names[req.params.kind]; if (!title) throw httpError(404, 'Unknown caretaker document'); const lines = caretakerLines(c); if (req.params.kind === 'checklist') lines.push('', ...(await verification(c.id)).documents.map((d) => `${d.label}: ${d.status.replace('_', ' ')}`)); if (req.params.kind === 'id_card') lines.splice(0, lines.length, `ID: ${c.va_id}`, `Name: ${c.name}`, `Service: ${c.service_label}`, `Status: ${c.status}`, 'Vivan Angels Caretaker Portal'); res.setHeader('Content-Disposition', `attachment; filename="${c.va_id || 'caretaker'}-${req.params.kind}.pdf"`); res.type('application/pdf').send(makePdf(title, lines)); }));

r.patch('/:id/approve', allow('owner', 'manager'), ah(async (req, res) => { const c = await caretaker(req.params.id); if (c.status === 'approved') throw httpError(400, 'Already approved'); const [[d]] = await db.query("SELECT COUNT(*) AS total, SUM(status='approved') AS ok FROM caretaker_documents WHERE caretaker_id=?", [c.id]); if (!d.total || Number(d.ok) !== Number(d.total)) throw httpError(400, 'All uploaded documents must be approved first'); const temp = tempPassword(); const conn = await db.getConnection(); try { await conn.beginTransaction(); const [u] = await conn.query("INSERT INTO users (name,phone,password_hash,role,must_change_password) VALUES (?,?,?, 'caretaker', 1)", [c.name, c.phone, await bcrypt.hash(temp, 10)]); await conn.query("UPDATE caretakers SET status='approved', user_id=?, employment_status='active' WHERE id=?", [u.insertId, c.id]); await conn.commit(); } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); } res.locals.audit = { action: 'caretaker.approve', entity: 'caretaker', id: c.id }; res.json({ ok: true, login_phone: c.phone, temp_password: temp }); }));
r.patch('/:id/reject', allow('owner', 'manager'), ah(async (req, res) => { await db.query("UPDATE caretakers SET status='rejected' WHERE id=?", [req.params.id]); res.locals.audit = { action: 'caretaker.reject', entity: 'caretaker', id: Number(req.params.id) }; res.json({ ok: true }); }));
r.patch('/:id/assign-agent', allow('owner', 'manager'), ah(async (req, res) => { need(req.body, ['agent_id']); const [[a]] = await db.query('SELECT id FROM agents WHERE id=?', [req.body.agent_id]); if (!a) throw httpError(400, 'Invalid agent'); await db.query('UPDATE caretakers SET registered_by=? WHERE id=?', [req.body.agent_id, req.params.id]); res.locals.audit = { action: 'caretaker.assign_agent', entity: 'caretaker', id: Number(req.params.id) }; res.json({ ok: true }); }));
r.get('/:id/change-requests', allow('owner', 'manager'), ah(async (req, res) => { const [rows] = await db.query('SELECT r.*, u.name AS requested_by_name FROM caretaker_change_requests r JOIN users u ON u.id=r.requested_by WHERE caretaker_id=? ORDER BY r.id DESC', [req.params.id]); res.json(rows); }));
r.patch('/change-requests/:requestId', allow('owner', 'manager'), ah(async (req, res) => { oneOf(req.body.status, ['approved', 'rejected'], 'status'); const [[q]] = await db.query('SELECT * FROM caretaker_change_requests WHERE id=?', [req.params.requestId]); if (!q) throw httpError(404, 'Change request not found'); if (req.body.status === 'approved') await db.query('UPDATE caretakers SET ??=? WHERE id=?', [q.field_name, q.requested_value, q.caretaker_id]); await db.query('UPDATE caretaker_change_requests SET status=?,remarks=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?', [req.body.status, req.body.remarks || null, req.user.id, q.id]); res.json({ ok: true }); }));

module.exports = r;
