# User + Product CRUD API + JWT Auth (in-memory)

Database yo'q — barcha ma'lumotlar oddiy massivda (RAM'da) saqlanadi. Server qayta ishga tushirilsa, ma'lumotlar o'chib ketadi.

Loyihada **register, login, access token va refresh token** mavjud. `/users` va `/products` route'larining barchasiga faqat access token bilan kirish mumkin.

## O'rnatish va ishga tushirish

```bash
npm install
npm start
```

Server manzili: `http://localhost:3000`

Ixtiyoriy environment o'zgaruvchilari (berilmasa, default qiymatlar ishlatiladi):

```bash
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
PORT=3000
```

## Auth endpointlari

| Method | URL             | Tavsif                                    |
| ------ | --------------- | ------------------------------------------ |
| POST   | /auth/register  | Ro'yxatdan o'tish (username, email, name, password) |
| POST   | /auth/login     | Tizimga kirish → accessToken + refreshToken |
| POST   | /auth/refresh   | refreshToken orqali yangi access+refresh token olish |
| POST   | /auth/logout    | refreshTokenni bekor qilish (chiqish)      |
| GET    | /auth/me        | O'zi haqida ma'lumot (access token kerak)  |

- **Access token** — 15 daqiqa yashaydi, har bir himoyalangan so'rovda `Authorization: Bearer <accessToken>` header orqali yuboriladi.
- **Refresh token** — 7 kun yashaydi, faqat `/auth/refresh` va `/auth/logout` uchun ishlatiladi. Har refresh qilinganda eski refresh token bekor qilinib, yangisi beriladi (token rotation).

## Users endpointlari (himoyalangan — access token talab qiladi)

| Method | URL        | Tavsif                 |
| ------ | ---------- | ----------------------- |
| POST   | /users     | Yangi user yaratish     |
| GET    | /users     | Barcha userlarni olish  |
| GET    | /users/:id | Bitta userni olish      |
| PUT    | /users/:id | Userni yangilash        |
| DELETE | /users/:id | Userni o'chirish        |

## Products endpointlari (himoyalangan — access token talab qiladi)

| Method | URL           | Tavsif                     |
| ------ | ------------- | --------------------------- |
| POST   | /products     | Yangi product yaratish      |
| GET    | /products     | Barcha productlarni olish   |
| GET    | /products/:id | Bitta productni olish       |
| PUT    | /products/:id | Productni yangilash         |
| DELETE | /products/:id | Productni o'chirish         |

Product maydonlari: `name` (majburiy), `price` (majburiy, son), `description` (ixtiyoriy), `quantity` (ixtiyoriy, son, default 0).

## Misollar

### Ro'yxatdan o'tish

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"aziz01","email":"aziz@example.com","name":"Aziz Karimov","password":"secret123"}'
```

### Tizimga kirish

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"aziz01","password":"secret123"}'
```

Javob:

```json
{
  "message": "Tizimga muvaffaqiyatli kirildi",
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": 1, "username": "aziz01", "email": "aziz@example.com", "name": "Aziz Karimov" }
}
```

### Access token bilan userlarni olish

```bash
curl http://localhost:3000/users \
  -H "Authorization: Bearer <accessToken>"
```

### Access tokenni yangilash (refresh)

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

### Tizimdan chiqish

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

### Yangi user qo'shish (login qilingandan keyin)

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"username":"vali02","email":"vali@example.com","name":"Vali Toshmatov"}'
```

### Bitta userni olish

```bash
curl http://localhost:3000/users/1 \
  -H "Authorization: Bearer <accessToken>"
```

### Userni yangilash

```bash
curl -X PUT http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"name":"Aziz Yangi"}'
```

### Userni o'chirish

```bash
curl -X DELETE http://localhost:3000/users/1 \
  -H "Authorization: Bearer <accessToken>"
```

### Yangi product qo'shish

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"name":"Noutbuk","price":1200,"description":"15 dyum","quantity":5}'
```

### Barcha productlarni olish

```bash
curl http://localhost:3000/products \
  -H "Authorization: Bearer <accessToken>"
```

### Bitta productni olish

```bash
curl http://localhost:3000/products/1 \
  -H "Authorization: Bearer <accessToken>"
```

### Productni yangilash

```bash
curl -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"price":999}'
```

### Productni o'chirish

```bash
curl -X DELETE http://localhost:3000/products/1 \
  -H "Authorization: Bearer <accessToken>"
```
