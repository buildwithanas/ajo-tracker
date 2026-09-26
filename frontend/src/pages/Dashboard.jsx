import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

function currency(amount, curr = 'NGN') {
  const symbol = curr === 'NGN' ? '₦' : `${curr} `;
  return `${symbol}${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      const data = await api.listGroups();
      setGroups(data.groups);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <div className="topbar">
        <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
          Ajo Ledger
          <small>Group savings, kept straight</small>
        </a>
        <div className="topbar-user">
          {user?.full_name}
          <button onClick={handleLogout}>Log out</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="passbook">
        <div className="passbook-inner">
          <div className="section-heading">Your groups</div>

          {groups === null && <p className="muted">Loading…</p>}

          {groups && groups.length === 0 && (
            <div className="empty-state">
              You're not part of any group yet. Start one, or join with an invite code.
            </div>
          )}

          {groups && groups.map((g) => (
            <Link to={`/groups/${g.id}`} className="group-card" key={g.id}>
              <h3>{g.name}</h3>
              <div className="muted">
                {currency(g.contribution_amount, g.currency)} · {g.frequency} · {g.member_count} member{g.member_count === 1 ? '' : 's'}
                {g.role === 'admin' ? ' · you\'re admin' : ''}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setShowCreate(true); setShowJoin(false); }}>
          Start a group
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowJoin(true); setShowCreate(false); }}>
          Join with code
        </button>
      </div>

      {showCreate && <CreateGroupForm onDone={() => { setShowCreate(false); loadGroups(); }} onCancel={() => setShowCreate(false)} />}
      {showJoin && <JoinGroupForm onDone={() => { setShowJoin(false); loadGroups(); }} onCancel={() => setShowJoin(false)} />}
    </div>
  );
}

function CreateGroupForm({ onDone, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [groupType, setGroupType] = useState('rotating');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.createGroup({
        name,
        description,
        contribution_amount: Number(amount),
        frequency,
        group_type: groupType,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="passbook" style={{ marginTop: 18 }}>
      <div className="passbook-inner">
        <div className="section-heading">Start a new group</div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="gname">Group name</label>
            <input id="gname" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Agege Market Women Ajo" />
          </div>
          <div className="field">
            <label htmlFor="gdesc">Description (optional)</label>
            <input id="gdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Monthly rotating savings for the shop owners" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="gamount">Contribution amount (₦)</label>
              <input id="gamount" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="20000" />
            </div>
            <div className="field">
              <label htmlFor="gfreq">Frequency</label>
              <select id="gfreq" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="gtype">Group type</label>
            <select id="gtype" value={groupType} onChange={(e) => setGroupType(e.target.value)}>
              <option value="rotating">Rotating savings (ajo/esusu) — one member collects the pot each cycle</option>
              <option value="shared_expense">Shared expense — everyone just pays their share</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create group'}</button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JoinGroupForm({ onDone, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.joinGroup(code.trim());
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="passbook" style={{ marginTop: 18 }}>
      <div className="passbook-inner">
        <div className="section-heading">Join a group</div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="code">Invite code</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="e.g. 86TZA2M" style={{ letterSpacing: 2 }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Joining…' : 'Join group'}</button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
