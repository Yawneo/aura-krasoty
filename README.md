# Аура красоты — сайт салона (Сургут)

Лендинг + каталог с корзиной + админ-панель для салона красоты «Аура красоты» (Сургут, Тюменский тракт, 4).

**Стек:** фронтенд — HTML/CSS/JS (без сборки), бэкенд — Go/gin, БД — PostgreSQL, прокси и статика — nginx.
Данные салона (адрес, телефон, график, фото работ) взяты с [Яндекс.Карт](https://yandex.com/maps/973/surgut/?mode=poi&poi%5Bpoint%5D=73.358309%2C61.276704&poi%5Buri%5D=ymapsbm1%3A%2F%2Forg%3Foid%3D1766784258&z=16.19), иконки — [Icons8](https://icons8.ru/).

```
├── frontend/            # сайт (открывается через Live Server)
│   ├── index.html       #   лендинг: hero, услуги по волосам, работы, контакты слева + карта справа
│   ├── admin.html       #   панель управления (товары/статусы/категории/заказы)
│   ├── css/styles.css   #   дизайн-система (3 цвета: белый, пыльная роза, слива)
│   ├── js/              #   api.js (авто-режим API/local), main.js, admin.js
│   ├── data/seed.json   #   стартовые товары для демо-режима
│   └── assets/          #   логотип-цветок, favicon, цветочный узор, иллюстрации, фото
├── server/              # Go/gin: REST API + миграции + Telegram-уведомления
│   ├── main.go          #   роуты и точка входа
│   ├── db.go            #   PostgreSQL (pgx), авторизация, CRUD
│   ├── telegram.go      #   отправка заказов боту
│   └── migrations/      #   SQL-схема и сид
├── deploy/nginx.conf    # конфиг nginx
└── docker-compose.yml   # postgres + api + nginx одной командой
```

## 1. Отладка через Live Server (без бэкенда)

Самый быстрый способ — фронтенд работает и **без** Go/PostgreSQL в демо-режиме (данные в localStorage из `data/seed.json`).

> Каталог товаров убран с сайта по решению владельца (салон занимается только работой с волосами): страница, скрипт и корзина удалены из проекта. При необходимости вернуть — восстановите `catalog.html` и `js/catalog.js` из истории git.

1. Откройте папку проекта в VS Code.
2. Правый клик по `frontend/index.html` → **Open with Live Server** (или Go Live).
3. Сайт: `http://127.0.0.1:5500/frontend/index.html` — каталог, корзина и админка (`admin.html`, демо-пароль **aura2026**) работают полностью.

В админке при этом горит бейдж «демо-режим (без бэкенда)»: заказы сохраняются локально в браузере.

## 2. Полный стек: PostgreSQL + Go API

Нужны установленные [Go ≥ 1.22](https://go.dev/dl/) и PostgreSQL (или Docker).

```bash
# 1) база (если PostgreSQL не установлен локально — только контейнер БД):
docker run -d --name aura-db -p 5432:5432 \
  -e POSTGRES_USER=aura -e POSTGRES_PASSWORD=aura -e POSTGRES_DB=aura postgres:16-alpine

# 2) бэкенд:
cd server
cp .env.example .env      # при желании поменяйте пароль/токены
go mod tidy
go run .
```

API поднимется на `http://localhost:8080`, миграции применятся автоматически (схема + сид из `migrations/`).

Фронтенд через Live Server **сам найдёт API**: `js/api.js` сначала пробует тот же origin, затем `http://localhost:8080`. Бейдж в админке сменится на «бэкенд подключён».

### Телеграм-бот для заказов

В `server/.env` заполните:

```
TG_BOT_TOKEN=токен_от_@BotFather
TG_CHAT_ID=id_чата_или_канала
```

Каждый новый заказ будет приходить сообщением. Пока поля пустые — заказы логируются в консоль сервера.

## 3. Продакшн через docker compose (nginx)

```bash
docker compose up -d --build
```

- `http://localhost` — сайт (nginx отдаёт `frontend/`);
- `http://localhost/api/...` — прокси на Go-контейнер;
- PostgreSQL — контейнер `db` с volume `auradb`.

Для боевого домена положите сертификаты и поменяйте `server_name` в `deploy/nginx.conf`.

## Админ-панель (`admin.html`)

| Вкладка | Что можно делать |
|---|---|
| Товары и цены | добавить/изменить товар: название, категория, цена, скидка, фото, описание, порядок; удалить |
| Статусы по категориям | товары сгруппированы по категориям; временно скрыть (👁), вернуть (🚫), изменить, удалить |
| Категории | добавить, переименовать, удалить (если пуста) |
| Заказы | список заказов, отметить «Доставлен», убрать из списка после доставки |

## API (кратко)

```
GET  /api/health                 — проверка
GET  /api/categories             — категории
GET  /api/products               — активные товары (?all=1 — все, с токеном)
POST /api/orders                 — оформить заказ (уходит в Telegram)
POST /api/appointments           — онлайн-запись на услугу (тоже уходит в Telegram)
POST /api/admin/login            — {password} → {token}
GET  /api/admin/orders           — все заказы (Bearer token)
PUT  /api/admin/orders/:id/status — {status: "delivered"}
DELETE /api/admin/orders/:id     — убрать заказ
POST/PUT/DELETE /api/admin/products[/:id]      — CRUD товаров
PATCH /api/admin/products/:id    — {active: bool} скрыть/показать
POST/PUT/DELETE /api/admin/categories[/:id]    — CRUD категорий
POST /api/admin/upload           — загрузка фото (multipart, поле file)
```

## Настройка контента

- **График/адрес/телефон** — блок контактов в `index.html` (+ `.map-note`), одна правка.
- **Онлайн-запись** — модальное окно открывается любой кнопкой `data-book`; список услуг и слоты времени — в `js/main.js` (`initBooking`).
- **Услуги и цены** — секция `#services` в `index.html`.
- **Фото товаров** — в админке можно указать любую ссылку или загрузить файл через `POST /api/admin/upload`; встроенные иллюстрации подсказываются в выпадающем списке.
- **Карта** — iframe-виджет Яндекс.Карт с карточкой организации (oid 1766784258); блок «контакты + карта» — сетка `.contacts-grid`.
- **Палитра и шрифты** — CSS-переменные в начале `css/styles.css`. Три цвета: тёплый белый `#FFFCFD`, пыльная роза `#F2DEE6` / `#C98BA2`, глубокая слива `#7A3F56` (кнопки, акценты, текст логотипа).
