const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');
const Block = require('../models/Block');
const HttpError = require('../utils/httpError');
const notifications = require('./notificationService');

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'รหัสผู้ใช้ไม่ถูกต้อง');
}

async function follow(me, targetId) {
  assertId(targetId);
  if (String(me._id) === String(targetId)) throw new HttpError(400, 'ไม่สามารถติดตามตัวเองได้');
  const target = await User.findOne({ _id: targetId, isDeleted: false, approval: 'approved' });
  if (!target) throw new HttpError(404, 'ไม่พบผู้ใช้');
  const blocked = await Block.exists({ $or: [{ blocker: me._id, blocked: target._id }, { blocker: target._id, blocked: me._id }] });
  if (blocked) throw new HttpError(403, 'ไม่สามารถติดตามผู้ใช้นี้ได้');
  const created = await Follow.updateOne(
    { follower: me._id, following: target._id },
    { $setOnInsert: { follower: me._id, following: target._id } },
    { upsert: true },
  );
  if (created.upsertedCount) {
    await notifications.notify({
      user: target._id, type: 'follow', actor: me._id,
      link: `/profile.html?u=${me.username}`, dedupeKey: `follow:${me._id}:${target._id}`,
    });
  }
  return { following: true };
}

async function unfollow(me, targetId) {
  assertId(targetId);
  await Follow.deleteOne({ follower: me._id, following: targetId });
  return { following: false };
}

// รหัสผู้ใช้ที่เราติดตามอยู่ (ใช้กรองฟีด)
async function followingIds(userId) {
  const rows = await Follow.find({ follower: userId }).select('following').lean();
  return rows.map((r) => r.following);
}

module.exports = { follow, unfollow, followingIds };
