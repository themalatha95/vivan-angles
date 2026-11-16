import { useState } from 'react';
import { useApi, useAction, useForm, Page, Table, Badge, Alert } from '../ui.jsx';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Security() {
  const { user, refresh } = useAuth();
  const hist = useApi('/auth/login-history');
  const [pm, runPw] = useAction();
  const [fm, runFa] = useAction();
  const [pw, bindPw, resetPw] = useForm({});
  const [fa, bindFa, resetFa] = useForm({});
  const [setup, setSetup] = useState(null);

  return (
    <Page title="My security" sub={`${user.name} · ${user.email || user.phone}`}>
      <div className="card">
        <h3>Change password</h3>
        <form onSubmit={(e) => { e.preventDefault(); runPw(async () => { await post('/auth/change-password', pw); resetPw(); await refresh(); }, 'Password changed'); }}>
          <label>Current password<input type="password" {...bindPw('old_password')} required /></label>
          <label>New password (min 8 characters)<input type="password" {...bindPw('new_password')} minLength={8} required /></label>
          <button>Change password</button>
        </form>
        <Alert err={pm.err} ok={pm.ok} />
      </div>

      <div className="card">
        <h3>Two-factor authentication {user.totp_enabled ? <Badge s="active" /> : <Badge s="inactive" />}</h3>
        {user.role === 'owner' && !user.totp_enabled && <p className="sub">Required for the Owner account.</p>}
        {!user.totp_enabled && !setup && (
          <button onClick={() => runFa(async () => setSetup(await post('/auth/2fa/setup')))}>Set up authenticator app</button>
        )}
        {!user.totp_enabled && setup && (
          <>
            <p>1. Install Google Authenticator or Microsoft Authenticator. 2. Scan the QR code (or type the key). 3. Enter the 6-digit code below.</p>
            {setup.qr && <img className="qr" src={setup.qr} alt="2FA QR code" />}
            <p>Manual key: <code className="k">{setup.secret}</code></p>
            <form onSubmit={(e) => { e.preventDefault(); runFa(async () => { await post('/auth/2fa/enable', { code: fa.code }); setSetup(null); resetFa(); await refresh(); }, 'Two-factor authentication is on'); }}>
              <label>6-digit code<input {...bindFa('code')} inputMode="numeric" maxLength={6} required /></label>
              <button>Turn on 2FA</button>
            </form>
          </>
        )}
        {user.totp_enabled && user.role !== 'owner' && (
          <form onSubmit={(e) => { e.preventDefault(); runFa(async () => { await post('/auth/2fa/disable', fa); resetFa(); await refresh(); }, 'Two-factor authentication turned off'); }}>
            <label>Password<input type="password" {...bindFa('password')} required /></label>
            <label>Current 6-digit code<input {...bindFa('code')} maxLength={6} required /></label>
            <button className="red">Turn off 2FA</button>
          </form>
        )}
        <Alert err={fm.err} ok={fm.ok} />
      </div>

      <h2>My recent logins</h2>
      <Table rows={hist.data} cols={[
        ['When', (h) => new Date(h.created_at).toLocaleString()], ['Result', (h) => (h.success ? <Badge s="approved" /> : <Badge s="rejected" />)],
        ['Reason', (h) => h.reason || '-'], ['IP', (h) => h.ip || '-'],
      ]} />
    </Page>
  );
}
