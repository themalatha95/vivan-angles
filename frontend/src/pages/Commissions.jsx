import { useMemo, useState } from 'react';
import { useApi, useAction, useCan, Page, Table, Badge, Alert, Stat, inr } from '../ui.jsx';
import { api, patch } from '../api.js';
import { useAuth } from '../auth.jsx';

const today = new Date().toISOString().slice(0, 10);

function paymentState(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paid = rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
  if (!total || paid <= 0) return 'pending';
  if (paid >= total) return 'paid';
  return 'partially_paid';
}

export default function Commissions() {
  const { user } = useAuth();
  const isAgent = user.role === 'agent';
  const can = useCan();
  const canWrite = can('commission', 2);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [paying, setPaying] = useState(null);
  const [proof, setProof] = useState(null);
  const [payment, setPayment] = useState({ amount: '', payment_date: today, method: 'upi', reference_no: '', remarks: '' });
  const agents = useApi(isAgent ? null : '/agents');
  const commissions = useApi(`/commissions?month=${month}`);
  const salaries = useApi(isAgent ? null : `/salary?month=${month}`);
  const [msg, run] = useAction(() => { agents.reload(); commissions.reload(); salaries.reload(); });
  const commissionRows = commissions.data || [];
  const salaryRows = salaries.data || [];

  const agentSource = agents.data || (isAgent ? [{ id: user.agentId, name: user.name, agent_code: 'My account' }] : []);
  const summaries = useMemo(() => agentSource.map((agent) => {
    const ownCommissions = commissionRows.filter((row) => Number(row.agent_id) === Number(agent.id));
    const ownSalaries = salaryRows.filter((row) => Number(row.agent_id) === Number(agent.id));
    const caretakerIds = new Set([...ownCommissions.map((row) => row.caretaker_id), ...ownSalaries.map((row) => row.caretaker_id)].filter(Boolean));
    return { ...agent, working_caretakers: Number(agent.caretakers_working || caretakerIds.size), salary_total: ownSalaries.reduce((sum, row) => sum + Number(row.amount || 0), 0), commission_total: ownCommissions.reduce((sum, row) => sum + Number(row.amount || 0), 0), commission_status: paymentState(ownCommissions) };
  }), [agentSource, commissionRows, salaryRows]);

  const totals = useMemo(() => ({
    agents: summaries.length,
    caretakers: summaries.reduce((sum, row) => sum + Number(row.working_caretakers || 0), 0),
    salaries: salaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    commission: commissionRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }), [summaries, salaryRows, commissionRows]);

  const updatePayment = (name) => (e) => setPayment((value) => ({ ...value, [name]: e.target.value }));
  const openPayment = (commission) => { setPaying(commission); setProof(null); setPayment({ amount: String(commission.pending_amount || 0), payment_date: today, method: 'upi', reference_no: '', remarks: '' }); };
  const submitPayment = (event) => { event.preventDefault(); run(async () => { await patch(`/commissions/${paying.id}/pay`, { ...payment, amount: Number(payment.amount) }); if (proof) { const body = new FormData(); body.append('file', proof); await api('POST', `/commissions/${paying.id}/proof`, body, true); } setPaying(null); }, 'Commission payment recorded'); };

  if (selectedAgent) {
    const ownCommissions = commissionRows.filter((row) => Number(row.agent_id) === Number(selectedAgent.id));
    const ownSalaries = salaryRows.filter((row) => Number(row.agent_id) === Number(selectedAgent.id));
    const caretakerIds = [...new Set([...ownCommissions.map((row) => row.caretaker_id), ...ownSalaries.map((row) => row.caretaker_id)].filter(Boolean))];
    const caretakers = caretakerIds.map((id) => {
      const salary = ownSalaries.find((row) => Number(row.caretaker_id) === Number(id));
      const commission = ownCommissions.filter((row) => Number(row.caretaker_id) === Number(id));
      return { id, caretaker_name: salary?.caretaker_name || commission[0]?.caretaker_name || '-', salary: salary?.amount || 0, salary_status: salary?.payment_status || 'pending', commission: commission.reduce((sum, row) => sum + Number(row.amount || 0), 0), commission_rows: commission };
    });
    return <Page title={`${selectedAgent.name} · Agent Details`} sub={`${selectedAgent.agent_code} · Monthly financial details for ${month}`}>
      <button className="ghost" onClick={() => setSelectedAgent(null)}>← Back to Agent Overview</button>
      <div className="grid" style={{ margin: '14px 0' }}><Stat label="Working caretakers" value={caretakers.length} /><Stat label="Salary total" value={inr(ownSalaries.reduce((sum, row) => sum + Number(row.amount || 0), 0))} /><Stat label="Agent commission" value={inr(ownCommissions.reduce((sum, row) => sum + Number(row.amount || 0), 0))} /><Stat label="Commission status" value={paymentState(ownCommissions).replace('_', ' ')} /></div>
      <div className="card filter-card"><div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}><h2 style={{ margin: 0 }}>Caretaker financial details</h2><label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div></div>
      <Table rows={caretakers} cols={[
        ['Caretaker', (row) => `${row.caretaker_name} (#${row.id})`], ['Monthly salary', (row) => inr(row.salary)], ['Salary status', (row) => <Badge s={row.salary_status} />], ['Commission', (row) => inr(row.commission)], ['Commission status', (row) => <Badge s={paymentState(row.commission_rows)} />],
        ...(canWrite ? [['', (row) => <span className="row">{row.commission_rows.filter((c) => c.status === 'approved' && Number(c.pending_amount) > 0).map((c) => <button className="sm" key={c.id} onClick={() => openPayment(c)}>Pay commission</button>)}</span>]] : []),
      ]} />
      {paying && <div className="card payment-entry-card"><h2>Pay agent commission</h2><p className="sub">{paying.agent_name} · {paying.caretaker_name} · Balance {inr(paying.pending_amount)}</p><form onSubmit={submitPayment}><label>Payment amount (₹)<input type="number" min="1" max={paying.pending_amount} value={payment.amount} onChange={updatePayment('amount')} required /></label><label>Payment date<input type="date" value={payment.payment_date} onChange={updatePayment('payment_date')} required /></label><label>Payment mode<select value={payment.method} onChange={updatePayment('method')}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="other">Other</option></select></label><label>Transaction reference<input value={payment.reference_no} onChange={updatePayment('reference_no')} /></label><label>Payment proof<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setProof(e.target.files[0] || null)} /></label><label>Remarks<textarea value={payment.remarks} onChange={updatePayment('remarks')} /></label><span className="row"><button type="submit">Submit commission payment</button><button type="button" className="grey" onClick={() => setPaying(null)}>Cancel</button></span></form></div>}
      <Alert err={agents.error || commissions.error || salaries.error || msg.err} ok={msg.ok} />
    </Page>;
  }

  return <Page title="Agent Overview" sub="Monthly agent salary and commission payment summary.">
    <div className="finance-direction-banner commission-out"><span className="finance-direction-icon">↑</span><div><b>Agent Payments</b><small>Click an agent to view all caretakers, salaries, payment statuses, and commissions.</small></div></div>
    <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}><label>Payment month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div>
    <div className="grid" style={{ marginBottom: 18 }}><Stat label="Total agents" value={totals.agents} /><Stat label="Working caretakers" value={totals.caretakers} /><Stat label="Total salaries" value={inr(totals.salaries)} /><Stat label="Agent commission" value={inr(totals.commission)} /></div>
    <h2>Agent List</h2>
    <div className="agent-overview-list">{summaries.map((agent) => <div className="agent-overview-card card" key={agent.id}><div className="agent-overview-head"><div><span className="agent-avatar">♙</span><span><b>{agent.name}</b><small>{agent.agent_code}</small></span></div><Badge s={agent.commission_status} /></div><div className="agent-overview-metrics"><div><small>Caretakers</small><b>{agent.working_caretakers}</b></div><div><small>Salary total</small><b>{inr(agent.salary_total)}</b></div><div><small>Commission</small><b>{inr(agent.commission_total)}</b></div></div><button className="agent-details-button" onClick={() => setSelectedAgent(agent)}>View Agent Details <span>→</span></button></div>)}</div>
    <Alert err={agents.error || commissions.error || salaries.error || msg.err} ok={msg.ok} />
  </Page>;
}
