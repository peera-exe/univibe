const router = require('express').Router();
const ctrl = require('../controllers/assignmentController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);
router.get('/:id/file', ctrl.download);
router.patch('/:id/grade', ctrl.grade);

module.exports = router;
