// กลุ่มทั่วไป (ผู้ใช้สร้าง มีแค่แชท) กลุ่มรายวิชาจัดการในช่วงถัดไป
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const HttpError = require('../utils/httpError');
const { escapeRegex } = require('../utils/text');
const { publicUser, USER_FIELDS } = require('../utils/serialize');
const { UPLOAD_DIR } = require('../config/env');
const notifications = require('./notificationService');

function assertId(id, label = 'รหัสกลุ่ม') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
}

const same = (a, b) => String(a && a._id ? a._id : a) === String(b && b._id ? b._id : b);

function removeOldImage(url) {
  const m = /^\/files\/avatars\/([a-f0-9]{32}\.(jpg|png|webp))$/.exec(url || '');
  if (m) fs.unlink(path.join(UPLOAD_DIR, 'avatars', m[1]), () => {});
}

async function loadGeneralGroup(id) {
  assertId(id);
  const group = await Group.findOne({ _id: id, type: 'general', isDeleted: false });
  if (!group) throw new HttpError(404, 'ไม่พบกลุ่ม');
  return group;
}

async function requireOwner(user, id) {
  const group = await loadGeneralGroup(id);
  if (!same(group.owner, user)) throw new HttpError(403, 'เฉพาะเจ้าของกลุ่มเท่านั้น');
  return group;
}

function cleanFields(body, { partial }) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 100) throw new HttpError(400, 'ชื่อกลุ่มต้องยาว 1–100 ตัวอักษร');
    out.name = name;
  }
  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (description.length > 500) throw new HttpError(400, 'คำอธิบายกลุ่มต้องไม่เกิน 500 ตัวอักษร');
    out.description = description;
  }
  if (body.privacy !== undefined || !partial) {
    const privacy = body.privacy === undefined ? 'open' : body.privacy;
    if (!['open', 'closed'].includes(privacy)) throw new HttpError(400, 'ชนิดกลุ่มไม่ถูกต้อง');
    out.privacy = privacy;
  }
  return out;
}

function summary(group, membership, membersCount) {
  return {
    _id: group._id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    privacy: group.privacy,
    membersCount,
    myStatus: membership ? (membership.status === 'pending' ? 'pending' : membership.role) : null, // null | pending | owner | member
  };
}

