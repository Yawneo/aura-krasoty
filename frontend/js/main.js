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
  });

  /* ---------- Иконки Icons8 ----------
     Подгружаются после полной загрузки страницы, чтобы внешние
     запросы не задерживали открытие сайта. При недоступности
     icons8 иконка просто скрывается — вёрстка не ломается. */
  function initIcons() {
    const apply = () => {
      document.querySelectorAll('img[data-ico]').forEach((el) => {
        el.addEventListener('error', () => { el.style.visibility = 'hidden'; }, { once: true });
        el.src = `https://img.icons8.com/ios/100/c9748f/${el.dataset.ico}.png`;
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
