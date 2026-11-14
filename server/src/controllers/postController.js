const posts = require('../services/postService');
const { toUrls } = require('../middleware/upload');

const send = (res, data, status = 200) => res.status(status).json(data);

module.exports = {
  create: async (req, res) => send(res, { post: await posts.createPost(req.user, req.body || {}, toUrls('posts', req.files)) }, 201),
  feed: async (req, res) => send(res, await posts.feed(req.user, { scope: req.query.scope, before: req.query.before })),
  hashtag: async (req, res) => send(res, await posts.byHashtag(req.user, req.params.tag, req.query.before)),
  search: async (req, res) => send(res, await posts.searchPosts(req.user, req.query.q, req.query.before)),
  get: async (req, res) => send(res, { post: await posts.getPost(req.user, req.params.id) }),
  update: async (req, res) => send(res, { post: await posts.updatePost(req.user, req.params.id, req.body || {}) }),
  remove: async (req, res) => { await posts.deletePost(req.user, req.params.id); send(res, { message: 'ลบโพสต์แล้ว' }); },
  like: async (req, res) => send(res, await posts.like(req.user, req.params.id)),
  unlike: async (req, res) => send(res, await posts.unlike(req.user, req.params.id)),
  listComments: async (req, res) => send(res, { comments: await posts.listComments(req.user, req.params.id) }),
  addComment: async (req, res) => send(res, { comment: await posts.addComment(req.user, req.params.id, req.body || {}, toUrls('posts', req.files)) }, 201),
  updateComment: async (req, res) => send(res, { comment: await posts.updateComment(req.user, req.params.id, req.body || {}) }),
  removeComment: async (req, res) => { await posts.deleteComment(req.user, req.params.id); send(res, { message: 'ลบคอมเมนต์แล้ว' }); },
};
