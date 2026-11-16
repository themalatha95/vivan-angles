import { useEffect, useRef, useState } from 'react';
import { useApi, useAction, useForm, Page, Alert, SVC } from '../ui.jsx';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';

function AgentMultiSelect({ agents, value, onChange }) {
  const [open, setOpen] = useState(false); const box = useRef(null);
  useEffect(() => { const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const toggle = (id) => onChange(value.includes(String(id)) ? value.filter((x) => x !== String(id)) : [...value, String(id)]);
  const names = value.map((id) => (agents || []).find((a) => String(a.id) === id)?.name).filter(Boolean);
  return <div className="agent-multiselect position-relative" ref={box}>
    <button type="button" className="btn btn-outline-secondary dropdown-toggle w-100 text-start" onClick={() => setOpen(!open)}><span className="d-flex flex-wrap gap-1 align-items-center pe-3">{names.length ? names.map((name) => <span className="badge text-bg-primary" key={name}>{name}</span>) : <span className="text-secondary">Select agent(s)</span>}</span></button>
    {open && <div className="dropdown-menu show w-100 p-2 shadow-sm">
      {!agents?.length && <div className="text-muted small px-2 py-1">No active agents available</div>}
      {(agents || []).map((a) => <label className="dropdown-item form-check d-flex gap-2 align-items-center" key={a.id}><input className="form-check-input mt-0" type="checkbox" checked={value.includes(String(a.id))} onChange={() => toggle(a.id)} /><span>{a.name}</span></label>)}
      {names.length > 0 && <div className="border-top mt-2 pt-2 px-2 d-flex justify-content-between align-items-center"><span className="badge text-bg-primary">{names.length} selected</span><button type="button" className="btn btn-sm btn-link p-0" onClick={() => onChange([])}>Clear</button></div>}
    </div>}
  </div>;
}

export default function AddLead() {
  const { user } = useAuth();
  const staff = ['owner', 'manager'].includes(user.role);
  const canAssignAgent = ['owner', 'manager', 'telecaller'].includes(user.role);
  const tele = useApi(staff ? '/users/staff?role=telecaller' : null);
  const ags = useApi(canAssignAgent ? '/agents' : null);
  const [msg, run] = useAction();
  const [f, bind, reset] = useForm({ service_type: 'elderly_care' });
  const [assignedAgents, setAssignedAgents] = useState([]);
  const submit = (e) => {
    e.preventDefault();
    run(async () => { await post('/leads', { ...f, agent_ids: assignedAgents }); reset(); setAssignedAgents([]); }, 'Lead registered. Find it under Customer Leads.');
  };
  return (
    <Page title="Register customer lead" sub="Add a new customer enquiry">
      <div className="card">
        <form onSubmit={submit}>
          <label>Customer name<input {...bind('customer_name')} required /></label>
          <label>Phone<input {...bind('phone')} required /></label>
          <label>Address<input {...bind('address')} /></label>
          <label>Area<input {...bind('area')} /></label>
          <label>Service
            <select {...bind('service_type')}>{Object.entries(SVC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label>Monthly budget (₹)<input type="number" min="1" {...bind('budget')} required /></label>
          {(staff || canAssignAgent) && (
            <>
              <label>Assign to agent(s)<AgentMultiSelect agents={ags.data || []} value={assignedAgents} onChange={setAssignedAgents} /><small className="sub">Select one or more agents from the list.</small></label>
              {staff && <label>Assign to telecaller (optional)
                <select {...bind('assigned_to')}><option value="">None</option>{(tele.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </label>}
            </>
          )}
          <button>Register lead</button>
        </form>
        <Alert err={msg.err} ok={msg.ok} />
      </div>
    </Page>
  );
}
