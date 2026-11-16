import { useState } from 'react';
import { useApi, useAction, useCan, Page, Table, Badge, Alert, inr } from '../ui.jsx';
import { post, patch } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Salary() {
  const can = useCan();
  const { user } = useAuth();
  const canWrite = can('salary', 2);
  const canPrepare = ['owner', 'manager'].includes(user.role);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [agentId, setAgentId] = useState(''); const [caretakerId, setCaretakerId] = useState('');
  const [caretakerName, setCaretakerName] = useState(''); const [agentName, setAgentName] = useState(''); const [customerName, setCustomerName] = useState(''); const [paymentStatus, setPaymentStatus] = useState('');
  const salaryQuery = new URLSearchParams({ month }); if (agentId) salaryQuery.set('agent_id', agentId); if (caretakerId) salaryQuery.set('caretaker_id', caretakerId); if (caretakerName) salaryQuery.set('caretaker_name', caretakerName); if (agentName) salaryQuery.set('agent_name', agentName); if (customerName) salaryQuery.set('customer_name', customerName); if (paymentStatus) salaryQuery.set('payment_status', paymentStatus);
  const list = useApi(`/salary?${salaryQuery}`);
  const due = useApi(canPrepare ? `/salary/due?month=${month}` : null);
  const history = useApi(`/salary/history?month=${month}${agentId ? `&agent_id=${agentId}` : ''}${caretakerId ? `&caretaker_id=${caretakerId}` : ''}`);
  const [paying, setPaying] = useState(null);
  const [payoutLink, setPayoutLink] = useState(null);
  const [payment, setPayment] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'upi', reference_no: '', remarks: '' });
  const reloadAll = () => { list.reload(); due.reload(); history.reload(); };
  const [msg, run] = useAction(reloadAll);
  const updatePayment = (name) => (e) => setPayment((p) => ({ ...p, [name]: e.target.value }));
  const openPayment = (s) => {
    setPaying(s);
    setPayoutLink(s.provider_payout_id ? { payout_id: s.provider_payout_id, payout_url: s.payout_url, status: s.provider_status } : null);
    setPayment({ amount: String(s.pending_amount || 0), payment_date: new Date().toISOString().slice(0, 10), method: 'upi', reference_no: '', remarks: '' });
  };
  const createPayoutLink = () => run(async () => {
    const result = await post(`/salary/${paying.id}/payout-link`);
    setPayoutLink(result);
  }, 'Secure payout link created. Share it with the caretaker.');
  const checkPayoutStatus = () => run(async () => {
    const result = await post(`/salary/${paying.id}/payout-status`);
    setPayoutLink((current) => ({ ...(current || {}), ...result }));
  }, 'Transfer status refreshed.');
  const submitPayment = (e) => {
    e.preventDefault();
    run(async () => {
      await patch(`/salary/${paying.id}/pay`, { ...payment, amount: Number(payment.amount) });
      setPaying(null);
    }, 'Caretaker salary payment recorded');
  };
  const totals = (list.data || []).reduce((a, s) => ({ approved: a.approved + Number(s.amount || 0), paid: a.paid + Number(s.amount_paid || 0), pending: a.pending + Number(s.pending_amount || 0), paidCount: a.paidCount + (s.payment_status === 'paid' ? 1 : 0), partialCount: a.partialCount + (s.payment_status === 'partially_paid' ? 1 : 0), pendingCount: a.pendingCount + (s.payment_status === 'pending' ? 1 : 0) }), { approved: 0, paid: 0, pending: 0, paidCount: 0, partialCount: 0, pendingCount: 0 });
  return (
    <Page title="Caretaker Payments" sub={canPrepare ? 'Prepare and approve salary statements.' : canWrite ? 'Money Out · Process approved caretaker salary payments.' : 'View caretaker salary records'}>
      <div className="finance-direction-banner money-out"><span className="finance-direction-icon">↑</span><div><b>Money Out · Caretaker Salary</b><small>Vivan Angels pays the caretaker after Manager approval.</small></div></div>
      <div className="grid" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-v">{list.data ? new Set(list.data.map((s) => s.caretaker_id)).size : 0}</div><div className="stat-l">Total caretakers</div></div>
        <div className="stat"><div className="stat-v">{inr(totals.approved)}</div><div className="stat-l">Approved salary</div></div>
        <div className="stat good"><div className="stat-v">{inr(totals.paid)}</div><div className="stat-l">Salary paid</div></div>
        <div className="stat bad"><div className="stat-v">{inr(totals.pending)}</div><div className="stat-l">Pending salary</div></div>
        <div className="stat"><div className="stat-v">{totals.paidCount}</div><div className="stat-l">Fully paid</div></div>
        <div className="stat"><div className="stat-v">{totals.partialCount}</div><div className="stat-l">Partially paid</div></div>
        <div className="stat"><div className="stat-v">{totals.pendingCount}</div><div className="stat-l">Pending payments</div></div>
      </div>
      <div className="row filter-row" style={{ marginBottom: 12 }}>
        <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label>Agent ID<input value={agentId} onChange={(e) => setAgentId(e.target.value.toUpperCase())} placeholder="e.g. AG0005" /></label>
        <label>Caretaker ID<input type="number" min="1" value={caretakerId} onChange={(e) => setCaretakerId(e.target.value)} placeholder="e.g. 2" /></label>
        <label>Caretaker name<input value={caretakerName} onChange={(e) => setCaretakerName(e.target.value)} /></label>
        <label>Agent name<input value={agentName} onChange={(e) => setAgentName(e.target.value)} /></label>
        <label>Customer<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label>
        <label>Status<select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option></select></label>
        <button className="grey" onClick={() => { setAgentId(''); setCaretakerId(''); setCaretakerName(''); setAgentName(''); setCustomerName(''); setPaymentStatus(''); }}>Clear filters</button>
      </div>
      <Alert err={list.error || due.error || msg.err} ok={msg.ok} />
      {paying && (
        <div className="card">
          <h2>Pay caretaker salary</h2>
          <p className="sub">Record a full or partial salary payment. The remaining balance is updated automatically.</p>
          <div className="card" style={{ margin: '12px 0', padding: 12 }}>
            <b>{paying.caretaker_name}</b> (Caretaker ID: {paying.caretaker_id}) · Agent: {paying.agent_name || '-'} · Customer: {paying.customer_name || '-'}<br />
            Salary month: {paying.salary_month} · Approved salary: {inr(paying.amount)} · Already paid: {inr(paying.amount_paid)} · Pending: {inr(paying.pending_amount)}
          </div>
          {payoutLink && <div className="alert ok"><b>RazorpayX status: {payoutLink.status || 'issued'}</b>{payoutLink.payout_url && <><br /><a href={payoutLink.payout_url} target="_blank" rel="noreferrer">Open/share caretaker payout link</a></>}<br /><button type="button" className="sm" onClick={checkPayoutStatus}>Check transfer status</button></div>}
          <form onSubmit={submitPayment}>
            <label>Payment amount (₹)<input type="number" min="1" max={paying.pending_amount} value={payment.amount} onChange={updatePayment('amount')} required /></label>
            <label>Payment date<input type="date" value={payment.payment_date} onChange={updatePayment('payment_date')} required /></label>
            <label>Payment mode<select value={payment.method} onChange={updatePayment('method')}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option><option value="other">Other</option></select></label>
            <label>Transaction reference<input value={payment.reference_no} onChange={updatePayment('reference_no')} placeholder="Required for UPI / bank transfer" /></label>
            <label>Remarks<textarea value={payment.remarks} onChange={updatePayment('remarks')} /></label>
            <span className="row"><button type="button" onClick={createPayoutLink}>Transfer to caretaker bank/UPI</button><button type="submit">Record manual payment</button><button type="button" className="grey" onClick={() => setPaying(null)}>Cancel</button></span>
            <small className="sub">Transfer uses RazorpayX. The caretaker enters bank/UPI details through the secure link. Manual payment records cash or an already-completed transfer.</small>
          </form>
        </div>
      )}
      {canPrepare && (
        <>
          <h2>Salary still to be prepared</h2>
          <Table rows={(due.data || []).map((d) => ({ ...d, id: d.job_id }))} cols={[
            ['Job', (d) => '#' + d.job_id], ['Caretaker', (d) => d.caretaker_name], ['Customer', (d) => d.customer_name],
            ['Monthly salary', (d) => inr(d.caretaker_salary)], ['Calendar days', (d) => d.calendar_days], ['Present', (d) => d.days_present], ['Absent', (d) => d.days_absent], ['Leave', (d) => d.days_leave], ['Payable', (d) => inr(d.salary_payable)],
            ['', (d) => <button className="sm" onClick={() => run(() => post('/salary', { job_id: d.job_id, salary_month: month, amount: Number(d.salary_payable || d.caretaker_salary || 0) }), 'Salary statement created')}>Create statement</button>],
          ]} />
        </>
      )}
      <h2>Salary statements</h2>
      <Table rows={list.data} cols={[
        ['Month', (s) => s.salary_month], ['Agent', (s) => s.agent_name ? `${s.agent_name} (#${s.agent_id})` : '-'], ['Caretaker', (s) => `${s.caretaker_name} (#${s.caretaker_id})`], ['Customer', (s) => s.customer_name], ['Salary payable', (s) => inr(s.amount)], ['Paid', (s) => inr(s.amount_paid)], ['Pending', (s) => inr(s.pending_amount)],
        ['Attendance', (s) => `${s.present_days || 0} present`], ['Approval', (s) => <Badge s={s.approval_status || 'pending'} />], ['Payment', (s) => <Badge s={s.payment_status || s.status} />], ['Payment date', (s) => s.payment_date || s.paid_at || '-'], ['Reference', (s) => s.reference_no || '-'],
        ['', (s) => <span className="row">{['owner', 'manager'].includes(user.role) && s.approval_status === 'pending' && <button className="sm" onClick={() => run(() => patch(`/salary/${s.id}/approve`), 'Salary approved')}>Approve salary</button>}{['owner', 'accountant'].includes(user.role) && s.status === 'pending' && s.approval_status === 'approved' && <button className="sm" onClick={() => openPayment(s)}>Pay salary</button>}</span>],
      ]} />
      <h2>Salary payment history</h2>
      <Table rows={history.data} cols={[
        ['Transaction', (h) => `#${h.transaction_id}`], ['Caretaker', (h) => `${h.caretaker_name} (#${h.caretaker_id})`], ['Agent', (h) => h.agent_name ? `${h.agent_name} (${h.agent_code || h.agent_id})` : '-'], ['Customer', (h) => h.customer_name], ['Month', (h) => h.salary_month], ['Payment', (h) => inr(h.payment_amount)], ['Date', (h) => h.payment_date], ['Mode', (h) => h.method], ['Reference', (h) => h.reference_no || '-'], ['Status', (h) => <Badge s={h.payment_status} />], ['Remarks', (h) => h.remarks || '-'],
      ]} />
    </Page>
  );
}
