const db = require('../config/db');
// Records EVERY write request (who, what, from where, result). Routes may add context via res.locals.audit.
module.exports = (req, res, next) => {
  res.on('finish', () => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return;
    const path = req.originalUrl.split('?')[0];
    if (path === '/api/auth/login' || path === '/api/auth/2fa/verify') return; // these go to login_history
    const a = res.locals.audit || {};
    db.query(
      'INSERT INTO audit_log (user_id,action,entity,entity_id,details,ip,method,path,status_code) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user ? req.user.id : null, a.action || `${req.method} ${path}`, a.entity || path.split('/')[2] || '-',
       a.id || null, JSON.stringify(a.details || {}), req.ip, req.method, path, res.statusCode]
    ).catch((e) => console.error('audit failed:', e.message));
  });
  next();
};
