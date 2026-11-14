const { Schema, model } = require('mongoose');

const commentSchema = new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, trim: true, maxlength: 1000, default: '' },
  images: { type: [String], default: [], validate: [(v) => v.length <= 4, 'แนบรูปในคอมเมนต์ได้ไม่เกิน 4 รูป'] },
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

commentSchema.pre('validate', function () {
  if (!this.text && this.images.length === 0) {
    this.invalidate('text', 'คอมเมนต์ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  }
});

commentSchema.index({ post: 1, createdAt: 1 });

module.exports = model('Comment', commentSchema);
