const { Schema, model } = require('mongoose');

const messageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, trim: true, maxlength: 2000, default: '' },
  images: { type: [String], default: [], validate: [(v) => v.length <= 4, 'ส่งรูปได้ไม่เกิน 4 รูปต่อข้อความ'] },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // ใช้ทำ "อ่านแล้ว" และจำนวนที่ยังไม่อ่าน
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

messageSchema.pre('validate', function () {
  if (!this.isDeleted && !this.text && this.images.length === 0) {
    this.invalidate('text', 'ข้อความต้องมีตัวอักษรหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  }
});

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = model('Message', messageSchema);