async function counts(groupIds) {
  const rows = await Membership.aggregate([
    { $match: { group: { $in: groupIds }, status: 'active' } },
    { $group: { _id: '$group', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

async function summaries(groups, user) {
  const ids = groups.map((g) => g._id);
  const [memberships, count] = await Promise.all([
    Membership.find({ group: { $in: ids }, user: user._id }).lean(),
    counts(ids),
  ]);
  const mine = new Map(memberships.map((m) => [String(m.group), m]));
  return groups.map((g) => summary(g, mine.get(String(g._id)), count.get(String(g._id)) || 0));
}

// ---------- สร้าง/แก้ไข ----------
async function create(user, body, imageUrl) {
  const fields = cleanFields(body, { partial: false });
  const group = await Group.create({ type: 'general', owner: user._id, avatarUrl: imageUrl, description: '', ...fields });
  await Membership.create({ group: group._id, user: user._id, role: 'owner', status: 'active', source: 'created' });
  await Conversation.create({ type: 'group', group: group._id });
  return (await summaries([group], user))[0];
}

async function update(user, id, body, imageUrl) {
  const group = await requireOwner(user, id);
  Object.assign(group, cleanFields(body, { partial: true }));
  if (imageUrl) {
    removeOldImage(group.avatarUrl);
    group.avatarUrl = imageUrl;
  }
  await group.save();
  return (await summaries([group], user))[0];
}

// ---------- ค้นหา/ดู ----------
async function search(user, q) {
  const filter = { type: 'general', isDeleted: false };
  const term = String(q || '').trim();
  if (term) filter.name = { $regex: escapeRegex(term), $options: 'i' };
  const groups = await Group.find(filter).sort({ createdAt: -1 }).limit(30);
  return summaries(groups, user);
}

async function mine(user) {
  const rows = await Membership.find({ user: user._id, status: 'active' }).select('group').lean();
  const groups = await Group.find({ _id: { $in: rows.map((r) => r.group) }, type: 'general', isDeleted: false }).sort({ name: 1 });
  return summaries(groups, user);
}

async function detail(user, id) {
  const group = await loadGeneralGroup(id);
  const base = (await summaries([group], user))[0];
  const isMember = base.myStatus && base.myStatus !== 'pending';
  const result = { ...base, isOwner: same(group.owner, user) };
  if (isMember) {
    const conv = await Conversation.findOne({ type: 'group', group: group._id }).select('_id');
    result.conversationId = conv ? conv._id : null;
  }
  if (result.isOwner) result.pendingCount = await Membership.countDocuments({ group: group._id, status: 'pending' });
  return result;
}

async function members(user, id) {
  const group = await loadGeneralGroup(id);
  const me = await Membership.findOne({ group: group._id, user: user._id, status: 'active' });
  if (!me) throw new HttpError(403, 'ดูรายชื่อสมาชิกได้เฉพาะสมาชิกของกลุ่ม');
  const rows = await Membership.find({ group: group._id, status: 'active' }).sort({ createdAt: 1 }).populate('user', USER_FIELDS);
  const list = rows.filter((r) => r.user && !r.user.isDeleted).map((r) => ({ ...publicUser(r.user), role: r.role }));
  return [...list.filter((m) => m.role === 'owner'), ...list.filter((m) => m.role !== 'owner')]; // เจ้าของกลุ่มขึ้นก่อน
}

// ---------- เข้า/ออกกลุ่ม ----------
async function join(user, id) {
  const group = await loadGeneralGroup(id);
  const existing = await Membership.findOne({ group: group._id, user: user._id });
  if (existing) return { status: existing.status === 'pending' ? 'pending' : existing.role };
  if (group.privacy === 'open') {
    await Membership.create({ group: group._id, user: user._id, role: 'member', status: 'active', source: 'open' });
    return { status: 'member' };
  }
  await Membership.create({ group: group._id, user: user._id, role: 'member', status: 'pending', source: 'request' });
  await notifications.notify({
    user: group.owner, type: 'group_request', actor: user._id, group: group._id,
    link: `/group.html?id=${group._id}`, text: `${user.displayName} ขอเข้าร่วมกลุ่ม ${group.name}`,
    dedupeKey: `grouprequest:${group._id}:${user._id}`,
  });
  return { status: 'pending' };
}

async function leave(user, id) {
  const group = await loadGeneralGroup(id);
  if (same(group.owner, user)) throw new HttpError(400, 'เจ้าของกลุ่มออกจากกลุ่มไม่ได้');
  await Membership.deleteOne({ group: group._id, user: user._id });
  return { status: null };
}

// ---------- เจ้าของกลุ่ม: คำขอเข้าร่วม / เตะสมาชิก ----------
async function requests(user, id) {
  const group = await requireOwner(user, id);
  const rows = await Membership.find({ group: group._id, status: 'pending' }).sort({ createdAt: 1 }).populate('user', USER_FIELDS);
  return rows.filter((r) => r.user && !r.user.isDeleted).map((r) => ({ ...publicUser(r.user), requestedAt: r.createdAt }));
}

async function decide(user, id, targetId, approve) {
  const group = await requireOwner(user, id);
  assertId(targetId, 'รหัสผู้ใช้');
  const pending = await Membership.findOne({ group: group._id, user: targetId, status: 'pending' });
  if (!pending) throw new HttpError(404, 'ไม่พบคำขอเข้าร่วมของผู้ใช้นี้');
  if (approve) {
    pending.status = 'active';
    pending.source = 'request';
    await pending.save();
  } else {
    await pending.deleteOne();
  }
  await notifications.notify({
    user: targetId, type: approve ? 'group_approved' : 'group_rejected', actor: user._id, group: group._id,
    link: approve ? `/group.html?id=${group._id}` : undefined,
    text: approve ? `คุณได้เข้าร่วมกลุ่ม ${group.name} แล้ว` : `คำขอเข้าร่วมกลุ่ม ${group.name} ไม่ได้รับการอนุมัติ`,
  });
  return { status: approve ? 'member' : null };
}

async function kick(user, id, targetId) {
  const group = await requireOwner(user, id);
  assertId(targetId, 'รหัสผู้ใช้');
  if (same(group.owner, targetId)) throw new HttpError(400, 'ไม่สามารถนำเจ้าของกลุ่มออกได้');
  const res = await Membership.deleteOne({ group: group._id, user: targetId, status: 'active' });
  if (!res.deletedCount) throw new HttpError(404, 'ไม่พบสมาชิกคนนี้ในกลุ่ม');
  return { removed: true };
}

module.exports = { create, update, search, mine, detail, members, join, leave, requests, decide, kick };
