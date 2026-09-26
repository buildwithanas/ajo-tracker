const pool = require('../config/db');

async function listContributions(req, res) {
  try {
    const groupId = req.params.id;
    const { cycle_id, member_id, status } = req.query;

    let query = `
      SELECT ct.*, u.full_name AS member_name, cy.cycle_number, cy.due_date
      FROM contributions ct
      JOIN group_members gm ON gm.id = ct.member_id
      JOIN users u ON u.id = gm.user_id
      JOIN cycles cy ON cy.id = ct.cycle_id
      WHERE ct.group_id = ?
    `;
    const params = [groupId];

    if (cycle_id) {
      query += ' AND ct.cycle_id = ?';
      params.push(cycle_id);
    }
    if (member_id) {
      query += ' AND ct.member_id = ?';
      params.push(member_id);
    }
    if (status) {
      query += ' AND ct.status = ?';
      params.push(status);
    }
    query += ' ORDER BY cy.cycle_number ASC, u.full_name ASC';

    const [rows] = await pool.query(query, params);
    return res.json({ contributions: rows });
  } catch (err) {
    console.error('listContributions error:', err);
    return res.status(500).json({ error: 'Something went wrong while fetching contributions' });
  }
}

// A member marks their own contribution as paid. An admin can mark it on behalf of any member.
async function payContribution(req, res) {
  try {
    const contributionId = req.params.contributionId;
    const { note } = req.body;

    const [[contribution]] = await pool.query('SELECT * FROM contributions WHERE id = ?', [
      contributionId,
    ]);
    if (!contribution) return res.status(404).json({ error: 'Contribution not found' });

    const [[membership]] = await pool.query(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [contribution.group_id, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const isOwnContribution = contribution.member_id === membership.id;
    const isAdmin = membership.role === 'admin';
    if (!isOwnContribution && !isAdmin) {
      return res.status(403).json({ error: 'You can only mark your own contribution as paid' });
    }

    if (contribution.status === 'paid') {
      return res.status(409).json({ error: 'This contribution is already marked as paid' });
    }

    await pool.query(
      `UPDATE contributions SET status = 'paid', paid_at = NOW(), note = ? WHERE id = ?`,
      [note || null, contributionId]
    );

    const [[updated]] = await pool.query('SELECT * FROM contributions WHERE id = ?', [
      contributionId,
    ]);
    return res.json({ contribution: updated });
  } catch (err) {
    console.error('payContribution error:', err);
    return res.status(500).json({ error: 'Something went wrong while marking the contribution paid' });
  }
}

module.exports = { listContributions, payContribution };
