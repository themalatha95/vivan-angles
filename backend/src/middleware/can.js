const { MATRIX } = require('../utils/permissions');
// can('salary', 2) = the role needs at least "manage" on the salary module
module.exports = (module_, level) => (req, res, next) =>
  ((MATRIX[req.user.role] || {})[module_] || 0) >= level
    ? next()
    : res.status(403).json({ error: 'Your role does not have permission for this action' });
