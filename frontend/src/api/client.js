const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('ajo_token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),

  listGroups: () => request('/groups'),
  createGroup: (payload) => request('/groups', { method: 'POST', body: payload }),
  joinGroup: (invite_code) => request('/groups/join', { method: 'POST', body: { invite_code } }),
  getGroup: (id) => request(`/groups/${id}`),
  getMembers: (id) => request(`/groups/${id}/members`),
  getDashboard: (id) => request(`/groups/${id}/dashboard`),

  createCycle: (groupId, payload) => request(`/groups/${groupId}/cycles`, { method: 'POST', body: payload }),
  listCycles: (groupId) => request(`/groups/${groupId}/cycles`),
  closeCycle: (groupId, cycleId) =>
    request(`/groups/${groupId}/cycles/${cycleId}/close`, { method: 'PATCH' }),

  listContributions: (groupId, cycleId) =>
    request(`/groups/${groupId}/contributions${cycleId ? `?cycle_id=${cycleId}` : ''}`),
  payContribution: (groupId, contributionId, note) =>
    request(`/groups/${groupId}/contributions/${contributionId}/pay`, {
      method: 'PATCH',
      body: { note },
    }),
};

export { getToken };
