const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireMember, requireAdmin } = require('../controllers/groupHelpers');
const groupController = require('../controllers/groupController');
const cycleController = require('../controllers/cycleController');
const contributionController = require('../controllers/contributionController');

router.use(requireAuth);

router.post('/', groupController.createGroup);
router.post('/join', groupController.joinGroup);
router.get('/', groupController.listMyGroups);

router.get('/:id', requireMember, groupController.getGroup);
router.get('/:id/members', requireMember, groupController.listMembers);
router.get('/:id/dashboard', requireMember, groupController.getDashboard);

router.post('/:id/cycles', requireAdmin, cycleController.createCycle);
router.get('/:id/cycles', requireMember, cycleController.listCycles);
router.patch('/:id/cycles/:cycleId/close', requireAdmin, cycleController.closeCycle);

router.get('/:id/contributions', requireMember, contributionController.listContributions);
router.patch('/:id/contributions/:contributionId/pay', requireMember, contributionController.payContribution);

module.exports = router;
