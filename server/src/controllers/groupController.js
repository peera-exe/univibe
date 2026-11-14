const groups = require('../services/groupService');
const { toUrls } = require('../middleware/upload');

const image = (req) => (req.file ? toUrls('avatars', [req.file])[0] : undefined);

module.exports = {
  search: async (req, res) => res.json({ groups: await groups.search(req.user, req.query.q) }),
  mine: async (req, res) => res.json({ groups: await groups.mine(req.user) }),
  create: async (req, res) => res.status(201).json({ group: await groups.create(req.user, req.body || {}, image(req)) }),
  get: async (req, res) => res.json({ group: await groups.detail(req.user, req.params.id) }),
  update: async (req, res) => res.json({ group: await groups.update(req.user, req.params.id, req.body || {}, image(req)) }),
  join: async (req, res) => res.json(await groups.join(req.user, req.params.id)),
  leave: async (req, res) => res.json(await groups.leave(req.user, req.params.id)),
  members: async (req, res) => res.json({ members: await groups.members(req.user, req.params.id) }),
  requests: async (req, res) => res.json({ requests: await groups.requests(req.user, req.params.id) }),
  approve: async (req, res) => res.json(await groups.decide(req.user, req.params.id, req.params.userId, true)),
  reject: async (req, res) => res.json(await groups.decide(req.user, req.params.id, req.params.userId, false)),
  kick: async (req, res) => res.json(await groups.kick(req.user, req.params.id, req.params.userId)),
};
