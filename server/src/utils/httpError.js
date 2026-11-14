// error ที่มี status code ใช้โยนจาก service แล้ว errorHandler จะตอบเป็น JSON ให้
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
module.exports = HttpError;
