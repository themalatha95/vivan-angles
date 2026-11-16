// Professional role-based login IDs: owner@..., manager01@..., caller01@..., accounts01@..., agent001@...
const db = require('../config/db');
const PREFIX = { manager: 'manager', telecaller: 'caller', accountant: 'accounts', agent: 'agent' };
module.exports = async (role) => {
  const p = PREFIX[role];
  if (!p) return null;
  const pad = role === 'agent' ? 3 : 2;
  const [[c]] = await db.query('SELECT COUNT(*) n FROM users WHERE role=?', [role]);
  for (let n = c.n + 1; ; n++) {
    const id = `${p}${String(n).padStart(pad, '0')}@vivanangels.com`;
    const [[e]] = await db.query('SELECT id FROM users WHERE email=?', [id]);
    if (!e) return id;
  }
};
