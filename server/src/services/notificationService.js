const Notification = require('../models/Notification');
const HttpError = require('../utils/httpError');

// สร้างแจ้งเตือน (ไม่แจ้งตัวเอง) ถ้ามี dedupeKey แล้วจะไม่สร้างซ้ำ เช่น กดไลก์-เลิกไลก์วนไปมา
async function notify({ user, type, actor, post, group, assignment, link, text, dedupeKey }) {
  if (actor && String(actor) === String(user)) return null;
  try {
    return await Notification.create({ user, type, actor, post, group, assignment, link, text, dedupeKey });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
}

const MESSAGES = {
  like: (n) => `${n} ถูกใจโพสต์ของคุณ`,
  comment: (n) => `${n} แสดงความคิดเห็นในโพสต์ของคุณ`,
  follow: (n) => `${n} เริ่มติดตามคุณ`,
};

function describe(n) {
  const name = n.actor ? n.actor.displayName : 'ผู้ใช้';
  return MESSAGES[n.type] ? MESSAGES[n.type](name) : (n.text || 'มีการแจ้งเตือนใหม่');
}

async function list(userId, { limit = 20, before } = {}) {
  const filter = { user: userId };
  if (before) filter._id = { $lt: before };
  const items = await Notification.find(filter).sort({ _id: -1 }).limit(Math.min(Number(limit) || 20, 50))
    .populate('actor', 'username displayName avatarUrl isDeleted');
  return items.map((n) => ({
    _id: n._id,
    type: n.type,
    text: describe(n),
    link: n.link || null,
    actor: n.actor && !n.actor.isDeleted ? { username: n.actor.username, displayName: n.actor.displayName, avatarUrl: n.actor.avatarUrl } : null,
    read: Boolean(n.readAt),
    createdAt: n.createdAt,
  }));
}

function unreadCount(userId) {
  return Notification.countDocuments({ user: userId, readAt: { $exists: false } });
}

async function markRead(userId, id) {
  const res = await Notification.updateOne({ _id: id, user: userId, readAt: { $exists: false } }, { readAt: new Date() });
  return res.modifiedCount;
}

async function markAllRead(userId) {
  await Notification.updateMany({ user: userId, readAt: { $exists: false } }, { readAt: new Date() });
}

module.exports = { notify, list, unreadCount, markRead, markAllRead, HttpError };
