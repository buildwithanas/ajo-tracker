const pool = require('../config/db');

async function createCycle(req, res) {
  const conn = await pool.getConnection();
  try {
    const groupId = req.params.id;
    const { due_date, recipient_member_id } = req.body;

    if (!due_date) {
      return res.status(400).json({ error: 'due_date is required (YYYY-MM-DD)' });
    }

    const [[group]] = await pool.query('SELECT * FROM groups_table WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const [members] = await pool.query(
      'SELECT * FROM group_members WHERE group_id = ? ORDER BY payout_position ASC',
      [groupId]
    );
    if (members.length === 0) {
      return res.status(400).json({ error: 'Group has no members yet' });
    }

    const [[{ maxCycle }]] = await pool.query(
      'SELECT COALESCE(MAX(cycle_number), 0) AS maxCycle FROM cycles WHERE group_id = ?',
      [groupId]
    );
    const cycleNumber = maxCycle + 1;

    // For rotating groups, auto-pick the next member (by payout_position) who hasn't received a payout yet,
    // unless the caller explicitly specified one.
    let finalRecipientId = recipient_member_id || null;
    if (!finalRecipientId && group.group_type === 'rotating') {
      const nextRecipient = members.find((m) => !m.has_received_payout);
      finalRecipientId = nextRecipient ? nextRecipient.id : null;
    }

    await conn.beginTransaction();

    const [cycleResult] = await conn.query(
      `INSERT INTO cycles (group_id, cycle_number, due_date, recipient_member_id, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [groupId, cycleNumber, due_date, finalRecipientId]
    );
    const cycleId = cycleResult.insertId;

    // Create a pending contribution for every member for this cycle
    const values = members.map((m) => [cycleId, groupId, m.id, group.contribution_amount, 'pending']);
    await conn.query(
      `INSERT INTO contributions (cycle_id, group_id, member_id, amount, status) VALUES ?`,
      [values]
    );

    await conn.commit();

    const [[cycle]] = await pool.query('SELECT * FROM cycles WHERE id = ?', [cycleId]);
    return res.status(201).json({ cycle });
  } catch (err) {
    await conn.rollback();
    console.error('createCycle error:', err);
    return res.status(500).json({ error: 'Something went wrong while creating the cycle' });
  } finally {
    conn.release();
  }
}

async function listCycles(req, res) {
  try {
    const groupId = req.params.id;
    const [cycles] = await pool.query(
      `SELECT c.*, u.full_name AS recipient_name
       FROM cycles c
       LEFT JOIN group_members gm ON gm.id = c.recipient_member_id
       LEFT JOIN users u ON u.id = gm.user_id
       WHERE c.group_id = ?
       ORDER BY c.cycle_number ASC`,
      [groupId]
    );
    return res.json({ cycles });
  } catch (err) {
    console.error('listCycles error:', err);
    return res.status(500).json({ error: 'Something went wrong while fetching cycles' });
  }
}

async function closeCycle(req, res) {
  const conn = await pool.getConnection();
  try {
    const groupId = req.params.id;
    const cycleId = req.params.cycleId;

    const [[cycle]] = await pool.query('SELECT * FROM cycles WHERE id = ? AND group_id = ?', [
      cycleId,
      groupId,
    ]);
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

    await conn.beginTransaction();

    await conn.query(`UPDATE cycles SET status = 'closed' WHERE id = ?`, [cycleId]);

    if (cycle.recipient_member_id) {
      await conn.query(`UPDATE group_members SET has_received_payout = TRUE WHERE id = ?`, [
        cycle.recipient_member_id,
      ]);
    }

    await conn.commit();
    return res.json({ message: 'Cycle closed', cycle_id: cycleId });
  } catch (err) {
    await conn.rollback();
    console.error('closeCycle error:', err);
    return res.status(500).json({ error: 'Something went wrong while closing the cycle' });
  } finally {
    conn.release();
  }
}

module.exports = { createCycle, listCycles, closeCycle };
