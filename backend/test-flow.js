// End-to-end test: business flow + role permissions. Backend running (npm run dev) and seeded (npm run seed), then: npm run test:flow
const totp = require('./src/utils/totp');
const BASE = process.env.API || 'http://localhost:5000/api';
let n = 0, failed = 0;
const rnd = () => '9' + Math.floor(100000000 + Math.random() * 899999999);

async function call(method, url, token, body, form) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  let data = {}; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function ck(name, cond, extra = '') {
  n++; if (!cond) failed++;
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${String(n).padStart(2)}. ${name}${!cond && extra ? ' -> ' + extra : ''}`);
  if (!cond && process.env.STOP !== '0') { console.log('\nStopping at first failure.'); process.exit(1); }
}
const login = async (id, pw) => { const r = await call('POST', '/auth/login', null, { login: id, password: pw }); return r; };

(async () => {
  console.log('--- Accounts and login ---');
  ck('API is running', (await call('GET', '/health')).status === 200);
  const o = await login('owner@vivanangels.com', 'admin123');
  ck('Owner logs in with email login ID', o.status === 200 && o.data.user.role === 'owner' && o.data.user.permissions.users === 3, o.data.error);
  const O = o.data.token;
  const bad = await login('owner@vivanangels.com', 'wrong-password');
  ck('Wrong password rejected (401)', bad.status === 401);

  const mk = async (role) => {
    const r = await call('POST', '/users', O, { name: 'Test ' + role, phone: rnd(), role });
    ck(`Owner creates ${role} (auto login ID)`, r.status === 201 && /@vivanangels\.com$/.test(r.data.login_id), r.data.error);
    const l = await login(r.data.login_id, r.data.temp_password);
    ck(`${role} logs in, must change password flag set`, l.status === 200 && l.data.user.must_change_password === true, l.data.error);
    return { token: l.data.token, id: r.data.id, loginId: r.data.login_id, pw: r.data.temp_password };
  };
  const M = await mk('manager'), T = await mk('telecaller'), A = await mk('accountant');

  console.log('--- Permission matrix ---');
  ck('Manager cannot manage users (403)', (await call('POST', '/users', M.token, { name: 'x', phone: rnd(), role: 'manager' })).status === 403);
  ck('Manager cannot read audit log (403)', (await call('GET', '/audit', M.token)).status === 403);
  ck('Telecaller cannot see jobs (403)', (await call('GET', '/jobs', T.token)).status === 403);
  ck('Telecaller cannot see salary (403)', (await call('GET', '/salary', T.token)).status === 403);
  ck('Telecaller cannot see expenses (403)', (await call('GET', '/expenses', T.token)).status === 403);
  ck('Accountant cannot create jobs (403)', (await call('POST', '/jobs', A.token, { lead_id: 1, caretaker_id: 1, caretaker_salary: 1 })).status === 403);
  ck('Accountant cannot mark attendance (403)', (await call('POST', '/attendance', A.token, { caretaker_id: 1, att_date: '2026-01-01', status: 'present' })).status === 403);
  ck('Manager can view salary but not create it',
    (await call('GET', '/salary', M.token)).status === 200 && (await call('POST', '/salary', M.token, { job_id: 1, salary_month: '2026-01' })).status === 403);
  ck('Manager cannot add expenses (403)', (await call('POST', '/expenses', M.token, { category: 'office', description: 'x', amount: 10, expense_date: '2026-01-01' })).status === 403);

  console.log('--- Agent, caretaker verification ---');
  const ag = await call('POST', '/agents', M.token, { name: 'Test Agent', phone: rnd(), commission_rate_pct: 10 });
  ck('Manager creates agent (login ID agentNNN@...)', ag.status === 201 && /^agent\d+@vivanangels\.com$/.test(ag.data.login_id), ag.data.error);
  const al = await login(ag.data.login_id, ag.data.temp_password);
  ck('Agent logs in', al.status === 200 && al.data.user.agentId > 0, al.data.error);
  const G = al.data.token;
  const ctPhone = rnd();
  const ct = await call('POST', '/caretakers', G, { name: 'Test Caretaker', phone: ctPhone, service_type: 'elderly_care', experience_years: 4, expected_salary: 15000 });
  ck('Agent registers caretaker', ct.status === 201, ct.data.error);
  const requiredDocs = ['aadhaar', 'pan', 'photo', 'address_proof', 'police_verification', 'medical_certificate', 'bank_proof'];
  const uploadedDocs = [];
  for (const docType of requiredDocs) {
    const form = new FormData();
    form.append('doc_type', docType);
    form.append('file', new Blob(['demo'], { type: 'application/pdf' }), `${docType}.pdf`);
    const doc = await call('POST', `/caretakers/${ct.data.id}/documents`, G, null, form);
    uploadedDocs.push(doc.data.id);
    if (docType === 'aadhaar') ck('Agent uploads document', doc.status === 201, doc.data.error);
  }
  ck('Agent cannot approve documents (403)', (await call('PATCH', `/caretakers/documents/${uploadedDocs[0]}`, G, { status: 'approved' })).status === 403);
  for (const id of uploadedDocs) ck('Manager approves required document', (await call('PATCH', `/caretakers/documents/${id}`, M.token, { status: 'approved' })).status === 200);
  const capp = await call('PATCH', `/caretakers/${ct.data.id}/approve`, M.token);
  ck('Manager approves caretaker, login created', capp.status === 200 && !!capp.data.temp_password, capp.data.error);

  console.log('--- Leads: telecaller sees only assigned leads ---');
  const tl = await call('POST', '/leads', T.token, { customer_name: 'Tele Lead', phone: rnd(), service_type: 'baby_care', budget: 20000 });
  ck('Telecaller creates a lead (assigned to self)', tl.status === 201, tl.data.error);
  const lead = await call('POST', '/leads', G, { customer_name: 'Test Customer', phone: rnd(), address: 'Madhapur', service_type: 'elderly_care', budget: 22000 });
  ck('Agent creates a lead', lead.status === 201, lead.data.error);
  const tList = await call('GET', '/leads', T.token);
  ck('Telecaller list contains only own lead', tList.data.length === 1 && tList.data[0].id === tl.data.id);
  ck("Telecaller cannot open agent's lead calls (403)", (await call('GET', `/leads/${lead.data.id}/calls`, T.token)).status === 403);
  ck('Telecaller logs a call', (await call('POST', `/leads/${tl.data.id}/calls`, T.token, { outcome: 'callback', note: 'call after 5pm', next_date: '2030-01-01' })).status === 201);
  ck('Accountant can view leads but not change status', (await call('GET', '/leads', A.token)).status === 200 &&
    (await call('PATCH', `/leads/${lead.data.id}/status`, A.token, { status: 'confirmed' })).status === 403);
  ck('Manager assigns the agent lead to the telecaller', (await call('PATCH', `/leads/${lead.data.id}/assign`, M.token, { agent_id: ag.data.id, assigned_to: T.id })).status === 200);
  ck('Telecaller now sees 2 leads', (await call('GET', '/leads', T.token)).data.length === 2);
  ck('Agent confirms lead', (await call('PATCH', `/leads/${lead.data.id}/status`, G, { status: 'confirmed' })).status === 200);

  console.log('--- Jobs and money ---');
  const job = await call('POST', '/jobs', M.token, { lead_id: lead.data.id, caretaker_id: ct.data.id, caretaker_salary: 15000 });
  ck('Manager creates job; margin hidden from Manager', job.status === 201 && job.data.agent_commission === 2200 && job.data.company_margin === undefined, job.data.error);
  const oJobs = await call('GET', '/jobs', O);
  const oj = oJobs.data.find((j) => j.id === job.data.id);
  ck('Owner sees all four money fields (22000 = 15000 + 2200 + 4800)', oj.customer_amount === 22000 && oj.caretaker_salary === 15000 && oj.agent_commission === 2200 && oj.company_margin === 4800);
  const aj = (await call('GET', '/jobs', G)).data[0];
  ck('Agent sees commission only (no salary, no margin)', aj.agent_commission === 2200 && aj.caretaker_salary === undefined && aj.company_margin === undefined);

  const cl = await login(ctPhone, capp.data.temp_password);
  ck('Caretaker logs in with phone number', cl.status === 200 && cl.data.user.caretakerId > 0, cl.data.error);
  const C = cl.data.token;
  const cj = (await call('GET', '/jobs', C)).data[0];
  ck('Caretaker sees salary only', cj.caretaker_salary === 15000 && cj.customer_amount === undefined && cj.company_margin === undefined);
  ck('Caretaker accepts job', (await call('PATCH', `/jobs/${job.data.id}/accept`, C)).status === 200);

  console.log('--- Finance: payments, commission, salary, expenses ---');
  const month = new Date().toISOString().slice(0, 7);
  ck('Manager can view but not record payments', (await call('GET', '/payments', M.token)).status === 200 &&
    (await call('POST', '/payments', M.token, { job_id: job.data.id, billing_month: month, amount: 22000 })).status === 403);
  const pay = await call('POST', '/payments', A.token, { job_id: job.data.id, billing_month: month, amount: 22000, reference_no: 'UTR1' });
  ck('Accountant records payment', pay.status === 201, pay.data.error);
  ck('No commission before verification', (await call('GET', '/commissions', G)).data.length === 0);
  const ver = await call('PATCH', `/payments/${pay.data.id}/verify`, A.token, { action: 'verify' });
  ck('Accountant verifies payment, commission auto-created', ver.status === 200 && ver.data.commission.amount === 2200, ver.data.error);
  const com = (await call('GET', '/commissions', G)).data;
  ck('Agent sees own commission 2200', com.length === 1 && com[0].amount === 2200);
  ck('Manager views commission but cannot approve', (await call('GET', '/commissions', M.token)).status === 200 &&
    (await call('PATCH', `/commissions/${com[0].id}/status`, M.token, { status: 'approved' })).status === 403);
  ck('Accountant approves then pays commission',
    (await call('PATCH', `/commissions/${com[0].id}/status`, A.token, { status: 'approved' })).status === 200 &&
    (await call('PATCH', `/commissions/${com[0].id}/status`, A.token, { status: 'paid' })).status === 200);
  const sal = await call('POST', '/salary', A.token, { job_id: job.data.id, salary_month: month });
  ck('Accountant creates salary statement (default 15000)', sal.status === 201 && sal.data.amount === 15000, sal.data.error);
  ck('Accountant marks salary paid', (await call('PATCH', `/salary/${sal.data.id}/pay`, A.token, { reference_no: 'NEFT1' })).status === 200);
  ck('Accountant adds expense', (await call('POST', '/expenses', A.token, { category: 'office', description: 'Stationery', amount: 500, expense_date: month + '-01' })).status === 201);
  ck('Manager marks attendance', (await call('POST', '/attendance', M.token, { caretaker_id: ct.data.id, att_date: month + '-01', status: 'present' })).status === 200);
  ck('Accountant can view attendance', (await call('GET', `/attendance?month=${month}`, A.token)).status === 200);
  ck('No delete route for financial data (404)', (await call('DELETE', `/payments/${pay.data.id}`, O)).status === 404);

  console.log('--- Dashboards and reports by role ---');
  const dO = (await call('GET', '/reports/dashboard', O)).data, dM = (await call('GET', '/reports/dashboard', M.token)).data;
  ck('Owner dashboard includes finance; Manager dashboard does not',
    dO.sections.some((s) => /four separate/.test(s.title)) && !dM.sections.some((s) => /money|Finance/.test(s.title)));
  ck('Finance report: Accountant yes, Manager no', (await call('GET', '/reports/finance', A.token)).status === 200 && (await call('GET', '/reports/finance', M.token)).status === 403);
  ck('Operations report: Manager yes, Accountant no', (await call('GET', '/reports/operations', M.token)).status === 200 && (await call('GET', '/reports/operations', A.token)).status === 403);
  ck('Call report: Telecaller sees own', (await call('GET', '/reports/calls', T.token)).status === 200);

  console.log('--- Audit, login history, 2FA, deactivation ---');
  await new Promise((r) => setTimeout(r, 500));
  const audit = await call('GET', '/audit?limit=500', O);
  ck('Audit log records actions (job create, payment verify)', audit.status === 200 && audit.data.some((a) => a.action === 'job.create') && audit.data.some((a) => a.action === 'payment.verify'));
  const lh = await call('GET', '/audit/logins', O);
  ck('Login history records successes and failures', lh.data.some((x) => x.success === 1) && lh.data.some((x) => x.success === 0));
  ck('Last login tracked', (await call('GET', '/users', O)).data.some((u) => u.last_login_at));

  const setup = await call('POST', '/auth/2fa/setup', M.token);
  ck('Manager starts 2FA setup', setup.status === 200 && !!setup.data.secret, setup.data.error);
  ck('Wrong 2FA code refused', (await call('POST', '/auth/2fa/enable', M.token, { code: '000000' })).status === 400);
  ck('Correct 2FA code enables it', (await call('POST', '/auth/2fa/enable', M.token, { code: totp.now(setup.data.secret) })).status === 200);
  const l2 = await login(M.loginId, M.pw);
  ck('Login now asks for a 2FA code', l2.status === 200 && l2.data.need_2fa === true);
  ck('Wrong code refused at login', (await call('POST', '/auth/2fa/verify', null, { temp_token: l2.data.temp_token, code: '123456' })).status === 401);
  const l3 = await call('POST', '/auth/2fa/verify', null, { temp_token: l2.data.temp_token, code: totp.now(setup.data.secret) });
  ck('Correct code completes login', l3.status === 200 && !!l3.data.token);

  ck('Owner account cannot be deactivated', (await call('PATCH', `/users/${o.data.user.id}/status`, O, { status: 'inactive' })).status === 400);
  ck('Owner deactivates accountant', (await call('PATCH', `/users/${A.id}/status`, O, { status: 'inactive' })).status === 200);
  ck('Deactivated accountant is locked out immediately (401)', (await call('GET', '/payments', A.token)).status === 401);
  const rp = await call('POST', `/users/${T.id}/reset-password`, O);
  ck('Owner resets telecaller password', rp.status === 200 && (await login(T.loginId, rp.data.temp_password)).status === 200);

  console.log(`\n${failed === 0 ? `ALL ${n} CHECKS PASSED. Backend v2 works end to end.` : failed + ' of ' + n + ' check(s) failed.'}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test crashed. Is the server running on ' + BASE + ' ?\n', e.message); process.exit(1); });
