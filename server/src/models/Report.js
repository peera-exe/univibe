const { Schema, model } = require('mongoose');

const reportSchema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' }, // resolved = ลบโพสต์แล้ว
  handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  handledAt: Date,
  resolutionNote: { type: String, maxlength: 500 },
}, { timestamps: true });

reportSchema.index({ reporter: 1, post: 1 }, { unique: true }); // รายงานโพสต์เดิมซ้ำไม่ได้
reportSchema.index({ status: 1, createdAt: 1 });

module.exports = model('Report', reportSchema);
