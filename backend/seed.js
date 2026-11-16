// Demo data. Safe to run more than once. Run AFTER database/migration_v2.sql.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function ensureUser(name, email, phone, role, password) {
  const [[u]] = await db.query('SELECT id FROM users WHERE phone=?', [phone]);
  if (u) { await db.query('UPDATE users SET email=COALESCE(email,?) WHERE id=?', [email, u.id]); return u.id; }
  const [x] = await db.query('INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',
    [name, email, phone, await bcrypt.hash(password, 10), role]);
  return x.insertId;
}
async function ensureAgent(userId, ownerId, area) {
  const [[a]] = await db.query('SELECT id FROM agents WHERE user_id=?', [userId]);
  if (a) return a.id;
  const [x] = await db.query('INSERT INTO agents (user_id,agent_code,area,commission_rate_pct,created_by) VALUES (?,?,?,10,?)',
    [userId, 'AG' + String(userId).padStart(4, '0'), area, ownerId]);
  return x.insertId;
}

(async () => {
  const owner = await ensureUser('Vivan Owner', 'owner@vivanangels.com', '9999900000', 'owner', 'admin123');
  await ensureUser('Operations Manager', 'manager01@vivanangels.com', '9999900001', 'manager', 'staff1234');
  await ensureUser('Telecaller One', 'caller01@vivanangels.com', '9999900002', 'telecaller', 'staff1234');
  await ensureUser('Accounts One', 'accounts01@vivanangels.com', '9999900003', 'accountant', 'staff1234');
  const rajesh = await ensureAgent(await ensureUser('Rajesh Kumar', 'agent001@vivanangels.com', '9876500001', 'agent', 'agent123'), owner, 'Madhapur');
  const priya = await ensureAgent(await ensureUser('Priya Sharma', 'agent002@vivanangels.com', '9876500002', 'agent', 'agent123'), owner, 'Gachibowli');

  const [[n]] = await db.query('SELECT COUNT(*) c FROM leads');
  if (n.c === 0) {
    const leads = [
      [rajesh, 'Ramesh Kumar', '9876501111', 'Madhapur, Hyderabad', 'elderly_care', 22000, 'confirmed'],
      [priya, 'Anita Rao', '9876502222', 'Gachibowli, Hyderabad', 'baby_care', 25000, 'follow_up'],
      [rajesh, 'Suresh Reddy', '9876503333', 'Kondapur, Hyderabad', 'patient_care', 24000, 'new'],
    ];
    for (const [agent, name, phone, addr, svc, budget, status] of leads) {
      await db.query('INSERT INTO leads (agent_id,created_by,customer_name,phone,address,service_type,budget,status) VALUES (?,?,?,?,?,?,?,?)',
        [agent, owner, name, phone, addr, svc, budget, status]);
    }
  }
  console.log(`Seeded. Demo logins (login ID or phone / password):
  Owner       owner@vivanangels.com     9999900000  / admin123
  Manager     manager01@vivanangels.com 9999900001  / staff1234
  Telecaller  caller01@vivanangels.com  9999900002  / staff1234
  Accountant  accounts01@vivanangels.com 9999900003 / staff1234
  Agent       agent001@vivanangels.com  9876500001  / agent123`);
  db.end();
})().catch((e) => { console.error(e); process.exit(1); });
