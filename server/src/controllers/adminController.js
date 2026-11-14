const authService = require('../services/authService');

async function listTeachers(req, res) {
  const allowed = ['pending', 'approved', 'rejected'];
  const approval = allowed.includes(req.query.status) ? req.query.status : undefined;
  res.json({ teachers: await authService.listTeachers(approval) });
}

async function approveTeacher(req, res) {
  res.json({ teacher: await authService.decideTeacher(req.params.id, 'approve') });
}

async function rejectTeacher(req, res) {
  res.json({ teacher: await authService.decideTeacher(req.params.id, 'reject') });
}

module.exports = { listTeachers, approveTeacher, rejectTeacher };
