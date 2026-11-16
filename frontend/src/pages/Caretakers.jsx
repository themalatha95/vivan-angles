import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAction, useForm, Page, Table, Badge, Alert, inr, SVC } from '../ui.jsx';
import { post, patch, api, openFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import CaretakerPhoto from '../components/CaretakerPhoto.jsx';

const REVIEW = ['owner', 'manager']; // only these roles verify documents and approve caretakers

function Docs({ c, role, onDone }) {
  const { data, error, reload } = useApi(`/caretakers/${c.id}/documents`);
  const [msg, run] = useAction(() => { reload(); onDone(); });
  const [f, bind] = useForm({ doc_type: 'aadhaar' });
  const [file, setFile] = useState(null);
  const upload = () => run(async () => {
    const fd = new FormData(); fd.append('doc_type', f.doc_type); fd.append('file', file);
    await api('POST', `/caretakers/${c.id}/documents`, fd, true); setFile(null);
  }, 'Document uploaded');
  return (
    <div className="card">
      <h3>Documents: {c.name}</h3>
      <Alert err={error || msg.err} ok={msg.ok} />
      <Table rows={data} cols={[
        ['Type', (d) => d.label || (d.doc_type || d.type || 'document').replace('_', ' ')],
        ['Status', (d) => <Badge s={d.status} />],
        ['', (d) => REVIEW.includes(role) && (
          <span className="row">
            {d.id && <button className="sm grey" onClick={() => run(() => openFile(`/caretakers/documents/${d.id}/file`))}>View</button>}
            <button className="sm" onClick={() => run(() => patch(`/caretakers/documents/${d.id}`, { status: 'approved' }), 'Document approved')}>Approve</button>
            <button className="sm red" onClick={() => {
              const r = prompt('Reason for rejecting?'); if (r) run(() => patch(`/caretakers/documents/${d.id}`, { status: 'rejected', remarks: r }), 'Document rejected');
            }}>Reject</button>
          </span>
        )],
      ]} />
      {['owner', 'manager', 'agent', 'caretaker'].includes(role) && (
        <div className="row" style={{ marginTop: 12 }}>
          <select {...bind('doc_type')} style={{ width: 200 }}>
            <option value="aadhaar">Aadhaar</option><option value="photo">Photo</option>
            <option value="police_verification">Police verification</option><option value="bank_proof">Bank proof</option>
            <option value="experience_certificate">Experience certificate (optional)</option><option value="other">Other</option>
          </select>
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ width: 260 }} onChange={(e) => setFile(e.target.files[0])} />
          <button disabled={!file} onClick={upload}>Upload</button>
        </div>
      )}
    </div>
  );
}

export default function Caretakers() {
  const { user } = useAuth();
  const nav = useNavigate();
  const role = user.role;
  const { data, error, reload } = useApi('/caretakers');
  const agents = useApi(REVIEW.includes(role) ? '/agents' : null);
  const [msg, run] = useAction(reload);
  const [f, bind, reset] = useForm({ service_type: 'elderly_care' });
  const [open, setOpen] = useState(null);
  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const created = await post('/caretakers', { ...f, services: [f.service_type] });
      reset();
      nav(`/caretaker-profile/${created.id}`);
      return created;
    }, 'Caretaker registered as pending. Upload documents in the profile.');
  };
  return (
    <Page accent="caretakers" title={REVIEW.includes(role) ? 'Caretakers' : 'My Caretakers'}
      sub={REVIEW.includes(role) ? 'Review documents and approve caretakers' : 'Register caretakers and upload their documents'}>
      {role === 'agent' && (
        <div className="card">
          <h3>Register caretaker</h3>
          <form onSubmit={add}>
            <label>Name<input {...bind('name')} required /></label>
            <label>Phone<input {...bind('phone')} required /></label>
            <label>Services provided
              <select {...bind('service_type')} required>{Object.entries(SVC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label>Experience (years)<input type="number" min="0" {...bind('experience_years')} /></label>
            <label>Area<input {...bind('area')} /></label>
            <label>Expected salary (₹)<input type="number" min="0" {...bind('expected_salary')} /></label>
            <button>Register</button>
          </form>
        </div>
      )}
      <Alert err={error || msg.err} ok={msg.ok} />
      {data && data.length === 0 && <div className="banner">No caretakers registered yet. Fill the form above and click Register. The document upload screen will open automatically.</div>}
      <Table rows={data} cols={[
        ['Photo', (c) => <CaretakerPhoto documentId={c.photo_document_id} name={c.name} />], ['Name', (c) => c.name], ['Phone', (c) => c.phone], ['Services', (c) => (c.services || c.service_type || '').split(',').map((s) => SVC[s] || s).join(', ')],
        ['Exp', (c) => c.experience_years + ' yrs'], ['Expected', (c) => (c.expected_salary ? inr(c.expected_salary) : '-')],
        ...(role === 'agent' ? [['Commission per placement', (c) => c.commission_amount != null ? inr(c.commission_amount) : 'Not placed yet'], ['Commission status', (c) => c.commission_status ? <Badge s={c.commission_status} /> : '-']] : []),
        ...(role !== 'agent' ? [['Agent', (c) => REVIEW.includes(role) ? <select value={c.registered_by || ''} onChange={(e) => run(() => patch(`/caretakers/${c.id}/assign-agent`, { agent_id: Number(e.target.value) }), 'Caretaker assigned')}><option value="">Select agent</option>{(agents.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : c.agent_name]] : []),
        ['Docs', (c) => `${c.docs_approved}/${c.docs_total} approved`],
        ['Status', (c) => <Badge s={c.status} />],
        ['Availability', (c) => (c.status === 'approved' ? <Badge s={c.availability} /> : '-')],
        ['', (c) => (
          <span className="row">
            <button className="sm grey" onClick={() => nav(`/caretaker-profile/${c.id}`)}>Profile</button>
            <button className="sm grey" onClick={() => setOpen(open && open.id === c.id ? null : c)}>Documents</button>
            {REVIEW.includes(role) && c.status === 'pending' && (
              <>
                <button className="sm" onClick={() => run(() => patch(`/caretakers/${c.id}/approve`),
                  (r) => `Approved. Caretaker login: ${r.login_phone} / temporary password: ${r.temp_password}. Share it now; it is shown only once.`)}>Approve</button>
                <button className="sm red" onClick={() => run(() => patch(`/caretakers/${c.id}/reject`), 'Caretaker rejected')}>Reject</button>
              </>
            )}
          </span>
        )],
      ]} />
      {open && <Docs key={open.id} c={open} role={role} onDone={reload} />}
    </Page>
  );
}
