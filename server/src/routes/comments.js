const router = require('express').Router();
const ctrl = require('../controllers/postController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);
router.patch('/:id', ctrl.updateComment);
router.delete('/:id', ctrl.removeComment);

module.exports = router;
