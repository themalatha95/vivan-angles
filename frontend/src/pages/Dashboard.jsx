import { useApi, Page, Stat, Alert, inr } from '../ui.jsx';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const TITLES = { owner: 'Owner Dashboard', manager: 'Operations Dashboard', telecaller: 'Telecaller Dashboard', accountant: 'Finance Dashboard', agent: 'Agent Dashboard' };

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error } = useApi('/reports/dashboard');
  const accountantSection = data?.sections?.find((s) => s.title === 'Accountant financial summary');
  const value = (label) => accountantSection?.stats?.find((x) => x.label === label)?.value || 0;
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date());
  if (user.role === 'accountant') return (
    <Page title="Finance Dashboard" sub={`Monthly financial overview · ${monthLabel}`}>
      <Alert err={error} />
      <div className="accountant-overview-grid">
        <div className="overview-card received"><span>Customer Payments Received</span><strong>{inr(value('Total customer collections'))}</strong><small>Money received from customers</small></div>
        <div className="overview-card caretaker"><span>Caretaker Payments</span><strong>{inr(value('Paid caretaker salaries'))}</strong><small>Salary paid to caretakers</small></div>
        <div className="overview-card commission"><span>Agent Commission</span><strong>{inr(value('Paid agent commissions'))}</strong><small>Commission paid to agents</small></div>
        <div className="overview-card pending"><span>Pending Payments</span><strong>{inr(Number(value('Pending customer payments')) + Number(value('Pending agent commissions')) + Number(value('Pending caretaker salaries')))}</strong><small>Customer, agent and caretaker balances</small></div>
      </div>
      <div className="card quick-actions-card screenshot-actions"><div className="quick-actions-heading"><div><h2>Quick Actions</h2><p>Common finance tasks for today</p></div><span className="quick-actions-count">4 shortcuts</span></div><div className="row g-3 quick-actions-grid">
        <Link className="quick-action col-12 col-sm-6 col-xl-3" to="/payments"><span className="quick-action-icon money-icon">＋</span><span><b>Add Payment</b><small>Record customer money received</small></span></Link>
        <Link className="quick-action col-12 col-sm-6 col-xl-3" to="/payments"><span className="quick-action-icon receipt-icon">▤</span><span><b>Payment Receipt</b><small>View payment history</small></span></Link>
        <Link className="quick-action col-12 col-sm-6 col-xl-3" to="/commissions"><span className="quick-action-icon agent-icon">▣</span><span><b>Agent Payments</b><small>Track commission balances</small></span></Link>
        <Link className="quick-action col-12 col-sm-6 col-xl-3" to="/accountant-followups"><span className="quick-action-icon follow-icon">◷</span><span><b>Follow-ups</b><small>Manage outstanding payments</small></span></Link>
      </div><p className="dashboard-note">Figures update from verified customer payments and recorded salary and commission transactions.</p></div>
      {(data?.sections || []).filter((s) => s.title !== 'Accountant financial summary').map((s) => <div key={s.title}><h2>{s.title}</h2><div className="grid">{s.stats.map((x) => <Stat key={x.label} label={x.label} value={x.money ? inr(x.value) : x.value} tone={x.tone} />)}</div></div>)}
    </Page>
  );
  return (
    <Page title={TITLES[user.role] || 'Dashboard'} sub={`Welcome, ${user.name}.${user.last_login_at ? ' Last login: ' + new Date(user.last_login_at).toLocaleString() : ''}`}>
      <Alert err={error} />
      {(data ? data.sections : []).map((s) => (
        <div key={s.title}>
          <h2>{s.title}</h2>
          <div className="grid">{s.stats.map((x) => <Stat key={x.label} label={x.label} value={x.money ? inr(x.value) : x.value} tone={x.tone} />)}</div>
        </div>
      ))}
    </Page>
  );
}
