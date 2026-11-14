const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Membership = require('../models/Membership');
const Group = require('../models/Group');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { publicUser, USER_FIELDS } = require('../utils/serialize');
const realtime = require('../sockets/realtime');
const blocks = require('./blockService');
const Block = require('../models/Block');

const PAGE_SIZE = 40;
const same = (a, b) => String(a && a._id ? a._id : a) === String(b && b._id ? b._id : b);

function assertId(id, label = 'รหัสอ้างอิง') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
}

// ---------- สิทธิ์เข้าห้องแชท ----------
async function memberIds(conv) {
  if (conv.type === 'direct') return conv.members.map((m) => String(m._id || m));
  const ids = await Membership.find({ group: conv.group, status: 'active' }).distinct('user');
  return ids.map(String);
}

async function hasAccess(conv, userId) {
  if (conv.type === 'direct') return conv.members.some((m) => same(m, userId));
  return Boolean(await Membership.exists({ group: conv.group, user: userId, status: 'active' }));
}

async function loadConversation(me, id) {
  assertId(id, 'รหัสห้องแชท');
  const conv = await Conversation.findById(id);
  if (!conv || !(await hasAccess(conv, me._id))) throw new HttpError(404, 'ไม่พบห้องแชท');
  return conv;
}

// สำหรับ socket: คืนรายชื่อสมาชิกถ้ามีสิทธิ์ ไม่เช่นนั้นคืน null
async function memberIdsIfAllowed(convId, userId) {
  if (!mongoose.isValidObjectId(convId)) return null;
  const conv = await Conversation.findById(convId);
  if (!conv || !(await hasAccess(conv, userId))) return null;
  return memberIds(conv);
}

async function canModerate(conv, me) {
  if (conv.type !== 'group') return false;
  return Boolean(await Group.exists({ _id: conv.group, type: 'general', owner: me._id }));
}

function directKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

// ---------- รูปแบบข้อมูล ----------
function serializeMessage(m) {
  return {
    _id: m._id,
    conversation: m.conversation,
    sender: publicUser(m.sender),
    text: m.isDeleted ? '' : m.text,
    images: m.isDeleted ? [] : m.images,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    isDeleted: m.isDeleted,
    readBy: (m.readBy || []).map(String),
  };
}

