const mongoose = require('mongoose');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const HttpError = require('../utils/httpError');
const { VISIBILITY } = require('../utils/constants');
const { extractHashtags, escapeRegex } = require('../utils/text');
const { followingIds } = require('./followService');
const notifications = require('./notificationService');

const PAGE_SIZE = 10;
const AUTHOR_FIELDS = 'username displayName avatarUrl role status isDeleted';

function assertId(id, label = 'รหัสอ้างอิง') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
}

function cleanText(value, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) throw new HttpError(400, `ข้อความยาวเกินไป (ไม่เกิน ${max} ตัวอักษร)`);
  return text;
}

function serializeAuthor(a) {
  if (!a || a.isDeleted) return { deleted: true, displayName: 'บัญชีที่ถูกลบ' };
  return { _id: a._id, username: a.username, displayName: a.displayName, avatarUrl: a.avatarUrl, role: a.role, status: a.status };
}

const isAdmin = (viewer) => viewer.role === 'admin';
const same = (a, b) => String(a && a._id ? a._id : a) === String(b && b._id ? b._id : b);

async function serializePosts(posts, viewer) {
  const likes = await Like.find({ user: viewer._id, post: { $in: posts.map((p) => p._id) } }).select('post').lean();
  const liked = new Set(likes.map((l) => String(l.post)));
  return posts.map((p) => ({
    _id: p._id,
    text: p.text,
    images: p.images,
    visibility: p.visibility,
    hashtags: p.hashtags,
    likesCount: p.likesCount,
    commentsCount: p.commentsCount,
    createdAt: p.createdAt,
    editedAt: p.editedAt,
    author: serializeAuthor(p.author),
    likedByMe: liked.has(String(p._id)),
    canEdit: same(p.author, viewer),
    canDelete: same(p.author, viewer) || isAdmin(viewer),
  }));
}

// โพสต์ที่ผู้ชมมองเห็นได้: สาธารณะ + ของตัวเอง + ของคนที่ติดตาม (รวมแบบเฉพาะผู้ติดตาม)
async function visibleFilter(viewer) {
  const following = await followingIds(viewer._id);
  return { isDeleted: false, $or: [{ visibility: 'public' }, { author: { $in: [viewer._id, ...following] } }] };
}

async function page(query, viewer, before) {
  const filter = { ...query };
  if (before) {
    assertId(before, 'ตัวชี้หน้า');
    filter._id = { $lt: before };
  }
  const rows = await Post.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE + 1).populate('author', AUTHOR_FIELDS);
  const hasMore = rows.length > PAGE_SIZE;
  const posts = await serializePosts(rows.slice(0, PAGE_SIZE), viewer);
  return { posts, nextCursor: hasMore ? posts[posts.length - 1]._id : null };
}

