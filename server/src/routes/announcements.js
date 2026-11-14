const router = require('express').Router();
const ctrl = require('../controllers/assignmentController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);
router.patch('/:id', ctrl.updateAnnouncement);
router.delete('/:id', ctrl.removeAnnouncement);

module.exports = router;
