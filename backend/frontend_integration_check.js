const BASE = 'http://localhost:4000/api';

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

(async () => {
  // Register two users like the AuthPage would
  const regA = await call('/auth/register', { method: 'POST', body: { full_name: 'Frontend Admin', email: 'fe-admin@example.com', password: 'password123' } });
  const userA = regA.user;
  const tokenA = regA.token;
  assert(typeof userA.id === 'number', 'user.id is a number (used for isAdmin/myMemberId comparisons)');

  const regB = await call('/auth/register', { method: 'POST', body: { full_name: 'Frontend Member', email: 'fe-member@example.com', password: 'password123' } });
  const tokenB = regB.token;

  // Dashboard.jsx: CreateGroupForm submit shape
  const groupRes = await call('/groups', { method: 'POST', token: tokenA, body: { name: 'Frontend Test Group', description: 'desc', contribution_amount: 5000, frequency: 'monthly', group_type: 'rotating' } });
  const groupId = groupRes.group.id;
  assert(typeof groupRes.group.contribution_amount !== 'undefined', 'group.contribution_amount present for currency() formatting');

  await call('/groups/join', { method: 'POST', token: tokenB, body: { invite_code: groupRes.group.invite_code } });

  // Dashboard.jsx: listGroups fields used in group-card
  const listA = await call('/groups', { token: tokenA });
  const g = listA.groups[0];
  assert(['id', 'name', 'contribution_amount', 'currency', 'frequency', 'member_count', 'role'].every((k) => k in g), 'group list item has all fields Dashboard.jsx reads: ' + JSON.stringify(Object.keys(g)));

  // GroupDetail.jsx: getMembers + isAdmin/myMemberId derivation
  const membersRes = await call(`/groups/${groupId}/members`, { token: tokenA });
  const members = membersRes.members;
  assert(['member_id', 'role', 'payout_position', 'has_received_payout', 'user_id', 'full_name'].every((k) => k in members[0]), 'member item has all fields GroupDetail.jsx reads: ' + JSON.stringify(Object.keys(members[0])));
  assert(typeof members[0].has_received_payout === 'boolean', 'has_received_payout is a real boolean, not 1/0: ' + JSON.stringify(members[0].has_received_payout));

  const myMember = members.find((m) => m.user_id === userA.id);
  assert(!!myMember && myMember.role === 'admin', 'isAdmin logic (find by user_id, check role) resolves correctly for the creator');

  // GroupDetail.jsx: createCycle + listCycles + getDashboard
  const cycleRes = await call(`/groups/${groupId}/cycles`, { method: 'POST', token: tokenA, body: { due_date: '2026-12-01' } });
  const cycleId = cycleRes.cycle.id;

  const cyclesRes = await call(`/groups/${groupId}/cycles`, { token: tokenA });
  assert(['id', 'cycle_number', 'due_date', 'status', 'recipient_name'].every((k) => k in cyclesRes.cycles[0]), 'cycle item has all fields CycleCard reads: ' + JSON.stringify(Object.keys(cyclesRes.cycles[0])));

  const dashRes = await call(`/groups/${groupId}/dashboard`, { token: tokenA });
  assert('total_collected' in dashRes.totals && 'total_outstanding' in dashRes.totals, 'dashboard.totals has fields the summary strip reads');
  assert(dashRes.next_cycle && dashRes.next_cycle.id === cycleId, 'dashboard.next_cycle matches the open cycle we just created');

  // GroupDetail.jsx: listContributions + payContribution + "Mark as paid" button matching logic
  const contribRes = await call(`/groups/${groupId}/contributions?cycle_id=${cycleId}`, { token: tokenA });
  const contributions = contribRes.contributions;
  assert(['id', 'member_id', 'member_name', 'status', 'amount', 'paid_at'].every((k) => k in contributions[0]), 'contribution item has all fields CycleCard reads: ' + JSON.stringify(Object.keys(contributions[0])));

  const myContribution = contributions.find((c) => c.member_id === myMember.member_id);
  assert(!!myContribution, "matching a contribution to 'my' member_id works (drives the Mark as paid button visibility)");

  const payRes = await call(`/groups/${groupId}/contributions/${myContribution.id}/pay`, { method: 'PATCH', token: tokenA, body: { note: undefined } });
  assert(payRes.contribution.status === 'paid', 'paying with note:undefined (as the UI does by default) still succeeds and flips status to paid');

  console.log('\nIntegration script finished.');
})().catch((err) => {
  console.error('SCRIPT ERROR:', err.message);
  process.exitCode = 1;
});
