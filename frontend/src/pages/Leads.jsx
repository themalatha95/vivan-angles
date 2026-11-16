import { useState } from 'react';
import { useApi, useAction, useForm, useCan, Page, Table, Badge, Alert, inr, SVC } from '../ui.jsx';
import { post, patch } from '../api.js';
import { useAuth } from '../auth.jsx';

const TABS = ['', 'new', 'follow_up', 'confirmed', 'lost'];

function Calls({ l, canWrite, onDone }) {
  const { data, error, reload } = useApi(`/leads/${l.id}/calls`);
  const [msg, run] = useAction(() => { reload(); onDone(); });
  const [f, bind, reset] = useForm({ outcome: 'answered' });
  const add = (e) => {
    e.preventDefault();
    run(async () => { await post(`/leads/${l.id}/calls`, f); reset(); }, 'Call logged');
  };
  return (
    <div className="card">
      <h3>Call records: {l.customer_name}</h3>
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={[
        ['When', (c) => new Date(c.created_at).toLocaleString()], ['By', (c) => c.user_name], ['Outcome', (c) => <Badge s={c.outcome} />],
        ['Note', (c) => c.note || '-'], ['Next call', (c) => (c.next_date ? String(c.next_date).slice(0, 10) : '-')],
      ]} />
      {canWrite && (
        <form onSubmit={add} style={{ marginTop: 12 }}>
          <label>Outcome
            <select {...bind('outcome')}>
              <option value="answered">Answered</option><option value="no_answer">No answer</option><option value="callback">Call back later</option>
              <option value="interested">Interested</option><option value="not_interested">Not interested</option><option value="other">Other</option>
            </select>
          </label>
          <label>Note<input {...bind('note')} /></label>
          <label>Next call date<input type="date" {...bind('next_date')} /></label>
          <button>Log call</button>
        </form>
      )}
    </div>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const can = useCan();
  const canWrite = can('leads', 2);
  const canAssign = ['owner', 'manager', 'telecaller'].includes(user.role);
  const [st, setSt] = useState('');
  const [service, setService] = useState('');
  const [open, setOpen] = useState(null);
  const query = new URLSearchParams(); if (st) query.set('status', st); if (service) query.set('service_type', service);
  const { data, error, reload } = useApi('/leads' + (query.toString() ? `?${query}` : ''));
  const tele = useApi(canAssign ? '/users/staff?role=telecaller' : null);
  const ags = useApi(canAssign ? '/agents' : null);
  const [msg, run] = useAction(reload);

  const setStatus = (l, status) => {
    const body = { status };
    if (status === 'lost') { const r = prompt('Reason for losing this lead?'); if (!r) return; body.lost_reason = r; }
    run(() => patch(`/leads/${l.id}/status`, body), 'Status updated');
  };
  const assign = (l, change) => run(() => patch(`/leads/${l.id}/assign`, { agent_id: l.agent_id || null, assigned_to: l.assigned_to || null, ...change }), 'Lead assigned');
  const pick = (v) => (v ? Number(v) : null);
  const accountantCols = [
    ['ID', (l) => `#${l.id}`],
    ['Customer Name', (l) => l.customer_name],
    ['Phone', (l) => l.phone || '-'],
    ['Service', (l) => SVC[l.service_type] || l.service_type || '-'],
    ['Customer Amount', (l) => inr(l.total_customer_payment)],
    ['Received', (l) => inr(l.amount_received)],
    ['Due', (l) => inr(l.pending_customer_payment)],
    ['Payment Status', (l) => <Badge s={l.customer_payment_status} />],
    ['Start Date', (l) => l.service_start_date ? String(l.service_start_date).slice(0, 10) : '-'],
    ['Service End Date', (l) => l.service_end_date ? String(l.service_end_date).slice(0, 10) : '-'],
  ];

  return (
    <Page accent="customers" title={user.role === 'accountant' ? 'Confirmed customer payments' : user.role === 'telecaller' || user.role === 'agent' ? 'My leads' : 'Customer lead pipeline'}
      sub={user.role === 'accountant' ? 'Confirmed customers with customer payments, caretaker salaries and agent commissions.' : user.role === 'telecaller' ? 'Only leads assigned to you are shown. Log every call.' : 'Follow up and confirm leads. Confirmed leads are turned into jobs by the Owner or Manager.'}>
      {user.role !== 'accountant' && <div className="tabs">
        {TABS.map((t) => <button key={t} className={st === t ? 'on' : ''} onClick={() => setSt(t)}>{t ? t.replace('_', ' ') : 'All'}</button>)}
      </div>}
      <div className="row filter-row" style={{ marginBottom: 12 }}><label>Service category<select value={service} onChange={(e) => setService(e.target.value)}><option value="">All services</option>{Object.entries(SVC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={user.role === 'accountant' ? accountantCols : [
        ['Customer', (l) => l.customer_name], ['Phone', (l) => l.phone], ['Location', (l) => l.address || l.area || '-'],
        ['Service', (l) => SVC[l.service_type]], ['Budget', (l) => inr(l.budget)],
        ...(user.role !== 'agent' ? [['Agent', (l) => (canAssign && !l.job_id ? (
          <select value={l.agent_id || ''} style={{ width: 140 }} onChange={(e) => assign(l, { agent_id: pick(e.target.value) })}>
            <option value="">None</option>{(ags.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>) : l.agent_name || '-')]] : []),
        ...(user.role !== 'agent' && user.role !== 'telecaller' ? [['Telecaller', (l) => (canAssign && !l.job_id ? (
          <select value={l.assigned_to || ''} style={{ width: 140 }} onChange={(e) => assign(l, { assigned_to: pick(e.target.value) })}>
            <option value="">None</option>{(tele.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>) : l.telecaller_name || '-')]] : []),
        ['Status', (l) => <Badge s={l.status} />],
        ['Action', (l) => (
          <span className="row">
            {canWrite && !l.job_id && (
              <select value={l.status} style={{ width: 120 }} onChange={(e) => setStatus(l, e.target.value)}>
                <option value="new">New</option><option value="follow_up">Follow-up</option><option value="confirmed">Confirmed</option><option value="lost">Lost</option>
              </select>
            )}
            <button className="sm grey" onClick={() => setOpen(open && open.id === l.id ? null : l)}>Calls ({l.calls})</button>
          </span>
        )],
        ['Job', (l) => (l.job_id ? 'Job created' : '-')],
      ]} />
      {open && <Calls key={open.id} l={open} canWrite={canWrite} onDone={reload} />}
    </Page>
  );
}
