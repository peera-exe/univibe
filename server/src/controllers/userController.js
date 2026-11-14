const users = require('../services/userService');
const follows = require('../services/followService');
const blocks = require('../services/blockService');
const posts = require('../services/postService');
const HttpError = require('../utils/httpError');
const { toUrls } = require('../middleware/upload');

module.exports = {
  search: async (req, res) => res.json({ users: await users.search(req.query.q, req.query.status) }),
  profile: async (req, res) => res.json({ user: await users.profile(req.user, req.params.username) }),
  posts: async (req, res) => {
    const authorId = await users.findIdByUsername(req.params.username);
    res.json(await posts.byAuthor(req.user, authorId, req.query.before));
  },
  followers: async (req, res) => res.json({ users: await users.connections(req.user, req.params.username, 'followers') }),
  following: async (req, res) => res.json({ users: await users.connections(req.user, req.params.username, 'following') }),
  photos: async (req, res) => {
    const authorId = await users.findIdByUsername(req.params.username);
    res.json(await posts.photosByAuthor(req.user, authorId, req.query.before));
  },
  blocks: async (req, res) => res.json({ users: await blocks.list(req.user) }),
  block: async (req, res) => res.json(await blocks.block(req.user, req.params.id)),
  unblock: async (req, res) => res.json(await blocks.unblock(req.user, req.params.id)),
  follow: async (req, res) => res.json(await follows.follow(req.user, req.params.id)),
  unfollow: async (req, res) => res.json(await follows.unfollow(req.user, req.params.id)),

  updateMe: async (req, res) => res.json({ user: await users.updateProfile(req.user, req.body || {}) }),
  setAvatar: async (req, res) => {
    if (!req.file) throw new HttpError(400, 'กรุณาเลือกรูปภาพ');
    res.json({ user: await users.setImage(req.user, 'avatarUrl', toUrls('avatars', [req.file])[0]) });
  },
  setCover: async (req, res) => {
    if (!req.file) throw new HttpError(400, 'กรุณาเลือกรูปภาพ');
    res.json({ user: await users.setImage(req.user, 'coverUrl', toUrls('avatars', [req.file])[0]) });
  },
  changePassword: async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    await users.changePassword(req.user, oldPassword, newPassword);
    res.json({ message: 'เปลี่ยนรหัสผ่านแล้ว' });
  },
  changeEmail: async (req, res) => {
    const { password, email } = req.body || {};
    res.json({ user: await users.changeEmail(req.user, password, email) });
  },
};
