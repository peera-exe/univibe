// การดูแลเนื้อหาและบัญชี: รายงานโพสต์ คิวรายงานของแอดมิน ระงับ/ปลดระงับบัญชี และรายการโพสต์/คอมเมนต์สำหรับลบ
const mongoose = require('mongoose');
const Report = require('../models/Report');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { escapeRegex } = require('../utils/text');
const { publicUser, USER_FIELDS } = require('../utils/serialize');
const postService = require('./postService');
const notifications = require('./notificationService');
const realtime = require('../sockets/realtime');

const REASONS = ['สแปมหรือโฆษณา', 'เนื้อหาไม่เหมาะสม', 'คุกคามหรือกลั่นแกล้ง', 'ข้อมูลเท็จ', 'อื่น ๆ'];
const AUTHOR_FIELDS = USER_FIELDS + ' isDeleted';

function assertId(id, label) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
}

const author = (a) => (!a || a.isDeleted ? { deleted: true, displayName: 'บัญชีที่ถูกลบ' } : publicUser(a));

// ---------- รายงานโพสต์ (ผู้ใช้ทั่วไป) ----------
async function reportPost(viewer, postId, body) {
  assertId(postId, 'รหัสโพสต์');
  const post = await postService.loadViewablePost(viewer, postId); // ต้องมองเห็นโพสต์นั้นได้ถึงจะรายงานได้
  if (String(post.author._id || post.author) === String(viewer._id)) throw new HttpError(400, 'รายงานโพสต์ของตัวเองไม่ได้');
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const detail = typeof body.detail === 'string' ? body.detail.trim() : '';
  if (!REASONS.includes(category)) throw new HttpError(400, 'กรุณาเลือกเหตุผลที่รายงาน');
  if (detail.length > 400) throw new HttpError(400, 'รายละเอียดต้องไม่เกิน 400 ตัวอักษร');
  try {
    await Report.create({ reporter: viewer._id, post: post._id, reason: detail ? `${category}: ${detail}` : category });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'คุณรายงานโพสต์นี้ไปแล้ว');
    throw err;
  }
  return { reported: true };
}

// ---------- คิวรายงาน (แอดมิน) ----------
// รวมรายงานของโพสต์เดียวกันเป็นหนึ่งรายการ แสดงเหตุผลของทุกคนที่รายงาน
async function listReports(status) {
  const reports = await Report.find({ status }).sort({ createdAt: 1 }).limit(300).populate('reporter', AUTHOR_FIELDS);
  const postIds = [...new Set(reports.map((r) => String(r.post)))];
  const posts = await Post.find({ _id: { $in: postIds } }).populate('author', AUTHOR_FIELDS);
  const postById = new Map(posts.map((p) => [String(p._id), p]));
  const groups = new Map();
  for (const r of reports) {
    const key = String(r.post);
    if (!groups.has(key)) {
      const p = postById.get(key);
      groups.set(key, {
        post: p ? { _id: p._id, text: p.text, images: p.images, createdAt: p.createdAt, isDeleted: p.isDeleted, author: author(p.author) } : null,
        reports: [], firstReportedAt: r.createdAt,
        handledAt: r.handledAt || null, resolutionNote: r.resolutionNote || '',
      });
    }
    groups.get(key).reports.push({ _id: r._id, reporter: author(r.reporter), reason: r.reason, createdAt: r.createdAt });
  }
  return [...groups.values()];
}

