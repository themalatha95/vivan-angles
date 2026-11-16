// Adds two telecallers and two agents, with separate lead-to-customer demo flows.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function ensureUser(name, email, phone, role, password, status = 'active') {
  const [[old]] = await db.query('SELECT id FROM users WHERE phone=?', [phone]);
  if (old) { await db.query('UPDATE users SET status=?,email=? WHERE id=?', [status, email, old.id]); return old.id; }
  const [x] = await db.query('INSERT INTO users (name,email,phone,password_hash,role,status,must_change_password) VALUES (?,?,?,?,?,?,0)', [name, email, phone, await bcrypt.hash(password, 10), role, status]);
  return x.insertId;
}

async function ensureAgent(userId, ownerId, code, area) {
  const [[old]] = await db.query('SELECT id FROM agents WHERE user_id=?', [userId]);
  if (old) return old.id;
  const [x] = await db.query('INSERT INTO agents (user_id,agent_code,area,commission_rate_pct,created_by) VALUES (?,?,?,?,?)', [userId, code, area, 10, ownerId]);
  return x.insertId;
}

async function ensureCaretaker(agentId, ownerId, name, phone, service, salary) {
  let [[ct]] = await db.query('SELECT id FROM caretakers WHERE phone=?', [phone]);
  if (!ct) { const [x] = await db.query(`INSERT INTO caretakers (registered_by,name,phone,service_type,experience_years,area,expected_salary,status,availability,email,city,fixed_salary,salary_approval_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [agentId, name, phone, service, 4, 'Hyderabad', salary, 'approved', 'assigned', `${phone}@demo.vivanangels.com`, 'Hyderabad', salary, 'approved']); ct = { id: x.insertId }; await db.query('UPDATE caretakers SET va_id=? WHERE id=?', [`VA-CT-${String(ct.id).padStart(6, '0')}`, ct.id]); }
  await db.query("UPDATE caretakers SET registered_by=?,status='approved',availability='assigned',fixed_salary=?,salary_approval_status='approved' WHERE id=?", [agentId, salary, ct.id]);
  await db.query('INSERT IGNORE INTO caretaker_services (caretaker_id,service_type) VALUES (?,?)', [ct.id, service]);
  for (const type of ['aadhaar', 'photo', 'police_verification', 'bank_proof']) await db.query(`INSERT INTO caretaker_documents (caretaker_id,doc_type,file_url,status,reviewed_by,reviewed_at) SELECT ?,?,?, 'approved', ?,NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM caretaker_documents WHERE caretaker_id=? AND doc_type=?)`, [ct.id, type, '/uploads/documents/demo-placeholder.pdf', ownerId, ct.id, type]);
  return ct.id;
}

async function ensureConvertedFlow({ telecallerId, agentId, caretakerId, ownerId, managerId, accountantId, customerName, customerPhone, service, budget, commission, key }) {
  let [[lead]] = await db.query('SELECT id FROM leads WHERE phone=?', [customerPhone]);
  if (!lead) { const [x] = await db.query(`INSERT INTO leads (agent_id,assigned_to,created_by,customer_name,phone,address,area,service_type,budget,status) VALUES (?,?,?,?,?,?,?,?,?, 'confirmed')`, [agentId, telecallerId, telecallerId, customerName, customerPhone, 'Hyderabad', 'Hyderabad', service, budget]); lead = { id: x.insertId }; }
  await db.query('INSERT IGNORE INTO lead_agent_assignments (lead_id,agent_id) VALUES (?,?)', [lead.id, agentId]);
  let [[job]] = await db.query('SELECT id FROM jobs WHERE lead_id=?', [lead.id]);
  if (!job) { const salary = budget - commission - Math.round(budget * 0.3); const margin = budget - salary - commission; const [x] = await db.query(`INSERT INTO jobs (lead_id,agent_id,caretaker_id,service_type,start_date,status,customer_amount,caretaker_salary,agent_commission,company_margin,created_by) VALUES (?,?,?,?,CURDATE(),'in_progress',?,?,?,?,?)`, [lead.id, agentId, caretakerId, service, budget, salary, commission, margin, managerId]); job = { id: x.insertId }; }
  const month = new Date().toISOString().slice(0, 7);
  let [[payment]] = await db.query('SELECT id FROM payments WHERE job_id=? AND billing_month=?', [job.id, month]);
  if (!payment) { const [x] = await db.query(`INSERT INTO payments (job_id,billing_month,amount,method,reference_no,status,verified_by,verified_at,payment_date) VALUES (?,?,?,?,?,'verified',?,NOW(),CURDATE())`, [job.id, month, budget, 'bank_transfer', `ROLE-${key}`, accountantId]); payment = { id: x.insertId }; }
  await db.query(`INSERT INTO commissions (agent_id,job_id,payment_id,billing_month,amount,status,paid_at,payment_date) SELECT ?,?,?,?,?, 'paid',NOW(),CURDATE() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM commissions WHERE payment_id=?)`, [agentId, job.id, payment.id, month, commission, payment.id]);
  const [[existingSalary]] = await db.query('SELECT id FROM salary_payments WHERE job_id=? AND salary_month=?', [job.id, month]);
  if (!existingSalary) { const [[j]] = await db.query('SELECT caretaker_salary FROM jobs WHERE id=?', [job.id]); await db.query(`INSERT INTO salary_payments (job_id,caretaker_id,salary_month,amount,status,approval_status,approved_by,approved_at,payment_date,paid_at,reference_no,created_by) VALUES (?,?,?,?,'paid','approved',?,NOW(),CURDATE(),NOW(),?,?)`, [job.id, caretakerId, month, j.caretaker_salary, managerId, `ROLE-SAL-${key}`, accountantId]); }
  await db.query("UPDATE caretakers SET salary_payment_date=CURDATE(),customer_payment_date=CURDATE() WHERE id=?", [caretakerId]);
  return lead.id;
}

(async () => {
  const [[owner]] = await db.query("SELECT id FROM users WHERE role='owner' AND status='active' ORDER BY id LIMIT 1");
  const [[manager]] = await db.query("SELECT id FROM users WHERE role='manager' AND status='active' ORDER BY id LIMIT 1");
  const [[accountant]] = await db.query("SELECT id FROM users WHERE role='accountant' AND status='active' ORDER BY id LIMIT 1");
  if (!owner || !manager || !accountant) throw new Error('Owner, Manager and Accountant accounts are required');
  const pairs = [
    { n: 'Two', tele: ['Demo Telecaller Two', 'demo.tele2@vivanangels.com', '9000000102', 'tele2pass'], agent: ['Demo Agent Two', 'demo.agent2@vivanangels.com', '9000000202', 'AG-DEMO-02'], service: 'baby_care' },
    { n: 'Three', tele: ['Demo Telecaller Three', 'demo.tele3@vivanangels.com', '9000000103', 'tele3pass'], agent: ['Demo Agent Three', 'demo.agent3@vivanangels.com', '9000000203', 'AG-DEMO-03'], service: 'cooking' },
  ];
  for (const p of pairs) {
    const teleId = await ensureUser(p.tele[0], p.tele[1], p.tele[2], 'telecaller', p.tele[3], 'active'); const agentUserId = await ensureUser(p.agent[0], p.agent[1], p.agent[2], 'agent', 'agentpass', 'active'); const agentId = await ensureAgent(agentUserId, owner.id, p.agent[3], 'Hyderabad');
    const salary = p.service === 'baby_care' ? 17000 : 15000; const suffix = p.n === 'Two' ? '21' : '31';
    const ctOne = await ensureCaretaker(agentId, owner.id, `${p.agent[0]} Caretaker One`, `9000000${suffix}2`, p.service, salary);
    const ctTwo = await ensureCaretaker(agentId, owner.id, `${p.agent[0]} Caretaker Two`, `9000000${suffix}3`, p.service, salary + 1000);
    await ensureConvertedFlow({ telecallerId: teleId, agentId, caretakerId: ctOne, ownerId: owner.id, managerId: manager.id, accountantId: accountant.id, customerName: `Customer ${p.n} One`, customerPhone: `9000000${p.n === 'Two' ? '221' : '331'}`, service: p.service, budget: p.service === 'baby_care' ? 28000 : 25000, commission: 2500, key: `${p.n}-1` });
    await ensureConvertedFlow({ telecallerId: teleId, agentId, caretakerId: ctTwo, ownerId: owner.id, managerId: manager.id, accountantId: accountant.id, customerName: `Customer ${p.n} Two`, customerPhone: `9000000${p.n === 'Two' ? '222' : '332'}`, service: p.service, budget: p.service === 'baby_care' ? 30000 : 26000, commission: 2800, key: `${p.n}-2` });
    const [[pending]] = await db.query('SELECT id FROM leads WHERE phone=?', [`9000000${p.n === 'Two' ? '223' : '333'}`]);
    if (!pending) await db.query(`INSERT INTO leads (agent_id,assigned_to,created_by,customer_name,phone,address,area,service_type,budget,status) VALUES (?,?,?,?,?,?,?,?,?, 'follow_up')`, [agentId, teleId, teleId, `Customer ${p.n} Follow-up`, `9000000${p.n === 'Two' ? '223' : '333'}`, 'Hyderabad', 'Hyderabad', p.service, 22000]);
    console.log(`${p.n}: telecaller #${teleId}, agent #${agentId}, 2 converted customers and 1 follow-up lead`);
  }
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
