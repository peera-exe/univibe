const router = require('express').Router();
const ctrl = require('../controllers/chatController');
const { requireLogin } = require('../middleware/auth');
const { imageUploader, verifyImages } = require('../middleware/upload');

const chatImages = imageUploader('chat', 4).array('images', 4);

router.use(requireLogin);

router.get('/unread-count', ctrl.unreadCount);
router.get('/conversations', ctrl.list);
router.post('/direct', ctrl.startDirect);
router.get('/conversations/:id', ctrl.get);
router.get('/conversations/:id/messages', ctrl.messages);
router.post('/conversations/:id/messages', chatImages, verifyImages, ctrl.send);
router.post('/conversations/:id/read', ctrl.read);
router.patch('/messages/:id', ctrl.edit);
router.delete('/messages/:id', ctrl.remove);

module.exports = router;
