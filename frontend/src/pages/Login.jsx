import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Alert } from '../ui.jsx';
import { api } from '../api.js';

const DEMO = [
  ['Owner', 'owner@vivanangels.com', 'admin123'], ['Manager', 'manager01@vivanangels.com', 'staff1234'],
  ['Telecaller', 'caller01@vivanangels.com', 'staff1234'], ['Accountant', 'accounts01@vivanangels.com', 'staff1234'],
  ['Agent', 'agent001@vivanangels.com', 'agent123'],
];

export default function Login() {
  const { user, login, verify2fa } = useAuth();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [temp, setTemp] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: '', phone: '', email: '', area: '', password: '' });
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setNotice(''); setBusy(true);
    try {
      if (signup) { const d = await api('POST', '/auth/agent-signup', agentForm); setSignup(false); setAgentForm({ name: '', phone: '', email: '', area: '', password: '' }); setNotice(d.message); }
      else if (temp) { await verify2fa(temp, code.trim()); nav('/'); }
      else {
        const d = await login(id.trim(), pw);
        if (d.need_2fa) setTemp(d.temp_token); else nav('/');
      }
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-layout">
        <section className="login-visual">
          <img src="/vivan-angels-logo.webp" alt="Vivan Angels" className="login-visual-logo" />
          <span className="login-eyebrow">CARE • CONNECT • EARN</span>
          <h1>Trusted care,<br /><em>closer to home.</em></h1>
          <p>One secure workspace for the people who connect families with compassionate, verified care.</p>
          <div className="login-trust-list"><span>✓ Verified professionals</span><span>✓ One connected portal</span><span>✓ Built for better care</span></div>
        </section>
        <div className="box">
        <div className="brand"><img src="/vivan-angels-logo.webp" alt="Vivan Angels" /><small>CARE • CONNECT • EARN</small></div>
        <p className="sub" style={{ textAlign: 'center' }}>{signup ? 'Apply for an Agent account' : temp ? 'Enter the 6-digit code from your authenticator app' : 'One login for everyone. You are taken to your own dashboard.'}</p>
        <form onSubmit={submit}>
          {signup ? (
            <>
              <label>Full name<input value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} required /></label>
              <label>Mobile number<input value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} required /></label>
              <label>Email / username<input type="email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} required /></label>
              <label>Area<input value={agentForm.area} onChange={(e) => setAgentForm({ ...agentForm, area: e.target.value })} /></label>
              <label>Password<input type="password" minLength={8} value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} required /></label>
            </>
          ) : !temp ? (
            <>
              <label>Login ID (email or phone)<input value={id} onChange={(e) => setId(e.target.value)} autoFocus required /></label>
              <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
            </>
          ) : (
            <label>Authentication code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoFocus required /></label>
          )}
          <Alert err={err} ok={notice} />
          <button disabled={busy}>{busy ? 'Please wait…' : signup ? 'Submit agent application' : temp ? 'Verify and sign in' : 'Sign in'}</button>
        </form>
        {!temp && !signup && (
          <div className="demo" style={{ flexWrap: 'wrap' }}>
            Demo:
            <div className="demo-grid">{DEMO.map(([l, a, b]) => <button key={l} type="button" className="sm grey" onClick={() => { setId(a); setPw(b); }}>{l}</button>)}</div>
          </div>
        )}
        {!temp && <button type="button" className="ghost" style={{ color: '#0f766e', borderColor: '#cbd5e1', marginTop: 14, width: '100%' }} onClick={() => { setSignup(!signup); setErr(''); }}>{signup ? 'Back to login' : 'New Agent? Sign up here'}</button>}
        </div>
      </div>
    </div>
  );
}
