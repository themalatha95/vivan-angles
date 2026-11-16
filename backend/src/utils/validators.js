const httpError = (status, msg) => Object.assign(new Error(msg), { status });
const need = (obj, fields) => {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw httpError(400, 'Missing: ' + missing.join(', '));
};
const SERVICES = ['elderly_care', 'baby_care', 'patient_care', 'cooking', 'housekeeping'];
const oneOf = (val, list, name) => {
  if (!list.includes(val)) throw httpError(400, `${name} must be one of: ${list.join(', ')}`);
};
module.exports = { httpError, need, oneOf, SERVICES };
