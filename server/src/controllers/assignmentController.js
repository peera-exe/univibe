const announcements = require('../services/announcementService');
const assignments = require('../services/assignmentService');
const HttpError = require('../utils/httpError');

module.exports = {
  announcements: async (req, res) => res.json({ announcements: await announcements.list(req.user, req.params.id) }),
  createAnnouncement: async (req, res) => res.status(201).json({ announcement: await announcements.create(req.user, req.params.id, req.body || {}) }),
  updateAnnouncement: async (req, res) => res.json({ announcement: await announcements.update(req.user, req.params.id, req.body || {}) }),
  removeAnnouncement: async (req, res) => res.json(await announcements.remove(req.user, req.params.id)),

  list: async (req, res) => res.json({ assignments: await assignments.list(req.user, req.params.id) }),
  create: async (req, res) => res.status(201).json({ assignment: await assignments.create(req.user, req.params.id, req.body || {}) }),
  get: async (req, res) => res.json({ assignment: await assignments.get(req.user, req.params.id) }),
  update: async (req, res) => res.json({ assignment: await assignments.update(req.user, req.params.id, req.body || {}) }),
  remove: async (req, res) => res.json(await assignments.remove(req.user, req.params.id)),
  submit: async (req, res) => {
    if (!req.file) throw new HttpError(400, 'กรุณาเลือกไฟล์ที่จะส่ง');
    res.status(201).json({ submission: await assignments.submit(req.user, req.params.id, req.file) });
  },
  submissions: async (req, res) => res.json(await assignments.submissions(req.user, req.params.id)),
  grade: async (req, res) => res.json({ submission: await assignments.grade(req.user, req.params.id, req.body || {}) }),
  download: async (req, res, next) => {
    const f = await assignments.fileFor(req.user, req.params.id);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(f.absolute, f.name, (err) => { if (err && !res.headersSent) next(new HttpError(404, 'ไม่พบไฟล์')); });
  },
};
