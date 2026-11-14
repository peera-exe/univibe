const HttpError = require('../utils/httpError');

// จำกัดจำนวนครั้งต่อช่วงเวลา (เก็บในหน่วยความจำ เหมาะกับเซิร์ฟเวอร์เครื่องเดียว)
function rateLimit({ windowMs, max, keyFn, message }) {
  const hits = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  const limiter = (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) return next(new HttpError(429, message));
    req.rateLimitKey = key;
    next();
  };
  limiter.reset = (key) => hits.delete(key);
  return limiter;
}

module.exports = rateLimit;
