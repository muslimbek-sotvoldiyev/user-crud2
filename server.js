const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ===== Ma'lumotlar shu yerda saqlanadi (oddiy massiv, database yo'q) =====
let users = [];
let nextId = 1;

// ===== Yordamchi: user obyektini validatsiya qilish =====
function validateUserInput(body) {
  const { username, email, name } = body;

  if (!username || typeof username !== "string") {
    return "username majburiy va string bo'lishi kerak";
  }

  if (!email || typeof email !== "string") {
    return "email majburiy va string bo'lishi kerak";
  }

  if (!name || typeof name !== "string") {
    return "name majburiy va string bo'lishi kerak";
  }

  return null;
}

// ===== CREATE - Yangi user qo'shish =====
app.post("/users", (req, res) => {
  const error = validateUserInput(req.body);

  if (error) {
    return res.status(400).json({ error });
  }

  const { username, email, name } = req.body;

  // Username yoki email band emasligini tekshirish
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
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  res.status(201).json({
    message: "User muvaffaqiyatli qo'shildi",
    user: newUser,
  });
});

// ===== READ - Barcha userlarni olish =====
app.get("/users", (req, res) => {
  res.status(200).json(users);
});

// ===== READ - Bitta userni ID orqali olish =====
app.get("/users/:id", (req, res) => {
  const id = Number(req.params.id);

  const user = users.find((user) => user.id === id);

  if (!user) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  res.status(200).json(user);
});

// ===== UPDATE - Userni yangilash =====
app.put("/users/:id", (req, res) => {
  const id = Number(req.params.id);

  const user = users.find((user) => user.id === id);

  if (!user) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  const { username, email, name } = req.body;

  // Username boshqa userda band emasligini tekshirish
  if (
    username &&
    users.some((u) => u.username === username && u.id !== id)
  ) {
    return res.status(409).json({
      error: "Bu username band",
    });
  }

  // Email boshqa userda band emasligini tekshirish
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
    user,
  });
});

// ===== DELETE - Userni o'chirish =====
app.delete("/users/:id", (req, res) => {
  const id = Number(req.params.id);

  const index = users.findIndex((user) => user.id === id);

  if (index === -1) {
    return res.status(404).json({
      error: "User topilmadi",
    });
  }

  const deletedUser = users.splice(index, 1)[0];

  res.status(200).json({
    message: "User muvaffaqiyatli o'chirildi",
    user: deletedUser,
  });
});

// ===== Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server ishlayapti: http://localhost:${PORT}`);
});