const router = require('express').Router();
const ctrl = require('../controllers/courseController');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('admin'));

router.get('/teachers', ctrl.adminTeachers); // ต้องอยู่ก่อนเส้นทางที่มี /:id
router.get('/', ctrl.adminList);
router.post('/', ctrl.adminCreate);
router.patch('/:id', ctrl.adminUpdate);
router.delete('/:id', ctrl.adminRemove);
router.get('/:id/enrollments', ctrl.adminEnrollments);
router.post('/:id/enrollments', ctrl.adminEnroll);
router.delete('/:id/enrollments/:studentId', ctrl.adminUnenroll);

module.exports = router;
