const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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

// ===== Rasm yuklash sozlamalari (product va user uchun) =====
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Faqat rasm fayllari (jpeg, png, gif, webp) yuklash mumkin"));
    }
  },
});

// Yuklangan rasmlarni statik fayl sifatida ochish: /uploads/<fayl-nomi>
app.use("/uploads", express.static(UPLOAD_DIR));

// ===== Yordamchi: diskdan rasm faylini o'chirish =====
function deleteImageFile(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filePath, () => {}); // xato bo'lsa ham e'tiborsiz qoldiramiz
}

// ===== Yordamchi: productga to'liq imageUrl qo'shib qaytarish =====
function toPublicProduct(product, req) {
  return {
    ...product,
    imageUrl: product.image
      ? `${req.protocol}://${req.get("host")}/uploads/${product.image}`
      : null,
  };
}

// ===== Yordamchi: rasm fayl nomidan to'liq URL yasash =====
function buildImageUrl(image, req) {
  return image ? `${req.protocol}://${req.get("host")}/uploads/${image}` : null;
}

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

// ===== Yordamchi: userni tashqariga chiqarishdan oldin passwordni olib tashlash va imageUrl qo'shish =====
function toPublicUser(user, req) {
  const { passwordHash, ...publicUser } = user;
  return {
    ...publicUser,
    imageUrl: req ? buildImageUrl(user.image, req) : undefined,
  };
}

// ==========================================================
// ===================== AUTH ENDPOINTLARI ===================
// ==========================================================

// ===== REGISTER - Ro'yxatdan o'tish (ixtiyoriy rasm bilan, form-data: image) =====
app.post("/auth/register", upload.single("image"), async (req, res) => {
  const error = validateRegisterInput(req.body);

  if (error) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(400).json({ error });
  }

  const { username, email, name, password } = req.body;

  const exists = users.find(
    (user) => user.username === username || user.email === email
  );

  if (exists) {
    if (req.file) deleteImageFile(req.file.filename);
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
    image: req.file ? req.file.filename : null,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  res.status(201).json({
    message: "Ro'yxatdan muvaffaqiyatli o'tildi",
    user: toPublicUser(newUser, req),
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
    user: toPublicUser(user, req),
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

  res.status(200).json(toPublicUser(user, req));
});

// ==========================================================
// ===================== USERS CRUD (himoyalangan) ============
// ==========================================================
// Quyidagi barcha /users route'lari access token talab qiladi.
// So'rov headerida: Authorization: Bearer <accessToken>

// ===== CREATE - Yangi user qo'shish (ixtiyoriy rasm bilan, form-data: image) =====
app.post("/users", authenticateToken, upload.single("image"), (req, res) => {
  const { username, email, name } = req.body;

  if (!username || !email || !name) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(400).json({
      error: "username, email va name majburiy",
    });
  }

  const exists = users.find(
    (user) => user.username === username || user.email === email
  );

  if (exists) {
    if (req.file) deleteImageFile(req.file.filename);
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
    image: req.file ? req.file.filename : null,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  res.status(201).json({
    message: "User muvaffaqiyatli qo'shildi",
    user: toPublicUser(newUser, req),
  });
});

// ===== READ - Barcha userlarni olish =====
app.get("/users", authenticateToken, (req, res) => {
  res.status(200).json(users.map((user) => toPublicUser(user, req)));
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

  res.status(200).json(toPublicUser(user, req));
});

// ===== UPDATE - Userni yangilash (ixtiyoriy yangi rasm bilan, form-data: image) =====
app.put("/users/:id", authenticateToken, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);

  const user = users.find((user) => user.id === id);

  if (!user) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  const { username, email, name } = req.body;

  if (
    username &&
    users.some((u) => u.username === username && u.id !== id)
  ) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(409).json({
      error: "Bu username band",
    });
  }

  if (
    email &&
    users.some((u) => u.email === email && u.id !== id)
  ) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(409).json({
      error: "Bu email band",
    });
  }

  if (username) user.username = username;
  if (email) user.email = email;
  if (name) user.name = name;

  // Yangi rasm yuklangan bo'lsa, eskisini o'chirib, yangisini o'rnatamiz
  if (req.file) {
    deleteImageFile(user.image);
    user.image = req.file.filename;
  }

  user.updatedAt = new Date().toISOString();

  res.status(200).json({
    message: "User muvaffaqiyatli yangilandi",
    user: toPublicUser(user, req),
  });
});

