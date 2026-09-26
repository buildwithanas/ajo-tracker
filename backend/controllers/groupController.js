const pool = require('../config/db');
const { generateInviteCode } = require('./groupHelpers');

async function createGroup(req, res) {
  const conn = await pool.getConnection();
  try {
    const { name, description, contribution_amount, currency, frequency, group_type } = req.body;
    if (!name || !contribution_amount) {
      return res.status(400).json({ error: 'name and contribution_amount are required' });
    }
    if (isNaN(contribution_amount) || Number(contribution_amount) <= 0) {
      return res.status(400).json({ error: 'contribution_amount must be a positive number' });
    }

    let invite_code = generateInviteCode();
    // ensure uniqueness (extremely unlikely to collide, but be safe)
    for (let attempts = 0; attempts < 5; attempts++) {
      const [existing] = await pool.query('SELECT id FROM groups_table WHERE invite_code = ?', [invite_code]);
      if (existing.length === 0) break;
      invite_code = generateInviteCode();
    }

    await conn.beginTransaction();

    const [groupResult] = await conn.query(
      `INSERT INTO groups_table (name, description, contribution_amount, currency, frequency, group_type, invite_code, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        contribution_amount,
        currency || 'NGN',
        frequency || 'monthly',
        group_type || 'rotating',
        invite_code,
        req.user.id,
      ]
    );
    const groupId = groupResult.insertId;

    await conn.query(
      `INSERT INTO group_members (group_id, user_id, role, payout_position) VALUES (?, ?, 'admin', 1)`,
      [groupId, req.user.id]
    );

    await conn.commit();

    const [group] = await pool.query('SELECT * FROM groups_table WHERE id = ?', [groupId]);
    return res.status(201).json({ group: group[0] });
  } catch (err) {
    await conn.rollback();
    console.error('createGroup error:', err);
    return res.status(500).json({ error: 'Something went wrong while creating the group' });
  } finally {
    conn.release();
  }
}

async function joinGroup(req, res) {
  try {
    const { invite_code } = req.body;
    if (!invite_code) {
      return res.status(400).json({ error: 'invite_code is required' });
    }

    const [groups] = await pool.query('SELECT * FROM groups_table WHERE invite_code = ?', [
      invite_code.toUpperCase(),
    ]);
    if (groups.length === 0) {
      return res.status(404).json({ error: 'No group found with that invite code' });
    }
    const group = groups[0];

    const [existing] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [group.id, req.user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'You are already a member of this group' });
    }

    const [[{ maxPos }]] = await pool.query(
      'SELECT COALESCE(MAX(payout_position), 0) AS maxPos FROM group_members WHERE group_id = ?',
      [group.id]
    );

    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role, payout_position) VALUES (?, ?, 'member', ?)`,
      [group.id, req.user.id, maxPos + 1]
    );

    return res.status(201).json({ message: `Joined "${group.name}" successfully`, group });
  } catch (err) {
    console.error('joinGroup error:', err);
    return res.status(500).json({ error: 'Something went wrong while joining the group' });
  }
}

async function listMyGroups(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT g.*, gm.role, gm.payout_position,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
       FROM groups_table g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    return res.json({ groups: rows });
  } catch (err) {
    console.error('listMyGroups error:', err);
    return res.status(500).json({ error: 'Something went wrong while fetching your groups' });
  }
}

async function getGroup(req, res) {
  try {
    const groupId = req.params.id;
    const [rows] = await pool.query('SELECT * FROM groups_table WHERE id = ?', [groupId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    return res.json({ group: rows[0], your_role: req.membership.role });
  } catch (err) {
    console.error('getGroup error:', err);
    return res.status(500).json({ error: 'Something went wrong while fetching the group' });
  }
}

async function listMembers(req, res) {
  try {
    const groupId = req.params.id;
    const [rows] = await pool.query(
      `SELECT gm.id AS member_id, gm.role, gm.payout_position, gm.has_received_payout, gm.joined_at,
              u.id AS user_id, u.full_name, u.email, u.phone
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.payout_position ASC`,
      [groupId]
    );
    const members = rows.map((m) => ({ ...m, has_received_payout: !!m.has_received_payout }));
    return res.json({ members });
  } catch (err) {
    console.error('listMembers error:', err);
    return res.status(500).json({ error: 'Something went wrong while fetching members' });
  }
}

async function getDashboard(req, res) {
  try {
    const groupId = req.params.id;

    const [[group]] = await pool.query('SELECT * FROM groups_table WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const [[totals]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS total_collected,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS total_outstanding,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count
       FROM contributions WHERE group_id = ?`,
      [groupId]
    );

    const [members] = await pool.query(
      `SELECT gm.id AS member_id, u.full_name, gm.payout_position, gm.has_received_payout,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.amount ELSE 0 END), 0) AS total_paid,
              COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.amount ELSE 0 END), 0) AS total_owed
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN contributions c ON c.member_id = gm.id
       WHERE gm.group_id = ?
       GROUP BY gm.id, u.full_name, gm.payout_position, gm.has_received_payout
       ORDER BY gm.payout_position ASC`,
      [groupId]
    );

    const [[nextCycle]] = await pool.query(
      `SELECT c.*, u.full_name AS recipient_name
       FROM cycles c
       LEFT JOIN group_members gm ON gm.id = c.recipient_member_id
       LEFT JOIN users u ON u.id = gm.user_id
       WHERE c.group_id = ? AND c.status = 'open'
       ORDER BY c.cycle_number ASC LIMIT 1`,
      [groupId]
    );

    const membersFixed = members.map((m) => ({ ...m, has_received_payout: !!m.has_received_payout }));

    return res.json({
      group,
      totals,
      members: membersFixed,
      next_cycle: nextCycle || null,
    });
  } catch (err) {
    console.error('getDashboard error:', err);
    return res.status(500).json({ error: 'Something went wrong while building the dashboard' });
  }
}

module.exports = { createGroup, joinGroup, listMyGroups, getGroup, listMembers, getDashboard };
