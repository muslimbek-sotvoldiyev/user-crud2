# User CRUD API (in-memory)

Database yo'q — barcha userlar oddiy massivda (RAM'da) saqlanadi. Server qayta ishga tushirilsa, ma'lumotlar o'chib ketadi.

## O'rnatish va ishga tushirish

```bash
npm install
npm start
```

Server manzili: `http://localhost:3000`

## Endpointlar

| Method | URL | Tavsif |
|--------|-----|--------|
| POST   | /users      | Yangi user yaratish |
| GET    | /users      | Barcha userlarni olish |
| GET    | /users/:id  | Bitta userni olish |
| PUT    | /users/:id  | Userni yangilash |
| DELETE | /users/:id  | Userni o'chirish |

## Misollar

### Yangi user yaratish
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"username":"aziz01","email":"aziz@example.com","name":"Aziz Karimov"}'
```

### Barcha userlarni olish
```bash
curl http://localhost:3000/users
```

### Bitta userni olish
```bash
curl http://localhost:3000/users/1
```

### Userni yangilash
```bash
curl -X PUT http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Aziz Yangi"}'
```

### Userni o'chirish
```bash
curl -X DELETE http://localhost:3000/users/1
```
