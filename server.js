const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
  hasRefreshToken,
  removeRefreshToken,
  removeAllRefreshTokens,
  REFRESH_SECRET,
} = require("./auth");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ===== Ma'lumotlar shu yerda saqlanadi (oddiy massiv, database yo'q) =====
let users = [];
let nextId = 1;

let products = [];
let nextProductId = 1;

// ===== Yordamchi: product obyektini validatsiya qilish =====
function validateProductInput(body) {
  const { name, price } = body;

  if (!name || typeof name !== "string") {
    return "name majburiy va string bo'lishi kerak";
  }

  if (price === undefined || price === null || typeof price !== "number" || price < 0) {
    return "price majburiy va manfiy bo'lmagan son bo'lishi kerak";
  }

  return null;
}

// ===== Yordamchi: user obyektini validatsiya qilish (register uchun) =====
function validateRegisterInput(body) {
  const { username, email, name, password } = body;

  if (!username || typeof username !== "string") {
    return "username majburiy va string bo'lishi kerak";
  }

  if (!email || typeof email !== "string") {
    return "email majburiy va string bo'lishi kerak";
  }

  if (!name || typeof name !== "string") {
    return "name majburiy va string bo'lishi kerak";
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return "password majburiy va kamida 6 ta belgidan iborat bo'lishi kerak";
  }

  return null;
}

// ===== Yordamchi: userni tashqariga chiqarishdan oldin passwordni olib tashlash =====
function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

// ==========================================================
// ===================== AUTH ENDPOINTLARI ===================
// ==========================================================

// ===== REGISTER - Ro'yxatdan o'tish =====
app.post("/auth/register", async (req, res) => {
  const error = validateRegisterInput(req.body);

  if (error) {
    return res.status(400).json({ error });
  }

  const { username, email, name, password } = req.body;

  const exists = users.find(
    (user) => user.username === username || user.email === email
  );

  if (exists) {
    return res.status(409).json({
      error: "Bu username yoki email allaqachon mavjud",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = {
    id: nextId++,
    username,
    email,
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  res.status(201).json({
    message: "Ro'yxatdan muvaffaqiyatli o'tildi",
    user: toPublicUser(newUser),
  });
});

// ===== LOGIN - Tizimga kirish =====
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "username va password majburiy",
    });
  }

  // username yoki email orqali qidirish
  const user = users.find(
    (u) => u.username === username || u.email === username
  );

  if (!user) {
    return res.status(401).json({ error: "Username yoki password noto'g'ri" });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    return res.status(401).json({ error: "Username yoki password noto'g'ri" });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.status(200).json({
    message: "Tizimga muvaffaqiyatli kirildi",
    accessToken,
    refreshToken,
    user: toPublicUser(user),
  });
});

// ===== REFRESH - Yangi access token olish =====
app.post("/auth/refresh", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token berilmagan" });
  }

  jwt.verify(refreshToken, REFRESH_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ error: "Refresh token yaroqsiz yoki muddati o'tgan" });
    }

    if (!hasRefreshToken(payload.id, refreshToken)) {
      return res.status(403).json({ error: "Refresh token tanilmadi (bekor qilingan bo'lishi mumkin)" });
    }

    const user = users.find((u) => u.id === payload.id);

    if (!user) {
      return res.status(404).json({ error: "User topilmadi" });
    }

    // Eski refresh tokenni bekor qilib, yangisini beramiz (rotation)
    removeRefreshToken(user.id, refreshToken);

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  });
});

// ===== LOGOUT - Refresh tokenni bekor qilish =====
app.post("/auth/logout", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token berilmagan" });
  }

  jwt.verify(refreshToken, REFRESH_SECRET, (err, payload) => {
    if (!err && payload) {
      removeRefreshToken(payload.id, refreshToken);
    }
    res.status(200).json({ message: "Tizimdan muvaffaqiyatli chiqildi" });
  });
});

// ===== ME - O'zim haqimda ma'lumot (access token bilan himoyalangan) =====
app.get("/auth/me", authenticateToken, (req, res) => {
  const user = users.find((u) => u.id === req.user.id);

  if (!user) {
    return res.status(404).json({ error: "User topilmadi" });
  }

  res.status(200).json(toPublicUser(user));
});

// ==========================================================
// ===================== USERS CRUD (himoyalangan) ============
// ==========================================================
// Quyidagi barcha /users route'lari access token talab qiladi.
// So'rov headerida: Authorization: Bearer <accessToken>