async function unreadMap(userId, convIds) {
  if (!convIds.length) return new Map();
  const rows = await Message.aggregate([
    { $match: { conversation: { $in: convIds }, sender: { $ne: userId }, readBy: { $ne: userId }, isDeleted: false } },
    { $group: { _id: '$conversation', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

async function conversationIds(userId) {
  const direct = await Conversation.find({ type: 'direct', members: userId }).select('_id').lean();
  const groupIds = await Membership.find({ user: userId, status: 'active' }).distinct('group');
  const groups = await Conversation.find({ type: 'group', group: { $in: groupIds } }).select('_id').lean();
  return [...direct, ...groups].map((c) => c._id);
}

async function describeMany(convs, me) {
  const partnerIds = convs.filter((c) => c.type === 'direct').map((c) => c.members.find((m) => !same(m, me._id)));
  const groupIds = convs.filter((c) => c.type === 'group').map((c) => c.group);
  const [partners, groups, unread, blockRows] = await Promise.all([
    User.find({ _id: { $in: partnerIds } }).select(USER_FIELDS + ' showOnlineStatus'),
    Group.find({ _id: { $in: groupIds } }),
    unreadMap(me._id, convs.map((c) => c._id)),
    Block.find({ $or: [{ blocker: me._id }, { blocked: me._id }] }).lean(),
  ]);
  const partnerById = new Map(partners.map((u) => [String(u._id), u]));
  const groupById = new Map(groups.map((g) => [String(g._id), g]));
  const blockedWith = new Set(blockRows.map((b) => (same(b.blocker, me._id) ? String(b.blocked) : String(b.blocker))));

  return convs.map((c) => {
    const base = {
      _id: c._id,
      type: c.type,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview || '',
      unread: unread.get(String(c._id)) || 0,
    };
    if (c.type === 'direct') {
      const pid = c.members.find((m) => !same(m, me._id));
      const partner = partnerById.get(String(pid));
      const info = publicUser(partner);
      return {
        ...base,
        name: info.displayName,
        avatarUrl: info.avatarUrl,
        partner: { ...info, online: Boolean(partner && !partner.isDeleted && partner.showOnlineStatus !== false && realtime.isOnline(pid)) },
        blocked: blockedWith.has(String(pid)),
        canSend: Boolean(partner && !partner.isDeleted) && !blockedWith.has(String(pid)),
      };
    }
    const g = groupById.get(String(c.group));
    return {
      ...base,
      name: g ? g.name : 'กลุ่ม',
      avatarUrl: g && g.avatarUrl,
      group: g ? { _id: g._id, type: g.type, privacy: g.privacy, isOwner: g.type === 'general' && same(g.owner, me._id) } : null,
      canSend: true,
    };
  });
}

// ---------- ห้องแชท ----------
async function listConversations(me) {
  const ids = await conversationIds(me._id);
  const convs = await Conversation.find({ _id: { $in: ids } }).sort({ lastMessageAt: -1 });
  return describeMany(convs, me);
}

async function getConversation(me, id) {
  const conv = await loadConversation(me, id);
  return (await describeMany([conv], me))[0];
}

// เจ้าของบัญชีตั้งไว้ว่าใครส่งข้อความหาได้ (แอดมินส่งได้เสมอ)
async function assertMayMessage(me, target) {
  if (me.role === 'admin') return;
  const mode = target.allowMessagesFrom || 'everyone';
  if (mode === 'everyone') return;
  if (mode === 'nobody') throw new HttpError(403, 'ผู้ใช้นี้ไม่รับข้อความจากผู้อื่น');
  const Follow = require('../models/Follow');
  if (!(await Follow.exists({ follower: target._id, following: me._id }))) throw new HttpError(403, 'ผู้ใช้นี้รับข้อความเฉพาะจากคนที่เขาติดตาม');
}

async function startDirect(me, targetId) {
  assertId(targetId, 'รหัสผู้ใช้');
  if (same(targetId, me._id)) throw new HttpError(400, 'ไม่สามารถแชทกับตัวเองได้');
  const target = await User.findOne({ _id: targetId, isDeleted: false, approval: 'approved' });
  if (!target) throw new HttpError(404, 'ไม่พบผู้ใช้');
  if (await blocks.isBlockedEither(me._id, target._id)) throw new HttpError(403, 'ไม่สามารถแชทกับผู้ใช้นี้ได้');
  await assertMayMessage(me, target);
  const pairKey = directKey(me._id, target._id);
  let conv = await Conversation.findOne({ pairKey });
  if (!conv) {
    try {
      conv = await Conversation.create({ type: 'direct', members: [me._id, target._id], pairKey });
    } catch (err) {
      if (err.code !== 11000) throw err;
      conv = await Conversation.findOne({ pairKey });
    }
  }
  return (await describeMany([conv], me))[0];
}

// ---------- ข้อความ ----------
async function listMessages(me, convId, before) {
  const conv = await loadConversation(me, convId);
  const filter = { conversation: conv._id };
  if (before) {
    assertId(before, 'ตัวชี้หน้า');
    filter._id = { $lt: before };
  }
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE + 1).populate('sender', USER_FIELDS);
  const hasMore = rows.length > PAGE_SIZE;
  const messages = rows.slice(0, PAGE_SIZE).reverse().map(serializeMessage);
  return { messages, hasMore };
}

function cleanText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > 2000) throw new HttpError(400, 'ข้อความยาวเกินไป (ไม่เกิน 2000 ตัวอักษร)');
  return text;
}

async function sendMessage(me, convId, body, imageUrls) {
  const conv = await loadConversation(me, convId);
  if (conv.type === 'direct') {
    const partnerId = conv.members.find((m) => !same(m, me._id));
    const partner = await User.findById(partnerId).select('isDeleted allowMessagesFrom');
    if (!partner || partner.isDeleted) throw new HttpError(403, 'บัญชีนี้ถูกลบแล้ว ส่งข้อความไม่ได้');
    await assertMayMessage(me, partner);
    if (await blocks.isBlockedEither(me._id, partnerId)) throw new HttpError(403, 'ไม่สามารถส่งข้อความหาผู้ใช้นี้ได้');
  }
  const text = cleanText(body.text);
  if (!text && imageUrls.length === 0) throw new HttpError(400, 'ข้อความต้องมีตัวอักษรหรือรูปภาพอย่างน้อยหนึ่งอย่าง');

  const message = await Message.create({ conversation: conv._id, sender: me._id, text, images: imageUrls, readBy: [me._id] });
  await Conversation.updateOne({ _id: conv._id }, { lastMessageAt: message.createdAt, lastMessagePreview: (text || 'ส่งรูปภาพ').slice(0, 100) });
  await message.populate('sender', USER_FIELDS);
  const payload = serializeMessage(message);
  realtime.emitToUsers(await memberIds(conv), 'message:new', { conversationId: String(conv._id), message: payload });
  return payload;
}

async function loadOwnMessage(id) {
  assertId(id, 'รหัสข้อความ');
  const message = await Message.findById(id).populate('sender', USER_FIELDS);
  if (!message) throw new HttpError(404, 'ไม่พบข้อความ');
  return message;
}

async function broadcastUpdate(message) {
  const conv = await Conversation.findById(message.conversation);
  const payload = serializeMessage(message);
  realtime.emitToUsers(await memberIds(conv), 'message:update', { conversationId: String(conv._id), message: payload });
  return payload;
}

async function editMessage(me, id, body) {
  const message = await loadOwnMessage(id);
  const conv = await loadConversation(me, message.conversation);
  if (message.isDeleted) throw new HttpError(404, 'ข้อความนี้ถูกลบแล้ว');
  if (!same(message.sender, me)) throw new HttpError(403, 'แก้ไขได้เฉพาะข้อความของตัวเอง');
  const text = cleanText(body.text);
  if (!text && message.images.length === 0) throw new HttpError(400, 'ข้อความต้องไม่ว่างเปล่า');
  message.text = text;
  message.editedAt = new Date();
  await message.save();
  if (conv.type) await Conversation.updateOne({ _id: conv._id, lastMessageAt: message.createdAt }, { lastMessagePreview: (text || 'ส่งรูปภาพ').slice(0, 100) });
  return broadcastUpdate(message);
}

async function deleteMessage(me, id) {
  const message = await loadOwnMessage(id);
  const conv = await loadConversation(me, message.conversation);
  if (message.isDeleted) return serializeMessage(message);
  if (!same(message.sender, me) && !(await canModerate(conv, me))) throw new HttpError(403, 'ไม่มีสิทธิ์ลบข้อความนี้');
  message.isDeleted = true;
  message.text = '';
  message.images = [];
  await message.save();
  await Conversation.updateOne({ _id: conv._id, lastMessageAt: message.createdAt }, { lastMessagePreview: 'ข้อความนี้ถูกลบ' });
  return broadcastUpdate(message);
}

// ---------- อ่านแล้ว / ที่ยังไม่อ่าน ----------
async function markRead(me, convId) {
  const conv = await loadConversation(me, convId);
  const res = await Message.updateMany(
    { conversation: conv._id, sender: { $ne: me._id }, readBy: { $ne: me._id } },
    { $addToSet: { readBy: me._id } },
  );
  if (res.modifiedCount > 0) {
    realtime.emitToUsers(await memberIds(conv), 'messages:read', { conversationId: String(conv._id), userId: String(me._id) });
  }
  return { updated: res.modifiedCount };
}

async function unreadTotal(me) {
  const ids = await conversationIds(me._id);
  const map = await unreadMap(me._id, ids);
  let total = 0;
  for (const n of map.values()) total += n;
  return total;
}

// ผู้ใช้ที่ต้องแจ้งสถานะออนไลน์ให้ (คู่สนทนาแชทส่วนตัว)
async function directPartners(userId) {
  const convs = await Conversation.find({ type: 'direct', members: userId }).select('members').lean();
  return convs.map((c) => c.members.find((m) => !same(m, userId))).filter(Boolean).map(String);
}

module.exports = {
  listConversations, getConversation, startDirect, listMessages, sendMessage, editMessage, deleteMessage,
  markRead, unreadTotal, memberIdsIfAllowed, directPartners,
};
