/* ============================================================
   catalog.js — каталог «Аура красоты»:
   загрузка товаров, фильтры по категориям, поиск, сортировка,
   корзина (выдвижная панель), оформление заказа.
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  let categories = [];
  let products = [];
  let state = { cat: 'all', query: '', sort: 'popular' };

  /* ---------- Загрузка ---------- */

  async function load() {
    try {
      [categories, products] = await Promise.all([
        AuraAPI.getCategories(),
        AuraAPI.getProducts(),
      ]);
      renderChips();
      renderGrid();
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить каталог: ' + err.message, true);
    }
  }

  const catById = (id) => categories.find((c) => c.id === id);

  const priceOf = (p) => AuraAPI.finalPrice(p);

  /* ---------- Фильтры ---------- */

  function renderChips() {
    const box = $('#chips');
    const chips = [{ key: 'all', name: 'Все товары' }]
      .concat(categories.map((c) => ({ key: String(c.id), name: c.name })));
    box.innerHTML = chips.map((c) => `
      <button class="chip ${state.cat === c.key ? 'active' : ''}" data-cat="${c.key}">${esc(c.name)}</button>
    `).join('');
    box.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.cat = btn.dataset.cat;
        renderChips();
        renderGrid();
      });
    });
  }

  function filtered() {
    let list = [...products];
    if (state.cat !== 'all') list = list.filter((p) => String(p.category_id) === state.cat);
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter((p) => (p.name + ' ' + (p.description || '')).toLowerCase().includes(q));
    }
    if (state.sort === 'price-asc') list.sort((a, b) => priceOf(a) - priceOf(b));
    else if (state.sort === 'price-desc') list.sort((a, b) => priceOf(b) - priceOf(a));
    else list.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
    return list;
  }

  /* ---------- Сетка товаров ---------- */

  function renderGrid() {
    const grid = $('#catalogGrid');
    const list = filtered();
    if (!list.length) {
      grid.innerHTML = `<div class="catalog-empty">Ничего не нашлось 🌸<br>Попробуйте изменить фильтры или запрос.</div>`;
      return;
    }
    grid.innerHTML = list.map((p) => {
      const cat = catById(p.category_id);
      const qty = AuraCart.get()[p.id] || 0;
      const inCart = qty > 0;
      return `
      <article class="product-card reveal visible" data-id="${p.id}">
        <div class="product-card__photo">
          ${p.discount ? `<span class="product-card__discount">−${p.discount}%</span>` : ''}
          <img src="${esc(photoSrc(p.photo))}" alt="${esc(p.name)}" loading="lazy"
               onerror="this.onerror=null;this.src='assets/img/products/shampoo.svg'">
        </div>
        <div class="product-card__body">
          <div class="product-card__cat">${esc(cat ? cat.name : '')}</div>
          <h3>${esc(p.name)}</h3>
          <p class="product-card__desc">${esc(p.description || '')}</p>
          <div class="product-card__row">
            <div class="price">
              ${p.discount ? `<del>${AuraAPI.formatPrice(p.price)}</del>` : ''}
              ${AuraAPI.formatPrice(priceOf(p))}
            </div>
            ${inCart
              ? qtyControl(p.id, qty)
              : `<button class="add-btn" data-add="${p.id}">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7h12l1.5 13h-15L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
                   В корзину
                 </button>`}
          </div>
        </div>
      </article>`;
    }).join('');
    bindCardButtons();
  }

  function qtyControl(id, qty) {
    return `
      <div class="qty">
        <button data-dec="${id}" aria-label="Меньше">−</button>
        <span>${qty}</span>
        <button data-inc="${id}" aria-label="Больше">+</button>
      </div>`;
  }

  function bindCardButtons() {
    $('#catalogGrid').querySelectorAll('[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        AuraCart.add(Number(b.dataset.add));
        renderGrid();
        renderCart();
        showToast('Добавлено в корзину 🌷');
      });
    });
    $('#catalogGrid').querySelectorAll('[data-inc]').forEach((b) => {
      b.addEventListener('click', () => { AuraCart.add(Number(b.dataset.inc)); renderGrid(); renderCart(); });
    });
    $('#catalogGrid').querySelectorAll('[data-dec]').forEach((b) => {
      b.addEventListener('click', () => { AuraCart.setQty(Number(b.dataset.dec), (AuraCart.get()[b.dataset.dec] || 0) - 1); renderGrid(); renderCart(); });
    });
  }

  /* ---------- Корзина ---------- */

  function openDrawer() { $('#cartDrawer').classList.add('open'); $('#drawerOverlay').classList.add('open'); document.body.style.overflow = 'hidden'; renderCart(); }
  function closeDrawer() { $('#cartDrawer').classList.remove('open'); $('#drawerOverlay').classList.remove('open'); document.body.style.overflow = ''; }

  function cartDetails() {
    const cart = AuraCart.get();
    const items = Object.entries(cart).map(([id, qty]) => {
      const p = products.find((x) => x.id === Number(id));
      return p ? { p, qty, sum: priceOf(p) * qty } : null;
    }).filter(Boolean);
    const total = items.reduce((s, x) => s + x.sum, 0);
    const oldTotal = items.reduce((s, x) => s + x.p.price * x.qty, 0);
    return { items, total, oldTotal };
  }

  function renderCart() {
    const { items, total, oldTotal } = cartDetails();
    const box = $('#cartItems');
    const foot = $('#cartFoot');

    if (!items.length) {
      box.innerHTML = `<div class="drawer__empty"><div class="big">🌸</div>Корзина пока пуста.<br>Загляните в каталог — там много нежного!</div>`;
      foot.style.display = 'none';
      return;
    }
    foot.style.display = '';

    box.innerHTML = items.map(({ p, qty, sum }) => `
      <div class="cart-item">
        <img src="${esc(photoSrc(p.photo))}" alt="${esc(p.name)}"
             onerror="this.onerror=null;this.src='assets/img/products/shampoo.svg'">
        <div>
          <div class="cart-item__name">${esc(p.name)}</div>
          <div class="cart-item__price">${AuraAPI.formatPrice(priceOf(p))} × ${qty} = ${AuraAPI.formatPrice(sum)}</div>
        </div>
        <div class="cart-item__qty">
          ${qtyControl(p.id, qty)}
          <button class="cart-item__remove" data-rm="${p.id}" title="Убрать">✕</button>
        </div>
      </div>
    `).join('');

    box.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => { AuraCart.add(Number(b.dataset.inc)); renderCart(); renderGrid(); }));
    box.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => { AuraCart.setQty(Number(b.dataset.dec), (AuraCart.get()[b.dataset.dec] || 0) - 1); renderCart(); renderGrid(); }));
    box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { AuraCart.remove(Number(b.dataset.rm)); renderCart(); renderGrid(); }));

    $('#cartTotal').textContent = AuraAPI.formatPrice(total);
    const saved = oldTotal - total;
    $('#cartSaved').textContent = saved > 0 ? `Вы экономите ${AuraAPI.formatPrice(saved)}` : '';
  }

  /* ---------- Оформление заказа ---------- */

  async function submitOrder(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.querySelector('#orderName').value.trim();
    const phone = form.querySelector('#orderPhone').value.trim();
    if (!name || window.phoneDigits(phone).length < 11) {
      showToast('Укажите имя и полный номер телефона', true);
      return;
    }

    const { items, total } = cartDetails();
    if (!items.length) { showToast('Корзина пуста', true); return; }

    const order = {
      customer_name: name,
      phone,
      comment: form.querySelector('#orderComment').value.trim(),
      delivery: form.querySelector('#orderDelivery').value,
      items: items.map(({ p, qty, sum }) => ({
        product_id: p.id, name: p.name, qty, unit_price: priceOf(p), sum,
      })),
      total,
    };

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await AuraAPI.createOrder(order);
      AuraCart.clear();
      renderGrid();
      closeDrawer();
      form.reset();
      $('#successModal').classList.add('open');
    } catch (err) {
      console.error(err);
      showToast('Не удалось отправить заказ: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Инициализация ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    load();

    document.querySelectorAll('[data-open-cart]').forEach((b) => b.addEventListener('click', openDrawer));
    $('#drawerOverlay').addEventListener('click', closeDrawer);
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#cartForm').addEventListener('submit', submitOrder);

    $('#searchInput').addEventListener('input', (e) => { state.query = e.target.value.trim(); renderGrid(); });
    $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });

    $('#successClose').addEventListener('click', () => $('#successModal').classList.remove('open'));

    // открытие корзины по ссылке catalog.html?cart=1 (как на сайте-референсе)
    if (new URLSearchParams(location.search).get('cart') === '1') openDrawer();
  });
})();
