const router = require('express').Router();
const ctrl = require('../controllers/assignmentController');
const { requireLogin } = require('../middleware/auth');
const { documentUploader, verifyDocument } = require('../middleware/upload');

const upload = documentUploader('submissions').single('file');

router.use(requireLogin);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/submission', upload, verifyDocument, ctrl.submit);
router.get('/:id/submissions', ctrl.submissions);

module.exports = router;
