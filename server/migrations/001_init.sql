-- ============================================================
-- «Аура красоты» — схема БД (PostgreSQL)
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id    SERIAL PRIMARY KEY,
    slug  TEXT UNIQUE NOT NULL,
    name  TEXT NOT NULL,
    sort  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INT  NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    price       INT  NOT NULL CHECK (price >= 0),
    discount    INT  NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND 99),
    sort        INT  NOT NULL DEFAULT 0,
    photo       TEXT NOT NULL DEFAULT '',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    phone         TEXT NOT NULL,
    comment       TEXT NOT NULL DEFAULT '',
    delivery      TEXT NOT NULL DEFAULT 'pickup',
    total         INT  NOT NULL,
    status        TEXT NOT NULL DEFAULT 'new', -- new | delivered
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
    id         SERIAL PRIMARY KEY,
    order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    qty        INT NOT NULL CHECK (qty > 0),
    unit_price INT NOT NULL,
    sum        INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------- Начальное наполнение ----------

INSERT INTO categories (slug, name, sort) VALUES
    ('care',        'Уход за волосами',    1),
    ('styling',     'Стайлинг',            2),
    ('accessories', 'Аксессуары',          3),
    ('devices',     'Приборы для укладки', 4),
    ('sets',        'Подарочные наборы',   5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (name, description, category_id, price, discount, sort, photo, active)
SELECT * FROM (VALUES
    ('Шампунь «Роза и шёлк»',                   'Мягкое очищение для окрашенных и повреждённых волос, 300 мл', (SELECT id FROM categories WHERE slug='care'),        790,  0, 1, 'assets/img/products/shampoo.svg',  TRUE),
    ('Бальзам-ополаскиватель «Нежность»',       'Лёгкое расчёсывание и блеск без утяжеления, 300 мл',          (SELECT id FROM categories WHERE slug='care'),        690, 15, 2, 'assets/img/products/balm.svg',     TRUE),
    ('Маска «Глубокое питание»',                'Интенсивное восстановление после окрашивания, 250 мл',        (SELECT id FROM categories WHERE slug='care'),       1290,  0, 3, 'assets/img/products/mask.svg',     TRUE),
    ('Масло для кончиков «Шёлк»',               'Запечатывает секущиеся кончики, не жирнит, 50 мл',            (SELECT id FROM categories WHERE slug='care'),        890, 10, 4, 'assets/img/products/oil.svg',      TRUE),
    ('Тоник-уход для кожи головы',              'Успокаивает кожу, укрепляет корни, 150 мл',                   (SELECT id FROM categories WHERE slug='care'),        990, 20, 5, 'assets/img/products/tonic.svg',    TRUE),
    ('Набор для кератинового выпрямления',      'Домашний уход: шампунь, состав, фиксирующая сыворотка',       (SELECT id FROM categories WHERE slug='care'),       2490,  0, 6, 'assets/img/products/keratin.svg',  TRUE),
    ('Спрей-термозащита «Аура»',                'Защита до 220 °C при горячих укладках, 200 мл',               (SELECT id FROM categories WHERE slug='styling'),     850,  0, 1, 'assets/img/products/spray.svg',    TRUE),
    ('Сыворотка-стайлер для гладкости',         'Разглаживает волосы и дарит зеркальный блеск, 30 мл',         (SELECT id FROM categories WHERE slug='styling'),    1490,  0, 2, 'assets/img/products/serum.svg',    TRUE),
    ('Расчёска для распутывания',               'Мягкая щетина, не травмирует влажные волосы',                 (SELECT id FROM categories WHERE slug='accessories'), 590,  0, 1, 'assets/img/products/comb.svg',     TRUE),
    ('Набор заколок «Пастель»',                 'Краб и невидимки в нежных оттенках, 6 предметов',             (SELECT id FROM categories WHERE slug='accessories'), 490,  0, 2, 'assets/img/products/clips.svg',    TRUE),
    ('Резинки-жгуты «Маршмеллоу»',              'Не оставляют заломов, 2 штуки',                               (SELECT id FROM categories WHERE slug='accessories'), 390,  0, 3, 'assets/img/products/scrunchie.svg',TRUE),
    ('Фен «Аура Air» 1800 Вт',                  'Ионизация, 3 режима, концентратор в комплекте',               (SELECT id FROM categories WHERE slug='devices'),    3990, 10, 1, 'assets/img/products/dryer.svg',    TRUE),
    ('Утюжок «Гладкость»',                      'Керамические пластины, регулировка до 230 °C',                (SELECT id FROM categories WHERE slug='devices'),    3290,  0, 2, 'assets/img/products/iron.svg',     TRUE),
    ('Плойка «Волна» 25 мм',                    'Локоны как из салона, керамическое покрытие',                 (SELECT id FROM categories WHERE slug='devices'),    2790, 15, 3, 'assets/img/products/curler.svg',   TRUE),
    ('Подарочный набор «Розовый рассвет»',      'Шампунь, маска и масло в праздничной упаковке',               (SELECT id FROM categories WHERE slug='sets'),       1990, 25, 1, 'assets/img/products/gift.svg',     TRUE),
    ('Набор «Салонный уход дома»',              'Бальзам, сыворотка и термозащита в корзинке',                 (SELECT id FROM categories WHERE slug='sets'),       2490,  0, 2, 'assets/img/products/set.svg',      TRUE)
) AS seed(name, description, category_id, price, discount, sort, photo, active)
WHERE NOT EXISTS (SELECT 1 FROM products);