// ===== DELETE - User rasmini o'chirish =====
app.delete("/users/:id/image", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const user = users.find((user) => user.id === id);

  if (!user) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  if (!user.image) {
    return res.status(400).json({ error: "Userda rasm mavjud emas" });
  }

  deleteImageFile(user.image);
  user.image = null;
  user.updatedAt = new Date().toISOString();

  res.status(200).json({
    message: "User rasmi o'chirildi",
    user: toPublicUser(user, req),
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
  deleteImageFile(deletedUser.image);

  // O'chirilgan userning barcha refresh tokenlarini ham bekor qilamiz
  removeAllRefreshTokens(deletedUser.id);

  res.status(200).json({
    message: "User muvaffaqiyatli o'chirildi",
    user: toPublicUser(deletedUser, req),
  });
});

// ==========================================================
// ===================== PRODUCTS CRUD (himoyalangan) =========
// ==========================================================
// Quyidagi barcha /products route'lari access token talab qiladi.
// So'rov headerida: Authorization: Bearer <accessToken>

// ===== CREATE - Yangi product qo'shish (ixtiyoriy rasm bilan, form-data: image) =====
app.post("/products", authenticateToken, upload.single("image"), (req, res) => {
  // multer form-data maydonlarini string qilib beradi, price/quantity'ni songa o'giramiz
  if (req.body.price !== undefined) req.body.price = Number(req.body.price);
  if (req.body.quantity !== undefined) req.body.quantity = Number(req.body.quantity);

  const error = validateProductInput(req.body);

  if (error) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(400).json({ error });
  }

  const { name, price, description, quantity } = req.body;

  const newProduct = {
    id: nextProductId++,
    name,
    price,
    description: description || "",
    quantity: typeof quantity === "number" && !Number.isNaN(quantity) ? quantity : 0,
    image: req.file ? req.file.filename : null,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };

  products.push(newProduct);

  res.status(201).json({
    message: "Product muvaffaqiyatli qo'shildi",
    product: toPublicProduct(newProduct, req),
  });
});

// ===== READ - Barcha productlarni olish =====
app.get("/products", authenticateToken, (req, res) => {
  res.status(200).json(products.map((product) => toPublicProduct(product, req)));
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

  res.status(200).json(toPublicProduct(product, req));
});

// ===== UPDATE - Productni yangilash (ixtiyoriy yangi rasm bilan, form-data: image) =====
app.put("/products/:id", authenticateToken, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => product.id === id);

  if (!product) {
    if (req.file) deleteImageFile(req.file.filename);
    return res.status(404).json({
      error: "Product topilmadi",
    });
  }

  if (req.body.price !== undefined) req.body.price = Number(req.body.price);
  if (req.body.quantity !== undefined) req.body.quantity = Number(req.body.quantity);

  const { name, price, description, quantity } = req.body;

  if (name !== undefined) {
    if (typeof name !== "string" || !name) {
      if (req.file) deleteImageFile(req.file.filename);
      return res.status(400).json({ error: "name string bo'lishi kerak" });
    }
    product.name = name;
  }

  if (price !== undefined) {
    if (typeof price !== "number" || Number.isNaN(price) || price < 0) {
      if (req.file) deleteImageFile(req.file.filename);
      return res.status(400).json({ error: "price manfiy bo'lmagan son bo'lishi kerak" });
    }
    product.price = price;
  }

  if (description !== undefined) product.description = description;
  if (quantity !== undefined) {
    if (typeof quantity !== "number" || Number.isNaN(quantity) || quantity < 0) {
      if (req.file) deleteImageFile(req.file.filename);
      return res.status(400).json({ error: "quantity manfiy bo'lmagan son bo'lishi kerak" });
    }
    product.quantity = quantity;
  }

  // Yangi rasm yuklangan bo'lsa, eskisini o'chirib, yangisini o'rnatamiz
  if (req.file) {
    deleteImageFile(product.image);
    product.image = req.file.filename;
  }

  product.updatedAt = new Date().toISOString();

  res.status(200).json({
    message: "Product muvaffaqiyatli yangilandi",
    product: toPublicProduct(product, req),
  });
});

// ===== DELETE - Product rasmini o'chirish =====
app.delete("/products/:id/image", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => product.id === id);

  if (!product) {
    return res.status(404).json({
      error: "Product topilmadi",
    });
  }

  if (!product.image) {
    return res.status(400).json({ error: "Productda rasm mavjud emas" });
  }

  deleteImageFile(product.image);
  product.image = null;
  product.updatedAt = new Date().toISOString();

  res.status(200).json({
    message: "Product rasmi o'chirildi",
    product: toPublicProduct(product, req),
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
  deleteImageFile(deletedProduct.image);

  res.status(200).json({
    message: "Product muvaffaqiyatli o'chirildi",
    product: toPublicProduct(deletedProduct, req),
  });
});

// ===== Multer/fayl yuklash xatolarini ushlash =====
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ===== Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server ishlayapti: http://localhost:${PORT}`);
});
