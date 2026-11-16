const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Verifies the token AND re-checks the account is still active, so deactivation takes effect immediately.
module.exports = async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.purpose !== 'access') throw new Error('wrong token type');
    const [[u]] = await db.query('SELECT status FROM users WHERE id=?', [p.id]);
    if (!u || u.status !== 'active') return res.status(401).json({ error: 'Account is deactivated' });
    req.user = p;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
