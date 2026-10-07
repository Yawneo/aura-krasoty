/* ============================================================
   main.js — общая логика всех страниц «Аура красоты»:
   шапка, мобильное меню, корзина (хранилище + счётчик),
   появление секций при прокрутке, тосты.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Корзина (localStorage) ---------- */

  const CART_KEY = 'aura_cart_v1';

  window.AuraCart = {
    get() {
      try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
      catch (_) { return {}; }
    },
    set(cart) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartBadge();
    },
    count() {
      return Object.values(this.get()).reduce((s, q) => s + q, 0);
    },
    add(id, qty = 1) {
      const cart = this.get();
      cart[id] = (cart[id] || 0) + qty;
      this.set(cart);
    },
    setQty(id, qty) {
      const cart = this.get();
      if (qty <= 0) delete cart[id]; else cart[id] = qty;
      this.set(cart);
    },
    remove(id) {
      const cart = this.get();
      delete cart[id];
      this.set(cart);
    },
    clear() {
      this.set({});
    },
  };

  function updateCartBadge() {
    document.querySelectorAll('.cart-btn__count').forEach((el) => {
      const n = window.AuraCart.count();
      el.textContent = n > 99 ? '99+' : n;
      el.classList.toggle('visible', n > 0);
    });
  }
  window.updateCartBadge = updateCartBadge;

  /* ---------- Шапка и мобильное меню ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    // активный пункт меню
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a, .mobile-menu a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const target = href.split('#')[0];
      if (target === page || (page === 'index.html' && href.startsWith('#'))) {
        if (target === page && !href.includes('#')) a.classList.add('active');
      }
    });

    const burger = document.querySelector('.burger');
    const menu = document.querySelector('.mobile-menu');
    if (burger && menu) {
      burger.addEventListener('click', () => menu.classList.toggle('open'));
      menu.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') menu.classList.remove('open');
      });
    }

    updateCartBadge();
    initReveal();
    initIcons();
    initBooking();
    document.querySelectorAll('input[type="tel"]').forEach(applyPhoneMask);
  });

  /* ---------- Маска телефона: +7 (999) 123-45-67 ----------
     Форматирует номер прямо во время ввода, как на популярных
     сайтах: +7, скобки, пробелы и дефисы. Ведущая 8 заменяется на +7. */
  function applyPhoneMask(input) {
    if (!input || input.dataset.masked) return;
    input.dataset.masked = '1';
    input.setAttribute('inputmode', 'tel');
    input.setAttribute('maxlength', '18');

    const format = (raw) => {
      let d = raw.replace(/\D/g, '');
      if (!d) return '';
      if (d.startsWith('8')) d = '7' + d.slice(1);
      if (!d.startsWith('7')) d = '7' + d;
      d = d.slice(0, 11);
      let out = '+7';
      if (d.length > 1) {
        out += ' (' + d.slice(1, 4);
        if (d.length >= 4) out += ')';
      }
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      return out;
    };

    input.addEventListener('focus', () => {
      if (!input.value.trim()) input.value = '+7 (';
    });
    input.addEventListener('input', () => {
      // если после «+7 (» первым символом ввели 8 — считаем её ведущей восьмёркой и убираем
      if (input.value.replace(/\D/g, '') === '78' && input.value.endsWith('8')) {
        input.value = '+7 (';
        return;
      }
      input.value = format(input.value);
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text') || '';
      input.value = format(text);
    });
    input.addEventListener('blur', () => {
      const d = input.value.replace(/\D/g, '');
      if (d === '' || d === '7') input.value = '';
    });
  }
  window.applyPhoneMask = applyPhoneMask;
  window.phoneDigits = (v) => String(v || '').replace(/\D/g, '');

  /* ---------- Окно записи (кнопки «Записаться») ----------
     Разметка добавляется на страницу автоматически,
     отправка — в API (/api/appointments) или в localStorage. */
  function initBooking() {
    if (!document.querySelector('[data-book]')) return;

    if (!document.getElementById('bookingModal')) {
      document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="bookingModal">
        <div class="modal" style="max-width:560px">
          <button class="modal__close" id="bookingClose" aria-label="Закрыть">✕</button>
          <div id="bookingFormView">
            <span class="eyebrow">ждём вас в гости</span>
            <h3 style="margin-bottom:16px">Запись в салон</h3>
            <form id="bookingForm" class="booking-form">
              <div class="form-grid">
                <div class="field">
                  <label for="bkName">Имя *</label>
                  <input type="text" id="bkName" required placeholder="Как к вам обращаться?">
                </div>
                <div class="field">
                  <label for="bkPhone">Телефон *</label>
                  <input type="tel" id="bkPhone" required placeholder="+7 (___) ___-__-__">
                </div>
                <div class="field full">
                  <label for="bkService">Услуга</label>
                  <select id="bkService">
                    <option>Женская стрижка</option>
                    <option>Мужская стрижка</option>
                    <option>Окрашивание</option>
                    <option>Укладка / локоны</option>
                    <option>Кератин / ботокс</option>
                    <option>Уход и лечение волос</option>
                    <option>Другое / консультация</option>
                  </select>
                </div>
                <div class="field">
                  <label for="bkDate">Желаемая дата</label>
                  <input type="date" id="bkDate">
                </div>
                <div class="field">
                  <label for="bkTime">Время</label>
                  <select id="bkTime"></select>
                </div>
                <div class="field full">
                  <label for="bkComment">Комментарий</label>
                  <textarea id="bkComment" rows="2" placeholder="Пожелания, длина волос, желаемый мастер…"></textarea>
                </div>
              </div>
              <button type="submit" class="btn btn--primary" style="width:100%">Отправить запись 🌷</button>
              <p class="booking-note">Отправив запись, вы соглашаетесь, что мы позвоним для подтверждения. Работаем вт–вс с 10:00 до 20:00.</p>
            </form>
          </div>
          <div id="bookingSuccessView" class="booking-success">
            <div class="success-icon">🌸</div>
            <h3>Записали!</h3>
            <p style="color:var(--text-muted)">Заявка отправлена — позвоним для подтверждения времени.<br>Срочное? <a href="tel:+73462616221">+7 (3462) 61-62-21</a></p>
            <button class="btn btn--primary" id="bookingOk" style="margin-top:18px">Хорошо!</button>
          </div>
        </div>
      </div>`);
    }

    const overlay = document.getElementById('bookingModal');
    const form = document.getElementById('bookingForm');
    const timeSelect = document.getElementById('bkTime');

    applyPhoneMask(document.getElementById('bkPhone'));

    // слоты времени: 10:00–19:30 каждые 30 минут
    for (let h = 10; h <= 19; h++) {
      for (const m of ['00', '30']) {
        if (h === 19 && m === '30') continue;
        timeSelect.insertAdjacentHTML('beforeend', `<option>${h}:${m}</option>`);
      }
    }

    const open = () => {
      document.getElementById('bookingFormView').style.display = '';
      document.getElementById('bookingSuccessView').classList.remove('visible');
      overlay.classList.add('open');
      setTimeout(() => document.getElementById('bkName').focus(), 60);
    };
    const close = () => overlay.classList.remove('open');

    document.querySelectorAll('[data-book]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.preventDefault(); open(); });
    });
    document.getElementById('bookingClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('bookingOk').addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const appt = {
        customer_name: document.getElementById('bkName').value.trim(),
        phone: document.getElementById('bkPhone').value.trim(),
        service: document.getElementById('bkService').value,
        date: document.getElementById('bkDate').value,
        time: document.getElementById('bkTime').value,
        comment: document.getElementById('bkComment').value.trim(),
      };
      if (!appt.customer_name || window.phoneDigits(appt.phone).length < 11) {
        showToast('Укажите имя и полный номер телефона', true);
        return;
      }
      try {
        await AuraAPI.createAppointment(appt);
        document.getElementById('bookingFormView').style.display = 'none';
        document.getElementById('bookingSuccessView').classList.add('visible');
        form.reset();
      } catch (err) {
        showToast('Не удалось отправить запись: ' + err.message, true);
      }
    });
  }

  /* ---------- Иконки Icons8 ----------
     Подгружаются после полной загрузки страницы, чтобы внешние
     запросы не задерживали открытие сайта. При недоступности
     icons8 иконка просто скрывается — вёрстка не ломается. */
  function initIcons() {
    const apply = () => {
      document.querySelectorAll('img[data-ico]').forEach((el) => {
        el.addEventListener('error', () => { el.style.visibility = 'hidden'; }, { once: true });
        el.src = `https://img.icons8.com/ios/100/7a3f56/${el.dataset.ico}.png`;
        // если картинка уже успела загрузиться с ошибкой до установки обработчика
        if (el.complete && el.naturalWidth === 0) el.style.visibility = 'hidden';
      });
    };
    if (document.readyState === 'complete') setTimeout(apply, 0);
    else window.addEventListener('load', () => setTimeout(apply, 0));
  }

  /* ---------- Появление блоков при прокрутке ---------- */

  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Тосты ---------- */

  let toastTimer = null;
  window.showToast = function (message, isError = false) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('toast--error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  };

  /* ---------- Экранирование HTML ---------- */

  window.esc = function (s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  };
})();
