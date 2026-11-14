const mongoose = require('mongoose');
const { MONGO_URL } = require('./env');

mongoose.set('strictQuery', true);

async function connectDB() {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  console.log('เชื่อมต่อ MongoDB สำเร็จ:', mongoose.connection.name);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
