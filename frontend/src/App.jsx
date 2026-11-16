import { Routes, Route, Navigate, NavLink, Link } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Agents from './pages/Agents.jsx';
import Caretakers from './pages/Caretakers.jsx';
import Leads from './pages/Leads.jsx';
import AddLead from './pages/AddLead.jsx';
import Jobs from './pages/Jobs.jsx';
import Payments from './pages/Payments.jsx';
import Attendance from './pages/Attendance.jsx';
import Salary from './pages/Salary.jsx';
import Commissions from './pages/Commissions.jsx';
import Expenses from './pages/Expenses.jsx';
import Reports from './pages/Reports.jsx';
import Audit from './pages/Audit.jsx';
import Security from './pages/Security.jsx';
import MyJobs from './pages/MyJobs.jsx';
import CaretakerProfile from './pages/CaretakerProfile.jsx';
import Telecallers from './pages/Telecallers.jsx';
import AccountantFollowups from './pages/AccountantFollowups.jsx';
import AccountantDailyReport from './pages/AccountantDailyReport.jsx';

// [path, label, page, module needed, minimum level]. The menu only shows what the role may open;
// the backend independently enforces the same rules.
const PAGES = [
  ['/', 'Dashboard', Dashboard],
  ['/users', 'User management', Users, 'users', 3],
  ['/agents', 'Agents', Agents, 'agents', 1],
  ['/caretakers', 'Caretakers', Caretakers, 'caretakers', 1],
  ['/add-lead', 'Add Lead', AddLead, 'leads', 2],
  ['/leads', 'Customer Payments', Leads, 'leads', 1],
  ['/jobs', 'Job Allocation', Jobs, 'jobs', 1],
  ['/payments', 'Payments', Payments, 'payments', 1],
  ['/attendance', 'Attendance', Attendance, 'attendance', 1],
  ['/salary', 'Salary', Salary, 'salary', 1],
  ['/commissions', 'Commissions', Commissions, 'commission', 1],
  ['/expenses', 'Expenses', Expenses, 'expenses', 1],
  ['/reports', 'Reports', Reports, 'reports', 1],
  ['/audit', 'Audit log', Audit, 'users', 3],
  ['/security', 'My security', Security],
];
const LABEL = { agent: { '/caretakers': 'My Caretakers', '/leads': 'My Leads', '/jobs': 'My Jobs', '/commissions': 'My Commissions' },
                telecaller: { '/leads': 'My Leads' },
                accountant: { '/leads': 'Customer Payments', '/payments': 'Receipts & Transactions', '/salary': 'Caretaker Payments', '/commissions': 'Agent Payments', '/reports': 'Financial Reports' } };

function Shell() {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const p = user.permissions || {};
  const items = user.role === 'caretaker'
    ? [['/', 'My jobs', MyJobs], ['/caretaker-profile', 'My profile', CaretakerProfile], ['/security', 'My security', Security]]
    : PAGES.filter(([, , , m, l]) => !m || (p[m] || 0) >= l)
        .map(([path, label, C, m, l]) => [path, (LABEL[user.role] || {})[path] || label, C]);
  if (user.role === 'manager') items.splice(1, 0, ['/telecallers', 'Telecallers', Telecallers]);
  if (user.role === 'accountant') {
    items.push(['/accountant-followups', 'Payment Follow-ups', AccountantFollowups]);
    items.push(['/accountant-daily-report', 'Daily Finance Report', AccountantDailyReport]);
  }
  return (
    <div className="shell d-flex overflow-hidden">
      <aside>
        <div className="brand"><img src="/vivan-angels-logo.webp" alt="Vivan Angels" /><small>CARE • CONNECT • EARN</small></div>
        <nav>{items.map(([path, label]) => <NavLink key={path} to={path} end={path === '/'}>{label}</NavLink>)}</nav>
        <div className="who">
          <b>{user.name}</b><span className="role">{user.role}</span>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="d-flex flex-column overflow-hidden">
        <div className="app-topbar flex-shrink-0">
          <div><span className="topbar-kicker">VIVAN ANGELS</span><span className="topbar-title">Care & service workspace</span></div>
          <div className="topbar-user"><span className="role-chip">{user.role}</span><span>{user.name}</span></div>
        </div>
        <div className="app-content flex-grow-1 overflow-auto">
          {user.twofa_required && <div className="banner">The Owner account must turn on two-factor authentication. <Link to="/security">Set it up now</Link></div>}
          {user.must_change_password && <div className="banner">You are using a temporary password. <Link to="/security">Change it now</Link></div>}
          <Routes>
            {items.map(([path, , C]) => <Route key={path} path={path} element={<C />} />)}
            <Route path="/caretaker-profile/:id" element={<CaretakerProfile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Shell />} />
    </Routes>
  );
}
