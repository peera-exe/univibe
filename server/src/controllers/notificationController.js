const n = require('../services/notificationService');

module.exports = {
  list: async (req, res) => res.json({ notifications: await n.list(req.user._id, { limit: req.query.limit, before: req.query.before }) }),
  unreadCount: async (req, res) => res.json({ count: await n.unreadCount(req.user._id) }),
  readAll: async (req, res) => { await n.markAllRead(req.user._id); res.json({ ok: true }); },
  read: async (req, res) => { await n.markRead(req.user._id, req.params.id); res.json({ ok: true }); },
};
