const router = require('express').Router();
const ctrl = require('../controllers/postController');
const moderation = require('../controllers/moderationController');
const { requireLogin } = require('../middleware/auth');
const { imageUploader, verifyImages } = require('../middleware/upload');

const postImages = imageUploader('posts', 10).array('images', 10);
const commentImages = imageUploader('posts', 4).array('images', 4);

router.use(requireLogin);

router.get('/feed', ctrl.feed);
router.get('/search', ctrl.search);
router.get('/hashtag/:tag', ctrl.hashtag);
router.post('/', postImages, verifyImages, ctrl.create);

router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

router.post('/:id/report', moderation.report);
router.post('/:id/like', ctrl.like);
router.delete('/:id/like', ctrl.unlike);

router.get('/:id/comments', ctrl.listComments);
router.post('/:id/comments', commentImages, verifyImages, ctrl.addComment);

module.exports = router;
