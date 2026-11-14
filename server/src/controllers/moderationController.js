const svc = require('../services/moderationService');

module.exports = {
  report: async (req, res) => res.status(201).json(await svc.reportPost(req.user, req.params.id, req.body || {})),
  listReports: async (req, res) => {
    const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    res.json({ reports: await svc.listReports(status), openCount: await svc.openReportsCount(), reasons: svc.REASONS });
  },
  resolveReports: async (req, res) => res.json(await svc.resolveReports(req.user, req.params.postId, req.body || {})),
  listUsers: async (req, res) => res.json({ users: await svc.listUsers({ q: req.query.q, filter: req.query.filter }) }),
  suspend: async (req, res) => res.json(await svc.suspend(req.user, req.params.id, req.body || {})),
  unsuspend: async (req, res) => res.json(await svc.unsuspend(req.user, req.params.id)),
  listPosts: async (req, res) => res.json({ posts: await svc.listPosts({ q: req.query.q, before: req.query.before }) }),
  listComments: async (req, res) => res.json({ comments: await svc.listComments({ q: req.query.q, before: req.query.before }) }),
};
