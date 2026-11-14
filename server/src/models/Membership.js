// สมาชิกกลุ่ม และคำขอเข้ากลุ่ม (status = pending) อยู่ในคอลเลกชันเดียวกัน
const { Schema, model } = require('mongoose');

const membershipSchema = new Schema({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'manager', 'member'], default: 'member' },
  status: { type: String, enum: ['active', 'pending'], default: 'active' },
  // registration = เข้าอัตโนมัติจากการลงทะเบียนเรียน, request = ขออนุมัติ, open = กลุ่มเปิด, created = ผู้สร้าง, assigned = แอดมินกำหนด
  source: { type: String, enum: ['registration', 'request', 'open', 'created', 'assigned'], default: 'open' },
}, { timestamps: true });

membershipSchema.index({ group: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1, status: 1 });

module.exports = model('Membership', membershipSchema);
