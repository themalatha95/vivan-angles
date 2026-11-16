// Creates one complete, repeatable demo flow for testing the Accountant and Agent screens.
require('dotenv').config();
const db = require('./src/config/db');

async function user(role) { const [[u]] = await db.query('SELECT id FROM users WHERE role=? AND status="active" ORDER BY id LIMIT 1', [role]); if (!u) throw new Error(`Active ${role} account is required`); return u.id; }

(async () => {
  const owner = await user('owner'); const manager = await user('manager'); const accountant = await user('accountant'); const telecaller = await user('telecaller');
  const [[agent]] = await db.query("SELECT a.id,a.user_id,u.name FROM agents a JOIN users u ON u.id=a.user_id WHERE u.status='active' ORDER BY a.id LIMIT 1");
  if (!agent) throw new Error('At least one active agent is required');

  let [[ct]] = await db.query("SELECT id FROM caretakers WHERE phone='9000000001'");
  if (!ct) {
    const [x] = await db.query(`INSERT INTO caretakers (registered_by,name,phone,service_type,experience_years,area,expected_salary,status,availability,email,city,fixed_salary,salary_approval_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [agent.id, 'Demo Caretaker', '9000000001', 'elderly_care', 5, 'Banjara Hills', 18000, 'approved', 'available', 'demo.caretaker@vivanangels.com', 'Hyderabad', 18000, 'approved']);
    ct = { id: x.insertId }; await db.query('UPDATE caretakers SET va_id=? WHERE id=?', [`VA-CT-${String(ct.id).padStart(6, '0')}`, ct.id]);
  }
  await db.query("UPDATE caretakers SET registered_by=?, status='approved', fixed_salary=18000, salary_approval_status='approved' WHERE id=?", [agent.id, ct.id]);
  await db.query('INSERT IGNORE INTO caretaker_services (caretaker_id,service_type) VALUES (?,?)', [ct.id, 'elderly_care']);
  for (const type of ['aadhaar', 'photo', 'police_verification', 'bank_proof']) {
    await db.query(`INSERT INTO caretaker_documents (caretaker_id,doc_type,file_url,status,reviewed_by,reviewed_at)
      SELECT ?,?,?, 'approved', ?, NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM caretaker_documents WHERE caretaker_id=? AND doc_type=?)`, [ct.id, type, '/uploads/documents/demo-placeholder.pdf', owner, ct.id, type]);
  }

  let [[lead]] = await db.query("SELECT id FROM leads WHERE phone='9000000002'");
  if (!lead) {
    const [x] = await db.query(`INSERT INTO leads (agent_id,assigned_to,created_by,customer_name,phone,address,area,service_type,budget,status)
      VALUES (?,?,?,?,?,?,?,?,?, 'confirmed')`, [agent.id, telecaller, telecaller, 'Demo Customer', '9000000002', 'Road No. 10', 'Banjara Hills', 'elderly_care', 30000]);
    lead = { id: x.insertId };
  }
  await db.query('INSERT IGNORE INTO lead_agent_assignments (lead_id,agent_id) VALUES (?,?)', [lead.id, agent.id]);

  let [[job]] = await db.query('SELECT id FROM jobs WHERE lead_id=?', [lead.id]);
  if (!job) {
    const [x] = await db.query(`INSERT INTO jobs (lead_id,agent_id,caretaker_id,service_type,start_date,status,customer_amount,caretaker_salary,agent_commission,company_margin,created_by)
      VALUES (?,?,?,?,CURDATE(),'in_progress',?,?,?,?,?)`, [lead.id, agent.id, ct.id, 'elderly_care', 30000, 18000, 3000, 9000, manager]);
    job = { id: x.insertId }; await db.query("UPDATE caretakers SET availability='assigned' WHERE id=?", [ct.id]);
  }
  const month = new Date().toISOString().slice(0, 7);
  let [[payment]] = await db.query('SELECT id FROM payments WHERE job_id=? AND billing_month=?', [job.id, month]);
  if (!payment) { const [x] = await db.query(`INSERT INTO payments (job_id,billing_month,amount,method,reference_no,status,verified_by,verified_at,payment_date) VALUES (?,?,?,?,?,'verified',?,NOW(),CURDATE())`, [job.id, month, 30000, 'bank_transfer', 'DEMO-UTR-001', accountant]); payment = { id: x.insertId }; }
  await db.query(`INSERT INTO commissions (agent_id,job_id,payment_id,billing_month,amount,status,paid_at,payment_date)
    SELECT ?,?,?,?,?, 'paid', NOW(), CURDATE() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM commissions WHERE payment_id=?)`, [agent.id, job.id, payment.id, month, 3000, payment.id]);
  await db.query(`INSERT INTO salary_payments (job_id,caretaker_id,salary_month,amount,status,approval_status,approved_by,approved_at,payment_date,paid_at,reference_no,created_by)
    SELECT ?,?,?,18000,'paid','approved',?,NOW(),CURDATE(),NOW(),'DEMO-SAL-001',? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM salary_payments WHERE job_id=? AND salary_month=?)`, [job.id, ct.id, month, manager, accountant, job.id, month]);
  await db.query("UPDATE caretakers SET salary_payment_date=CURDATE(), customer_payment_date=CURDATE(), fixed_salary=18000, salary_approval_status='approved' WHERE id=?", [ct.id]);
  console.log(`Demo flow ready: lead #${lead.id}, caretaker #${ct.id}, job #${job.id}, payment #${payment.id}`);

  // More caretakers for the same agent, each with a matching customer/service/job/payment flow.
  const extras = [
    ['Demo Baby Caretaker', '9000000011', 'baby_care', 'Baby Care', 16000, 26000, 2500, 'Demo Baby Customer', '9000000012'],
    ['Demo Patient Caretaker', '9000000041', 'patient_care', 'Patient Care', 19000, 32000, 3200, 'Demo Patient Customer', '9000000042'],
    ['Demo Cooking Caretaker', '9000000021', 'cooking', 'Cooking', 15000, 24000, 2200, 'Demo Cooking Customer', '9000000022'],
    ['Demo Housekeeping Caretaker', '9000000031', 'housekeeping', 'Housekeeping', 14000, 22000, 2000, 'Demo Housekeeping Customer', '9000000032'],
  ];
  for (const [name, phone, service, label, salary, customerAmount, commissionAmount, customerName, customerPhone] of extras) {
    let [[extraCt]] = await db.query('SELECT id FROM caretakers WHERE phone=?', [phone]);
    if (!extraCt) { const [x] = await db.query(`INSERT INTO caretakers (registered_by,name,phone,service_type,experience_years,area,expected_salary,status,availability,email,city,fixed_salary,salary_approval_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [agent.id, name, phone, service, 3, 'Hyderabad', salary, 'approved', 'assigned', `${phone}@demo.vivanangels.com`, 'Hyderabad', salary, 'approved']); extraCt = { id: x.insertId }; await db.query('UPDATE caretakers SET va_id=? WHERE id=?', [`VA-CT-${String(extraCt.id).padStart(6, '0')}`, extraCt.id]); }
    await db.query("UPDATE caretakers SET registered_by=?, status='approved', availability='assigned', fixed_salary=?, salary_approval_status='approved' WHERE id=?", [agent.id, salary, extraCt.id]);
    await db.query('INSERT IGNORE INTO caretaker_services (caretaker_id,service_type) VALUES (?,?)', [extraCt.id, service]);
    for (const type of ['aadhaar', 'photo', 'police_verification', 'bank_proof']) await db.query(`INSERT INTO caretaker_documents (caretaker_id,doc_type,file_url,status,reviewed_by,reviewed_at) SELECT ?,?,?, 'approved', ?, NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM caretaker_documents WHERE caretaker_id=? AND doc_type=?)`, [extraCt.id, type, '/uploads/documents/demo-placeholder.pdf', owner, extraCt.id, type]);
    let [[extraLead]] = await db.query('SELECT id FROM leads WHERE phone=?', [customerPhone]);
    if (!extraLead) { const [x] = await db.query(`INSERT INTO leads (agent_id,assigned_to,created_by,customer_name,phone,address,area,service_type,budget,status) VALUES (?,?,?,?,?,?,?,?,?, 'confirmed')`, [agent.id, telecaller, telecaller, customerName, customerPhone, 'Hyderabad', 'Hyderabad', service, customerAmount]); extraLead = { id: x.insertId }; }
    await db.query('INSERT IGNORE INTO lead_agent_assignments (lead_id,agent_id) VALUES (?,?)', [extraLead.id, agent.id]);
    let [[extraJob]] = await db.query('SELECT id FROM jobs WHERE lead_id=?', [extraLead.id]);
    if (!extraJob) { const margin = customerAmount - salary - commissionAmount; const [x] = await db.query(`INSERT INTO jobs (lead_id,agent_id,caretaker_id,service_type,start_date,status,customer_amount,caretaker_salary,agent_commission,company_margin,created_by) VALUES (?,?,?,?,CURDATE(),'in_progress',?,?,?,?,?)`, [extraLead.id, agent.id, extraCt.id, service, customerAmount, salary, commissionAmount, margin, manager]); extraJob = { id: x.insertId }; }
    let [[extraPayment]] = await db.query('SELECT id FROM payments WHERE job_id=? AND billing_month=?', [extraJob.id, month]);
    if (!extraPayment) { const [x] = await db.query(`INSERT INTO payments (job_id,billing_month,amount,method,reference_no,status,verified_by,verified_at,payment_date) VALUES (?,?,?,?,?,'verified',?,NOW(),CURDATE())`, [extraJob.id, month, customerAmount, 'upi', `DEMO-${phone}`, accountant]); extraPayment = { id: x.insertId }; }
    await db.query(`INSERT INTO commissions (agent_id,job_id,payment_id,billing_month,amount,status,paid_at,payment_date) SELECT ?,?,?,?,?, 'paid', NOW(), CURDATE() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM commissions WHERE payment_id=?)`, [agent.id, extraJob.id, extraPayment.id, month, commissionAmount, extraPayment.id]);
    await db.query(`INSERT INTO salary_payments (job_id,caretaker_id,salary_month,amount,status,approval_status,approved_by,approved_at,payment_date,paid_at,reference_no,created_by) SELECT ?,?,?,?,'paid','approved',?,NOW(),CURDATE(),NOW(),?,? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM salary_payments WHERE job_id=? AND salary_month=?)`, [extraJob.id, extraCt.id, month, salary, manager, `DEMO-SAL-${phone}`, accountant, extraJob.id, month]);
    await db.query("UPDATE caretakers SET salary_payment_date=CURDATE(), customer_payment_date=CURDATE() WHERE id=?", [extraCt.id]);
    console.log(`Extra ${label} flow ready: lead #${extraLead.id}, caretaker #${extraCt.id}, job #${extraJob.id}`);
  }
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
