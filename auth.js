const jwt = require("jsonwebtoken");

// ===== Sozlamalar (productionda .env orqali berish tavsiya etiladi) =====
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access-secret-key-dev";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-secret-key-dev";

const ACCESS_TOKEN_TTL = "15m"; // access token 15 daqiqa yashaydi
const REFRESH_TOKEN_TTL = "7d"; // refresh token 7 kun yashaydi

// ===== Refresh tokenlar shu yerda saqlanadi (RAM, database yo'q) =====
// Har bir userId uchun bir nechta refresh token bo'lishi mumkin (masalan bir nechta qurilma)
let refreshTokens = new Map(); // userId -> Set(tokenlar)

function addRefreshToken(userId, token) {
  if (!refreshTokens.has(userId)) {
    refreshTokens.set(userId, new Set());
  }
  refreshTokens.get(userId).add(token);
}

function hasRefreshToken(userId, token) {
  return refreshTokens.has(userId) && refreshTokens.get(userId).has(token);
}

function removeRefreshToken(userId, token) {
  if (refreshTokens.has(userId)) {
    refreshTokens.get(userId).delete(token);
  }
}

function removeAllRefreshTokens(userId) {
  refreshTokens.delete(userId);
}

// ===== Token generatsiya qilish =====
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function generateRefreshToken(user) {
  const token = jwt.sign(
    { id: user.id, username: user.username },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );
  addRefreshToken(user.id, token);
  return token;
}

// ===== Middleware: access tokenni tekshirish =====
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: "Access token berilmagan" });
  }

  jwt.verify(token, ACCESS_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ error: "Access token yaroqsiz yoki muddati o'tgan" });
    }
    req.user = payload; // { id, username }
    next();
  });
}

module.exports = {
  ACCESS_SECRET,
  REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
  hasRefreshToken,
  removeRefreshToken,
  removeAllRefreshTokens,
};
