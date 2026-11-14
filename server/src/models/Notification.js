const { Schema, model } = require('mongoose');

const TYPES = [
  'like', 'comment', 'follow',
  'group_request', 'group_approved', 'group_rejected',
  'announcement', 'assignment_new', 'assignment_graded',
  'reminder_class', 'reminder_assignment', 'reminder_assignment_last',
  'teacher_approved', 'teacher_rejected', 'report_result',
];

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // ผู้รับ
  type: { type: String, enum: TYPES, required: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  post: { type: Schema.Types.ObjectId, ref: 'Post' },
  group: { type: Schema.Types.ObjectId, ref: 'Group' },
  assignment: { type: Schema.Types.ObjectId, ref: 'Assignment' },
  text: { type: String, maxlength: 300 },
  link: String,
  readAt: Date,
  dedupeKey: String, // กันแจ้งเตือนอัตโนมัติซ้ำ เช่น "class:<groupId>:<วันที่>:<userId>"
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

module.exports = model('Notification', notificationSchema);
module.exports.TYPES = TYPES;
