import { useApi, useAction, Page, Badge, Alert, inr, SVC } from '../ui.jsx';
import { patch } from '../api.js';

export default function MyJobs() {
  const { data, error, reload } = useApi('/jobs');
  const [msg, run] = useAction(reload);
  return (
    <Page title="My jobs" sub="Accept assigned jobs and mark them complete">
      <Alert err={error || msg.err} ok={msg.ok} />
      {data && !data.length && <p className="empty">No jobs assigned to you yet.</p>}
      {(data || []).map((j) => (
        <div className="card" key={j.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{j.customer_name} <Badge s={j.status} /></h3>
            <b>{inr(j.caretaker_salary)} / month</b>
          </div>
          <p className="sub" style={{ margin: '0 0 12px' }}>
            {SVC[j.service_type]} · {j.customer_phone} · {j.address || j.area || 'Address not given'}{j.start_date ? ` · starts ${String(j.start_date).slice(0, 10)}` : ''}
          </p>
          {j.status === 'assigned' && <button onClick={() => run(() => patch(`/jobs/${j.id}/accept`), 'Job accepted')}>Accept job</button>}
          {['accepted', 'in_progress'].includes(j.status) && <button onClick={() => confirm('Mark this service as completed?') && run(() => patch(`/jobs/${j.id}/complete`), 'Job completed')}>Mark complete</button>}
        </div>
      ))}
    </Page>
  );
}