// ---------- โพสต์ ----------
async function createPost(viewer, body, imageUrls) {
  const text = cleanText(body.text, 2000);
  const visibility = VISIBILITY.includes(body.visibility) ? body.visibility : 'public';
  if (!text && imageUrls.length === 0) throw new HttpError(400, 'โพสต์ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  const post = await Post.create({ author: viewer._id, text, images: imageUrls, visibility, hashtags: extractHashtags(text) });
  await post.populate('author', AUTHOR_FIELDS);
  return (await serializePosts([post], viewer))[0];
}

async function feed(viewer, { scope, before }) {
  if (scope === 'following') {
    const following = await followingIds(viewer._id);
    return page({ isDeleted: false, author: { $in: [viewer._id, ...following] } }, viewer, before);
  }
  return page(await visibleFilter(viewer), viewer, before);
}

async function byHashtag(viewer, tag, before) {
  const base = await visibleFilter(viewer);
  return page({ $and: [base, { hashtags: String(tag).toLowerCase() }] }, viewer, before);
}

async function searchPosts(viewer, q, before) {
  const term = String(q || '').trim();
  if (!term) return { posts: [], nextCursor: null };
  const base = await visibleFilter(viewer);
  return page({ $and: [base, { text: { $regex: escapeRegex(term), $options: 'i' } }] }, viewer, before);
}

async function byAuthor(viewer, authorId, before) {
  if (same(authorId, viewer)) return page({ isDeleted: false, author: authorId }, viewer, before);
  const isFollower = await Follow.exists({ follower: viewer._id, following: authorId });
  const visibility = isFollower || isAdmin(viewer) ? { $in: VISIBILITY } : 'public';
  return page({ isDeleted: false, author: authorId, visibility }, viewer, before);
}

// แท็บ "รูป" ในโปรไฟล์: รูปทั้งหมดจากโพสต์ของเจ้าของโปรไฟล์ (เคารพสิทธิ์การมองเห็นเหมือนโพสต์) เรียงใหม่ → เก่า
const PHOTO_PAGE = 12;
async function photosByAuthor(viewer, authorId, before) {
  const filter = { isDeleted: false, author: authorId, 'images.0': { $exists: true } };
  if (!same(authorId, viewer) && !isAdmin(viewer)) {
    const isFollower = await Follow.exists({ follower: viewer._id, following: authorId });
    if (!isFollower) filter.visibility = 'public';
  }
  if (before) {
    assertId(before, 'ตัวชี้หน้า');
    filter._id = { $lt: before };
  }
  const rows = await Post.find(filter).sort({ _id: -1 }).limit(PHOTO_PAGE + 1).select('images');
  const hasMore = rows.length > PHOTO_PAGE;
  const used = rows.slice(0, PHOTO_PAGE);
  const photos = [];
  used.forEach((p) => p.images.forEach((url, i) => photos.push({ url, postId: p._id, index: i, count: p.images.length })));
  return { photos, nextCursor: hasMore ? used[used.length - 1]._id : null };
}

async function canView(post, viewer) {
  if (same(post.author, viewer) || post.visibility === 'public' || isAdmin(viewer)) return true;
  return Boolean(await Follow.exists({ follower: viewer._id, following: post.author._id || post.author }));
}

// ซ่อนการมีอยู่ของโพสต์ที่ไม่มีสิทธิ์ดู (ตอบ 404 เหมือนไม่พบ)
async function loadViewablePost(viewer, id) {
  assertId(id, 'รหัสโพสต์');
  const post = await Post.findOne({ _id: id, isDeleted: false }).populate('author', AUTHOR_FIELDS);
  if (!post || !(await canView(post, viewer))) throw new HttpError(404, 'ไม่พบโพสต์');
  return post;
}

async function getPost(viewer, id) {
  const post = await loadViewablePost(viewer, id);
  return (await serializePosts([post], viewer))[0];
}

async function updatePost(viewer, id, body) {
  assertId(id, 'รหัสโพสต์');
  const post = await Post.findOne({ _id: id, isDeleted: false }).populate('author', AUTHOR_FIELDS);
  if (!post) throw new HttpError(404, 'ไม่พบโพสต์');
  if (!same(post.author, viewer)) throw new HttpError(403, 'แก้ไขได้เฉพาะโพสต์ของตัวเอง');
  const text = body.text === undefined ? post.text : cleanText(body.text, 2000);
  if (!text && post.images.length === 0) throw new HttpError(400, 'โพสต์ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  if (body.visibility !== undefined) {
    if (!VISIBILITY.includes(body.visibility)) throw new HttpError(400, 'ตัวเลือกผู้เห็นโพสต์ไม่ถูกต้อง');
    post.visibility = body.visibility;
  }
  post.text = text;
  post.hashtags = extractHashtags(text);
  post.editedAt = new Date();
  await post.save();
  return (await serializePosts([post], viewer))[0];
}

async function deletePost(viewer, id) {
  assertId(id, 'รหัสโพสต์');
  const post = await Post.findOne({ _id: id, isDeleted: false });
  if (!post) throw new HttpError(404, 'ไม่พบโพสต์');
  if (!same(post.author, viewer) && !isAdmin(viewer)) throw new HttpError(403, 'ลบได้เฉพาะโพสต์ของตัวเองหรือโดยแอดมิน');
  post.isDeleted = true;
  post.deletedBy = viewer._id;
  await post.save();
}

// ---------- ไลก์ ----------
async function like(viewer, id) {
  const post = await loadViewablePost(viewer, id);
  const res = await Like.updateOne({ user: viewer._id, post: post._id }, { $setOnInsert: { user: viewer._id, post: post._id } }, { upsert: true });
  if (res.upsertedCount) {
    await Post.updateOne({ _id: post._id }, { $inc: { likesCount: 1 } });
    await notifications.notify({
      user: post.author._id, type: 'like', actor: viewer._id, post: post._id,
      link: `/post.html?id=${post._id}`, dedupeKey: `like:${post._id}:${viewer._id}`,
    });
  }
  const fresh = await Post.findById(post._id).select('likesCount');
  return { liked: true, likesCount: fresh.likesCount };
}

async function unlike(viewer, id) {
  assertId(id, 'รหัสโพสต์');
  const res = await Like.deleteOne({ user: viewer._id, post: id });
  if (res.deletedCount) await Post.updateOne({ _id: id, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } });
  const fresh = await Post.findById(id).select('likesCount');
  return { liked: false, likesCount: fresh ? fresh.likesCount : 0 };
}

