-- ============================================================
-- «Аура красоты» — контент сайта: услуги и работы
-- ============================================================

CREATE TABLE IF NOT EXISTS services (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price       TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT 'scissors',
    sort        INT  NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS works (
    id      SERIAL PRIMARY KEY,
    photo   TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    sort    INT  NOT NULL DEFAULT 0,
    active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_services_sort ON services(sort);
CREATE INDEX IF NOT EXISTS idx_works_sort ON works(sort);

INSERT INTO services (name, description, price, icon, sort, active)
SELECT * FROM (VALUES
    ('Женская стрижка',            'Подберём форму под лицо и тип волос, научим укладывать дома.',         'от 1 500 ₽', 'scissors',   1, TRUE),
    ('Мужская стрижка',            'Классика, фейды и современные формы — аккуратно и быстро.',           'от 800 ₽',   'comb',       2, TRUE),
    ('Окрашивание и мелирование',  'Однотонное окрашивание, мелирование, растяжка цвета, выход из блонда.', 'от 6 000 ₽', 'sparkles',   3, TRUE),
    ('Укладки и локоны',           'Повседневные объёмные укладки и вечерние локоны к событию.',           'от 700 ₽',   'hair-dryer', 4, TRUE),
    ('Кератин и ботокс',           'Гладкость и блеск на месяцы вперёд, уход за непослушными волосами.',   'от 3 500 ₽', 'spa',        5, TRUE),
    ('Сложное окрашивание',        'Осветление корней и тонирование, колорирование, сложные техники.',     'от 8 000 ₽', 'lotus',      6, TRUE)
) AS seed(name, description, price, icon, sort, active)
WHERE NOT EXISTS (SELECT 1 FROM services);

INSERT INTO works (photo, caption, sort, active)
SELECT * FROM (VALUES
    ('assets/img/salon/work-4.jpg', 'Локоны на высоком хвосте', 1, TRUE),
    ('assets/img/salon/work-5.jpg', 'Гладкость и блонд',        2, TRUE),
    ('assets/img/salon/work-6.jpg', 'Серебристое пикси',        3, TRUE)
) AS seed(photo, caption, sort, active)
WHERE NOT EXISTS (SELECT 1 FROM works);
