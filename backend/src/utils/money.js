// Four SEPARATE financial fields: customer_amount, caretaker_salary, agent_commission, company_margin
const { httpError } = require('./validators');
const r2 = (n) => Math.round(n * 100) / 100;

function splitMoney({ customer, salary, commission }) {
  customer = Number(customer); salary = Number(salary); commission = Number(commission);
  if ([customer, salary, commission].some((n) => Number.isNaN(n) || n < 0)) {
    throw httpError(400, 'Amounts must be non-negative numbers');
  }
  const margin = r2(customer - salary - commission);
  if (margin < 0) throw httpError(400, 'Salary + commission exceed customer amount (negative company margin)');
  return { customer_amount: r2(customer), caretaker_salary: r2(salary), agent_commission: r2(commission), company_margin: margin };
}
module.exports = { splitMoney, r2 };
