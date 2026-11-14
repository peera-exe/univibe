const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Post = require('../models/Post');
const Block = require('../models/Block');
const blockService = require('./blockService');
const HttpError = require('../utils/httpError');
const { escapeRegex } = require('../utils/text');
const { UPLOAD_DIR } = require('../config/env');
const auth = require('./authService');

const USERNAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const PUBLIC_FIELDS = 'username displayName bio avatarUrl coverUrl role status faculty major department createdAt';

function summary(u) {
  return {
    _id: u._id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl,
    role: u.role, status: u.status, faculty: u.faculty, major: u.major, department: u.department,
  };
}

// ---------- โปรไฟล์และค้นหา ----------
async function profile(viewer, username) {
  const user = await User.findOne({ username: String(username).toLowerCase(), isDeleted: false, approval: 'approved' }).select(PUBLIC_FIELDS + ' connectionsVisibility showFacultyMajor allowMessagesFrom showOnlineStatus');
  if (!user) throw new HttpError(404, 'ไม่พบผู้ใช้');
  const isMe = String(user._id) === String(viewer._id);
  const [followers, following, isFollowing, postsCount] = await Promise.all([
    Follow.countDocuments({ following: user._id }),
    Follow.countDocuments({ follower: user._id }),
    isMe ? false : Follow.exists({ follower: viewer._id, following: user._id }).then(Boolean),
    countVisiblePosts(viewer, user, isMe),
  ]);
  const relation = isMe ? { isBlocked: false, blockedMe: false } : await blockService.relation(viewer._id, user._id);
  const canViewList = await canViewConnections(viewer, user, isMe);
  const data = { ...user.toObject(), followers, following, postsCount, isMe, isFollowing, canViewConnections: canViewList, ...relation };
  if (!isMe) {
    // การตั้งค่าส่วนตัว คนอื่นไม่ต้องเห็น และซ่อนคณะ/สาขาถ้าเจ้าของไม่เปิด (แอดมินยังเห็น)
    if (user.showFacultyMajor === false && viewer.role !== 'admin') { delete data.faculty; delete data.major; delete data.department; }
    delete data.connectionsVisibility; delete data.showFacultyMajor; delete data.allowMessagesFrom; delete data.showOnlineStatus;
  }
  return data;
}

async function countVisiblePosts(viewer, author, isMe) {
  const filter = { author: author._id, isDeleted: false };
  if (!isMe && viewer.role !== 'admin') {
    const isFollower = await Follow.exists({ follower: viewer._id, following: author._id });
    if (!isFollower) filter.visibility = 'public';
  }
  return Post.countDocuments(filter);
}

// ดูรายชื่อผู้ติดตาม/กำลังติดตามของเจ้าของโปรไฟล์ได้หรือไม่ (ตามที่เจ้าของตั้งค่าไว้)
async function canViewConnections(viewer, owner, isMe) {
  if (isMe || viewer.role === 'admin') return true;
  if (await blockService.isBlockedEither(viewer._id, owner._id)) return false;
  const mode = owner.connectionsVisibility || 'everyone';
  if (mode === 'everyone') return true;
  if (mode === 'only_me') return false;
  return Boolean(await Follow.exists({ follower: viewer._id, following: owner._id }));
}

// รายชื่อผู้ติดตาม (kind = 'followers') หรือคนที่กำลังติดตาม (kind = 'following')
async function connections(viewer, username, kind) {
  const owner = await User.findOne({ username: String(username).toLowerCase(), isDeleted: false, approval: 'approved' }).select(PUBLIC_FIELDS + ' connectionsVisibility');
  if (!owner) throw new HttpError(404, 'ไม่พบผู้ใช้');
  const isMe = String(owner._id) === String(viewer._id);
  if (!(await canViewConnections(viewer, owner, isMe))) throw new HttpError(403, 'ผู้ใช้นี้ไม่เปิดให้ดูรายชื่อผู้ติดตามและกำลังติดตาม');
  const [mine, key, other] = kind === 'followers' ? [{ following: owner._id }, 'follower', 'follower'] : [{ follower: owner._id }, 'following', 'following'];
  const rows = await Follow.find(mine).sort({ createdAt: -1 }).limit(200).select(other).lean();
  const ids = rows.map((r) => r[other]);
  const [people, blocks, followed] = await Promise.all([
    User.find({ _id: { $in: ids }, isDeleted: false, approval: 'approved' }).select(PUBLIC_FIELDS),
    Block.find({ $or: [{ blocker: viewer._id, blocked: { $in: ids } }, { blocked: viewer._id, blocker: { $in: ids } }] }).lean(),
    Follow.find({ follower: viewer._id, following: { $in: ids } }).select('following').lean(),
  ]);
  const hidden = new Set(blocks.map((b) => String(b.blocker) === String(viewer._id) ? String(b.blocked) : String(b.blocker)));
  const followedSet = new Set(followed.map((f) => String(f.following)));
  const byId = new Map(people.map((u) => [String(u._id), u]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter((u) => u && !hidden.has(String(u._id)))
    .map((u) => ({ ...summary(u), isMe: String(u._id) === String(viewer._id), isFollowing: followedSet.has(String(u._id)) }));
}

async function findIdByUsername(username) {
  const user = await User.findOne({ username: String(username).toLowerCase(), isDeleted: false, approval: 'approved' }).select('_id');
  if (!user) throw new HttpError(404, 'ไม่พบผู้ใช้');
  return user._id;
}

async function search(q, status) {
  const filter = { isDeleted: false, approval: 'approved', role: { $ne: 'admin' } };
  const term = String(q || '').trim().replace(/^@/, ''); // พิมพ์ @username ก็ค้นเจอ
  if (term) {
    const re = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ displayName: re }, { username: re }];
  }
  if (status === 'student' || status === 'alumni') {
    filter.role = 'user';
    filter.status = status;
  } else if (status === 'teacher') {
    filter.role = 'teacher';
  }
  const users = await User.find(filter).sort({ displayName: 1 }).limit(30).select(PUBLIC_FIELDS);
  return users.map(summary);
}

