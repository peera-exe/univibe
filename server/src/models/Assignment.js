const { Schema, model } = require('mongoose');

const assignmentSchema = new Schema({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, default: '', maxlength: 5000 },
  dueAt: { type: Date, required: true },   // กำหนดส่ง (ส่งหลังจากนี้ติดป้าย "ส่งช้า")
  closeAt: { type: Date, required: true }, // ปิดรับงาน (พ้นเวลานี้ส่งไม่ได้)
  maxScore: { type: Number, default: 100, min: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

assignmentSchema.path('closeAt').validate(function (value) {
  return !this.dueAt || value >= this.dueAt;
}, 'เวลาปิดรับงานต้องไม่ก่อนกำหนดส่ง');

assignmentSchema.index({ group: 1, dueAt: 1 });

module.exports = model('Assignment', assignmentSchema);
