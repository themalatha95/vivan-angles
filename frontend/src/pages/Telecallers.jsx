import { useApi, useAction, useForm, Page, Table, Badge, Alert } from '../ui.jsx';
import { post, patch } from '../api.js';

export default function Telecallers() {
  const { data, error, reload } = useApi('/users/telecallers');
  const [msg, run] = useAction(reload); const [f, bind, reset] = useForm({});
  const add = (e) => { e.preventDefault(); run(async () => { const r = await post('/users/telecallers', f); reset(); return r; }, (r) => `Telecaller created. Login: ${r.login_id}; temporary password: ${r.temp_password}`); };
  return <Page title="Telecaller management" sub="Create, activate and deactivate telecaller accounts">
    <div className="card"><h3>Add telecaller</h3><form onSubmit={add}><label>Name<input {...bind('name')} required /></label><label>Phone<input {...bind('phone')} required /></label><label>Login ID (optional)<input {...bind('email')} placeholder="caller02@vivanangels.com" /></label><label>Password (optional)<input type="password" {...bind('password')} minLength={8} /></label><button>Create telecaller</button></form></div>
    <Alert err={error || msg.err} ok={msg.ok} /><Table rows={data} cols={[['Name', (t) => t.name], ['Login ID', (t) => t.email], ['Phone', (t) => t.phone], ['Status', (t) => <Badge s={t.status} />], ['Last login', (t) => t.last_login_at ? new Date(t.last_login_at).toLocaleString() : 'Never'], ['', (t) => <button className="sm" onClick={() => run(() => patch(`/users/telecallers/${t.id}/status`, { status: t.status === 'active' ? 'inactive' : 'active' }), 'Status updated')}>{t.status === 'active' ? 'Deactivate' : 'Activate'}</button>]]} />
  </Page>;
}
