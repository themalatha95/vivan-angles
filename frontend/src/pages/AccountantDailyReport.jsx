import { useState } from 'react';
import { useApi, useAction, Page, Table, Alert, Stat, inr } from '../ui.jsx';
import { post } from '../api.js';

export default function AccountantDailyReport() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const data = useApi(`/accountant/daily-report?date=${date}`);
  const [msg, run] = useAction(data.reload);
  const [f, setF] = useState({ next_follow_up_dates: '', manager_issues: '', remarks: '', submitted_to_manager: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = (e) => { e.preventDefault(); run(() => post('/accountant/daily-report', { report_date: date, summary: data.data.summary, ...f }), 'Daily report submitted'); };
  const s = data.data?.summary;
  return <Page title="Daily finance report" sub="Submit collections, payouts, follow-ups, and issues to the Manager.">
    <div className="row"><label>Report date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label></div>
    <Alert err={data.error || msg.err} ok={msg.ok} />
    {s && <div className="grid"><Stat label="Customer payments received" value={inr(s.received)} /><Stat label="Payments made" value={inr(s.paid)} /><Stat label="Net cash movement" value={inr(s.net)} tone="good" /><Stat label="Pending transactions" value={s.pending_transactions} /><Stat label="Pending follow-ups" value={Number(s.followups?.customers || 0) + Number(s.followups?.agents || 0) + Number(s.followups?.caretakers || 0)} /><Stat label="Payments committed" value={inr(s.committed)} /></div>}
    {s && <div className="card"><h2>Submit report to Manager</h2><form onSubmit={save}><label>Next follow-up dates<textarea value={f.next_follow_up_dates} onChange={set('next_follow_up_dates')} placeholder="Customer call: 2026-11-04" /></label><label>Issues requiring Manager approval<textarea value={f.manager_issues} onChange={set('manager_issues')} /></label><label>Accountant remarks<textarea value={f.remarks} onChange={set('remarks')} /></label><label><input type="checkbox" checked={f.submitted_to_manager} onChange={set('submitted_to_manager')} /> Submitted to Manager</label><button>Submit daily report</button></form></div>}
    <h2>Submitted report history</h2><Table rows={data.data?.history} cols={[['Date', (x) => x.report_date], ['Received', (x) => inr(x.total_received)], ['Paid', (x) => inr(x.total_paid)], ['Net', (x) => inr(x.net_cash_movement)], ['Submitted', (x) => x.submitted_to_manager ? 'Yes' : 'No'], ['Remarks', (x) => x.remarks || '-']]} />
  </Page>;
}
