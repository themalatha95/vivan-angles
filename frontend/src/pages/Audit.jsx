import { useState } from 'react';
import { useApi, Page, Table, Badge, Alert } from '../ui.jsx';

export default function Audit() {
  const [tab, setTab] = useState('audit');
  const a = useApi(tab === 'audit' ? '/audit' : null);
  const l = useApi(tab === 'logins' ? '/audit/logins' : null);
  const t = (x) => new Date(x).toLocaleString();
  return (
    <Page title="Audit log" sub="Every change made in the system, and every login attempt. Records cannot be edited or deleted.">
      <div className="tabs">
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Actions</button>
        <button className={tab === 'logins' ? 'on' : ''} onClick={() => setTab('logins')}>Login history</button>
      </div>
      <Alert err={a.error || l.error} />
      {tab === 'audit' && <Table rows={a.data} cols={[
        ['When', (x) => t(x.created_at)], ['User', (x) => x.user_name || '-'], ['Role', (x) => (x.user_role ? <Badge s={x.user_role} /> : '-')],
        ['Action', (x) => x.action], ['Record', (x) => (x.entity_id ? `${x.entity} #${x.entity_id}` : x.entity)],
        ['Result', (x) => (x.status_code < 400 ? 'OK' : 'Blocked ' + x.status_code)], ['IP', (x) => x.ip || '-'],
      ]} />}
      {tab === 'logins' && <Table rows={l.data} cols={[
        ['When', (x) => t(x.created_at)], ['Login ID', (x) => x.login_id], ['Name', (x) => x.user_name || '-'],
        ['Result', (x) => (x.success ? <Badge s="approved" /> : <Badge s="rejected" />)], ['Reason', (x) => x.reason || '-'], ['IP', (x) => x.ip || '-'],
      ]} />}
    </Page>
  );
}
