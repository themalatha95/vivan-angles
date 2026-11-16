import { useEffect, useState, useCallback } from 'react';
import { get } from './api.js';
import { useAuth } from './auth.jsx';

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const SVC = { elderly_care: 'Elderly Care', baby_care: 'Baby Care', patient_care: 'Patient Care', cooking: 'Cooking', housekeeping: 'Housekeeping' };

export function useApi(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!url) return;
    get(url).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

// run(fn, okMessage): runs an API call, shows a message, then reloads the list
export function useAction(reload) {
  const [msg, setMsg] = useState({});
  const run = async (fn, ok) => {
    setMsg({});
    try {
      const r = await fn();
      setMsg({ ok: typeof ok === 'function' ? ok(r) : ok });
      if (reload) reload();
      return r;
    } catch (e) { setMsg({ err: e.message }); }
  };
  return [msg, run];
}

// can('salary', 2) -> does my role have at least "manage" on that module? (the backend enforces this too)
export function useCan() {
  const { user } = useAuth();
  return (module, level = 1) => ((user.permissions || {})[module] || 0) >= level;
}

export function useForm(init) {
  const [v, setV] = useState(init);
  const bind = (n) => ({ name: n, value: v[n] ?? '', onChange: (e) => setV({ ...v, [n]: e.target.value }) });
  return [v, bind, () => setV(init), setV];
}

export const Page = ({ title, sub, accent, children }) => (
  <>
    <div className="page-heading">
      <div><h1 className={accent ? `section-title section-${accent}` : ''}>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
    </div>
    {children}
  </>
);
export const Stat = ({ label, value, tone }) => (
  <div className={'stat ' + (tone || '')}><div className="stat-v">{value}</div><div className="stat-l">{label}</div></div>
);
export const Badge = ({ s }) => <span className={'badge b-' + s}>{String(s).replace('_', ' ')}</span>;
export const Alert = ({ err, ok }) => (err ? <div className="alert err">{err}</div> : ok ? <div className="alert ok">{ok}</div> : null);

export function Table({ cols, rows }) {
  if (!rows) return null;
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  return (
    <div className="tw">
      <table>
        <thead><tr>{cols.map((c, i) => <th className={i === cols.length - 1 ? 'table-action-column' : ''} key={i}>{c[0]}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.id ?? i}>{cols.map((c, j) => <td className={j === cols.length - 1 ? 'table-action-column' : ''} key={j}>{c[1](r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
