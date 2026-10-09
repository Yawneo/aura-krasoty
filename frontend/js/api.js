/* ============================================================
   AuraAPI — слой данных для сайта «Аура красоты».
   Работает в двух режимах и переключается автоматически:
     1) 'api'   — бэкенд Go/gin: сначала пробуем тот же origin (/api),
                  затем http://localhost:8080 (для отладки через Live Server);
     2) 'local' — демо-режим без бэкенда: данные в localStorage,
                  первичное наполнение из data/seed.json.
   Благодаря этому фронтенд запускается через Live Server
   даже без PostgreSQL и Go.
   ============================================================ */

const AuraAPI = (() => {
  'use strict';

  const LS = {
    categories: 'aura_categories_v1',
    products: 'aura_products_v1',
    orders: 'aura_orders_v1',
    appointments: 'aura_appointments_v1',
    services: 'aura_services_v1',
    works: 'aura_works_v1',
    token: 'aura_token_v1',
  };

  const LOCAL_PASSWORD = 'aura2026'; // пароль админки в демо-режиме без бэкенда

  /* ---------- Контент сайта: значения по умолчанию ----------
     Совпадают с разметкой index.html. Пока владелец ничего
     не менял в админке, сайт показывает статику; после первого
     сохранения данные живут в localStorage (или в БД с бэкендом). */

  const DEFAULT_SERVICES = [
    { id: 1, name: 'Женская стрижка', desc: 'Подберём форму под лицо и тип волос, научим укладывать дома.', price: 'от 1 500 ₽', icon: 'scissors', active: true, sort: 1 },
    { id: 2, name: 'Мужская стрижка', desc: 'Классика, фейды и современные формы — аккуратно и быстро.', price: 'от 800 ₽', icon: 'comb', active: true, sort: 2 },
    { id: 3, name: 'Окрашивание и мелирование', desc: 'Однотонное окрашивание, мелирование, растяжка цвета, выход из блонда.', price: 'от 6 000 ₽', icon: 'sparkles', active: true, sort: 3 },
    { id: 4, name: 'Укладки и локоны', desc: 'Повседневные объёмные укладки и вечерние локоны к событию.', price: 'от 700 ₽', icon: 'hair-dryer', active: true, sort: 4 },
    { id: 5, name: 'Кератин и ботокс', desc: 'Гладкость и блеск на месяцы вперёд, уход за непослушными волосами.', price: 'от 3 500 ₽', icon: 'spa', active: true, sort: 5 },
    { id: 6, name: 'Сложное окрашивание', desc: 'Осветление корней и тонирование, колорирование, сложные техники.', price: 'от 8 000 ₽', icon: 'lotus', active: true, sort: 6 },
  ];

  const DEFAULT_WORKS = [
    { id: 1, photo: 'assets/img/salon/work-4.jpg', caption: 'Локоны на высоком хвосте', active: true, sort: 1 },
    { id: 2, photo: 'assets/img/salon/work-5.jpg', caption: 'Гладкость и блонд', active: true, sort: 2 },
    { id: 3, photo: 'assets/img/salon/work-6.jpg', caption: 'Серебристое пикси', active: true, sort: 3 },
  ];

  let mode = null;   // 'api' | 'local'
  let base = null;   // базовый URL API, например http://localhost:8080/api

  /* ---------- Определение режима ---------- */

  async function detect() {
    if (mode) return mode;
    const candidates = [];
    if (location.protocol.startsWith('http')) candidates.push(`${location.origin}/api`);
    candidates.push('http://localhost:8080/api');
    for (const b of candidates) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(`${b}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) { base = b; mode = 'api'; return mode; }
      } catch (_) { /* пробуем следующий вариант */ }
    }
    mode = 'local';
    return mode;
  }

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem(LS.token);
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  async function req(path, options = {}) {
    const res = await fetch(`${base}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    if (res.status === 401) { localStorage.removeItem(LS.token); throw new Error('Требуется вход в админ-панель'); }
    if (!res.ok) {
      let msg = `Ошибка ${res.status}`;
      try { const data = await res.json(); if (data.error) msg = data.error; } catch (_) {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /* ---------- Локальное хранилище ---------- */

  async function seedLocal() {
    if (localStorage.getItem(LS.products) && localStorage.getItem(LS.categories)) return;
    const res = await fetch('data/seed.json');
    const data = await res.json();
    if (!localStorage.getItem(LS.categories)) localStorage.setItem(LS.categories, JSON.stringify(data.categories));
    if (!localStorage.getItem(LS.products)) localStorage.setItem(LS.products, JSON.stringify(data.products));
  }

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const nextId = (items) => items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;

  const finalPrice = (p) => Math.round(p.price * (1 - (p.discount || 0) / 100));

  /* ---------- Публичный интерфейс ---------- */

  return {
    async mode() { await detect(); return mode; },
    async apiBase() { await detect(); return base; },

    async login(password) {
      await detect();
      if (mode === 'api') {
        const data = await req('/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
        localStorage.setItem(LS.token, data.token);
        return data.token;
      }
      if (password !== LOCAL_PASSWORD) throw new Error('Неверный пароль');
      localStorage.setItem(LS.token, 'local-demo-token');
      return 'local-demo-token';
    },

    async checkAuth() {
      await detect();
      if (mode === 'api') {
        try { await req('/admin/me'); return true; } catch (_) { return false; }
      }
      return localStorage.getItem(LS.token) === 'local-demo-token';
    },

    logout() { localStorage.removeItem(LS.token); },

    /* --- Категории --- */

    async getCategories() {
      await detect();
      if (mode === 'api') return req('/categories');
      await seedLocal();
      return read(LS.categories, []).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    },

    async saveCategory(cat) {
      await detect();
      if (mode === 'api') {
        return cat.id
          ? req(`/admin/categories/${cat.id}`, { method: 'PUT', body: JSON.stringify(cat) })
          : req('/admin/categories', { method: 'POST', body: JSON.stringify(cat) });
      }
      await seedLocal();
      const cats = read(LS.categories, []);
      if (cat.id) {
        const i = cats.findIndex((c) => c.id === cat.id);
        if (i >= 0) cats[i] = { ...cats[i], ...cat };
      } else {
        cat.id = nextId(cats);
        cats.push(cat);
      }
      write(LS.categories, cats);
      return cat;
    },

    async deleteCategory(id) {
      await detect();
      if (mode === 'api') { await req(`/admin/categories/${id}`, { method: 'DELETE' }); return; }
      await seedLocal();
      write(LS.categories, read(LS.categories, []).filter((c) => c.id !== id));
    },

    /* --- Товары --- */

    async getProducts({ all = false } = {}) {
      await detect();
      if (mode === 'api') return req(`/products${all ? '?all=1' : ''}`);
      await seedLocal();
      const items = read(LS.products, []);
      return all ? items : items.filter((p) => p.active);
    },

    async saveProduct(p) {
      await detect();
      if (mode === 'api') {
        return p.id
          ? req(`/admin/products/${p.id}`, { method: 'PUT', body: JSON.stringify(p) })
          : req('/admin/products', { method: 'POST', body: JSON.stringify(p) });
      }
      await seedLocal();
      const items = read(LS.products, []);
      if (p.id) {
        const i = items.findIndex((x) => x.id === p.id);
        if (i >= 0) items[i] = { ...items[i], ...p };
      } else {
        p.id = nextId(items);
        items.push(p);
      }
      write(LS.products, items);
      return p;
    },

    async setProductActive(id, active) {
      await detect();
      if (mode === 'api') { await req(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); return; }
      const items = read(LS.products, []);
      const p = items.find((x) => x.id === id);
      if (p) { p.active = active; write(LS.products, items); }
    },

    async deleteProduct(id) {
      await detect();
      if (mode === 'api') { await req(`/admin/products/${id}`, { method: 'DELETE' }); return; }
      await seedLocal();
      write(LS.products, read(LS.products, []).filter((p) => p.id !== id));
    },

    /* --- Заказы --- */

    async createOrder(order) {
      await detect();
      if (mode === 'api') return req('/orders', { method: 'POST', body: JSON.stringify(order) });
      await seedLocal();
      const orders = read(LS.orders, []);
      const saved = {
        id: nextId(orders),
        status: 'new',
        created_at: new Date().toISOString(),
        ...order,
      };
      orders.unshift(saved);
      write(LS.orders, orders);
      return saved;
    },

    async getOrders() {
      await detect();
      if (mode === 'api') return req('/admin/orders');
      return read(LS.orders, []);
    },

    async setOrderStatus(id, status) {
      await detect();
      if (mode === 'api') { await req(`/admin/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); return; }
      const orders = read(LS.orders, []);
      const o = orders.find((x) => x.id === id);
      if (o) { o.status = status; write(LS.orders, orders); }
    },

    async deleteOrder(id) {
      await detect();
      if (mode === 'api') { await req(`/admin/orders/${id}`, { method: 'DELETE' }); return; }
      write(LS.orders, read(LS.orders, []).filter((o) => o.id !== id));
    },

    /* --- Запись на услуги --- */

    async createAppointment(appt) {
      await detect();
      if (mode === 'api') return req('/appointments', { method: 'POST', body: JSON.stringify(appt) });
      const items = read(LS.appointments, []);
      const saved = {
        id: nextId(items),
        status: 'new',
        created_at: new Date().toISOString(),
        ...appt,
      };
      items.unshift(saved);
      write(LS.appointments, items);
      return saved;
    },

    /* --- Записи клиентов (админка) --- */

    async getAppointments() {
      await detect();
      if (mode === 'api') return req('/admin/appointments');
      return read(LS.appointments, []);
    },

    async setAppointmentStatus(id, status) {
      await detect();
      if (mode === 'api') { await req(`/admin/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); return; }
      const items = read(LS.appointments, []);
      const a = items.find((x) => x.id === id);
      if (a) { a.status = status; write(LS.appointments, items); }
    },

    async deleteAppointment(id) {
      await detect();
      if (mode === 'api') { await req(`/admin/appointments/${id}`, { method: 'DELETE' }); return; }
      write(LS.appointments, read(LS.appointments, []).filter((a) => a.id !== id));
    },

    /* --- Контент сайта: услуги и работы ---
       Возвращают массив правок или null, если владелец ещё ничего
       не менял — тогда сайт показывает исходную разметку. */

    async getServices({ all = false, defaults = false } = {}) {
      await detect();
      if (mode === 'api') return req(`/services${all ? '?all=1' : ''}`);
      const items = read(LS.services, null);
      if (!items) return defaults ? DEFAULT_SERVICES.map((s) => ({ ...s })) : null;
      const list = [...items].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
      return all ? list : list.filter((s) => s.active);
    },

    async saveService(s) {
      await detect();
      if (mode === 'api') {
        return s.id
          ? req(`/admin/services/${s.id}`, { method: 'PUT', body: JSON.stringify(s) })
          : req('/admin/services', { method: 'POST', body: JSON.stringify(s) });
      }
      const items = read(LS.services, null) || DEFAULT_SERVICES.map((x) => ({ ...x }));
      if (s.id) {
        const i = items.findIndex((x) => x.id === s.id);
        if (i >= 0) items[i] = { ...items[i], ...s };
      } else {
        s.id = nextId(items);
        items.push(s);
      }
      write(LS.services, items);
      return s;
    },

    async setServiceActive(id, active) {
      await detect();
      if (mode === 'api') { await req(`/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); return; }
      const items = read(LS.services, null) || DEFAULT_SERVICES.map((x) => ({ ...x }));
      const s = items.find((x) => x.id === id);
      if (s) { s.active = active; write(LS.services, items); }
    },

    async deleteService(id) {
      await detect();
      if (mode === 'api') { await req(`/admin/services/${id}`, { method: 'DELETE' }); return; }
      const items = read(LS.services, null) || DEFAULT_SERVICES.map((x) => ({ ...x }));
      write(LS.services, items.filter((s) => s.id !== id));
    },

    async getWorks({ all = false, defaults = false } = {}) {
      await detect();
      if (mode === 'api') return req(`/works${all ? '?all=1' : ''}`);
      const items = read(LS.works, null);
      if (!items) return defaults ? DEFAULT_WORKS.map((w) => ({ ...w })) : null;
      const list = [...items].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
      return all ? list : list.filter((w) => w.active);
    },

    async saveWork(w) {
      await detect();
      if (mode === 'api') {
        return w.id
          ? req(`/admin/works/${w.id}`, { method: 'PUT', body: JSON.stringify(w) })
          : req('/admin/works', { method: 'POST', body: JSON.stringify(w) });
      }
      const items = read(LS.works, null) || DEFAULT_WORKS.map((x) => ({ ...x }));
      if (w.id) {
        const i = items.findIndex((x) => x.id === w.id);
        if (i >= 0) items[i] = { ...items[i], ...w };
      } else {
        w.id = nextId(items);
        items.push(w);
      }
      write(LS.works, items);
      return w;
    },

    async setWorkActive(id, active) {
      await detect();
      if (mode === 'api') { await req(`/admin/works/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); return; }
      const items = read(LS.works, null) || DEFAULT_WORKS.map((x) => ({ ...x }));
      const w = items.find((x) => x.id === id);
      if (w) { w.active = active; write(LS.works, items); }
    },

    async deleteWork(id) {
      await detect();
      if (mode === 'api') { await req(`/admin/works/${id}`, { method: 'DELETE' }); return; }
      const items = read(LS.works, null) || DEFAULT_WORKS.map((x) => ({ ...x }));
      write(LS.works, items.filter((w) => w.id !== id));
    },

    /* --- Утилиты --- */

    finalPrice,
    formatPrice(v) { return `${Number(v).toLocaleString('ru-RU')} ₽`; },
    fmtDate(iso) {
      try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
      catch (_) { return iso; }
    },
  };
})();
