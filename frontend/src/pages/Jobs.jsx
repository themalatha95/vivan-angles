import { useEffect } from 'react';
import { useApi, useAction, useForm, useCan, Page, Table, Badge, Alert, Stat, inr, SVC } from '../ui.jsx';
import { post, patch } from '../api.js';
import { useAuth } from '../auth.jsx';

function Allocate({ onDone, showMargin }) {
  const leads = useApi('/leads?status=confirmed');
  const cts = useApi('/caretakers?status=approved&availability=available');
  const ags = useApi('/agents');
  const [f, bind, reset, setForm] = useForm({});
  const [msg, run] = useAction(onDone);
  const free = (leads.data || []).filter((l) => !l.job_id);
  const lead = free.find((l) => String(l.id) === String(f.lead_id));
  const agent = lead && (ags.data || []).find((a) => a.id === lead.agent_id);
  const eligibleCaretakers = (cts.data || []).filter((c) => {
    if (!lead) return false;
    const services = String(c.services || c.service_type || '').split(',');
    return String(c.registered_by) === String(lead.agent_id) && services.includes(lead.service_type);
  });
  useEffect(() => {
    if (lead) setForm((current) => ({ ...current, customer_amount: String(lead.budget || ''), caretaker_id: '' }));
  }, [lead?.id]);
  const customer = Number(f.customer_amount || (lead ? lead.budget : 0));
  const salary = Number(f.caretaker_salary || 0);
  const suggestedCommission = lead && agent ? Math.round(customer * agent.commission_rate_pct) / 100 : 0; // no agent = no commission
  const commission = f.agent_commission !== undefined && f.agent_commission !== '' ? Number(f.agent_commission) : suggestedCommission;
  const margin = customer - salary - commission;
  const submit = (e) => {
    e.preventDefault();
    const body = { lead_id: Number(f.lead_id), caretaker_id: Number(f.caretaker_id), caretaker_salary: salary, agent_commission: commission };
    if (f.customer_amount) body.customer_amount = Number(f.customer_amount);
    if (f.start_date) body.start_date = f.start_date;
    run(async () => { await post('/jobs', body); reset(); leads.reload(); cts.reload(); }, 'Job created and caretaker assigned');
  };
  return (
    <div className="card">
      <h3>Convert confirmed lead into a job</h3>
      <form onSubmit={submit}>
        <label>Confirmed lead
          <select {...bind('lead_id')} required>
            <option value="">Select…</option>
            {free.map((l) => <option key={l.id} value={l.id}>{l.customer_name} ({SVC[l.service_type]}, {inr(l.budget)})</option>)}
          </select>
        </label>
        <label>Telecaller Name
          <input value={lead ? (lead.telecaller_name || 'Not assigned') : 'Select a confirmed lead'} readOnly />
        </label>
        <label>Assigned Agent Name
          <input value={lead ? (lead.agent_name || 'Not assigned') : 'Select a confirmed lead'} readOnly />
        </label>
        <label>Customer Name
          <input value={lead ? lead.customer_name : 'Select a confirmed lead'} readOnly />
        </label>
        <label>Verified, available caretaker
          <select {...bind('caretaker_id')} required>
            <option value="">Select…</option>
            {eligibleCaretakers.map((c) => <option key={c.id} value={c.id}>{c.name} ({SVC[c.service_type]})</option>)}
          </select>
          <small className="field-help">Showing approved, available caretakers matching this lead's agent and service.</small>
        </label>
        <label>Caretaker salary / month (₹)<input type="number" min="0" {...bind('caretaker_salary')} required /></label>
        <label>Agent commission (₹)<input type="number" min="0" step="0.01" value={f.agent_commission ?? ''} placeholder={suggestedCommission ? String(suggestedCommission) : '0'} onChange={(e) => bind('agent_commission').onChange(e)} /></label>
        <label>Customer amount (₹, from lead budget)<input type="number" min="0" value={f.customer_amount ?? (lead ? lead.budget : '')} onChange={bind('customer_amount').onChange} /></label>
        <label>Start date<input type="date" {...bind('start_date')} /></label>
        <button disabled={!lead || margin < 0}>Create job</button>
      </form>
      {lead && (
        <div className="preview">
          <Stat label="Customer pays" value={inr(customer)} />
          <Stat label="Caretaker salary" value={inr(salary)} />
          <Stat label={agent ? `Suggested commission (${agent.commission_rate_pct}%)` : 'Agent commission (no agent)'} value={inr(commission)} />
          {showMargin
            ? <Stat label="Company margin" value={inr(margin)} tone={margin < 0 ? 'bad' : 'good'} />
            : <Stat label="Margin check" value={margin < 0 ? 'Too low' : 'OK'} tone={margin < 0 ? 'bad' : 'good'} />}
        </div>
      )}
      <Alert err={msg.err || leads.error || cts.error} ok={msg.ok} />
    </div>
  );
}

export default function Jobs() {
  const { user } = useAuth();
  const can = useCan();
  const canAlloc = can('jobs', 2);
  const role = user.role;
  const { data, error, reload } = useApi('/jobs');
  const [msg, run] = useAction(reload);
  return (
    <Page title={canAlloc ? 'Job allocation' : 'My jobs'} sub={canAlloc ? 'Turn confirmed leads into jobs and assign verified caretakers' : 'Jobs created from your confirmed leads'}>
      {canAlloc && <Allocate onDone={reload} showMargin={role === 'owner'} />}
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={[
        ['Job', (j) => '#' + j.id], ['Customer', (j) => j.customer_name], ['Service', (j) => SVC[j.service_type]], ['Caretaker', (j) => j.caretaker_name || '-'],
        ...(role !== 'agent' ? [['Agent', (j) => j.agent_name || '-'], ['Customer pays', (j) => inr(j.customer_amount)], ['Salary', (j) => inr(j.caretaker_salary)]] : []),
        ['Commission', (j) => inr(j.agent_commission)],
        ...(role === 'owner' ? [['Margin', (j) => inr(j.company_margin)]] : []),
        ['Status', (j) => <Badge s={j.status} />],
        ['', (j) => canAlloc && !['completed', 'cancelled'].includes(j.status) && (
          <button className="sm red" onClick={() => confirm('Cancel this job?') && run(() => patch(`/jobs/${j.id}/cancel`), 'Job cancelled')}>Cancel</button>
        )],
      ]} />
    </Page>
  );
}
