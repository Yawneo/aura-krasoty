/* ============================================================
   admin.js — панель управления сайтом «Аура красоты».
   Вкладки: Услуги (название, цена, иконка, описание),
   Наши работы (фото + подпись), Записи клиентов.
   Работает и через бэкенд, и в демо-режиме (localStorage):
   правки отсюда сразу появляются на главной странице сайта.
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  let services = [];
  let works = [];
  let appointments = [];

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
    services = (await AuraAPI.getServices({ all: true, defaults: true })) || [];
    works = (await AuraAPI.getWorks({ all: true, defaults: true })) || [];
    appointments = (await AuraAPI.getAppointments().catch(() => [])) || [];
    renderServices();
    renderWorks();
    renderAppointments();
  }

  /* ---------- Вкладки ---------- */

  function switchTab(name) {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
  }

  /* ---------- Услуги ---------- */

  function renderServices() {
    const tbody = $('#servicesTbody');
    const list = [...services].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
    $('#servicesCount').textContent = `Услуг: ${list.length} · на сайте ${list.filter((s) => s.active).length}`;

    tbody.innerHTML = list.map((s) => `
      <tr>
        <td><img class="thumb" src="assets/icons/${esc(s.icon || 'scissors')}.png" alt="" onerror="this.style.visibility='hidden'"></td>
        <td><b>${esc(s.name)}</b><br><small style="color:var(--text-muted)">${esc(s.desc || '')}</small></td>
        <td>${esc(s.price || '—')}</td>
        <td>${s.active ? '<span class="status-badge status-badge--active">на сайте</span>' : '<span class="status-badge status-badge--hidden">скрыта</span>'}</td>
        <td>
          <div class="actions">
            <button class="icon-btn" title="${s.active ? 'Временно скрыть' : 'Вернуть на сайт'}" data-toggle="${s.id}">${s.active ? '👁' : '🚫'}</button>
            <button class="icon-btn" title="Редактировать" data-edit="${s.id}">✏️</button>
            <button class="icon-btn" title="Удалить" data-del="${s.id}">🗑</button>
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const s = services.find((x) => x.id === Number(b.dataset.toggle));
      await AuraAPI.setServiceActive(s.id, !s.active);
      showToast(s.active ? 'Услуга скрыта с сайта' : 'Услуга снова на сайте');
      await refreshAll();
    }));
    tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openServiceModal(services.find((s) => s.id === Number(b.dataset.edit)))));
    tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeService(Number(b.dataset.del))));
  }

  function openServiceModal(s = null) {
    $('#serviceModalTitle').textContent = s ? 'Редактировать услугу' : 'Новая услуга';
    $('#serviceId').value = s ? s.id : '';
    $('#serviceName').value = s ? s.name : '';
    $('#servicePrice').value = s ? (s.price || '') : '';
    $('#serviceSort').value = s ? (s.sort || 0) : services.length + 1;
    $('#serviceIcon').value = s ? (s.icon || 'scissors') : 'scissors';
    $('#serviceDesc').value = s ? (s.desc || '') : '';
    $('#serviceActive').checked = s ? !!s.active : true;
    $('#serviceModal').classList.add('open');
    setTimeout(() => $('#serviceName').focus(), 60);
  }

  async function saveService(e) {
    e.preventDefault();
    const s = {
      id: $('#serviceId').value ? Number($('#serviceId').value) : null,
      name: $('#serviceName').value.trim(),
      price: $('#servicePrice').value.trim(),
      sort: Number($('#serviceSort').value) || 0,
      icon: $('#serviceIcon').value,
      desc: $('#serviceDesc').value.trim(),
      active: $('#serviceActive').checked,
    };
    if (!s.name) { showToast('Укажите название услуги', true); return; }
    try {
      await AuraAPI.saveService(s);
      $('#serviceModal').classList.remove('open');
      showToast('Услуга сохранена — уже на сайте 🌸');
      await refreshAll();
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
    }
  }

  async function removeService(id) {
    const s = services.find((x) => x.id === id);
    if (!s || !confirm(`Удалить услугу «${s.name}»? Она исчезнет с сайта.`)) return;
    await AuraAPI.deleteService(id);
    showToast('Услуга удалена');
    await refreshAll();
  }

  /* ---------- Наши работы ---------- */

  function renderWorks() {
    const tbody = $('#worksTbody');
    const list = [...works].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
    $('#worksCount').textContent = `Фото: ${list.length} · на сайте ${list.filter((w) => w.active).length}`;

    tbody.innerHTML = list.map((w) => `
      <tr>
        <td><img class="thumb" style="width:72px;height:72px" src="${esc(photoSrc(w.photo))}" alt="" onerror="this.style.visibility='hidden'"></td>
        <td><b>${esc(w.caption)}</b></td>
        <td>${w.active ? '<span class="status-badge status-badge--active">на сайте</span>' : '<span class="status-badge status-badge--hidden">скрыто</span>'}</td>
        <td>
          <div class="actions">
            <button class="icon-btn" title="${w.active ? 'Временно скрыть' : 'Вернуть на сайт'}" data-toggle="${w.id}">${w.active ? '👁' : '🚫'}</button>
            <button class="icon-btn" title="Редактировать" data-edit="${w.id}">✏️</button>
            <button class="icon-btn" title="Удалить" data-del="${w.id}">🗑</button>
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const w = works.find((x) => x.id === Number(b.dataset.toggle));
      await AuraAPI.setWorkActive(w.id, !w.active);
      showToast(w.active ? 'Фото скрыто с сайта' : 'Фото снова на сайте');
      await refreshAll();
    }));
    tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openWorkModal(works.find((w) => w.id === Number(b.dataset.edit)))));
    tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeWork(Number(b.dataset.del))));
  }

  function updateWorkPreview() {
    const val = $('#workPhoto').value.trim();
    const el = $('#workPreview');
    if (val) {
      el.style.backgroundImage = `url("${val.replace(/"/g, '%22')}")`;
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = 'Здесь появится фото работы';
    }
  }

  function openWorkModal(w = null) {
    $('#workModalTitle').textContent = w ? 'Редактировать фото' : 'Новое фото';
    $('#workId').value = w ? w.id : '';
    $('#workPhoto').value = w ? w.photo : '';
    $('#workCaption').value = w ? w.caption : '';
    $('#workSort').value = w ? (w.sort || 0) : works.length + 1;
    $('#workActive').checked = w ? !!w.active : true;
    updateWorkPreview();
    $('#workModal').classList.add('open');
    setTimeout(() => $('#workCaption').focus(), 60);
  }

  async function saveWork(e) {
    e.preventDefault();
    const w = {
      id: $('#workId').value ? Number($('#workId').value) : null,
      photo: $('#workPhoto').value.trim() || 'assets/img/salon/work-4.jpg',
      caption: $('#workCaption').value.trim(),
      sort: Number($('#workSort').value) || 0,
      active: $('#workActive').checked,
    };
    if (!w.caption) { showToast('Добавьте подпись к фото', true); return; }
    try {
      await AuraAPI.saveWork(w);
      $('#workModal').classList.remove('open');
      showToast('Фото сохранено — уже на сайте 🌸');
      await refreshAll();
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
    }
  }

  async function removeWork(id) {
    const w = works.find((x) => x.id === id);
    if (!w || !confirm(`Удалить фото «${w.caption}»?`)) return;
    await AuraAPI.deleteWork(id);
    showToast('Фото удалено');
    await refreshAll();
  }

  /* ---------- Записи клиентов ---------- */

  const APPT_STATUS = {
    new: { label: 'новая', cls: 'status-badge--new' },
    confirmed: { label: 'подтверждена', cls: 'status-badge--new' },
    done: { label: 'выполнена', cls: 'status-badge--active' },
  };

  function renderAppointments() {
    const box = $('#appointmentsList');
    const filter = $('#appointmentFilter').value;
    let list = [...appointments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filter !== 'all') list = list.filter((a) => (a.status || 'new') === filter);

    $('#appointmentsCount').textContent = `Записей: ${list.length}`;

    if (!list.length) {
      box.innerHTML = '<div class="catalog-empty">Записей пока нет 🌷<br>Они появятся здесь, когда клиент оставит заявку через «Записаться онлайн».</div>';
      return;
    }

    box.innerHTML = list.map((a) => {
      const st = APPT_STATUS[a.status] || APPT_STATUS.new;
      return `
      <div class="order-card">
        <div class="order-card__head">
          <b>${esc(a.customer_name)} <span style="font-weight:500;color:var(--text-muted)">· ${AuraAPI.fmtDate(a.created_at)}</span></b>
          <span class="status-badge ${st.cls}">${st.label}</span>
        </div>
        <div class="order-card__meta">
          <a href="tel:${esc((a.phone || '').replace(/[^+\d]/g, ''))}">${esc(a.phone)}</a>
          ${a.service ? ` · ${esc(a.service)}` : ''}
          ${a.master && a.master !== 'Любой мастер' ? ` · мастер: ${esc(a.master)}` : ''}
          ${a.date ? ` · ${esc(a.date)}` : ''} ${a.time ? esc(a.time) : ''}
        </div>
        ${a.comment ? `<div class="order-card__meta">💬 «${esc(a.comment)}»</div>` : ''}
        <div class="order-card__actions">
          ${(a.status || 'new') === 'new' ? `<button class="btn btn--soft btn--sm" data-confirm="${a.id}">✓ Подтвердить</button>` : ''}
          ${(a.status || 'new') !== 'done' ? `<button class="btn btn--primary btn--sm" data-done="${a.id}">✓ Выполнена</button>` : ''}
          <button class="btn btn--danger btn--sm" data-rm="${a.id}">Удалить</button>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', async () => {
      await AuraAPI.setAppointmentStatus(Number(b.dataset.confirm), 'confirmed');
      showToast('Запись подтверждена');
      await refreshAll();
    }));
    box.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async () => {
      await AuraAPI.setAppointmentStatus(Number(b.dataset.done), 'done');
      showToast('Запись отмечена выполненной');
      await refreshAll();
    }));
    box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить запись? Обычно это делают, когда клиент уже принят.')) return;
      await AuraAPI.deleteAppointment(Number(b.dataset.rm));
      showToast('Запись удалена');
      await refreshAll();
    }));
  }

  /* ---------- Инициализация ---------- */

  document.addEventListener('DOMContentLoaded', async () => {
    $('#loginForm').addEventListener('submit', tryLogin);
    $('#logoutBtn').addEventListener('click', logout);
    $('#refreshBtn').addEventListener('click', async () => { await refreshAll(); showToast('Данные обновлены'); });

    document.querySelectorAll('.admin-tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    $('#addServiceBtn').addEventListener('click', () => openServiceModal(null));
    $('#serviceForm').addEventListener('submit', saveService);
    $('#serviceModalClose').addEventListener('click', () => $('#serviceModal').classList.remove('open'));
    $('#serviceCancel').addEventListener('click', () => $('#serviceModal').classList.remove('open'));

    $('#addWorkBtn').addEventListener('click', () => openWorkModal(null));
    $('#workForm').addEventListener('submit', saveWork);
    $('#workPhoto').addEventListener('input', updateWorkPreview);
    $('#workModalClose').addEventListener('click', () => $('#workModal').classList.remove('open'));
    $('#workCancel').addEventListener('click', () => $('#workModal').classList.remove('open'));

    $('#appointmentFilter').addEventListener('change', renderAppointments);

    if (await AuraAPI.checkAuth()) await enterPanel();
  });
})();
