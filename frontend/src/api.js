const BASE = '/api';
export const getToken = () => localStorage.getItem('va_token');

export async function api(method, url, body, isForm = false) {
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = 'Bearer ' + t;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running on port 5000?');
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && !url.startsWith('/auth/login')) {
    localStorage.removeItem('va_token'); localStorage.removeItem('va_user');
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b);
export const patch = (u, b) => api('PATCH', u, b);

// Open a protected file (caretaker document) in a new tab
export async function openFile(url) {
  const res = await fetch(BASE + url, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) throw new Error('Cannot open file');
  window.open(URL.createObjectURL(await res.blob()), '_blank');
}
