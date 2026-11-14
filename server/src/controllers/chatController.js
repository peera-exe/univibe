const chat = require('../services/chatService');
const { toUrls } = require('../middleware/upload');

module.exports = {
  list: async (req, res) => res.json({ conversations: await chat.listConversations(req.user) }),
  get: async (req, res) => res.json({ conversation: await chat.getConversation(req.user, req.params.id) }),
  startDirect: async (req, res) => res.json({ conversation: await chat.startDirect(req.user, (req.body || {}).userId) }),
  messages: async (req, res) => res.json(await chat.listMessages(req.user, req.params.id, req.query.before)),
  send: async (req, res) => res.status(201).json({ message: await chat.sendMessage(req.user, req.params.id, req.body || {}, toUrls('chat', req.files)) }),
  edit: async (req, res) => res.json({ message: await chat.editMessage(req.user, req.params.id, req.body || {}) }),
  remove: async (req, res) => res.json({ message: await chat.deleteMessage(req.user, req.params.id) }),
  read: async (req, res) => res.json(await chat.markRead(req.user, req.params.id)),
  unreadCount: async (req, res) => res.json({ count: await chat.unreadTotal(req.user) }),
};
