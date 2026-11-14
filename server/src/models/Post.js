const { Schema, model } = require('mongoose');
const { VISIBILITY } = require('../utils/constants');

const postSchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, trim: true, maxlength: 2000, default: '' },
  images: { type: [String], default: [], validate: [(v) => v.length <= 10, 'แนบรูปได้ไม่เกิน 10 รูป'] },
  visibility: { type: String, enum: VISIBILITY, default: 'public' },
  hashtags: { type: [String], default: [] }, // เก็บเป็นตัวพิมพ์เล็ก ไม่มี #
  likesCount: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

postSchema.pre('validate', function () {
  if (!this.text && this.images.length === 0) {
    this.invalidate('text', 'โพสต์ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง');
  }
});

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ hashtags: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

module.exports = model('Post', postSchema);
