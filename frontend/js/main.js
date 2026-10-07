/* ============================================================
   main.js — общая логика страниц «Аура красоты»:
   шапка, мобильное меню, окно записи, иконки, анимации,
   появление секций при прокрутке, тосты.
   ============================================================ */

(function () {
  'use strict';

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

    initReveal();
    initIcons();
    initBooking();
    initParallax();
    initHeaderShadow();
    document.querySelectorAll('input[type="tel"]').forEach(applyPhoneMask);
  });

  /* ---------- Тень шапки при прокрутке ---------- */
  function initHeaderShadow() {
    const header = document.querySelector('.header');
    if (!header) return;
    const apply = () => header.classList.toggle('scrolled', window.scrollY > 8);
    apply();
    window.addEventListener('scroll', apply, { passive: true });
  }

  /* ---------- Параллакс веток и «блоба» в hero ---------- */
  function initParallax() {
    const sprigs = document.querySelectorAll('.hero__decor-sprig');
    const blob = document.querySelector('.hero__blob');
    if (!sprigs.length && !blob) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const y = window.scrollY;
      if (y > 1400) return;
      sprigs.forEach((s, i) => { s.style.translate = `0 ${(y * (i ? 0.1 : 0.06)).toFixed(1)}px`; });
      if (blob) blob.style.translate = `0 ${(y * 0.14).toFixed(1)}px`;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
  }

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

  /* Путь к картинке товара с версией — чтобы браузер не показывал старые из кэша */
  window.photoSrc = function (photo) {
    const u = photo || 'assets/img/products/shampoo.svg';
    if (!u.startsWith('assets/')) return u;
    return u + (u.includes('?') ? '&' : '?') + 'v=8';
  };

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
                    <option>Мелирование</option>
                    <option>Сложное окрашивание</option>
                    <option>Укладка / локоны</option>
                    <option>Кератин / ботокс</option>
                    <option>Другое / консультация</option>
                  </select>
                </div>
                <div class="field full">
                  <label for="bkMaster">Мастер</label>
                  <select id="bkMaster">
                    <option>Любой мастер</option>
                    <option>Парикмахер-универсал</option>
                    <option>Колорист</option>
                    <option>Мастер укладок</option>
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
                  <textarea id="bkComment" rows="2" placeholder="Пожелания, длина волос…"></textarea>
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
        master: document.getElementById('bkMaster').value,
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

  /* ---------- Иконки ----------
     Лежат локально в assets/icons (скачаны с Icons8, тон сайта).
     Локальные файлы не зависят от сети — ничего не «пропадает».
     При ошибке иконка просто скрывается, вёрстка не ломается. */
  function initIcons() {
    document.querySelectorAll('img[data-ico]').forEach((el) => {
      el.addEventListener('error', () => { el.style.visibility = 'hidden'; }, { once: true });
      el.src = `assets/icons/${el.dataset.ico}.png`;
    });
  }

  /* ---------- Появление блоков при прокрутке (каскадом внутри секции) ---------- */

  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const parent = en.target.parentElement;
          const idx = parent ? [...parent.children].indexOf(en.target) : 0;
          en.target.style.animationDelay = Math.min(Math.max(idx, 0) * 90, 540) + 'ms';
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
