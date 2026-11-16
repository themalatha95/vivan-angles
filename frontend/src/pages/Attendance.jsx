import { useState } from 'react';
import { useApi, useAction, useForm, useCan, Page, Table, Badge, Alert } from '../ui.jsx';
import { post } from '../api.js';

export default function Attendance() {
  const can = useCan();
  const canWrite = can('attendance', 2);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [agentId, setAgentId] = useState(''); const [caretakerId, setCaretakerId] = useState(''); const [customer, setCustomer] = useState('');
  const cts = useApi(canWrite ? '/caretakers?status=approved' : null);
  const attendanceQuery = new URLSearchParams({ month }); if (agentId) attendanceQuery.set('agent_id', agentId); if (caretakerId) attendanceQuery.set('caretaker_id', caretakerId); if (customer) attendanceQuery.set('customer_name', customer);
  const { data, error, reload } = useApi(`/attendance?${attendanceQuery}`);
  const [msg, run] = useAction(reload);
  const [f, bind] = useForm({ status: 'present', att_date: new Date().toISOString().slice(0, 10) });
  const mark = (e) => {
    e.preventDefault();
    run(() => post('/attendance', { caretaker_id: Number(f.caretaker_id), att_date: f.att_date, status: f.status, note: f.note }), 'Attendance saved');
  };
  // per-caretaker totals for the month
  const summary = {};
  (data || []).forEach((a) => {
    const s = (summary[a.caretaker_id] = summary[a.caretaker_id] || { id: a.caretaker_id, name: a.caretaker_name, present: 0, half_day: 0, leave: 0, absent: 0 });
    s[a.status]++;
  });
  return (
    <Page title="Attendance" sub={canWrite ? 'Mark caretaker attendance. Re-marking a day updates it.' : 'View only'}>
      <div className="row filter-row" style={{ marginBottom: 12 }}>
        <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label>Agent ID<input value={agentId} onChange={(e) => setAgentId(e.target.value.toUpperCase())} placeholder="e.g. AG0005" /></label>
        <label>Caretaker ID<input type="number" min="1" value={caretakerId} onChange={(e) => setCaretakerId(e.target.value)} /></label>
        <label>Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" /></label>
        <button className="grey" onClick={() => { setAgentId(''); setCaretakerId(''); setCustomer(''); }}>Clear filters</button>
      </div>
      {canWrite && (
        <div className="card">
          <form onSubmit={mark}>
            <label>Caretaker
              <select {...bind('caretaker_id')} required>
                <option value="">Select…</option>{(cts.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Date<input type="date" {...bind('att_date')} required /></label>
            <label>Status
              <select {...bind('status')}><option value="present">Present</option><option value="half_day">Half day</option><option value="leave">Leave</option><option value="absent">Absent</option></select>
            </label>
            <label>Note<input {...bind('note')} /></label>
            <button>Save</button>
          </form>
        </div>
      )}
      <Alert err={error || msg.err} ok={msg.ok} />
      <h2>Monthly summary</h2>
      <Table rows={Object.values(summary).map((s) => ({ ...s, id: s.id }))} cols={[
        ['Caretaker', (s) => s.name], ['Present', (s) => s.present], ['Half day', (s) => s.half_day], ['Leave', (s) => s.leave], ['Absent', (s) => s.absent],
      ]} />
      <h2>Daily records</h2>
      <Table rows={data} cols={[['Date', (a) => a.att_date], ['Agent', (a) => a.agent_name || '-'], ['Caretaker', (a) => `${a.caretaker_name} (#${a.caretaker_id})`], ['Customer', (a) => a.customer_name || '-'], ['Status', (a) => <Badge s={a.status} />], ['Note', (a) => a.note || '-']]} />
    </Page>
  );
}
