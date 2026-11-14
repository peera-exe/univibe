// direct = แชทส่วนตัว 1 ต่อ 1 (members 2 คน), group = แชทของกลุ่ม (สมาชิกมาจาก Membership)
const { Schema, model } = require('mongoose');

const conversationSchema = new Schema({
  type: { type: String, enum: ['direct', 'group'], required: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  pairKey: String, // direct: id สองคนเรียงลำดับแล้วต่อด้วย ":" กันสร้างห้องซ้ำ
  group: { type: Schema.Types.ObjectId, ref: 'Group' },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessagePreview: { type: String, maxlength: 100 },
}, { timestamps: true });

conversationSchema.pre('validate', function () {
  if (this.type === 'direct' && (this.members.length !== 2 || !this.pairKey)) {
    this.invalidate('members', 'แชทส่วนตัวต้องมีสมาชิก 2 คน');
  }
  if (this.type === 'group' && !this.group) {
    this.invalidate('group', 'แชทกลุ่มต้องระบุกลุ่ม');
  }
});

conversationSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } } });
conversationSchema.index({ group: 1 }, { unique: true, partialFilterExpression: { type: 'group' } });
conversationSchema.index({ members: 1, lastMessageAt: -1 });

module.exports = model('Conversation', conversationSchema);
