import { useState } from 'react';
import { useApi, useAction, useForm, useCan, Page, Table, Alert, inr } from '../ui.jsx';
import { api, post } from '../api.js';

export default function Payments() {
  const can = useCan();
  const canWrite = can('payments', 2);
  const [agentId, setAgentId] = useState(''); const [caretakerId, setCaretakerId] = useState('');
  const filter = new URLSearchParams(); if (agentId) filter.set('agent_id', agentId); if (caretakerId) filter.set('caretaker_id', caretakerId);
  const { data, error, reload } = useApi('/payments' + (filter.toString() ? `?${filter}` : ''));
  const jobs = useApi(canWrite ? '/payments/jobs' : null);
  const payableJobs = (jobs.data || []).filter((j) => Number(j.pending_amount) > 0);
  const [msg, run] = useAction(reload);
  const [proof, setProof] = useState(null);
  const [f, bind, reset] = useForm({ method: 'upi', billing_month: new Date().toISOString().slice(0, 7), payment_date: new Date().toISOString().slice(0, 10) });
  const job = (jobs.data || []).find((j) => String(j.id) === String(f.job_id));
  const record = (e) => {
    e.preventDefault();
    run(async () => {
      const saved = await post('/payments', { job_id: Number(f.job_id), billing_month: f.billing_month, amount: Number(f.amount), method: f.method, reference_no: f.reference_no, payment_date: f.payment_date, next_due_date: f.next_due_date, remarks: f.remarks });
      if (proof) { const body = new FormData(); body.append('file', proof); await api('POST', `/payments/${saved.id}/proof`, body, true); }
      reset(); setProof(null);
    }, 'Payment recorded as pending. Verify it to generate the agent commission.');
  };
  return (
    <Page title="Customer Payments" sub={canWrite ? 'Money In · Record payments received from customers and verify them.' : 'View customer payment records'}>
      <div className="finance-direction-banner money-in"><span className="finance-direction-icon">↓</span><div><b>Money In</b><small>Customer pays Vivan Angels for the assigned care service.</small></div></div>
      {canWrite && (
        <div className="card payment-entry-card">
          <div className="payment-entry-heading"><div><h3>Customer Payment Entry</h3><span className="money-in-badge">Money In</span></div><span className="entry-label">Customer collection</span></div>
          {!payableJobs.length && <div className="alert ok" style={{ width: '100%', margin: '10px 0 16px' }}>All current customers are fully paid. Create a new active job or use a customer with a pending balance.</div>}
          <form onSubmit={record}>
            <label>Customer / Job
              <select {...bind('job_id')} required>
                <option value="">Select…</option>
                {payableJobs.map((j) => <option key={j.id} value={j.id}>#{j.id} {j.customer_name} — {j.agent_name || 'No agent'} ({inr(j.pending_amount)} due)</option>)}
              </select>
            </label>
            {job && <div className="payment-context"><div><small>Customer ID</small><b>CUS-{String(job.id).padStart(5, '0')}</b></div><div><small>Service ID</small><b>JOB-{String(job.id).padStart(5, '0')}</b></div><div><small>Customer Name</small><b>{job.customer_name}</b></div><div><small>Assigned Caretaker</small><b>{job.caretaker_name || '-'}</b></div></div>}
            {job && <div className="payment-summary"><div className="payment-summary-title"><b>Payment details</b><b>Amount</b></div><div><span>Total service charge</span><strong>{inr(job.customer_amount)}</strong></div><div><span>Amount received</span><strong>{inr(job.amount_received)}</strong></div><div><span>Balance pending</span><strong className="pending-text">{inr(job.pending_amount)}</strong></div></div>}
            <div className="payment-fields-title">Payment entry fields</div>
            <label>Billing month<input type="month" {...bind('billing_month')} required /></label>
            <label>Amount received (₹){job ? ` max ${inr(job.pending_amount)}` : ''}<input type="number" min="1" max={job && Number(job.pending_amount) > 0 ? job.pending_amount : undefined} {...bind('amount')} required /></label>
            <label>Payment date<input type="date" {...bind('payment_date')} required /></label>
            <label>Payment mode
              <select {...bind('method')}><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select>
            </label>
            <label>Transaction ID<input {...bind('reference_no')} placeholder="Required for UPI / bank transfer" /></label>
            <label>Upload payment screenshot<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setProof(e.target.files[0] || null)} /></label>
            <label>Next payment due date<input type="date" {...bind('next_due_date')} /></label>
            <label>Remarks<textarea {...bind('remarks')} /></label>
            <label>Payment status<input value={job && f.amount && Number(f.amount) >= Number(job.pending_amount) ? 'Paid' : f.amount ? 'Partially Paid' : 'Pending'} readOnly /></label>
            <button disabled={!job || Number(job.pending_amount) <= 0}>Record</button>
          </form>
          {job && <div className="payment-status-note"><Badge s={f.amount && Number(f.amount) >= Number(job.pending_amount) ? 'paid' : f.amount ? 'partially_paid' : 'pending'} /> Status is calculated automatically from the received amount.</div>}
        </div>
      )}
      <Alert err={error || msg.err} ok={msg.ok} />
      <div className="card filter-card"><h3>Find payment details</h3><div className="row filter-row"><label>Agent ID<input value={agentId} onChange={(e) => setAgentId(e.target.value.toUpperCase())} placeholder="e.g. AG0005" /></label><label>Caretaker ID<input type="number" min="1" value={caretakerId} onChange={(e) => setCaretakerId(e.target.value)} placeholder="e.g. 2" /></label><button className="grey" onClick={() => { setAgentId(''); setCaretakerId(''); }}>Clear filters</button></div></div>
      <Table rows={data} cols={[
        ['ID', (p) => `#${p.id}`],
        ['Customer Name', (p) => p.customer_name],
        ['Phone', (p) => p.phone || '-'],
        ['Service', (p) => p.service_type || '-'],
        ['Customer Amount', (p) => inr(p.customer_amount)],
        ['Received', (p) => inr(p.amount_received)],
        ['Due', (p) => inr(p.amount_due)],
        ['Payment Status', (p) => <span className={'badge b-' + (p.customer_payment_status || p.status)}>{String(p.customer_payment_status || p.status).replace('_', ' ')}</span>],
        ['Start Date', (p) => p.start_date ? String(p.start_date).slice(0, 10) : '-'],
        ['Service End Date', (p) => p.end_date ? String(p.end_date).slice(0, 10) : '-'],
      ]} />
    </Page>
  );
}
