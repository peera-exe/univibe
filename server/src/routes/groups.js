const router = require('express').Router();
const ctrl = require('../controllers/groupController');
const { requireLogin } = require('../middleware/auth');
const { imageUploader, verifyImages } = require('../middleware/upload');

const oneImage = imageUploader('avatars', 1).single('image');

router.use(requireLogin);

router.get('/', ctrl.search);
router.get('/mine', ctrl.mine);
router.post('/', oneImage, verifyImages, ctrl.create);

router.get('/:id', ctrl.get);
router.patch('/:id', oneImage, verifyImages, ctrl.update);

router.post('/:id/join', ctrl.join);
router.post('/:id/leave', ctrl.leave);
router.get('/:id/members', ctrl.members);
router.delete('/:id/members/:userId', ctrl.kick);
router.get('/:id/requests', ctrl.requests);
router.post('/:id/requests/:userId/approve', ctrl.approve);
router.post('/:id/requests/:userId/reject', ctrl.reject);

module.exports = router;