// ---------- แก้ไขโปรไฟล์ ----------
async function updateProfile(user, body) {
  // ชื่อที่แสดงมาจากทะเบียน แก้เองไม่ได้ (ส่งค่าเดิมมาได้ แต่เปลี่ยนไม่ได้)
  if (body.displayName !== undefined && String(body.displayName).trim() !== user.displayName) {
    throw new HttpError(400, 'ชื่อที่แสดงมาจากทะเบียน แก้เองไม่ได้ (เปลี่ยนได้เฉพาะ username)');
  }
  if (body.username !== undefined) {
    const next = String(body.username).trim().toLowerCase().replace(/^@/, '');
    if (next !== user.username) {
      auth.checkUsername(next);
      if (/^del_/.test(next)) throw new HttpError(400, 'username นี้ใช้ไม่ได้');
      const waitMs = user.usernameChangedAt ? user.usernameChangedAt.getTime() + USERNAME_COOLDOWN_MS - Date.now() : 0;
      if (waitMs > 0) throw new HttpError(429, `เปลี่ยน username ได้ทุก 14 วัน (รออีก ${Math.ceil(waitMs / 86400000)} วัน)`);
      if (await User.exists({ username: next, _id: { $ne: user._id } })) throw new HttpError(409, 'username นี้มีคนใช้แล้ว');
      user.username = next;
      user.usernameChangedAt = new Date();
    }
  }
  if (body.showFacultyMajor !== undefined) user.showFacultyMajor = body.showFacultyMajor === true;
  if (body.showOnlineStatus !== undefined) user.showOnlineStatus = body.showOnlineStatus === true;
  if (body.allowMessagesFrom !== undefined) {
    if (!['everyone', 'following', 'nobody'].includes(body.allowMessagesFrom)) throw new HttpError(400, 'ตัวเลือกผู้ส่งข้อความไม่ถูกต้อง');
    user.allowMessagesFrom = body.allowMessagesFrom;
  }
  if (body.connectionsVisibility !== undefined) {
    if (!['everyone', 'followers', 'only_me'].includes(body.connectionsVisibility)) throw new HttpError(400, 'ตัวเลือกการมองเห็นไม่ถูกต้อง');
    user.connectionsVisibility = body.connectionsVisibility;
  }
  if (body.bio !== undefined) {
    const bio = String(body.bio).trim();
    if (bio.length > 300) throw new HttpError(400, 'ประวัติย่อต้องไม่เกิน 300 ตัวอักษร');
    user.bio = bio;
  }
  try {
    await user.save();
  } catch (err) {
    if (err && err.code === 11000) throw new HttpError(409, 'username นี้มีคนใช้แล้ว');
    throw err;
  }
  return user;
}

function removeOldImage(url) {
  const m = /^\/files\/avatars\/([a-f0-9]{32}\.(jpg|png|webp))$/.exec(url || '');
  if (m) fs.unlink(path.join(UPLOAD_DIR, 'avatars', m[1]), () => {});
}

async function setImage(user, field, url) {
  removeOldImage(user[field]);
  user[field] = url;
  await user.save();
  return user;
}

// ---------- บัญชี ----------
async function verifyPassword(userId, password) {
  const withHash = await User.findById(userId).select('+passwordHash');
  const ok = typeof password === 'string' && (await bcrypt.compare(password, withHash.passwordHash));
  if (!ok) throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  return withHash;
}

async function changePassword(user, oldPassword, newPassword) {
  auth.checkPassword(newPassword);
  const withHash = await verifyPassword(user._id, oldPassword);
  withHash.passwordHash = await bcrypt.hash(newPassword, auth.BCRYPT_COST);
  await withHash.save();
}

async function changeEmail(user, password, email) {
  const next = String(email || '').trim().toLowerCase();
  auth.checkEmail(next);
  await verifyPassword(user._id, password);
  user.email = next;
  await user.save();
  return user;
}

module.exports = { connections, profile, findIdByUsername, search, updateProfile, setImage, changePassword, changeEmail };
