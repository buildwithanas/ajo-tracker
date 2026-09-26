const pool = require('../config/db');

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getMembership(groupId, userId) {
  const [rows] = await pool.query(
    'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  );
  return rows[0] || null;
}

async function requireMember(req, res, next) {
  const groupId = req.params.id || req.params.groupId;
  const membership = await getMembership(groupId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }
  req.membership = membership;
  next();
}

async function requireAdmin(req, res, next) {
  const groupId = req.params.id || req.params.groupId;
  const membership = await getMembership(groupId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }
  if (membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only a group admin can perform this action' });
  }
  req.membership = membership;
  next();
}

module.exports = { generateInviteCode, getMembership, requireMember, requireAdmin };
