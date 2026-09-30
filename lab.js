/* ============================================================
   lab.js — shared behaviour for the hands-on lecture series.
     • light/dark theme toggle (same key as the rest of the site)
     • "Copy" button on every .cmd code block
     • a "Done" tick on every .step, saved per page in this browser
     • the sticky lesson-progress bar
     • mermaid diagram initialisation
   Every feature quietly does nothing if its elements are missing.
   ============================================================ */
(function () {
  'use strict';
  var PAGE = 'lab:' + location.pathname.split('/').pop();

  function load() {
    try { return JSON.parse(localStorage.getItem(PAGE)) || {}; } catch (e) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(PAGE, JSON.stringify(s)); } catch (e) {}
  }

  /* ---- theme toggle ---- */
  var btn = document.getElementById('theme-toggle');
  function paintIcon() {
    if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
  }
  if (btn) {
    paintIcon();
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('limo-book-theme', next); } catch (e) {}
      paintIcon();
    });
  }

  /* ---- copy buttons ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.cmd'), function (box) {
    var head = box.querySelector('.cmd-h');
    var pre = box.querySelector('pre');
    if (!head || !pre) return;
    var b = document.createElement('button');
    b.className = 'copy-btn';
    b.type = 'button';
    b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var text = pre.innerText.replace(/\n$/, '');
      function ok() { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, function () { fallback(text); ok(); });
      } else { fallback(text); ok(); }
    });
    head.appendChild(b);
  });
  function fallback(text) {
    var t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(t);
  }

  /* ---- step ticks + progress ---- */
  var state = load();
  var steps = Array.prototype.slice.call(document.querySelectorAll('.step'));
  var fill = document.querySelector('.lp-fill');
  var count = document.querySelector('.lp-count');

  function refresh() {
    var done = steps.filter(function (s) { return s.classList.contains('is-done'); }).length;
    if (fill) fill.style.width = (steps.length ? (100 * done / steps.length) : 0) + '%';
    if (count) count.textContent = done + ' / ' + steps.length + ' steps';
  }

  steps.forEach(function (step, i) {
    var id = step.id || ('s' + i);
    var head = step.querySelector('.step-h');
    if (!head) return;
    var label = document.createElement('label');
    label.className = 'done-box';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!state[id];
    label.appendChild(cb);
    label.appendChild(document.createTextNode('Done'));
    head.appendChild(label);
    if (cb.checked) step.classList.add('is-done');
    cb.addEventListener('change', function () {
      step.classList.toggle('is-done', cb.checked);
      state[id] = cb.checked;
      save(state);
      refresh();
    });
  });
  refresh();

  var reset = document.querySelector('.lp-reset');
  if (reset) {
    reset.addEventListener('click', function (e) {
      e.preventDefault();
      state = {}; save(state);
      steps.forEach(function (s) {
        s.classList.remove('is-done');
        var cb = s.querySelector('.done-box input');
        if (cb) cb.checked = false;
      });
      refresh();
    });
  }

  /* ---- mermaid ---- */
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: true,
      theme: 'base',
      themeVariables: {
        background: '#fffefb', primaryColor: '#eef0ff', primaryTextColor: '#211f1a',
        primaryBorderColor: '#3d4bf5', lineColor: '#0e9e6e', secondaryColor: '#eafaf3',
        tertiaryColor: '#fdf3e4', textColor: '#211f1a', fontFamily: 'Inter, -apple-system, sans-serif'
      },
      flowchart: { curve: 'basis' },
      securityLevel: 'strict'
    });
  }
})();
