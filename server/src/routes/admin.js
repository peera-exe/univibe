const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const mod = require('../controllers/moderationController');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('admin'));

router.get('/teachers', ctrl.listTeachers);
router.post('/teachers/:id/approve', ctrl.approveTeacher);
router.post('/teachers/:id/reject', ctrl.rejectTeacher);

router.get('/reports', mod.listReports);
router.post('/reports/post/:postId/resolve', mod.resolveReports);

router.get('/users', mod.listUsers);
router.post('/users/:id/suspend', mod.suspend);
router.post('/users/:id/unsuspend', mod.unsuspend);

router.get('/posts', mod.listPosts);
router.get('/comments', mod.listComments);

module.exports = router;
