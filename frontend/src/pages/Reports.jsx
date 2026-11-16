import { useApi, Page, Table, Alert, inr } from '../ui.jsx';
import { useAuth } from '../auth.jsx';

export default function Reports() {
  const { user } = useAuth();
  const r = user.role;
  const fin = useApi(['owner', 'accountant'].includes(r) ? '/reports/finance' : null);
  const ops = useApi(['owner', 'manager'].includes(r) ? '/reports/operations' : null);
  const calls = useApi(['owner', 'manager', 'telecaller'].includes(r) ? '/reports/calls' : null);
  const scope = { owner: 'All reports', manager: 'Operations reports', telecaller: 'Call reports', accountant: 'Finance reports' }[r];
  return (
    <Page title="Reports" sub={scope}>
      <Alert err={fin.error || ops.error || calls.error} />
      {fin.data && (
        <>
          <h2>Monthly profitability (four separate money fields)</h2>
          <Table rows={fin.data.monthly} cols={[
            ['Month', (x) => x.month], ['Payments', (x) => x.payments], ['Customer amount', (x) => inr(x.customer_amount)],
            ['Caretaker salary', (x) => inr(x.caretaker_salary)], ['Agent commission', (x) => inr(x.agent_commission)], ['Company margin', (x) => inr(x.company_margin)],
          ]} />
          <h2>Salary paid by month</h2>
          <Table rows={fin.data.salary_paid.map((x, i) => ({ ...x, id: i }))} cols={[['Month', (x) => x.month], ['Salary paid', (x) => inr(x.amount)]]} />
          <h2>Expenses by month</h2>
          <Table rows={fin.data.expenses.map((x, i) => ({ ...x, id: i }))} cols={[['Month', (x) => x.month], ['Expenses', (x) => inr(x.amount)]]} />
        </>
      )}
      {ops.data && (
        <>
          <h2>Agent performance</h2>
          <Table rows={ops.data.agents.map((x, i) => ({ ...x, id: i }))} cols={[
            ['Agent', (x) => x.name], ['Code', (x) => x.agent_code], ['Leads', (x) => x.total_leads], ['Confirmed', (x) => x.confirmed_leads], ['Caretakers', (x) => x.caretakers_registered],
          ]} />
          <h2>Jobs by status</h2>
          <Table rows={Object.entries(ops.data.jobs).map(([k, v]) => ({ id: k, k, v }))} cols={[['Status', (x) => x.k.replace('_', ' ')], ['Jobs', (x) => x.v]]} />
          <h2>Attendance this month</h2>
          <Table rows={Object.entries(ops.data.attendance_this_month).map(([k, v]) => ({ id: k, k, v }))} cols={[['Status', (x) => x.k.replace('_', ' ')], ['Days', (x) => x.v]]} />
        </>
      )}
      {calls.data && (
        <>
          <h2>Calls in the last 30 days</h2>
          <Table rows={calls.data.map((x, i) => ({ ...x, id: i }))} cols={[['Telecaller', (x) => x.user_name], ['Outcome', (x) => x.outcome.replace('_', ' ')], ['Calls', (x) => x.n]]} />
        </>
      )}
    </Page>
  );
}
