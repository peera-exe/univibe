const router = require('express').Router();
const ctrl = require('../controllers/courseController');
const asg = require('../controllers/assignmentController');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

router.get('/', ctrl.list);
router.get('/timetable', ctrl.timetable); // ต้องอยู่ก่อน /:id

router.get('/:id', ctrl.get);
router.get('/:id/members', ctrl.members);
router.delete('/:id/members/:userId', ctrl.removeMember);
router.patch('/:id/schedule', ctrl.updateSchedule);

router.get('/:id/announcements', asg.announcements);
router.post('/:id/announcements', asg.createAnnouncement);
router.get('/:id/assignments', asg.list);
router.post('/:id/assignments', asg.create);

router.post('/:id/join', ctrl.join);
router.post('/:id/cancel-request', ctrl.cancelRequest);
router.post('/:id/leave', ctrl.leave);
router.get('/:id/requests', ctrl.requests);
router.post('/:id/requests/:userId/approve', ctrl.approve);
router.post('/:id/requests/:userId/reject', ctrl.reject);

module.exports = router;
