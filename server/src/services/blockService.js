const mongoose = require('mongoose');
const Block = require('../models/Block');
const Follow = require('../models/Follow');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { publicUser, USER_FIELDS } = require('../utils/serialize');

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'รหัสผู้ใช้ไม่ถูกต้อง');
}

// บล็อก: ส่งข้อความ/ติดตามกันไม่ได้ และยกเลิกการติดตามทั้งสองทาง (โปรไฟล์และโพสต์สาธารณะยังเห็นได้)
async function block(me, targetId) {
  assertId(targetId);
  if (String(me._id) === String(targetId)) throw new HttpError(400, 'ไม่สามารถบล็อกตัวเองได้');
  const target = await User.exists({ _id: targetId, isDeleted: false });
  if (!target) throw new HttpError(404, 'ไม่พบผู้ใช้');
  await Block.updateOne({ blocker: me._id, blocked: targetId }, { $setOnInsert: { blocker: me._id, blocked: targetId } }, { upsert: true });
  await Follow.deleteMany({ $or: [{ follower: me._id, following: targetId }, { follower: targetId, following: me._id }] });
  return { blocked: true };
}

async function unblock(me, targetId) {
  assertId(targetId);
  await Block.deleteOne({ blocker: me._id, blocked: targetId });
  return { blocked: false };
}

async function list(me) {
  const rows = await Block.find({ blocker: me._id }).sort({ createdAt: -1 }).populate('blocked', USER_FIELDS);
  return rows.filter((r) => r.blocked && !r.blocked.isDeleted).map((r) => publicUser(r.blocked));
}

// มีการบล็อกระหว่างสองคนในทิศทางใดทิศทางหนึ่งหรือไม่
async function isBlockedEither(a, b) {
  return Boolean(await Block.exists({ $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }] }));
}

// สำหรับหน้าโปรไฟล์: เราบล็อกเขา / เขาบล็อกเรา
async function relation(viewerId, targetId) {
  const [iBlocked, blockedMe] = await Promise.all([
    Block.exists({ blocker: viewerId, blocked: targetId }),
    Block.exists({ blocker: targetId, blocked: viewerId }),
  ]);
  return { isBlocked: Boolean(iBlocked), blockedMe: Boolean(blockedMe) };
}

module.exports = { block, unblock, list, isBlockedEither, relation };