async function resolveReports(admin, postId, body) {
  assertId(postId, 'รหัสโพสต์');
  const action = body.action;
  if (!['delete', 'dismiss'].includes(action)) throw new HttpError(400, 'การดำเนินการต้องเป็น delete หรือ dismiss');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const open = await Report.find({ post: postId, status: 'open' });
  if (!open.length) throw new HttpError(404, 'ไม่พบรายงานที่รอดำเนินการของโพสต์นี้');

  if (action === 'delete') {
    await Post.updateOne({ _id: postId, isDeleted: false }, { $set: { isDeleted: true, deletedBy: admin._id } });
  }
  const status = action === 'delete' ? 'resolved' : 'dismissed';
  await Report.updateMany({ post: postId, status: 'open' }, { $set: { status, handledBy: admin._id, handledAt: new Date(), resolutionNote: note } });
  const text = action === 'delete'
    ? 'ขอบคุณที่รายงาน แอดมินตรวจสอบแล้วและลบโพสต์ที่คุณรายงานออกจากระบบ'
    : 'ขอบคุณที่รายงาน แอดมินตรวจสอบแล้วไม่พบการละเมิดกติกา จึงไม่ลบโพสต์ที่คุณรายงาน';
  for (const r of open) {
    await notifications.notify({ user: r.reporter, type: 'report_result', actor: admin._id, post: action === 'delete' ? undefined : postId, link: action === 'delete' ? undefined : `/post.html?id=${postId}`, text, dedupeKey: `report_result:${r._id}` });
  }
  return { status, notified: open.length };
}

async function openReportsCount() {
  return Report.distinct('post', { status: 'open' }).then((l) => l.length);
}

// ---------- ระงับ / ปลดระงับบัญชี ----------
async function listUsers({ q, filter }) {
  const query = { isDeleted: false };
  if (filter === 'suspended') query.isSuspended = true;
  const term = String(q || '').trim();
  if (term) {
    const rx = { $regex: escapeRegex(term), $options: 'i' };
    query.$or = [{ username: rx }, { displayName: rx }, { studentId: rx }, { email: rx }];
  }
  const users = await User.find(query).sort({ createdAt: -1 }).limit(50);
  return users.map((u) => ({
    ...publicUser(u), studentId: u.studentId, email: u.email, approval: u.approval,
    isSuspended: u.isSuspended, suspendedReason: u.suspendedReason || '', lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  }));
}

async function loadTarget(admin, id) {
  assertId(id, 'รหัสผู้ใช้');
  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) throw new HttpError(404, 'ไม่พบผู้ใช้');
  return user;
}

async function suspend(admin, id, body) {
  const user = await loadTarget(admin, id);
  if (String(user._id) === String(admin._id)) throw new HttpError(400, 'ระงับบัญชีของตัวเองไม่ได้');
  if (user.role === 'admin') throw new HttpError(400, 'ระงับบัญชีแอดมินไม่ได้');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > 200) throw new HttpError(400, 'เหตุผลต้องไม่เกิน 200 ตัวอักษร');
  user.isSuspended = true;
  user.suspendedReason = reason || undefined;
  await user.save();
  realtime.disconnectUser(user._id); // ตัดแชทเรียลไทม์ทันที ส่วนเว็บจะถูกเตะออกตอนคำขอถัดไป
  return { _id: user._id, isSuspended: true };
}

async function unsuspend(admin, id) {
  const user = await loadTarget(admin, id);
  user.isSuspended = false;
  user.suspendedReason = undefined;
  await user.save();
  return { _id: user._id, isSuspended: false };
}

// ---------- รายการเนื้อหาให้แอดมินค้นและลบ ----------
async function listPosts({ q, before }) {
  const query = { isDeleted: false };
  if (q) query.text = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
  if (before && mongoose.isValidObjectId(before)) query._id = { $lt: before };
  const rows = await Post.find(query).sort({ _id: -1 }).limit(20).populate('author', AUTHOR_FIELDS);
  return rows.map((p) => ({ _id: p._id, text: p.text, imagesCount: p.images.length, commentsCount: p.commentsCount, createdAt: p.createdAt, author: author(p.author) }));
}

async function listComments({ q, before }) {
  const query = { isDeleted: false };
  if (q) query.text = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
  if (before && mongoose.isValidObjectId(before)) query._id = { $lt: before };
  const rows = await Comment.find(query).sort({ _id: -1 }).limit(20).populate('author', AUTHOR_FIELDS);
  return rows.map((c) => ({ _id: c._id, post: c.post, text: c.text, createdAt: c.createdAt, author: author(c.author) }));
}

module.exports = { REASONS, reportPost, listReports, resolveReports, openReportsCount, listUsers, suspend, unsuspend, listPosts, listComments };
