const courses = require('../services/courseService');
const admin = require('../services/courseAdminService');

module.exports = {
  list: async (req, res) => res.json({
    courses: await courses.list(req.user, { scope: req.query.scope, q: req.query.q, semester: req.query.semester }),
    semesters: await courses.semesters(),
  }),
  timetable: async (req, res) => res.json(await courses.myTimetable(req.user, req.query.semester)),
  get: async (req, res) => res.json({ course: await courses.detail(req.user, req.params.id) }),
  members: async (req, res) => res.json({ members: await courses.members(req.user, req.params.id) }),
  join: async (req, res) => res.json(await courses.requestJoin(req.user, req.params.id)),
  cancelRequest: async (req, res) => res.json(await courses.cancelRequest(req.user, req.params.id)),
  leave: async (req, res) => res.json(await courses.leave(req.user, req.params.id)),
  requests: async (req, res) => res.json({ requests: await courses.requests(req.user, req.params.id) }),
  approve: async (req, res) => res.json(await courses.decide(req.user, req.params.id, req.params.userId, true)),
  reject: async (req, res) => res.json(await courses.decide(req.user, req.params.id, req.params.userId, false)),
  removeMember: async (req, res) => res.json(await courses.removeMember(req.user, req.params.id, req.params.userId)),
  updateSchedule: async (req, res) => res.json({ course: await courses.updateSchedule(req.user, req.params.id, req.body || {}) }),

  // แอดมิน
  adminTeachers: async (req, res) => res.json({ teachers: await admin.searchTeachers(req.query.q) }),
  adminList: async (req, res) => res.json({ courses: await admin.list(req.user, { semester: req.query.semester, q: req.query.q }) }),
  adminCreate: async (req, res) => res.status(201).json({ course: await admin.create(req.user, req.body || {}) }),
  adminUpdate: async (req, res) => res.json({ course: await admin.update(req.user, req.params.id, req.body || {}) }),
  adminRemove: async (req, res) => res.json(await admin.remove(req.params.id)),
  adminEnrollments: async (req, res) => res.json({ enrollments: await admin.enrollments(req.params.id) }),
  adminEnroll: async (req, res) => res.status(201).json(await admin.enroll(req.params.id, req.body || {})),
  adminUnenroll: async (req, res) => res.json(await admin.unenroll(req.params.id, req.params.studentId)),
};
