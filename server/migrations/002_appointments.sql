-- ============================================================
-- «Аура красоты» — онлайн-запись на услуги
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
    id            SERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    phone         TEXT NOT NULL,
    service       TEXT NOT NULL DEFAULT '',
    date          TEXT NOT NULL DEFAULT '',
    time          TEXT NOT NULL DEFAULT '',
    comment       TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'new', -- new | confirmed
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