// ===== CREATE - Yangi user qo'shish =====
app.post("/users", authenticateToken, (req, res) => {
  const { username, email, name } = req.body;

  if (!username || !email || !name) {
    return res.status(400).json({
      error: "username, email va name majburiy",
    });
  }

  const exists = users.find(
    (user) => user.username === username || user.email === email
  );

  if (exists) {
    return res.status(409).json({
      error: "Bu username yoki email allaqachon mavjud",
    });
  }

  const newUser = {
    id: nextId++,
    username,
    email,
    name,
    passwordHash: null, // parolsiz yaratilgan user, /auth/register orqali kirolmaydi
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  res.status(201).json({
    message: "User muvaffaqiyatli qo'shildi",
    user: toPublicUser(newUser),
  });
});

// ===== READ - Barcha userlarni olish =====
app.get("/users", authenticateToken, (req, res) => {
  res.status(200).json(users.map(toPublicUser));
});

// ===== READ - Bitta userni olish =====
app.get("/users/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const user = users.find((user) => user.id === id);

  if (!user) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  res.status(200).json(toPublicUser(user));
});

// ===== UPDATE - Userni yangilash =====
app.put("/users/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const user = users.find((user) => user.id === id);

  if (!user) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  const { username, email, name } = req.body;

  if (
    username &&
    users.some((u) => u.username === username && u.id !== id)
  ) {
    return res.status(409).json({
      error: "Bu username band",
    });
  }

  if (
    email &&
    users.some((u) => u.email === email && u.id !== id)
  ) {
    return res.status(409).json({
      error: "Bu email band",
    });
  }

  if (username) user.username = username;
  if (email) user.email = email;
  if (name) user.name = name;

  user.updatedAt = new Date().toISOString();

  res.status(200).json({
    message: "User muvaffaqiyatli yangilandi",
    user: toPublicUser(user),
  });
});

// ===== DELETE - Userni o'chirish =====
app.delete("/users/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const index = users.findIndex((user) => user.id === id);

  if (index === -1) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  const deletedUser = users.splice(index, 1)[0];

  // O'chirilgan userning barcha refresh tokenlarini ham bekor qilamiz
  removeAllRefreshTokens(deletedUser.id);

  res.status(200).json({
    message: "User muvaffaqiyatli o'chirildi",
    user: toPublicUser(deletedUser),
  });
});

// ==========================================================
// ===================== PRODUCTS CRUD (himoyalangan) =========
// ==========================================================
// Quyidagi barcha /products route'lari access token talab qiladi.
// So'rov headerida: Authorization: Bearer <accessToken>

// ===== CREATE - Yangi product qo'shish =====
app.post("/products", authenticateToken, (req, res) => {
  const error = validateProductInput(req.body);

  if (error) {
    return res.status(400).json({ error });
  }

  const { name, price, description, quantity } = req.body;

  const newProduct = {
    id: nextProductId++,
    name,
    price,
    description: description || "",
    quantity: typeof quantity === "number" ? quantity : 0,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };

  products.push(newProduct);

  res.status(201).json({
    message: "Product muvaffaqiyatli qo'shildi",
    product: newProduct,
  });
});

// ===== READ - Barcha productlarni olish =====
app.get("/products", authenticateToken, (req, res) => {
  res.status(200).json(products);
});

// ===== READ - Bitta productni olish =====
app.get("/products/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => product.id === id);

  if (!product) {
    return res.status(404).json({
      error: "Product topilmadi",
    });
  }

  res.status(200).json(product);
});

// ===== UPDATE - Productni yangilash =====
app.put("/products/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => product.id === id);

  if (!product) {
    return res.status(404).json({
      error: "Product topilmadi",
    });
  }

  const { name, price, description, quantity } = req.body;

  if (name !== undefined) {
    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "name string bo'lishi kerak" });
    }
    product.name = name;
  }

  if (price !== undefined) {
    if (typeof price !== "number" || price < 0) {
      return res.status(400).json({ error: "price manfiy bo'lmagan son bo'lishi kerak" });
    }
    product.price = price;
  }

  if (description !== undefined) product.description = description;
  if (quantity !== undefined) {
    if (typeof quantity !== "number" || quantity < 0) {
      return res.status(400).json({ error: "quantity manfiy bo'lmagan son bo'lishi kerak" });
    }
    product.quantity = quantity;
  }

  product.updatedAt = new Date().toISOString();

  res.status(200).json({
    message: "Product muvaffaqiyatli yangilandi",
    product,
  });
});

// ===== DELETE - Productni o'chirish =====
app.delete("/products/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const index = products.findIndex((product) => product.id === id);

  if (index === -1) {
    return res.status(404).json({
      error: "Product topilmadi",
    });
  }

  const deletedProduct = products.splice(index, 1)[0];

  res.status(200).json({
    message: "Product muvaffaqiyatli o'chirildi",
    product: deletedProduct,
  });
});

// ===== Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server ishlayapti: http://localhost:${PORT}`);
});
