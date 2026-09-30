/* ============================================================
   enhance.js — presentation extras for lecture and project pages:
     • fade-in of blocks as they scroll into view
     • "On this page" side menu with the current section highlighted
     • back-to-top button
     • click a figure to enlarge it
     • a celebration when every lab step on the page is ticked
   Everything is optional: without this file the pages work the same.
   ============================================================ */
(function () {
  'use strict';
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wrap = document.querySelector('.wrap');
  if (!wrap) return;

  /* ---- scroll reveal ---- */
  if ('IntersectionObserver' in window && !reduce) {
    var blocks = $$('.lab, .ig, .sim, .kc, .game, .activity, .figure-card, .card, .analogy, .mermaid, .flip-grid, .levels, .box, .figure, .table-wrap', wrap)
      .filter(function (el) { return !el.closest('.cover') && !el.closest('details:not([open])'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -40px 0px' });
    blocks.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) return;           // already on screen: leave it alone
      el.classList.add('reveal-up'); io.observe(el);
    });
  }

  /* ---- side menu ---- */
  var heads = $$('h2', wrap).filter(function (h) { return !h.closest('.cover') && !h.closest('.kc') && h.offsetParent !== null; });
  if (heads.length > 3) {
    var nav = document.createElement('nav');
    nav.className = 'side-toc';
    nav.setAttribute('aria-label', 'On this page');
    nav.innerHTML = '<b>On this page</b>';
    var links = heads.map(function (h, i) {
      if (!h.id) {
        var sec = h.closest('section[id]');
        h.id = sec ? sec.id + '-h' : 'section-' + (i + 1);
      }
      var a = document.createElement('a');
      a.href = '#' + h.id;
      var num = h.querySelector('.num');
      var rest = h.cloneNode(true);
      var n2 = rest.querySelector('.num'); if (n2) n2.remove();
      var title = rest.textContent.replace(/\s+/g, ' ').trim();
      var badge = num ? num.textContent.trim() : '';
      if (/^(Lab|Milestone|M\d)/.test(title) || /^(L|M)\d+$/.test(badge) && /^(Lab|Milestone)/.test(title)) badge = '';
      a.textContent = (badge ? badge + '  ' : '') + title;
      nav.appendChild(a);
      return a;
    });
    document.body.appendChild(nav);
    var ticking = false;
    function spy() {
      ticking = false;
      var cur = 0, line = 150;
      heads.forEach(function (h, i) { if (h.getBoundingClientRect().top <= line) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
  }

  /* ---- back to top ---- */
  var top = document.createElement('button');
  top.className = 'to-top'; top.type = 'button'; top.setAttribute('aria-label', 'Back to top'); top.textContent = '↑';
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  document.body.appendChild(top);
  window.addEventListener('scroll', function () { top.classList.toggle('show', window.scrollY > 900); }, { passive: true });

  /* ---- lightbox for figures ---- */
  $$('.figure-card img, .figure img', wrap).forEach(function (img) {
    img.addEventListener('click', function () {
      var box = document.createElement('div');
      box.className = 'lightbox';
      var big = document.createElement('img'); big.src = img.src; big.alt = img.alt;
      var cap = document.createElement('span');
      var fc = img.closest('figure') && img.closest('figure').querySelector('figcaption');
      cap.textContent = fc ? fc.textContent : '';
      box.appendChild(big); box.appendChild(cap);
      function close() { box.classList.remove('show'); setTimeout(function () { box.remove(); }, 200); document.removeEventListener('keydown', esc); }
      function esc(e) { if (e.key === 'Escape') close(); }
      box.addEventListener('click', close); document.addEventListener('keydown', esc);
      document.body.appendChild(box);
      requestAnimationFrame(function () { box.classList.add('show'); });
    });
  });

  /* ---- celebration when all steps are done ---- */
  var steps = $$('.step', wrap);
  if (steps.length) {
    var celebrated = steps.every(function (s) { return s.classList.contains('is-done'); });
    document.addEventListener('change', function (e) {
      if (!e.target.closest || !e.target.closest('.done-box')) return;
      setTimeout(function () {
        var all = steps.every(function (s) { return s.classList.contains('is-done'); });
        if (all && !celebrated) { celebrated = true; party(); }
        if (!all) celebrated = false;
      }, 0);
    });
  }
  function party() {
    var msg = document.createElement('div');
    msg.className = 'celebrate';
    msg.innerHTML = '🎉 All lab steps done!<br><small style="font-weight:600">Great work. Now try the knowledge check.</small>';
    document.body.appendChild(msg);
    requestAnimationFrame(function () { msg.classList.add('show'); });
    setTimeout(function () { msg.classList.remove('show'); setTimeout(function () { msg.remove(); }, 400); }, 3200);
    if (reduce) return;
    var cols = ['#3d4bf5', '#8b5cf6', '#0e9e6e', '#c8862c', '#d64a3c', '#ffd166'];
    for (var i = 0; i < 90; i++) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.4) + 's';
      document.body.appendChild(c);
      (function (el) { setTimeout(function () { el.remove(); }, 4200); })(c);
    }
  }
})();
