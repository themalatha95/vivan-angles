import { useApi, useAction, useForm, Page, Table, Badge, Alert } from '../ui.jsx';
import { post, patch } from '../api.js';

export default function Users() {
  const { data, error, reload } = useApi('/users');
  const [msg, run] = useAction(reload);
  const [f, bind, reset] = useForm({ role: 'manager' });
  const add = (e) => {
    e.preventDefault();
    const body = { name: f.name, phone: f.phone, role: f.role };
    if (f.email) body.email = f.email;
    if (f.password) body.password = f.password;
    run(async () => { const r = await post('/users', body); reset(); return r; },
      (r) => `Account created. Login ID: ${r.login_id}  Temporary password: ${r.temp_password}  (shown once; the employee must change it at first login)`);
  };
  return (
    <Page title="User management" sub="Create, deactivate and reset employee accounts. Only the Owner can do this.">
      <div className="card">
        <h3>Add employee</h3>
        <form onSubmit={add}>
          <label>Name<input {...bind('name')} required /></label>
          <label>Phone<input {...bind('phone')} required /></label>
          <label>Role
            <select {...bind('role')}>
              <option value="manager">Operations Manager</option><option value="telecaller">Telecaller / Support</option><option value="accountant">Accountant / Finance</option>
            </select>
          </label>
          <label>Login ID (blank = automatic)<input {...bind('email')} placeholder="caller02@vivanangels.com" /></label>
          <label>Password (blank = automatic)<input type="password" {...bind('password')} minLength={8} /></label>
          <button>Create account</button>
        </form>
        <p className="sub" style={{ margin: '10px 0 0' }}>Agents are created on the Agents page. Caretaker logins are created when a caretaker is approved.</p>
      </div>
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={[
        ['Name', (u) => u.name], ['Login ID', (u) => u.email || u.phone], ['Phone', (u) => u.phone], ['Role', (u) => <Badge s={u.role} />],
        ['Status', (u) => <Badge s={u.status} />], ['2FA', (u) => (u.totp_enabled ? 'On' : 'Off')],
        ['Last login', (u) => (u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never')],
        ['', (u) => u.role !== 'owner' && (
          <span className="row">
            <button className="sm grey" onClick={() => confirm(`Reset password for ${u.name}?`) && run(() => post(`/users/${u.id}/reset-password`),
              (r) => `New temporary password for ${u.name}: ${r.temp_password} (shown once)`)}>Reset password</button>
            <button className={'sm ' + (u.status === 'active' ? 'red' : '')}
              onClick={() => run(() => patch(`/users/${u.id}/status`, { status: u.status === 'active' ? 'inactive' : 'active' }), 'Updated')}>
              {u.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
          </span>
        )],
      ]} />
    </Page>
  );
}
