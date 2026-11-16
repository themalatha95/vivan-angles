import { useApi, useAction, useForm, useCan, Page, Table, Badge, Alert, inr } from '../ui.jsx';
import { post, patch } from '../api.js';

export default function Agents() {
  const can = useCan();
  const canWrite = can('agents', 2);
  const { data, error, reload } = useApi('/agents');
  const [msg, run] = useAction(reload);
  const [f, bind, reset] = useForm({ commission_rate_pct: 10 });
  const add = (e) => {
    e.preventDefault();
    const body = { name: f.name, phone: f.phone, area: f.area, commission_rate_pct: f.commission_rate_pct };
    if (f.password) body.password = f.password;
    run(async () => { const r = await post('/agents', body); reset(); return r; },
      (r) => `Agent created. Login ID: ${r.login_id}  Temporary password: ${r.temp_password} (shown once)`);
  };
  return (
    <Page title="Agents" accent="agents" sub={canWrite ? 'Create and manage sales agents' : 'Agent directory (view only)'}>
      {canWrite && (
        <div className="card">
          <h3>Add new agent</h3>
          <form onSubmit={add}>
            <label>Name<input {...bind('name')} required /></label>
            <label>Phone<input {...bind('phone')} required /></label>
            <label>Area<input {...bind('area')} /></label>
            <label>Commission %<input type="number" step="0.5" {...bind('commission_rate_pct')} /></label>
            <label>Password (blank = automatic)<input type="password" {...bind('password')} minLength={8} /></label>
            <button>Create agent</button>
          </form>
        </div>
      )}
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={[
        ['Code', (a) => a.agent_code], ['Name', (a) => a.name], ['Login ID', (a) => a.login_id || '-'], ['Phone', (a) => a.phone], ['Area', (a) => a.area || '-'],
        ['Rate', (a) => (a.commission_rate_pct != null ? a.commission_rate_pct + '%' : '-')],
        ['Leads', (a) => `${a.confirmed_leads}/${a.total_leads} confirmed`], ['Caretakers', (a) => a.caretakers_registered], ['Working', (a) => a.caretakers_working], ['Not working', (a) => a.caretakers_not_working],
        ['Commission earned', (a) => (a.total_commission != null ? inr(a.total_commission) : '-')],
        ['Status', (a) => <Badge s={a.status} />],
        ['', (a) => canWrite && (
          <button className={'sm ' + (a.status === 'active' ? 'red' : '')}
            onClick={() => run(() => patch(`/agents/${a.id}/status`, { status: a.status === 'active' ? 'inactive' : 'active' }), 'Updated')}>
            {a.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        )],
      ]} />
    </Page>
  );
}
