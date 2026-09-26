import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

function currency(amount, curr = 'NGN') {
  const symbol = curr === 'NGN' ? '₦' : `${curr} `;
  return `${symbol}${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function GroupDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [members, setMembers] = useState(null);
  const [cycles, setCycles] = useState(null);
  const [contributionsByCycle, setContributionsByCycle] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const isAdmin = dashboard?.group && members?.find((m) => m.user_id === user.id)?.role === 'admin';
  const myMemberId = members?.find((m) => m.user_id === user.id)?.member_id;

  const loadAll = useCallback(async () => {
    try {
      const [dash, mem, cyc] = await Promise.all([
        api.getDashboard(id),
        api.getMembers(id),
        api.listCycles(id),
      ]);
      setDashboard(dash);
      setMembers(mem.members);
      setCycles(cyc.cycles);

      const contribResults = await Promise.all(
        cyc.cycles.map((c) => api.listContributions(id, c.id))
      );
      const map = {};
      cyc.cycles.forEach((c, idx) => {
        map[c.id] = contribResults[idx].contributions;
      });
      setContributionsByCycle(map);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handlePay(contributionId) {
    setBusyId(contributionId);
    setError('');
    try {
      await api.payContribution(id, contributionId);
      setNotice('Marked as paid.');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setTimeout(() => setNotice(''), 2500);
    }
  }

  async function handleCloseCycle(cycleId) {
    setBusyId(cycleId);
    setError('');
    try {
      await api.closeCycle(id, cycleId);
      setNotice('Cycle closed and payout recorded.');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setTimeout(() => setNotice(''), 2500);
    }
  }

  if (!dashboard || !members || !cycles) {
    return (
      <div className="shell">
        {error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>}
      </div>
    );
  }

  const { group, totals, next_cycle } = dashboard;
  const openCycles = cycles.filter((c) => c.status === 'open');
  const closedCycles = cycles.filter((c) => c.status === 'closed');

  return (
    <div className="shell">
      <Link to="/" className="back-link">← Your groups</Link>

      <div className="topbar">
        <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
          {group.name}
          <small>Invite code: <span className="invite-code">{group.invite_code}</span></small>
        </a>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="success-banner">{notice}</div>}

      <div className="passbook">
        <div className="passbook-inner">
          <div className="summary-strip">
            <div className="summary-cell">
              <div className="summary-label">Collected</div>
              <div className="summary-value">{currency(totals.total_collected, group.currency)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Outstanding</div>
              <div className="summary-value">{currency(totals.total_outstanding, group.currency)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Next payout to</div>
              <div className="summary-value" style={{ fontSize: 15 }}>
                {next_cycle?.recipient_name || '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="passbook">
        <div className="passbook-inner">
          <div className="section-heading">Members ({members.length})</div>
          {members.map((m) => (
            <div className="ledger-row" key={m.member_id}>
              <div>
                <div className="ledger-name">
                  {m.full_name}{m.role === 'admin' ? ' · admin' : ''}
                </div>
                <div className="ledger-sub">Position {m.payout_position}</div>
              </div>
              {group.group_type === 'rotating' && (
                m.has_received_payout
                  ? <span className="stamp stamp-paid">received</span>
                  : <span className="stamp stamp-pending">waiting</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={() => setShowNewCycle((v) => !v)}>
            {showNewCycle ? 'Cancel' : 'Open a new cycle'}
          </button>
        </div>
      )}

      {showNewCycle && (
        <NewCycleForm
          groupId={id}
          onDone={() => { setShowNewCycle(false); loadAll(); }}
          onCancel={() => setShowNewCycle(false)}
        />
      )}

      {openCycles.map((cycle) => (
        <CycleCard
          key={cycle.id}
          cycle={cycle}
          contributions={contributionsByCycle[cycle.id] || []}
          currencyCode={group.currency}
          myMemberId={myMemberId}
          isAdmin={isAdmin}
          busyId={busyId}
          onPay={handlePay}
          onClose={handleCloseCycle}
        />
      ))}

      {closedCycles.length > 0 && (
        <div className="passbook">
          <div className="passbook-inner">
            <div className="section-heading">Past cycles</div>
            {closedCycles.map((c) => (
              <div className="ledger-row" key={c.id}>
                <div>
                  <div className="ledger-name">Cycle {c.cycle_number}</div>
                  <div className="ledger-sub">Due {formatDate(c.due_date)} · paid out to {c.recipient_name || '—'}</div>
                </div>
                <span className="stamp stamp-closed">closed</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CycleCard({ cycle, contributions, currencyCode, myMemberId, isAdmin, busyId, onPay, onClose }) {
  const allPaid = contributions.length > 0 && contributions.every((c) => c.status === 'paid');

  return (
    <div className="passbook">
      <div className="passbook-inner">
        <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cycle {cycle.cycle_number} · due {formatDate(cycle.due_date)}</span>
          <span className="stamp stamp-open">open</span>
        </div>

        {contributions.map((c) => (
          <div className="ledger-row" key={c.id}>
            <div>
              <div className="ledger-name">{c.member_name}</div>
              <div className="ledger-sub">{c.status === 'paid' ? `Paid ${new Date(c.paid_at).toLocaleDateString('en-NG')}` : 'Not yet paid'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ledger-amount">{currencyCode === 'NGN' ? '₦' : ''}{Number(c.amount).toLocaleString('en-NG')}</span>
              {c.status === 'paid' ? (
                <span className="stamp stamp-paid">paid</span>
              ) : c.member_id === myMemberId ? (
                <button className="btn btn-secondary btn-small" disabled={busyId === c.id} onClick={() => onPay(c.id)}>
                  {busyId === c.id ? 'Marking…' : 'Mark as paid'}
                </button>
              ) : (
                <span className="stamp stamp-pending">pending</span>
              )}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <button
              className="btn btn-primary btn-small"
              disabled={!allPaid || busyId === cycle.id}
              onClick={() => onClose(cycle.id)}
              title={!allPaid ? 'All members must pay before closing the cycle' : ''}
            >
              {busyId === cycle.id ? 'Closing…' : 'Close cycle & record payout'}
            </button>
            {!allPaid && <div className="ledger-sub" style={{ marginTop: 6 }}>Waiting on every member to pay before this can close.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function NewCycleForm({ groupId, onDone, onCancel }) {
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.createCycle(groupId, { due_date: dueDate });
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
        <div className="section-heading">Open a new cycle</div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="due">Due date</label>
            <input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Opening…' : 'Open cycle'}</button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
