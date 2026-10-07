/* ============================================================
   admin.js — админ-панель «Аура красоты».
   Вкладки: Товары (CRUD), Статусы (скрыть/показать/удалить),
   Категории, Заказы (доставлен/удалить).
   Работает и через бэкенд, и в демо-режиме (localStorage).
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  let categories = [];
  let products = [];
  let orders = [];

  /* ---------- Вход ---------- */

  async function tryLogin(e) {
    e.preventDefault();
    const password = $('#passwordInput').value;
    const btn = $('#loginBtn');
    btn.disabled = true;
    try {
      await AuraAPI.login(password);
      await enterPanel();
    } catch (err) {
      showToast(err.message || 'Не удалось войти', true);
    } finally {
      btn.disabled = false;
    }
  }

  async function enterPanel() {
    $('#loginScreen').style.display = 'none';
    $('#adminShell').classList.add('active');
    await refreshAll();
    await showModeBadge();
  }

  async function showModeBadge() {
    const mode = await AuraAPI.mode();
    const badge = $('#modeBadge');
    if (mode === 'api') {
      badge.textContent = 'бэкенд подключён';
      badge.className = 'mode-badge mode-badge--api';
    } else {
      badge.textContent = 'демо-режим (без бэкенда)';
      badge.className = 'mode-badge mode-badge--local';
    }
  }

  function logout() {
    AuraAPI.logout();
    location.reload();
  }

  /* ---------- Загрузка данных ---------- */

  async function refreshAll() {
    [categories, products, orders] = await Promise.all([
      AuraAPI.getCategories(),
      AuraAPI.getProducts({ all: true }),
      AuraAPI.getOrders().catch(() => []),
    ]);
    fillProductFilter();
    renderProducts();
    renderStatusBoard();
    renderCategories();
    renderOrders();
  }

  function fillProductFilter() {
    const sel = $('#productFilter');
    const current = sel.value;
    sel.innerHTML = `<option value="all">Все категории</option>` +
      categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (current) sel.value = current;
  }

  const catById = (id) => categories.find((c) => c.id === id);
  const priceOf = (p) => AuraAPI.finalPrice(p);

  /* ---------- Вкладки ---------- */

  function switchTab(name) {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
  }

  /* ---------- Вкладка «Товары» ---------- */

  function renderProducts() {
    const tbody = $('#productsTbody');
    const filterCat = $('#productFilter').value;
    let list = [...products].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
    if (filterCat !== 'all') list = list.filter((p) => String(p.category_id) === filterCat);

    $('#productsCount').textContent = `Товаров: ${list.length}`;

    tbody.innerHTML = list.map((p) => {
      const cat = catById(p.category_id);
      return `
      <tr>
        <td><img class="thumb" src="${esc(photoSrc(p.photo))}" alt="" onerror="this.style.visibility='hidden'"></td>
        <td><b>${esc(p.name)}</b><br><small style="color:var(--text-muted)">${esc(p.description || '')}</small></td>
        <td>${esc(cat ? cat.name : '—')}</td>
        <td>${AuraAPI.formatPrice(p.price)}${p.discount ? `<br><small style="color:var(--rose-deep)">скидка −${p.discount}% → ${AuraAPI.formatPrice(priceOf(p))}</small>` : ''}</td>
        <td>${p.active ? '<span class="status-badge status-badge--active">активен</span>' : '<span class="status-badge status-badge--hidden">скрыт</span>'}</td>
        <td>
          <div class="actions">
            <button class="icon-btn" title="Редактировать" data-edit="${p.id}">✏️</button>
            <button class="icon-btn" title="Удалить" data-del="${p.id}">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openProductModal(products.find((p) => p.id === Number(b.dataset.edit)))));
    tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteProduct(Number(b.dataset.del))));
  }

  function openProductModal(p = null) {
    $('#productModalTitle').textContent = p ? 'Редактировать товар' : 'Новый товар';
    $('#productId').value = p ? p.id : '';
    $('#productName').value = p ? p.name : '';
    $('#productDesc').value = p ? (p.description || '') : '';
    $('#productCategory').innerHTML = categories.map((c) =>
      `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('#productPrice').value = p ? p.price : '';
    $('#productDiscount').value = p ? (p.discount || 0) : 0;
    $('#productSort').value = p ? (p.sort || 0) : 0;
    $('#productPhoto').value = p ? p.photo : '';
    $('#productActive').checked = p ? !!p.active : true;
    updatePhotoPreview();
    $('#productModal').classList.add('open');
    setTimeout(() => $('#productName').focus(), 60);
  }

  function updatePhotoPreview() {
    const val = $('#productPhoto').value.trim();
    const el = $('#photoPreview');
    if (val) {
      el.style.backgroundImage = `url("${val.replace(/"/g, '%22')}")`;
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = 'Здесь появится фото товара';
    }
  }

  async function saveProduct(e) {
    e.preventDefault();
    const p = {
      id: $('#productId').value ? Number($('#productId').value) : null,
      name: $('#productName').value.trim(),
      description: $('#productDesc').value.trim(),
      category_id: Number($('#productCategory').value),
      price: Number($('#productPrice').value) || 0,
      discount: Math.max(0, Math.min(99, Number($('#productDiscount').value) || 0)),
      sort: Number($('#productSort').value) || 0,
      photo: $('#productPhoto').value.trim() || 'assets/img/products/shampoo.svg',
      active: $('#productActive').checked,
    };
    if (!p.name) { showToast('Укажите название товара', true); return; }
    try {
      await AuraAPI.saveProduct(p);
      $('#productModal').classList.remove('open');
      showToast('Товар сохранён 🌸');
      await refreshAll();
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
    }
  }

  async function deleteProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!p || !confirm(`Удалить товар «${p.name}»? Действие необратимо.`)) return;
    try {
      await AuraAPI.deleteProduct(id);
      showToast('Товар удалён');
      await refreshAll();
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
    }
  }

  /* ---------- Вкладка «Статусы» (по категориям) ---------- */

  function renderStatusBoard() {
    const box = $('#statusBoard');
    const groups = categories.map((c) => ({
      cat: c,
      items: products.filter((p) => p.category_id === c.id).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    }));

    box.innerHTML = groups.map(({ cat, items }) => `
      <div class="status-group">
        <h3>${esc(cat.name)} <span class="count">${items.length} шт · ${items.filter((i) => i.active).length} активны</span></h3>
        <div class="status-cards">
          ${items.map((p) => `
            <div class="status-card ${p.active ? '' : 'is-hidden'}">
              <img src="${esc(photoSrc(p.photo))}" alt="" onerror="this.style.visibility='hidden'">
              <div class="status-card__info">
                <b>${esc(p.name)}</b>
                <span>${AuraAPI.formatPrice(priceOf(p))} · ${p.active ? 'показывается' : 'скрыт'}</span>
              </div>
              <div class="status-card__actions">
                <button class="icon-btn ${p.active ? '' : 'off'}" title="${p.active ? 'Временно скрыть' : 'Вернуть в каталог'}" data-toggle="${p.id}">${p.active ? '👁' : '🚫'}</button>
                <button class="icon-btn" title="Изменить" data-edit="${p.id}">✏️</button>
                <button class="icon-btn" title="Удалить" data-del="${p.id}">🗑</button>
              </div>
            </div>`).join('') || '<div style="color:var(--text-muted);font-size:14px">В категории пока нет товаров</div>'}
        </div>
      </div>`).join('');

    box.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const p = products.find((x) => x.id === Number(b.dataset.toggle));
      await AuraAPI.setProductActive(p.id, !p.active);
      showToast(p.active ? 'Товар скрыт из каталога' : 'Товар снова виден покупателям');
      await refreshAll();
    }));
    box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openProductModal(products.find((p) => p.id === Number(b.dataset.edit)))));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteProduct(Number(b.dataset.del))));
  }

  /* ---------- Вкладка «Категории» ---------- */

  function renderCategories() {
    const tbody = $('#categoriesTbody');
    tbody.innerHTML = categories.map((c) => {
      const n = products.filter((p) => p.category_id === c.id).length;
      return `
      <tr>
        <td><b>${esc(c.name)}</b></td>
        <td>${esc(c.slug || '—')}</td>
        <td>${n} товаров</td>
        <td>
          <div class="actions">
            <button class="icon-btn" title="Переименовать" data-rename="${c.id}">✏️</button>
            <button class="icon-btn" title="Удалить" data-delcat="${c.id}">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
      const c = catById(Number(b.dataset.rename));
      const name = prompt('Новое название категории:', c.name);
      if (!name || name.trim() === c.name) return;
      await AuraAPI.saveCategory({ ...c, name: name.trim() });
      showToast('Категория обновлена');
      await refreshAll();
    }));

    tbody.querySelectorAll('[data-delcat]').forEach((b) => b.addEventListener('click', async () => {
      const c = catById(Number(b.dataset.delcat));
      const n = products.filter((p) => p.category_id === c.id).length;
      if (n > 0) { showToast(`Сначала уберите товары из категории (${n} шт.)`, true); return; }
      if (!confirm(`Удалить категорию «${c.name}»?`)) return;
      await AuraAPI.deleteCategory(c.id);
      showToast('Категория удалена');
      await refreshAll();
    }));
  }

  async function addCategory() {
    const name = prompt('Название новой категории:');
    if (!name || !name.trim()) return;
    await AuraAPI.saveCategory({
      name: name.trim(),
      slug: name.trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/(^-|-$)/g, ''),
      sort: categories.length + 1,
    });
    showToast('Категория добавлена 🌸');
    await refreshAll();
  }

  /* ---------- Вкладка «Заказы» ---------- */

  function renderOrders() {
    const box = $('#ordersList');
    const filter = $('#orderFilter').value;
    let list = [...orders];
    if (filter !== 'all') list = list.filter((o) => o.status === filter);

    $('#ordersCount').textContent = `Заказов: ${list.length}`;

    if (!list.length) {
      box.innerHTML = '<div class="catalog-empty">Заказов пока нет 🌷<br>Они появятся здесь после оформления на сайте.</div>';
      return;
    }

    box.innerHTML = list.map((o) => `
      <div class="order-card">
        <div class="order-card__head">
          <b>Заказ №${o.id} · ${esc(o.customer_name)}</b>
          <span>${o.status === 'delivered'
            ? '<span class="status-badge status-badge--delivered">доставлен</span>'
            : '<span class="status-badge status-badge--new">новый</span>'}</span>
        </div>
        <div class="order-card__meta">
          ${AuraAPI.fmtDate(o.created_at)} · ${esc(o.phone)} · ${o.delivery === 'courier' ? 'доставка курьером' : 'самовывоз'}
          ${o.comment ? ` · «${esc(o.comment)}»` : ''}
        </div>
        <ul>
          ${(o.items || []).map((i) => `<li><span>${esc(i.name)} × ${i.qty}</span><span>${AuraAPI.formatPrice(i.sum)}</span></li>`).join('')}
        </ul>
        <div class="order-card__total">Итого: ${AuraAPI.formatPrice(o.total)}</div>
        <div class="order-card__actions">
          ${o.status !== 'delivered' ? `<button class="btn btn--soft btn--sm" data-deliver="${o.id}">✓ Доставлен</button>` : ''}
          <button class="btn btn--danger btn--sm" data-rmorder="${o.id}">Убрать из списка</button>
        </div>
      </div>`).join('');

    box.querySelectorAll('[data-deliver]').forEach((b) => b.addEventListener('click', async () => {
      await AuraAPI.setOrderStatus(Number(b.dataset.deliver), 'delivered');
      showToast('Заказ отмечен как доставленный');
      await refreshAll();
    }));

    box.querySelectorAll('[data-rmorder]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Убрать заказ из списка? Обычно это делают после успешной доставки.')) return;
      await AuraAPI.deleteOrder(Number(b.dataset.rmorder));
      showToast('Заказ убран');
      await refreshAll();
    }));
  }

  /* ---------- Инициализация ---------- */

  document.addEventListener('DOMContentLoaded', async () => {
    $('#loginForm').addEventListener('submit', tryLogin);
    $('#logoutBtn').addEventListener('click', logout);
    $('#refreshBtn').addEventListener('click', async () => { await refreshAll(); showToast('Данные обновлены'); });

    document.querySelectorAll('.admin-tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    $('#addProductBtn').addEventListener('click', () => openProductModal(null));
    $('#addCategoryBtn').addEventListener('click', addCategory);
    $('#productFilter').addEventListener('change', renderProducts);
    $('#orderFilter').addEventListener('change', renderOrders);

    $('#productForm').addEventListener('submit', saveProduct);
    $('#productPhoto').addEventListener('input', updatePhotoPreview);
    $('#productModalClose').addEventListener('click', () => $('#productModal').classList.remove('open'));
    $('#productCancel').addEventListener('click', () => $('#productModal').classList.remove('open'));

    // авторизованы ли уже
    if (await AuraAPI.checkAuth()) await enterPanel();
  });
})();
