const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { requireLogin } = require('../middleware/auth');
const { imageUploader, verifyImages } = require('../middleware/upload');

const oneImage = imageUploader('avatars', 1).single('image');

router.use(requireLogin);

router.get('/search', ctrl.search);
router.get('/me/blocks', ctrl.blocks);

router.patch('/me', ctrl.updateMe);
router.post('/me/avatar', oneImage, verifyImages, ctrl.setAvatar);
router.post('/me/cover', oneImage, verifyImages, ctrl.setCover);
router.post('/me/password', ctrl.changePassword);
router.post('/me/email', ctrl.changeEmail);

router.post('/:id/block', ctrl.block);
router.delete('/:id/block', ctrl.unblock);
router.post('/:id/follow', ctrl.follow);
router.delete('/:id/follow', ctrl.unfollow);
router.get('/:username/posts', ctrl.posts);
router.get('/:username/photos', ctrl.photos);
router.get('/:username/followers', ctrl.followers);
router.get('/:username/following', ctrl.following);
router.get('/:username', ctrl.profile);

module.exports = router;
