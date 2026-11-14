const { Schema, model } = require('mongoose');

const likeSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
}, { timestamps: true });

likeSchema.index({ user: 1, post: 1 }, { unique: true }); // 1 คน ไลก์ 1 โพสต์ได้ครั้งเดียว
likeSchema.index({ post: 1 });

module.exports = model('Like', likeSchema);
