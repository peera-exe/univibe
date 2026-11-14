// กลุ่มมี 2 ประเภท: course (แอดมินสร้าง มีประกาศ/ตารางเรียน/งาน/แชท) และ general (ผู้ใช้สร้าง มีแค่แชท)
const { Schema, model } = require('mongoose');
const { DAYS, GROUP_TYPES } = require('../utils/constants');

const slotSchema = new Schema({
  day: { type: String, enum: DAYS, required: true },
  startMin: { type: Number, required: true, min: 0, max: 1439 },
  endMin: { type: Number, required: true, min: 1, max: 1440 },
  room: { type: String, required: true, trim: true },
}, { _id: false });

slotSchema.path('endMin').validate(function (value) {
  return value > this.startMin;
}, 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม');

const courseInfoSchema = new Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  section: { type: String, required: true, trim: true, default: '1' },
  semester: { type: String, required: true, trim: true }, // เช่น 1/2569
  credits: { type: Number, min: 0, max: 12, default: 3 },
  teachers: [{ type: Schema.Types.ObjectId, ref: 'User' }], // อาจารย์ผู้จัดการกลุ่ม
  schedule: { type: [slotSchema], default: [] },
}, { _id: false });

const groupSchema = new Schema({
  type: { type: String, enum: GROUP_TYPES, required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 500 },
  avatarUrl: String,
  privacy: { type: String, enum: ['open', 'closed'], default: 'open' }, // ใช้กับกลุ่มทั่วไป
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // ผู้สร้าง (กลุ่มรายวิชา = แอดมิน)
  course: { type: courseInfoSchema },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

groupSchema.pre('validate', function () {
  if (this.type === 'course' && !this.course) {
    this.invalidate('course', 'กลุ่มรายวิชาต้องมีข้อมูลวิชา');
  }
  if (this.type === 'general' && this.course) {
    this.invalidate('course', 'กลุ่มทั่วไปไม่มีข้อมูลวิชา');
  }
});

groupSchema.index({ type: 1, name: 1 });
groupSchema.index(
  { 'course.code': 1, 'course.section': 1, 'course.semester': 1 },
  { unique: true, partialFilterExpression: { type: 'course' } },
);

module.exports = model('Group', groupSchema);
