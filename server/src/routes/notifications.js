const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);
router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.readAll);
router.post('/:id/read', ctrl.read);

module.exports = router;
