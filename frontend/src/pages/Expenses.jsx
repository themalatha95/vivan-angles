import { useState } from 'react';
import { useApi, useAction, useForm, useCan, Page, Table, Alert, Stat, inr } from '../ui.jsx';
import { post } from '../api.js';

const CATS = { office: 'Office', marketing: 'Marketing', travel: 'Travel', staff_salary: 'Staff salary', utilities: 'Utilities', other: 'Other' };

export default function Expenses() {
  const can = useCan();
  const canWrite = can('expenses', 2);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, error, reload } = useApi(`/expenses?month=${month}`);
  const [msg, run] = useAction(reload);
  const [f, bind, reset] = useForm({ category: 'office', expense_date: new Date().toISOString().slice(0, 10) });
  const total = (data || []).reduce((a, e) => a + e.amount, 0);
  return (
    <Page title="Expenses" sub="Entries cannot be edited or deleted once saved.">
      <div className="row filter-row" style={{ marginBottom: 12 }}>
        <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <Stat label="Total this month" value={inr(total)} />
      </div>
      {canWrite && (
        <div className="card">
          <h3>Add expense</h3>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await post('/expenses', f); reset(); }, 'Expense saved'); }}>
            <label>Category<select {...bind('category')}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Description<input {...bind('description')} required /></label>
            <label>Amount (₹)<input type="number" min="1" {...bind('amount')} required /></label>
            <label>Date<input type="date" {...bind('expense_date')} required /></label>
            <button>Save expense</button>
          </form>
        </div>
      )}
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={[
        ['Date', (e) => String(e.expense_date).slice(0, 10)], ['Category', (e) => CATS[e.category]], ['Description', (e) => e.description],
        ['Amount', (e) => inr(e.amount)], ['Entered by', (e) => e.created_by_name],
      ]} />
    </Page>
  );
}
