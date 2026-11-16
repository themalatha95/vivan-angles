// Creates three approved, unpaid salary statements for Accountant testing.
// Safe to run repeatedly: the same three demo records are reset to pending.
require('dotenv').config();
const db = require('./src/config/db');

(async () => {
  const [[manager]] = await db.query("SELECT id FROM users WHERE role='manager' AND status='active' ORDER BY id LIMIT 1");
  const [[accountant]] = await db.query("SELECT id FROM users WHERE role='accountant' AND status='active' ORDER BY id LIMIT 1");
  if (!manager || !accountant) throw new Error('Run the normal demo seed first so Manager and Accountant users exist.');

  const month = new Date().toISOString().slice(0, 7);
  const [jobs] = await db.query(`
    SELECT j.id, j.caretaker_id, j.caretaker_salary
    FROM jobs j
    WHERE j.status NOT IN ('completed', 'cancelled')
      AND j.caretaker_id IS NOT NULL
    ORDER BY j.id
    LIMIT 3`);
  if (jobs.length < 3) throw new Error('At least three active jobs with caretakers are required. Run npm run seed:demo first.');

  for (const job of jobs) {
    const amount = Number(job.caretaker_salary || 0);
    const [[existing]] = await db.query('SELECT id FROM salary_payments WHERE job_id=? AND salary_month=?', [job.id, month]);
    if (existing) {
      await db.query(`UPDATE salary_payments
        SET amount=?, amount_paid=0, status='pending', approval_status='approved', approved_by=?, approved_at=NOW(),
            paid_at=NULL, payment_date=NULL, method=NULL, reference_no=?
        WHERE id=?`, [amount, manager.id, `DEMO-SAL-TEST-${job.id}`, existing.id]);
    } else {
      await db.query(`INSERT INTO salary_payments
        (job_id, caretaker_id, salary_month, amount, amount_paid, status, approval_status, approved_by, approved_at, created_by, reference_no)
        VALUES (?, ?, ?, ?, 0, 'pending', 'approved', ?, NOW(), ?, ?)`,
        [job.id, job.caretaker_id, month, amount, manager.id, accountant.id, `DEMO-SAL-TEST-${job.id}`]);
    }
  }

  console.log(`Created/reset 3 Accountant salary test records for ${month}.`);
  console.log('Login as Accountant and open Caretaker Payments. Each row should show Pay salary.');
  await db.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
