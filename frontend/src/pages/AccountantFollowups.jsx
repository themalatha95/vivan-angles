import { useState } from 'react';
import { useApi, useAction, Page, Table, Badge, Alert, inr } from '../ui.jsx';
import { post, patch } from '../api.js';

export default function AccountantFollowups() {
  const [category, setCategory] = useState('');
  const { data, error, reload } = useApi(`/accountant/followups${category ? `?category=${category}` : ''}`);
  const [msg, run] = useAction(reload);
  const [f, setF] = useState({ category: 'customer', entity_name: '', pending_amount: '', follow_up_date: new Date().toISOString().slice(0, 10), contact_method: 'call', response: '', commitment_date: '', next_follow_up: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => { e.preventDefault(); run(() => post('/accountant/followups', { ...f, pending_amount: Number(f.pending_amount) }), 'Follow-up saved'); };
  return <Page title="Payment follow-ups" sub="Track customer, agent, and caretaker payment reminders.">
    <div className="card"><h2>Add follow-up</h2><form onSubmit={save}>
      <label>Person type<select value={f.category} onChange={set('category')}><option value="customer">Customer</option><option value="agent">Agent</option><option value="caretaker">Caretaker</option></select></label>
      <label>Name and ID<input value={f.entity_name} onChange={set('entity_name')} placeholder="Ramesh Kumar / CUS-00125" required /></label>
      <label>Pending amount (₹)<input type="number" min="0" value={f.pending_amount} onChange={set('pending_amount')} required /></label>
      <label>Follow-up date<input type="date" value={f.follow_up_date} onChange={set('follow_up_date')} required /></label>
      <label>Contact method<select value={f.contact_method} onChange={set('contact_method')}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Other</option></select></label>
      <label>Response<textarea value={f.response} onChange={set('response')} /></label><label>Commitment date<input type="date" value={f.commitment_date} onChange={set('commitment_date')} /></label><label>Next follow-up<input type="date" value={f.next_follow_up} onChange={set('next_follow_up')} /></label>
      <button>Save follow-up</button>
    </form></div>
    <div className="row" style={{ marginBottom: 12 }}><label>Filter category<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All</option><option value="customer">Customer</option><option value="agent">Agent</option><option value="caretaker">Caretaker</option></select></label></div>
    <Alert err={error || msg.err} ok={msg.ok} />
    <Table rows={data} cols={[
      ['Category', (x) => <Badge s={x.category} />], ['Name / ID', (x) => x.entity_name], ['Pending', (x) => inr(x.pending_amount)], ['Follow-up date', (x) => x.follow_up_date || 'Auto'], ['Next follow-up', (x) => x.next_follow_up || '-'], ['Contact', (x) => x.contact_method || '-'], ['Status', (x) => <Badge s={x.status} />], ['', (x) => x.id && <button className="sm" onClick={() => run(() => patch(`/accountant/followups/${x.id}/resolve`), 'Follow-up resolved')}>Resolve</button>],
    ]} />
  </Page>;
}