// ---------- คอมเมนต์ ----------
function serializeComment(c, viewer, postAuthorId) {
  return {
    _id: c._id,
    post: c.post,
    text: c.text,
    images: c.images,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    author: serializeAuthor(c.author),
    canEdit: same(c.author, viewer),
    canDelete: same(c.author, viewer) || same(postAuthorId, viewer) || isAdmin(viewer),
  };
}

async function listComments(viewer, postId) {
  const post = await loadViewablePost(viewer, postId);
  const rows = await Comment.find({ post: post._id, isDeleted: false }).sort({ _id: 1 }).limit(200).populate('author', AUTHOR_FIELDS);
  return rows.map((c) => serializeComment(c, viewer, post.author._id));
}

async function addComment(viewer, postId, body, imageUrls) {
  const post = await loadViewablePost(viewer, postId);
  const text = cleanText(body.text, 1000);
  if (!text && imageUrls.length === 0) throw new HttpError(400, 'คอมเมนต์ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  const comment = await Comment.create({ post: post._id, author: viewer._id, text, images: imageUrls });
  await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });
  await comment.populate('author', AUTHOR_FIELDS);
  await notifications.notify({ user: post.author._id, type: 'comment', actor: viewer._id, post: post._id, link: `/post.html?id=${post._id}` });
  return serializeComment(comment, viewer, post.author._id);
}

async function loadComment(id) {
  assertId(id, 'รหัสคอมเมนต์');
  const comment = await Comment.findOne({ _id: id, isDeleted: false }).populate('author', AUTHOR_FIELDS);
  if (!comment) throw new HttpError(404, 'ไม่พบคอมเมนต์');
  return comment;
}

async function updateComment(viewer, id, body) {
  const comment = await loadComment(id);
  if (!same(comment.author, viewer)) throw new HttpError(403, 'แก้ไขได้เฉพาะคอมเมนต์ของตัวเอง');
  const text = cleanText(body.text, 1000);
  if (!text && comment.images.length === 0) throw new HttpError(400, 'คอมเมนต์ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  comment.text = text;
  comment.editedAt = new Date();
  await comment.save();
  const post = await Post.findById(comment.post).select('author');
  return serializeComment(comment, viewer, post && post.author);
}

async function deleteComment(viewer, id) {
  const comment = await loadComment(id);
  const post = await Post.findById(comment.post).select('author');
  const allowed = same(comment.author, viewer) || (post && same(post.author, viewer)) || isAdmin(viewer);
  if (!allowed) throw new HttpError(403, 'ไม่มีสิทธิ์ลบคอมเมนต์นี้');
  comment.isDeleted = true;
  comment.deletedBy = viewer._id;
  await comment.save();
  await Post.updateOne({ _id: comment.post, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } });
}

module.exports = {
  createPost, feed, byHashtag, searchPosts, byAuthor, photosByAuthor, getPost, updatePost, deletePost,
  like, unlike, listComments, addComment, updateComment, deleteComment, loadViewablePost,
};
