/* ============================================================
   widgets.js — interactive learning widgets for the lecture series.
   Every widget is declared in the HTML with data-widget="name" and
   quietly does nothing if its element is missing.

   Markup-driven (content written in the page):
     kc        knowledge check (multiple choice with instant feedback)
     flip      flip cards for key terms
     order     put the steps in the right order
     sort      sort items into categories
     explain   click parts of code to see what they do
   Simulators (built entirely by this script):
     pubsub    publish/subscribe playground          (L3)
     service   service call: async vs blocking        (L4)
     action    action goal / feedback / result        (L13)
     msgbuilder  .msg / .srv designer                 (L5)
     launchbuilder  launch-file generator             (L6)
     gotogoal  turtle go-to-goal + catch them all     (L7)
     twist     Twist → path, open-loop drift          (L8)
     quat      quaternion ↔ yaw                       (L8)
     tf2d      laser point through the TF chain       (L9)
     scan      LaserScan explorer + wanderer          (L10)
     hsv       HSV colour threshold + blob tracker    (L11)
     particles 1D particle filter (AMCL idea)         (L12)
     planner   occupancy grid + inflation + A*        (L13)
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------- helpers */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function C() {
    return {
      bg: cssv('--panel') || '#fffefb', bg2: cssv('--panel2') || '#f1efe8', text: cssv('--text') || '#211f1a',
      muted: cssv('--muted') || '#7a7568', border: cssv('--border') || '#e6e1d6', accent: cssv('--accent') || '#3d4bf5',
      green: cssv('--accent2') || '#0e9e6e', gold: cssv('--gold') || '#c8862c', red: cssv('--danger') || '#d64a3c',
      purple: cssv('--purple') || '#8b5cf6'
    };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function deg(r) { return r * 180 / Math.PI; }

  function mkCanvas(w, hh) {
    var c = h('canvas', { class: 'wcanvas' });
    var d = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(w * d); c.height = Math.round(hh * d);
    c.style.aspectRatio = w + ' / ' + hh;
    c.style.maxWidth = w + 'px';
    var ctx = c.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    c._w = w; c._h = hh;
    return { c: c, ctx: ctx };
  }
  function pos(c, ev) {
    var r = c.getBoundingClientRect();
    var p = ev.touches ? ev.touches[0] : ev;
    return { x: (p.clientX - r.left) * c._w / r.width, y: (p.clientY - r.top) * c._h / r.height };
  }
  function rr(ctx, x, y, w, hh, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function label(ctx, txt, x, y, col, size, align, bold) {
    ctx.fillStyle = col; ctx.font = (bold ? '700 ' : '600 ') + (size || 12) + 'px Inter, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y);
  }
  function node(ctx, x, y, w, hh, txt, fill, stroke, txtCol) {
    rr(ctx, x - w / 2, y - hh / 2, w, hh, 12);
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
    label(ctx, txt, x, y, txtCol, 12, 'center', true);
  }
  function arrowLine(ctx, x1, y1, x2, y2, col, dash) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
    if (dash) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    var a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function btn(text, cls, fn) {
    return h('button', { type: 'button', class: 'wbtn ' + (cls || ''), text: text, onclick: fn });
  }
  function slider(lbl, min, max, step, val, onInput, fmt) {
    var out = h('b', { text: fmt ? fmt(val) : String(val) });
    var inp = h('input', { type: 'range', min: min, max: max, step: step, value: val });
    inp.addEventListener('input', function () {
      var v = parseFloat(inp.value); out.textContent = fmt ? fmt(v) : String(v); onInput(v);
    });
    var wrapEl = h('label', { class: 'wslider' }, [h('span', { text: lbl }), inp, out]);
    return { el: wrapEl, input: inp, set: function (v) { inp.value = v; out.textContent = fmt ? fmt(v) : String(v); } };
  }
  function check(lbl, val, onChange) {
    var inp = h('input', { type: 'checkbox' }); inp.checked = !!val;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    return h('label', { class: 'wcheck' }, [inp, h('span', { text: lbl })]);
  }
  function readouts(pairs) {
    var box = h('div', { class: 'wread' });
    var cells = {};
    pairs.forEach(function (p) {
      var v = h('b', { text: '–' });
      cells[p[0]] = v;
      box.appendChild(h('div', {}, [h('span', { text: p[1] }), v]));
    });
    return { el: box, set: function (k, t) { if (cells[k]) cells[k].textContent = t; } };
  }
  function shell(root, title) {
    root.classList.add('sim');
    root.appendChild(h('div', { class: 'sim-h' }, [
      h('span', { class: 'sim-tag', text: '🧪 Try it' }),
      h('span', { class: 'sim-title', text: root.getAttribute('data-title') || title })
    ]));
    var hint = root.getAttribute('data-hint');
    var body = h('div', { class: 'sim-b' });
    if (hint) body.appendChild(h('p', { class: 'sim-hint', html: hint }));
    root.appendChild(body);
    return body;
  }
  function row(kids) { return h('div', { class: 'w-row' }, kids); }

  /* one animation loop for all simulators, paused when off-screen */
  var loops = [];
  function addLoop(root, fn) {
    var o = { fn: fn, vis: !('IntersectionObserver' in window) };
    loops.push(o);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { o.vis = es[0].isIntersecting; }).observe(root);
    }
  }
  var last = 0;
  function frame(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    loops.forEach(function (o) { if (o.vis) { try { o.fn(dt); } catch (e) { console.error(e); } } });
    requestAnimationFrame(frame);
  }
  var themeCbs = [];
  if ('MutationObserver' in window) {
    new MutationObserver(function () { themeCbs.forEach(function (f) { f(); }); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  var W = {};

  /* ================================================== markup-driven */
  W.kc = function (root) {
    var qs = $$('.kc-q', root), score = 0, done = 0;
    var txt = h('span', { class: 'kc-score' });
    root.appendChild(h('div', { class: 'kc-bar' }, [txt, btn('↺ Try again', 'ghost', reset)]));
    function upd() {
      if (done < qs.length) txt.textContent = 'Score: ' + score + ' / ' + done + ' · ' + (qs.length - done) + ' question' + (qs.length - done === 1 ? '' : 's') + ' to go';
      else txt.textContent = '🏁 ' + score + ' / ' + qs.length + (score === qs.length ? ' · Perfect! 🎉' : score >= qs.length * 0.6 ? ' · Good, review the red ones' : ' · Re-read "The idea" and try again');
    }
    qs.forEach(function (q) {
      var a = parseInt(q.getAttribute('data-a'), 10);
      var bs = $$('.kc-opts button', q), why = $('.kc-why', q);
      if (why) why.hidden = true;
      bs.forEach(function (b, i) {
        b.type = 'button';
        b.addEventListener('click', function () {
          if (q.classList.contains('answered')) return;
          q.classList.add('answered'); done++;
          if (i === a) { b.classList.add('right'); score++; } else { b.classList.add('wrong'); if (bs[a]) bs[a].classList.add('right'); }
          if (why) why.hidden = false;
          upd();
        });
      });
    });
    function reset() {
      score = 0; done = 0;
      qs.forEach(function (q) {
        q.classList.remove('answered');
        $$('.kc-opts button', q).forEach(function (b) { b.classList.remove('right', 'wrong'); });
        var w = $('.kc-why', q); if (w) w.hidden = true;
      });
      upd();
    }
    upd();
  };

  W.flip = function (root) {
    $$('.flip', root).forEach(function (f) {
      f.tabIndex = 0; f.setAttribute('role', 'button');
      function t() { f.classList.toggle('flipped'); }
      f.addEventListener('click', t);
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
    });
  };

  W.order = function (root) {
    var ol = $('ol', root); if (!ol) return;
    var items = $$('li', ol).map(function (li, i) { return { html: li.innerHTML, i: i }; });
    ol.parentNode.removeChild(ol);
    var list = h('div', { class: 'ord-list' }), msg = h('div', { class: 'ord-msg' });
    function shuffle(a) {
      var tries = 0;
      do {
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        tries++;
      } while (a.length > 1 && tries < 20 && a.every(function (x, k) { return x.i === k; }));
      return a;
    }
    var cur = shuffle(items.slice());
    function swap(k, d) { var t = cur[k + d]; cur[k + d] = cur[k]; cur[k] = t; render(); }
    function render() {
      list.innerHTML = '';
      cur.forEach(function (it, k) {
        list.appendChild(h('div', { class: 'ord-row' }, [
          h('span', { class: 'ord-n', text: String(k + 1) }),
          h('span', { class: 'ord-t', html: it.html }),
          btn('▲', 'mini', function () { if (k > 0) swap(k, -1); }),
          btn('▼', 'mini', function () { if (k < cur.length - 1) swap(k, 1); })
        ]));
      });
      msg.textContent = '';
    }
    root.appendChild(list);
    root.appendChild(row([
      btn('✔ Check order', 'primary', function () {
        var ok = 0;
        $$('.ord-row', list).forEach(function (r, k) {
          var good = cur[k].i === k; r.classList.toggle('good', good); r.classList.toggle('bad', !good); if (good) ok++;
        });
        msg.textContent = ok === cur.length ? '🎉 Perfect order!' : ok + ' of ' + cur.length + ' in the right place. Move the red ones.';
      }),
      btn('↺ Shuffle', 'ghost', function () { cur = shuffle(items.slice()); render(); })
    ]));
    root.appendChild(msg);
    render();
  };

  W.sort = function (root) {
    var cats = (root.getAttribute('data-cats') || 'A|B').split('|');
    var ul = $('ul', root); if (!ul) return;
    var items = $$('li', ul).map(function (li) { return { html: li.innerHTML, c: parseInt(li.getAttribute('data-cat'), 10) }; });
    ul.parentNode.removeChild(ul);
    var picks = items.map(function () { return -1; });
    var box = h('div', { class: 'sort-list' }), msg = h('div', { class: 'ord-msg' });
    items.forEach(function (it, k) {
      var g = h('span', { class: 'sort-btns' });
      var r = h('div', { class: 'sort-row' }, [h('span', { class: 'sort-t', html: it.html }), g]);
      cats.forEach(function (c, ci) {
        g.appendChild(btn(c, 'chipbtn', function () {
          picks[k] = ci;
          $$('button', g).forEach(function (x, xi) { x.classList.toggle('on', xi === ci); });
          r.classList.remove('good', 'bad');
        }));
      });
      box.appendChild(r);
    });
    root.appendChild(box);
    root.appendChild(row([btn('✔ Check', 'primary', function () {
      var ok = 0;
      $$('.sort-row', box).forEach(function (r, k) {
        var good = picks[k] === items[k].c; r.classList.toggle('good', good); r.classList.toggle('bad', !good); if (good) ok++;
      });
      msg.textContent = ok === items.length ? '🎉 All correct!' : ok + ' / ' + items.length + ' correct. Change the red ones.';
    })]));
    root.appendChild(msg);
  };

  W.explain = function (root) {
    var panel = h('div', { class: 'ex-panel', html: '👆 Click any <span class="ex-demo">highlighted</span> part of the code to see what it does.' });
    root.appendChild(panel);
    $$('.ex', root).forEach(function (s) {
      s.tabIndex = 0;
      function show() {
        $$('.ex.on', root).forEach(function (x) { x.classList.remove('on'); });
        s.classList.add('on');
        panel.innerHTML = '<code>' + esc(s.textContent.trim()) + '</code><br>' + s.getAttribute('data-tip');
      }
      s.addEventListener('click', show);
      s.addEventListener('keydown', function (e) { if (e.key === 'Enter') show(); });
    });
  };

  /* ================================================== L3: pub/sub */
  W.pubsub = function (root) {
    var body = shell(root, 'Publish / subscribe playground');
    var WD = 640, HT = 300, cv = mkCanvas(WD, HT), ctx = cv.ctx;
    var pubs = [{ name: 'station1', topic: '/robot_news', acc: 0 }];
    var subs = [{ name: 'smartphone', topic: '/robot_news', count: 0 }];
    var dots = [], rate = 2, paused = false, dropped = 0;
    var logEl = h('div', { class: 'sim-log' });
    var TOP = { '/robot_news': { x: 320, y: 120 }, '/other_news': { x: 320, y: 245 } };
    function yOf(i, n) { return n === 1 ? 120 : 45 + i * (HT - 90) / (n - 1); }
    function log(t) {
      logEl.insertBefore(h('div', { text: t }), logEl.firstChild);
      while (logEl.childNodes.length > 6) logEl.removeChild(logEl.lastChild);
    }
    body.appendChild(cv.c);
    var rs = slider('Publish rate', 0.5, 5, 0.5, rate, function (v) { rate = v; }, function (v) { return v + ' Hz'; });
    body.appendChild(row([
      btn('+ Publisher', '', function () { if (pubs.length < 4) pubs.push({ name: 'station' + (pubs.length + 1), topic: '/robot_news', acc: Math.random() }); }),
      btn('− Publisher', '', function () { if (pubs.length > 0) pubs.pop(); }),
      btn('+ Subscriber', '', function () { if (subs.length < 4) subs.push({ name: ['laptop', 'tablet', 'watch'][subs.length - 1] || 'sub' + subs.length, topic: '/robot_news', count: 0 }); }),
      btn('− Subscriber', '', function () { if (subs.length > 0) subs.pop(); }),
      rs.el
    ]));
    body.appendChild(row([
      btn('🔀 Remap last subscriber', 'ghost', function () {
        var s = subs[subs.length - 1]; if (!s) return;
        s.topic = s.topic === '/robot_news' ? '/other_news' : '/robot_news';
        log('ros2 run … ' + s.name + ' --ros-args -r robot_news:=' + s.topic.slice(1));
      }),
      btn('🔀 Remap last publisher', 'ghost', function () {
        var p = pubs[pubs.length - 1]; if (!p) return;
        p.topic = p.topic === '/robot_news' ? '/other_news' : '/robot_news';
        log('ros2 run … ' + p.name + ' --ros-args -r robot_news:=' + p.topic.slice(1));
      }),
      btn('⏯ Pause', 'ghost', function () { paused = !paused; })
    ]));
    body.appendChild(logEl);
    body.appendChild(h('p', { class: 'sim-hint', html: 'Watch: every subscriber on the same topic gets its <em>own copy</em> of each message. A remapped node talks on a different topic and is cut off. With no subscribers the messages are simply dropped: the publisher never knows (topics are <strong>anonymous</strong>).' }));

    addLoop(root, function (dt) {
      if (!paused) {
        pubs.forEach(function (p, i) {
          p.acc += dt * rate;
          while (p.acc >= 1) {
            p.acc -= 1;
            dots.push({ x1: 90, y1: yOf(i, pubs.length), x2: TOP[p.topic].x, y2: TOP[p.topic].y, t: 0, stage: 0, topic: p.topic, from: p.name });
          }
        });
        dots.forEach(function (d) { d.t += dt * 1.4; });
        var born = [];
        dots = dots.filter(function (d) {
          if (d.t < 1) return true;
          if (d.stage === 0) {
            var n = 0;
            subs.forEach(function (s, j) {
              if (s.topic === d.topic) { n++; born.push({ x1: d.x2, y1: d.y2, x2: 550, y2: yOf(j, subs.length), t: 0, stage: 1, sub: s, from: d.from }); }
            });
            if (!n) { dropped++; }
          } else {
            d.sub.count++;
            if (Math.random() < 0.35) log('[' + d.sub.name + '] Hi, this is ' + d.from + ' from the robot news station.');
          }
          return false;
        });
        dots = dots.concat(born);
      }
      var c = C();
      ctx.clearRect(0, 0, WD, HT);
      ctx.fillStyle = c.bg2; rr(ctx, 0, 0, WD, HT, 14); ctx.fill();
      Object.keys(TOP).forEach(function (t) {
        var used = pubs.some(function (p) { return p.topic === t; }) || subs.some(function (s) { return s.topic === t; });
        if (t === '/other_news' && !used) return;
        pubs.forEach(function (p, i) { if (p.topic === t) arrowLine(ctx, 150, yOf(i, pubs.length), TOP[t].x - 62, TOP[t].y, c.green); });
        subs.forEach(function (s, j) { if (s.topic === t) arrowLine(ctx, TOP[t].x + 62, TOP[t].y, 490, yOf(j, subs.length), c.green); });
        rr(ctx, TOP[t].x - 62, TOP[t].y - 16, 124, 32, 16); ctx.fillStyle = c.bg; ctx.fill();
        ctx.strokeStyle = c.green; ctx.lineWidth = 2; ctx.stroke();
        label(ctx, t, TOP[t].x, TOP[t].y, c.green, 12, 'center', true);
      });
      pubs.forEach(function (p, i) { node(ctx, 90, yOf(i, pubs.length), 120, 34, '📡 ' + p.name, c.bg, c.accent, c.text); });
      subs.forEach(function (s, j) {
        node(ctx, 550, yOf(j, subs.length), 120, 34, '📱 ' + s.name, c.bg, c.purple, c.text);
        label(ctx, s.count + ' msgs', 550, yOf(j, subs.length) + 26, c.muted, 11);
      });
      dots.forEach(function (d) {
        var x = d.x1 + (d.x2 - d.x1) * d.t, y = d.y1 + (d.y2 - d.y1) * d.t;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = d.stage ? c.purple : c.gold; ctx.fill();
      });
      if (!subs.length) label(ctx, 'no subscribers → messages dropped (' + dropped + ')', 320, 160, c.red, 12);
      if (!pubs.length) label(ctx, 'no publishers → subscribers wait (no error)', 320, 160, c.red, 12);
    });
  };

  /* ================================================== L4: service */
  W.service = function (root) {
    var body = shell(root, 'Service call: /add_two_ints');
    var WD = 640, HT = 230, cv = mkCanvas(WD, HT), ctx = cv.ctx;
    var a = 3, b = 4, running = true, blocking = false;
    var phase = 'idle', t = 0, ticks = 0, tickAcc = 0, result = null, waitT = 0;
    var logEl = h('div', { class: 'sim-log' });
    function log(s) { logEl.insertBefore(h('div', { text: s }), logEl.firstChild); while (logEl.childNodes.length > 6) logEl.removeChild(logEl.lastChild); }
    var ia = h('input', { type: 'number', value: a, class: 'wnum' }), ib = h('input', { type: 'number', value: b, class: 'wnum' });
    body.appendChild(cv.c);
    body.appendChild(row([
      h('label', { class: 'wslider' }, [h('span', { text: 'a' }), ia]),
      h('label', { class: 'wslider' }, [h('span', { text: 'b' }), ib]),
      btn('📨 Call service', 'primary', function () {
        if (phase !== 'idle') { log('(a call is already in flight)'); return; }
        a = parseInt(ia.value, 10) || 0; b = parseInt(ib.value, 10) || 0;
        phase = 'req'; t = 0; result = null; waitT = 0;
        log('client: call_async(AddTwoInts.Request(a=' + a + ', b=' + b + '))');
      }),
      check('server running', running, function (v) { running = v; log(v ? 'server: ros2 run my_py_pkg add_two_ints_server' : 'server stopped (Ctrl+C)'); }),
      check('blocking call inside a callback (the bug)', blocking, function (v) { blocking = v; })
    ]));
    body.appendChild(logEl);
    body.appendChild(h('p', { class: 'sim-hint', html: 'The client also has a <strong>timer</strong> that ticks twice per second. With a non-blocking <code>call_async</code> + callback, the timer keeps ticking while it waits. Tick the "blocking" box: the whole node freezes until the answer arrives. Now stop the server and call again.' }));
    addLoop(root, function (dt) {
      var frozen = blocking && phase !== 'idle';
      if (!frozen) { tickAcc += dt; while (tickAcc >= 0.5) { tickAcc -= 0.5; ticks++; } }
      if (phase === 'req') {
        var lim = running ? 1 : 0.5;
        t = Math.min(lim, t + dt);
        if (!running && t >= 0.5) { waitT += dt; if (waitT > 1.5 && Math.floor(waitT * 2) % 2 === 0 && Math.floor((waitT - dt) * 2) % 2 === 1) log('client: Waiting for server add_two_ints...'); }
        if (running && t >= 1) { phase = 'compute'; t = 0; }
      } else if (phase === 'compute') {
        t += dt; if (t >= 0.5) { result = a + b; phase = 'resp'; t = 0; log('server: ' + a + ' + ' + b + ' = ' + result); }
      } else if (phase === 'resp') {
        t += dt; if (t >= 1) { phase = 'idle'; log('client callback: ' + a + ' + ' + b + ' = ' + result); }
      }
      var c = C();
      ctx.clearRect(0, 0, WD, HT); ctx.fillStyle = c.bg2; rr(ctx, 0, 0, WD, HT, 14); ctx.fill();
      node(ctx, 110, 100, 160, 60, 'client node', c.bg, frozen ? c.red : c.accent, c.text);
      label(ctx, frozen ? '⛔ BLOCKED' : '⏱ timer ticks: ' + ticks, 110, 150, frozen ? c.red : c.muted, 12, 'center', true);
      node(ctx, 530, 100, 160, 60, running ? 'add_two_ints_server' : '(server offline)', c.bg, running ? c.green : c.border, running ? c.text : c.muted);
      arrowLine(ctx, 195, 88, 445, 88, c.border); arrowLine(ctx, 445, 112, 195, 112, c.border);
      label(ctx, 'request {a, b}', 320, 74, c.muted, 11); label(ctx, 'response {sum}', 320, 128, c.muted, 11);
      if (phase === 'req') {
        var x = 195 + 250 * t;
        rr(ctx, x - 34, 76, 68, 24, 6); ctx.fillStyle = c.gold; ctx.fill();
        label(ctx, 'a=' + a + ' b=' + b, x, 88, '#fff', 11, 'center', true);
        if (!running && t >= 0.5) label(ctx, 'Waiting for service…', 320, 190, c.red, 13, 'center', true);
      } else if (phase === 'compute') {
        label(ctx, '⚙ sum = a + b', 530, 150, c.green, 12, 'center', true);
      } else if (phase === 'resp') {
        var x2 = 445 - 250 * t;
        rr(ctx, x2 - 34, 100, 68, 24, 6); ctx.fillStyle = c.purple; ctx.fill();
        label(ctx, 'sum=' + result, x2, 112, '#fff', 11, 'center', true);
      }
    });
  };

  /* ================================================== L13: action */
  W.action = function (root) {
    var body = shell(root, 'Action: /turtle1/rotate_absolute');
    var WD = 640, HT = 220, cv = mkCanvas(WD, HT), ctx = cv.ctx;
    var theta = 0, target = 90, active = false, fbAcc = 0, events = [];
    var logEl = h('div', { class: 'sim-log' });
    function log(s) { logEl.insertBefore(h('div', { text: s }), logEl.firstChild); while (logEl.childNodes.length > 7) logEl.removeChild(logEl.lastChild); }
    var sl = slider('Goal angle', -180, 180, 5, target, function (v) { target = v; }, function (v) { return v + '°'; });
    body.appendChild(cv.c);
    body.appendChild(row([sl.el,
      btn('🎯 Send goal', 'primary', function () {
        active = true; events.push('goal'); log('client → goal {theta: ' + (target * Math.PI / 180).toFixed(2) + '}  · server: goal ACCEPTED');
      }),
      btn('✖ Cancel goal', 'ghost', function () {
        if (!active) return; active = false; events.push('cancel');
        log('client → cancel · result: CANCELED (delta so far ' + f2(Math.abs(theta)) + ')');
      })]));
    body.appendChild(logEl);
    body.appendChild(h('p', { class: 'sim-hint', html: 'An <strong>action</strong> is a long-running service: <em>goal</em> → many <em>feedback</em> messages → one <em>result</em>, and it can be <em>cancelled</em> half-way. Nav2\'s <code>NavigateToPose</code> works exactly like this.' }));
    addLoop(root, function (dt) {
      if (active) {
        var goal = target * Math.PI / 180, err = wrap(goal - theta);
        var step = clamp(err, -1.2 * dt, 1.2 * dt);
        theta = wrap(theta + step);
        fbAcc += dt;
        if (fbAcc > 0.4) { fbAcc = 0; log('feedback: remaining = ' + f2(Math.abs(err)) + ' rad'); }
        if (Math.abs(err) < 0.01) { active = false; log('result: SUCCEEDED  (delta = ' + f2(Math.abs(err)) + ')'); }
      }
      var c = C();
      ctx.clearRect(0, 0, WD, HT); ctx.fillStyle = c.bg2; rr(ctx, 0, 0, WD, HT, 14); ctx.fill();
      var cx = 120, cy = 110;
      ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 7); ctx.strokeStyle = c.border; ctx.lineWidth = 2; ctx.stroke();
      var g = target * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 70 * Math.cos(g), cy - 70 * Math.sin(g)); ctx.strokeStyle = c.red; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-theta);
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fillStyle = c.green; ctx.fill();
      ctx.beginPath(); ctx.arc(26, 0, 9, 0, 7); ctx.fill(); ctx.restore();
      label(ctx, 'θ = ' + deg(theta).toFixed(0) + '°', cx, 200, c.text, 12, 'center', true);
      var steps = [['Goal', c.accent], ['Accepted', c.accent], ['Feedback…', c.gold], ['Result', c.green]];
      steps.forEach(function (s, i) {
        var x = 290 + i * 88, on = active ? i <= 2 : (i === 3 && events.length);
        rr(ctx, x - 40, 90, 80, 36, 10); ctx.fillStyle = on ? s[1] : c.bg; ctx.fill(); ctx.strokeStyle = s[1]; ctx.stroke();
        label(ctx, s[0], x, 108, on ? '#fff' : s[1], 12, 'center', true);
        if (i < 3) arrowLine(ctx, x + 40, 108, x + 48, 108, c.muted);
      });
      label(ctx, active ? 'running… you can still cancel' : 'idle: send a goal', 422, 150, c.muted, 12);
    });
  };

  /* ================================================== L5: interface builder */
  W.msgbuilder = function (root) {
    var body = shell(root, 'Interface builder: design a .msg or .srv');
    var TYPES = ['bool', 'int64', 'float64', 'string', 'int64[]', 'float64[]', 'string[]', 'geometry_msgs/Point', 'Turtle', 'Turtle[]'];
    var PRESETS = {
      'HardwareStatus.msg': { kind: 'msg', name: 'HardwareStatus', req: [['int64', 'temperature'], ['bool', 'are_motors_ready'], ['string', 'debug_message']], res: [] },
      'LedStateArray.msg': { kind: 'msg', name: 'LedStateArray', req: [['int64[]', 'led_states']], res: [] },
      'TurtleArray.msg': { kind: 'msg', name: 'TurtleArray', req: [['Turtle[]', 'turtles']], res: [] },
      'ComputeRectangleArea.srv': { kind: 'srv', name: 'ComputeRectangleArea', req: [['float64', 'length'], ['float64', 'width']], res: [['float64', 'area']] },
      'SetLed.srv': { kind: 'srv', name: 'SetLed', req: [['int64', 'led_number'], ['int64', 'state']], res: [['bool', 'success']] }
    };
    var st = JSON.parse(JSON.stringify(PRESETS['HardwareStatus.msg']));
    var editor = h('div', { class: 'mb-ed' }), out = h('div', { class: 'mb-out' });
    var presetSel = h('select', { class: 'wsel' }, Object.keys(PRESETS).map(function (k) { return h('option', { value: k, text: k }); }));
    presetSel.addEventListener('change', function () { st = JSON.parse(JSON.stringify(PRESETS[presetSel.value])); render(); });
    body.appendChild(row([h('span', { class: 'wlbl', text: 'Start from:' }), presetSel]));
    body.appendChild(h('div', { class: 'mb-grid' }, [editor, out]));
    function fieldRows(list, title) {
      var box = h('div', { class: 'mb-part' }, [h('div', { class: 'mb-title', text: title })]);
      list.forEach(function (f, i) {
        var sel = h('select', { class: 'wsel' }, TYPES.map(function (t) { var o = h('option', { value: t, text: t }); if (t === f[0]) o.selected = true; return o; }));
        var nm = h('input', { class: 'wtxt', value: f[1], spellcheck: 'false' });
        sel.addEventListener('change', function () { f[0] = sel.value; gen(); });
        nm.addEventListener('input', function () { f[1] = nm.value; gen(); });
        box.appendChild(h('div', { class: 'mb-row' }, [sel, nm, btn('✕', 'mini', function () { list.splice(i, 1); render(); })]));
      });
      box.appendChild(btn('+ field', 'ghost', function () { list.push(['float64', 'new_field']); render(); }));
      return box;
    }
    function render() {
      editor.innerHTML = '';
      var kind = h('select', { class: 'wsel' }, [h('option', { value: 'msg', text: '.msg (topic)' }), h('option', { value: 'srv', text: '.srv (service)' })]);
      kind.value = st.kind;
      kind.addEventListener('change', function () { st.kind = kind.value; if (st.kind === 'srv' && !st.res.length) st.res.push(['bool', 'success']); render(); });
      var nm = h('input', { class: 'wtxt', value: st.name, spellcheck: 'false' });
      nm.addEventListener('input', function () { st.name = nm.value; gen(); });
      editor.appendChild(row([kind, nm]));
      editor.appendChild(fieldRows(st.req, st.kind === 'srv' ? 'Request (above ---)' : 'Fields'));
      if (st.kind === 'srv') editor.appendChild(fieldRows(st.res, 'Response (below ---)'));
      gen();
    }
    function pyDefault(t) {
      if (t === 'bool') return 'True'; if (t === 'int64') return '0'; if (t === 'float64') return '0.0';
      if (t === 'string') return '"text"'; if (t === 'int64[]') return '[0, 1, 0]'; if (t === 'float64[]') return '[0.0, 1.5]';
      if (t === 'string[]') return '["a", "b"]'; if (t === 'geometry_msgs/Point') return 'Point(x=1.0, y=2.0, z=0.0)';
      if (t === 'Turtle') return 'Turtle()'; if (t === 'Turtle[]') return '[Turtle(), Turtle()]'; return '...';
    }
    function gen() {
      var errs = [], name = st.name.trim();
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) errs.push('File name must be CamelCase, start with a capital, and have no "_" (e.g. HardwareStatus).');
      var all = st.req.concat(st.res), seen = {};
      all.forEach(function (f) {
        if (!/^[a-z][a-z0-9_]*$/.test(f[1]) || /__|_$/.test(f[1])) errs.push('Field "' + f[1] + '" must be snake_case: lower case letters, digits and single underscores.');
        if (seen[f[1]]) errs.push('Field "' + f[1] + '" is used twice.');
        seen[f[1]] = 1;
      });
      if (!st.req.length && st.kind === 'msg') errs.push('A message needs at least one field.');
      var file = st.req.map(function (f) { return f[0] + ' ' + f[1]; }).join('\n');
      if (st.kind === 'srv') file += (file ? '\n' : '') + '---\n' + st.res.map(function (f) { return f[0] + ' ' + f[1]; }).join('\n');
      var ext = st.kind, py;
      if (st.kind === 'msg') {
        py = 'from my_robot_interfaces.msg import ' + name + '\n\nmsg = ' + name + '()\n' +
          st.req.map(function (f) { return 'msg.' + f[1] + ' = ' + pyDefault(f[0]); }).join('\n') + '\nself.publisher_.publish(msg)';
      } else {
        py = 'from my_robot_interfaces.srv import ' + name + '\n\n# server callback\ndef callback(self, request, response):\n' +
          st.req.map(function (f) { return '    x = request.' + f[1]; }).slice(0, 2).join('\n') + '\n' +
          st.res.map(function (f) { return '    response.' + f[1] + ' = ' + pyDefault(f[0]); }).join('\n') + '\n    return response\n\n# client\nrequest = ' + name + '.Request()';
      }
      var needs = all.some(function (f) { return f[0].indexOf('geometry_msgs') === 0; });
      out.innerHTML =
        '<div class="mb-file">📄 my_robot_interfaces/' + ext + '/' + esc(name) + '.' + ext + '</div><pre>' + esc(file || '(empty)') + '</pre>' +
        '<div class="mb-file">📄 CMakeLists.txt → rosidl_generate_interfaces(…)</div><pre>"' + ext + '/' + esc(name) + '.' + ext + '"' +
        (needs ? '\n# + DEPENDENCIES geometry_msgs, and &lt;depend&gt;geometry_msgs&lt;/depend&gt;' : '') + '</pre>' +
        '<div class="mb-file">🐍 Using it in Python</div><pre>' + esc(py) + '</pre>' +
        '<div class="mb-file">💻 Check it after building</div><pre>ros2 interface show my_robot_interfaces/' + ext + '/' + esc(name) + '</pre>' +
        (errs.length ? '<div class="mb-err">⚠️ ' + errs.map(esc).join('<br>⚠️ ') + '</div>' : '<div class="mb-ok">✅ Valid names: this will build.</div>');
    }
    render();
  };

  /* ================================================== L6: launch builder */
  W.launchbuilder = function (root) {
    var body = shell(root, 'Launch-file builder');
    var PRESETS = {
      'number_app': [
        { pkg: 'my_py_pkg', exe: 'number_publisher', name: 'my_number_publisher', remaps: 'number:=my_number', params: 'number_to_publish=4, publish_frequency=5.0' },
        { pkg: 'my_py_pkg', exe: 'number_counter', name: 'my_number_counter', remaps: 'number:=my_number, number_count:=my_number_count', params: '' }],
      'radio (5 stations)': ['Giskard', 'BB8', 'Daneel', 'Jander', 'C3PO'].map(function (n) {
        return { pkg: 'my_py_pkg', exe: 'robot_news_station', name: 'robot_news_station_' + n.toLowerCase(), remaps: '', params: 'robot_name=' + n };
      }).concat([{ pkg: 'my_py_pkg', exe: 'smartphone', name: '', remaps: '', params: '' }]),
      'catch them all': [
        { pkg: 'turtlesim', exe: 'turtlesim_node', name: '', remaps: '', params: '' },
        { pkg: 'turtlesim_catch_them_all', exe: 'turtle_spawner', name: '', remaps: '', params: 'spawn_frequency=1.5, turtle_name_prefix=my_turtle' },
        { pkg: 'turtlesim_catch_them_all', exe: 'turtle_controller', name: '', remaps: '', params: 'catch_closest_turtle_first=true' }]
    };
    var nodes = JSON.parse(JSON.stringify(PRESETS.number_app));
    var sel = h('select', { class: 'wsel' }, Object.keys(PRESETS).map(function (k) { return h('option', { value: k, text: k }); }));
    sel.addEventListener('change', function () { nodes = JSON.parse(JSON.stringify(PRESETS[sel.value])); render(); });
    var ed = h('div', { class: 'lb-ed' }), out = h('div', { class: 'mb-out' });
    body.appendChild(row([h('span', { class: 'wlbl', text: 'Preset:' }), sel, btn('+ Node', '', function () { nodes.push({ pkg: 'my_py_pkg', exe: 'smartphone', name: '', remaps: '', params: '' }); render(); })]));
    body.appendChild(ed); body.appendChild(out);
    function val(v) {
      v = v.trim();
      if (/^-?\d+$/.test(v)) return v;
      if (/^-?\d*\.\d+$/.test(v)) return v;
      if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true' ? 'True' : 'False';
      if (/^\[.*\]$/.test(v)) return v;
      return '"' + v.replace(/"/g, '') + '"';
    }
    function pairs(s, sep) { return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return x.split(sep); }).filter(function (p) { return p.length === 2 && p[0].trim() && p[1].trim(); }); }
    function render() {
      ed.innerHTML = '';
      ed.appendChild(h('div', { class: 'lb-row lb-head' }, ['package', 'executable', 'name (optional)', 'remaps  a:=b, …', 'parameters  k=v, …', ''].map(function (t) { return h('span', { text: t }); })));
      nodes.forEach(function (n, i) {
        var r = h('div', { class: 'lb-row' });
        ['pkg', 'exe', 'name', 'remaps', 'params'].forEach(function (k) {
          var inp = h('input', { class: 'wtxt', value: n[k], spellcheck: 'false' });
          inp.addEventListener('input', function () { n[k] = inp.value; gen(); });
          r.appendChild(inp);
        });
        r.appendChild(btn('✕', 'mini', function () { nodes.splice(i, 1); render(); }));
        ed.appendChild(r);
      });
      gen();
    }
    function gen() {
      var L = ['from launch import LaunchDescription', 'from launch_ros.actions import Node', '', '', 'def generate_launch_description():', '    ld = LaunchDescription()', ''];
      var cmds = [], deps = {};
      nodes.forEach(function (n, i) {
        var v = 'node_' + (i + 1);
        L.push('    ' + v + ' = Node(');
        L.push('        package="' + n.pkg.trim() + '",');
        L.push('        executable="' + n.exe.trim() + '",');
        if (n.name.trim()) L.push('        name="' + n.name.trim() + '",');
        var rm = pairs(n.remaps, ':=');
        if (rm.length) L.push('        remappings=[' + rm.map(function (p) { return '("' + p[0].trim() + '", "' + p[1].trim() + '")'; }).join(', ') + '],');
        var pr = pairs(n.params, '=');
        if (pr.length) L.push('        parameters=[{' + pr.map(function (p) { return '"' + p[0].trim() + '": ' + val(p[1]); }).join(', ') + '}],');
        L.push('    )'); L.push('    ld.add_action(' + v + ')'); L.push('');
        var args = [];
        if (n.name.trim()) args.push('-r __node:=' + n.name.trim());
        rm.forEach(function (p) { args.push('-r ' + p[0].trim() + ':=' + p[1].trim()); });
        pr.forEach(function (p) { args.push('-p ' + p[0].trim() + ':=' + p[1].trim()); });
        cmds.push('ros2 run ' + n.pkg.trim() + ' ' + n.exe.trim() + (args.length ? ' --ros-args ' + args.join(' ') : ''));
        deps[n.pkg.trim()] = 1;
      });
      L.push('    return ld');
      out.innerHTML = '<div class="mb-file">📄 my_robot_bringup/launch/my_app.launch.py</div><pre>' + esc(L.join('\n')) + '</pre>' +
        '<div class="mb-file">💻 …replaces these ' + cmds.length + ' terminals</div><pre>' + esc(cmds.join('\n')) + '</pre>' +
        '<div class="mb-file">📄 my_robot_bringup/package.xml</div><pre>' + esc(Object.keys(deps).map(function (d) { return '<exec_depend>' + d + '</exec_depend>'; }).join('\n')) + '</pre>';
    }
    render();
  };

  /* ================================================== L7: go-to-goal */
  W.gotogoal = function (root) {
    var body = shell(root, 'Go-to-goal controller & Catch Them All');
    var S = 40, N = 11, WD = S * N, cv = mkCanvas(WD, WD), ctx = cv.ctx;
    var kl = 2, ka = 6, closest = true, wrapOn = true, auto = false, paused = false, freq = 1;
    var tur, targets, trail, caught, spawnAcc, count, cmd = { v: 0, w: 0, d: 0, g: 0, diff: 0 };
    function reset() { tur = { x: 5.5, y: 5.5, th: 0 }; targets = []; trail = []; caught = 0; spawnAcc = 0; count = 1; }
    reset();
    function spawn(x, y) { count++; targets.push({ x: x != null ? x : 0.5 + Math.random() * 10, y: y != null ? y : 0.5 + Math.random() * 10, th: Math.random() * 6.28, name: 'turtle' + count }); }
    var rd = readouts([['d', 'distance'], ['g', 'goal_theta'], ['e', 'diff (wrapped)'], ['v', 'linear.x'], ['w', 'angular.z'], ['c', 'caught']]);
    var grid = h('div', { class: 'sim-split' }, [cv.c, h('div', { class: 'sim-side' }, [rd.el,
      slider('Kp linear', 0.2, 5, 0.1, kl, function (v) { kl = v; }).el,
      slider('Kp angular', 0.5, 20, 0.5, ka, function (v) { ka = v; }).el,
      check('closest turtle first (M5)', closest, function (v) { closest = v; }),
      check('wrap angle to [−π, π]', wrapOn, function (v) { wrapOn = v; }),
      check('auto-spawn (turtle_spawner)', auto, function (v) { auto = v; }),
      slider('spawn_frequency', 0.5, 3, 0.5, freq, function (v) { freq = v; }, function (v) { return v + ' Hz'; }).el
    ])]);
    body.appendChild(grid);
    body.appendChild(row([btn('🐢 Spawn a turtle', 'primary', function () { spawn(); }), btn('⏯ Pause', 'ghost', function () { paused = !paused; }), btn('↺ Reset', 'ghost', reset)]));
    body.appendChild(h('p', { class: 'sim-hint', html: '<strong>Click inside the world</strong> to place a target. Try: very small gains (slow), very large gains (shaky), and switch off the angle wrap to see the turtle take the long way round.' }));
    cv.c.addEventListener('click', function (e) { var p = pos(cv.c, e); spawn(p.x / S, (WD - p.y) / S); });
    function pick() {
      if (!targets.length) return null;
      if (!closest) return targets[0];
      var best = null, bd = 1e9;
      targets.forEach(function (t) { var d = Math.hypot(t.x - tur.x, t.y - tur.y); if (d < bd) { bd = d; best = t; } });
      return best;
    }
    function step(dt) {
      if (auto) { spawnAcc += dt * freq; while (spawnAcc >= 1) { spawnAcc -= 1; if (targets.length < 12) spawn(); } }
      var t = pick(), v = 0, w = 0;
      if (t) {
        var dx = t.x - tur.x, dy = t.y - tur.y, d = Math.sqrt(dx * dx + dy * dy);
        var g = Math.atan2(dy, dx), diff = g - tur.th;
        if (wrapOn) { if (diff > Math.PI) diff -= 2 * Math.PI; else if (diff < -Math.PI) diff += 2 * Math.PI; }
        if (d > 0.5) { v = kl * d; w = ka * diff; }
        else { targets.splice(targets.indexOf(t), 1); caught++; }
        cmd = { v: v, w: w, d: d, g: g, diff: diff };
      } else cmd = { v: 0, w: 0, d: 0, g: 0, diff: 0 };
      tur.x = clamp(tur.x + v * Math.cos(tur.th) * dt, 0, 11);
      tur.y = clamp(tur.y + v * Math.sin(tur.th) * dt, 0, 11);
      tur.th = wrap(tur.th + w * dt);
    }
    function drawTurtle(x, y, th, col, r) {
      ctx.save(); ctx.translate(x * S, WD - y * S); ctx.rotate(-th);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 1.1, 0, r * 0.4, 0, 7); ctx.fill();
      ctx.restore();
    }
    addLoop(root, function (dt) {
      if (!paused) { for (var i = 0; i < 5; i++) step(dt / 5); trail.push([tur.x, tur.y]); if (trail.length > 400) trail.shift(); }
      var c = C();
      ctx.fillStyle = '#4556ff'; ctx.fillRect(0, 0, WD, WD);
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
      for (var k = 1; k < N; k++) { ctx.beginPath(); ctx.moveTo(k * S, 0); ctx.lineTo(k * S, WD); ctx.moveTo(0, k * S); ctx.lineTo(WD, k * S); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath();
      trail.forEach(function (p, i) { if (i) ctx.lineTo(p[0] * S, WD - p[1] * S); else ctx.moveTo(p[0] * S, WD - p[1] * S); }); ctx.stroke();
      targets.forEach(function (t) { drawTurtle(t.x, t.y, t.th, '#ffd166', 9); label(ctx, t.name, t.x * S, WD - t.y * S - 16, '#fff', 10); });
      var t = pick();
      if (t) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(tur.x * S, WD - tur.y * S); ctx.lineTo(t.x * S, WD - t.y * S); ctx.stroke(); ctx.setLineDash([]); }
      drawTurtle(tur.x, tur.y, tur.th, '#3ee8a0', 13);
      label(ctx, 'turtle1', tur.x * S, WD - tur.y * S + 22, '#fff', 11, 'center', true);
      rd.set('d', f2(cmd.d)); rd.set('g', f2(cmd.g) + ' rad'); rd.set('e', f2(cmd.diff) + ' rad');
      rd.set('v', f2(cmd.v)); rd.set('w', f2(cmd.w)); rd.set('c', String(caught));
    });
  };

  /* ================================================== L8: twist */
  W.twist = function (root) {
    var body = shell(root, 'Twist → robot path, and open-loop drift');
    var WD = 420, cv = mkCanvas(WD, WD), ctx = cv.ctx, SC = 120;
    var v = 0.2, w = 0.5, T = 5, mode = 'arc', noise = 0.15, runs = [];
    var rd = readouts([['r', 'turning radius v/ω'], ['p', 'final pose (x, y)'], ['y', 'final yaw'], ['e', 'square: end error']]);
    body.appendChild(h('div', { class: 'sim-split' }, [cv.c, h('div', { class: 'sim-side' }, [
      h('div', { class: 'mb-title', text: 'Mode 1: one Twist for T seconds' }),
      slider('linear.x', -0.3, 0.5, 0.05, v, function (x) { v = x; mode = 'arc'; draw(); }, function (x) { return x.toFixed(2) + ' m/s'; }).el,
      slider('angular.z', -1.5, 1.5, 0.05, w, function (x) { w = x; mode = 'arc'; draw(); }, function (x) { return x.toFixed(2) + ' rad/s'; }).el,
      slider('duration T', 1, 12, 0.5, T, function (x) { T = x; mode = 'arc'; draw(); }, function (x) { return x + ' s'; }).el,
      h('div', { class: 'mb-title', text: 'Mode 2: drive_square (open loop)' }),
      slider('wheel slip / timing noise', 0, 0.4, 0.02, noise, function (x) { noise = x; }, function (x) { return Math.round(x * 100) + ' %'; }).el,
      row([btn('▶ Run open-loop square', 'primary', function () { mode = 'square'; runs.push(simSquare(false)); if (runs.length > 5) runs.shift(); draw(); }),
        btn('▶ Closed loop (go_to_goal)', '', function () { mode = 'square'; runs.push(simSquare(true)); if (runs.length > 5) runs.shift(); draw(); }),
        btn('Clear', 'ghost', function () { runs = []; draw(); })])
    ])]));
    body.appendChild(h('p', { class: 'sim-hint', html: 'Robot starts at the centre facing <strong>up</strong> (+x forward, +y left). Run the open-loop square several times: each run ends in a different place. The closed-loop version measures its pose, so it corrects the error.' }));
    function scr(x, y) { return [WD / 2 - y * SC, WD / 2 - x * SC]; }
    function arcPath() {
      var pts = [[0, 0]], x = 0, y = 0, th = 0, dt = 0.02;
      for (var t = 0; t < T; t += dt) { x += v * Math.cos(th) * dt; y += v * Math.sin(th) * dt; th += w * dt; pts.push([x, y]); }
      return { pts: pts, x: x, y: y, th: th };
    }
    function simSquare(closed) {
      var x = 0, y = 0, th = 0, pts = [[0, 0]], dt = 0.02, side = 0.5, sp = 0.2, ts = 0.5;
      var corners = [[0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0]];
      for (var k = 0; k < 4; k++) {
        if (closed) {
          var g = corners[k], guard = 0;
          while (Math.hypot(g[0] - x, g[1] - y) > 0.02 && guard++ < 3000) {
            var dd = wrap(Math.atan2(g[1] - y, g[0] - x) - th), vv = Math.abs(dd) < 0.4 ? Math.min(0.3, 0.5 * Math.hypot(g[0] - x, g[1] - y)) : 0;
            var ww = clamp(1.5 * dd, -1, 1), f = 1 + noise * gauss() * 0.5;
            x += vv * f * Math.cos(th) * dt; y += vv * f * Math.sin(th) * dt; th += ww * (1 + noise * gauss() * 0.5) * dt; pts.push([x, y]);
          }
        } else {
          var fv = 1 + noise * gauss(), fw = 1 + noise * gauss();
          for (var t = 0; t < side / sp; t += dt) { x += sp * fv * Math.cos(th) * dt; y += sp * fv * Math.sin(th) * dt; th += noise * 0.05 * gauss() * dt; pts.push([x, y]); }
          for (var t2 = 0; t2 < (Math.PI / 2) / ts; t2 += dt) { th += ts * fw * dt; pts.push([x, y]); }
        }
      }
      return { pts: pts, err: Math.hypot(x, y), closed: closed };
    }
    function drawPath(pts, col, width, dash) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); pts.forEach(function (p, i) { var s = scr(p[0], p[1]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.stroke(); ctx.restore();
    }
    function draw() {
      var c = C();
      ctx.clearRect(0, 0, WD, WD); ctx.fillStyle = c.bg2; ctx.fillRect(0, 0, WD, WD);
      ctx.strokeStyle = c.border; ctx.lineWidth = 1;
      for (var m = -1.5; m <= 1.5; m += 0.5) { var a = scr(m, -1.75), b = scr(m, 1.75); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); a = scr(-1.75, m); b = scr(1.75, m); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      label(ctx, 'grid = 0.5 m', 50, 14, c.muted, 11);
      var o = scr(0, 0);
      arrowLine(ctx, o[0], o[1], o[0], o[1] - 40, c.red); arrowLine(ctx, o[0], o[1], o[0] - 40, o[1], c.green);
      label(ctx, 'x', o[0] + 8, o[1] - 42, c.red, 11); label(ctx, 'y', o[0] - 46, o[1] - 8, c.green, 11);
      if (mode === 'arc') {
        var r = arcPath();
        drawPath(r.pts, c.accent, 3);
        var e = scr(r.x, r.y); ctx.beginPath(); ctx.arc(e[0], e[1], 7, 0, 7); ctx.fillStyle = c.accent; ctx.fill();
        rd.set('r', Math.abs(w) < 1e-3 ? '∞ (straight)' : (v / w).toFixed(2) + ' m');
        rd.set('p', '(' + f2(r.x) + ', ' + f2(r.y) + ') m'); rd.set('y', deg(wrap(r.th)).toFixed(0) + '°'); rd.set('e', '–');
      } else {
        drawPath([[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0]], c.muted, 2, [6, 5]);
        runs.forEach(function (rn, i) { drawPath(rn.pts, rn.closed ? c.green : [c.red, c.gold, c.purple, c.accent, c.red][i % 5], 2.5); });
        var lastR = runs[runs.length - 1];
        rd.set('e', lastR ? (lastR.err * 100).toFixed(1) + ' cm' + (lastR.closed ? ' (closed)' : ' (open)') : '–');
        rd.set('r', '–'); rd.set('p', '–'); rd.set('y', '–');
      }
    }
    themeCbs.push(draw); draw();
  };

  W.quat = function (root) {
    var body = shell(root, 'Quaternion ↔ yaw');
    var cv = mkCanvas(180, 180), ctx = cv.ctx, yaw = 90;
    var rd = readouts([['q', 'quaternion (x, y, z, w)'], ['f', 'yaw from formula']]);
    var zi = h('input', { class: 'wnum', type: 'number', step: '0.001', value: '0.707' }), wi = h('input', { class: 'wnum', type: 'number', step: '0.001', value: '0.707' });
    var outZW = h('b', { text: '' });
    body.appendChild(h('div', { class: 'sim-split' }, [cv.c, h('div', { class: 'sim-side' }, [
      slider('yaw', -180, 180, 5, yaw, function (v) { yaw = v; draw(); }, function (v) { return v + '°'; }).el, rd.el,
      h('div', { class: 'mb-title', text: 'Your turn: type z and w' }),
      row([h('label', { class: 'wslider' }, [h('span', { text: 'z' }), zi]), h('label', { class: 'wslider' }, [h('span', { text: 'w' }), wi]), outZW])
    ])]));
    function calc() { var z = parseFloat(zi.value) || 0, w = parseFloat(wi.value) || 0; outZW.textContent = '→ yaw = ' + deg(Math.atan2(2 * w * z, 1 - 2 * z * z)).toFixed(1) + '°'; }
    zi.addEventListener('input', calc); wi.addEventListener('input', calc); calc();
    function draw() {
      var c = C(), r = yaw * Math.PI / 180;
      ctx.clearRect(0, 0, 180, 180); ctx.fillStyle = c.bg2; rr(ctx, 0, 0, 180, 180, 14); ctx.fill();
      ctx.beginPath(); ctx.arc(90, 90, 70, 0, 7); ctx.strokeStyle = c.border; ctx.stroke();
      label(ctx, '+x (0°)', 90, 12, c.muted, 10); label(ctx, '+y (90°)', 30, 90, c.muted, 10);
      ctx.save(); ctx.translate(90, 90); ctx.rotate(-r - Math.PI / 2 + Math.PI);
      ctx.restore();
      var hx = 90 - 60 * Math.sin(r), hy = 90 - 60 * Math.cos(r);
      arrowLine(ctx, 90, 90, hx, hy, c.accent);
      var z = Math.sin(r / 2), w = Math.cos(r / 2);
      rd.set('q', '(0, 0, ' + z.toFixed(3) + ', ' + w.toFixed(3) + ')');
      rd.set('f', deg(Math.atan2(2 * w * z, 1 - 2 * z * z)).toFixed(1) + '°');
    }
    themeCbs.push(draw); draw();
  };

  /* ================================================== L9: tf2d */
  W.tf2d = function (root) {
    var body = shell(root, 'Follow a LiDAR point through the TF chain');
    var WD = 460, HT = 360, cv = mkCanvas(WD, HT), ctx = cv.ctx, SC = 130;
    var s = { x: 0.6, y: 0.3, yaw: 30, r: 0.8, a: 20 };
    var rd = readouts([['l', 'in laser_link'], ['b', 'in base_link'], ['o', 'in odom']]);
    function sl(k, lbl, mn, mx, st, fmt) { return slider(lbl, mn, mx, st, s[k], function (v) { s[k] = v; draw(); }, fmt).el; }
    body.appendChild(h('div', { class: 'sim-split' }, [cv.c, h('div', { class: 'sim-side' }, [
      h('div', { class: 'mb-title', text: 'Robot pose (odom → base_link)' }),
      sl('x', 'x', -1, 1.2, 0.05, function (v) { return v.toFixed(2) + ' m'; }), sl('y', 'y', -0.9, 0.9, 0.05, function (v) { return v.toFixed(2) + ' m'; }), sl('yaw', 'yaw', -180, 180, 5, function (v) { return v + '°'; }),
      h('div', { class: 'mb-title', text: 'One LiDAR reading (in laser_link)' }),
      sl('r', 'range', 0.15, 1.2, 0.05, function (v) { return v.toFixed(2) + ' m'; }), sl('a', 'angle', -115, 115, 5, function (v) { return v + '°'; }),
      rd.el
    ])]));
    body.appendChild(h('p', { class: 'sim-hint', html: 'The LIMO\'s <code>laser_link</code> sits 0.103 m in front of <code>base_link</code>. TF does exactly these two steps for you: <strong>laser_link → base_link</strong> (fixed, from the URDF) and <strong>base_link → odom</strong> (moving, from odometry).' }));
    function S(x, y) { return [140 + x * SC, HT / 2 - y * SC]; }
    function axes(x, y, th, len, name, c) {
      var o = S(x, y);
      arrowLine(ctx, o[0], o[1], o[0] + len * Math.cos(th), o[1] - len * Math.sin(th), c.red);
      arrowLine(ctx, o[0], o[1], o[0] - len * Math.sin(th), o[1] - len * Math.cos(th), c.green);
      label(ctx, name, o[0] - 4, o[1] + 14, c.text, 10, 'left', true);
    }
    function draw() {
      var c = C(), th = s.yaw * Math.PI / 180, a = s.a * Math.PI / 180;
      var pl = [s.r * Math.cos(a), s.r * Math.sin(a)];
      var pb = [pl[0] + 0.103, pl[1]];
      var po = [s.x + pb[0] * Math.cos(th) - pb[1] * Math.sin(th), s.y + pb[0] * Math.sin(th) + pb[1] * Math.cos(th)];
      var lo = [s.x + 0.103 * Math.cos(th), s.y + 0.103 * Math.sin(th)];
      ctx.clearRect(0, 0, WD, HT); ctx.fillStyle = c.bg2; ctx.fillRect(0, 0, WD, HT);
      ctx.strokeStyle = c.border; ctx.lineWidth = 1;
      for (var gx = -1; gx <= 2.4; gx += 0.5) { var p1 = S(gx, -1.5), p2 = S(gx, 1.5); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
      for (var gy = -1.5; gy <= 1.5; gy += 0.5) { var p3 = S(-1.2, gy), p4 = S(2.6, gy); ctx.beginPath(); ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke(); }
      axes(0, 0, 0, 40, 'odom', c);
      var b = S(s.x, s.y);
      ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(-th);
      rr(ctx, -0.16 * SC, -0.11 * SC, 0.32 * SC, 0.22 * SC, 6); ctx.fillStyle = 'rgba(61,75,245,.18)'; ctx.fill(); ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      axes(s.x, s.y, th, 30, 'base_link', c);
      var L = S(lo[0], lo[1]), P = S(po[0], po[1]);
      ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(P[0], P[1]); ctx.strokeStyle = c.gold; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(L[0], L[1], 5, 0, 7); ctx.fillStyle = c.gold; ctx.fill();
      label(ctx, 'laser_link', L[0] + 6, L[1] - 12, c.gold, 10, 'left', true);
      ctx.beginPath(); ctx.arc(P[0], P[1], 7, 0, 7); ctx.fillStyle = c.red; ctx.fill();
      label(ctx, 'obstacle', P[0] + 10, P[1], c.red, 11, 'left', true);
      rd.set('l', '(' + f2(pl[0]) + ', ' + f2(pl[1]) + ')');
      rd.set('b', '(' + f2(pb[0]) + ', ' + f2(pb[1]) + ')');
      rd.set('o', '(' + f2(po[0]) + ', ' + f2(po[1]) + ')');
    }
    themeCbs.push(draw); draw();
  };

  /* ================================================== L10: scan */
  W.scan = function (root) {
    var body = shell(root, 'LaserScan explorer + obstacle-avoiding wanderer');
    var WD = 420, cv = mkCanvas(WD, WD), ctx = cv.ctx, SC = WD / 3;
    var bars = mkCanvas(420, 120), bctx = bars.ctx;
    var robot, obs, running = false, safety = 0.4, hover = -1, crash = false, ranges = [];
    var N = 360, AMIN = -2.0, INC = 4.0 / 359;
    function reset() { robot = { x: 1.5, y: 0.6, th: Math.PI / 2 }; crash = false; }
    reset();
    obs = [{ x: 1.5, y: 1.7, r: 0.18 }, { x: 0.7, y: 2.2, r: 0.15 }, { x: 2.3, y: 1.2, r: 0.15 }];
    var rd = readouts([['n', 'nearest'], ['f', 'front ±20° min'], ['l', 'left min'], ['r', 'right min'], ['d', 'wanderer decides'], ['h', 'hovered ray']]);
    body.appendChild(h('div', { class: 'sim-split' }, [h('div', {}, [cv.c, bars.c]), h('div', { class: 'sim-side' }, [rd.el,
      slider('safety_distance', 0.2, 0.8, 0.05, safety, function (v) { safety = v; }, function (v) { return v.toFixed(2) + ' m'; }).el,
      row([btn('▶ Run wanderer', 'primary', function () { running = !running; this.textContent = running ? '⏸ Pause' : '▶ Run wanderer'; }),
        btn('↺ Robot', 'ghost', reset), btn('Clear obstacles', 'ghost', function () { obs = []; })])
    ])]));
    body.appendChild(h('p', { class: 'sim-hint', html: '<strong>Click</strong> the arena to add an obstacle, <strong>drag</strong> to move it, <strong>double-click</strong> to delete it. Hover over the bar chart: each bar is one entry of <code>msg.ranges</code> (index 0 = right, ≈180 = ahead, 359 = left). Gold bars are the front sector.' }));
    var drag = null;
    cv.c.addEventListener('mousedown', function (e) {
      var p = pos(cv.c, e), wx = p.x / SC, wy = (WD - p.y) / SC;
      drag = null;
      obs.forEach(function (o) { if (Math.hypot(o.x - wx, o.y - wy) < o.r + 0.05) drag = o; });
      if (!drag && Math.hypot(robot.x - wx, robot.y - wy) > 0.3) { drag = { x: wx, y: wy, r: 0.15 }; obs.push(drag); }
    });
    cv.c.addEventListener('mousemove', function (e) { if (!drag) return; var p = pos(cv.c, e); drag.x = clamp(p.x / SC, 0.1, 2.9); drag.y = clamp((WD - p.y) / SC, 0.1, 2.9); });
    window.addEventListener('mouseup', function () { drag = null; });
    cv.c.addEventListener('dblclick', function (e) { var p = pos(cv.c, e), wx = p.x / SC, wy = (WD - p.y) / SC; obs = obs.filter(function (o) { return Math.hypot(o.x - wx, o.y - wy) > o.r + 0.05; }); });
    bars.c.addEventListener('mousemove', function (e) { var p = pos(bars.c, e); hover = clamp(Math.floor(p.x / (420 / N)), 0, N - 1); });
    bars.c.addEventListener('mouseleave', function () { hover = -1; });
    function cast(ox, oy, a) {
      var dx = Math.cos(a), dy = Math.sin(a), best = 8;
      if (dx > 1e-9) best = Math.min(best, (3 - ox) / dx); if (dx < -1e-9) best = Math.min(best, -ox / dx);
      if (dy > 1e-9) best = Math.min(best, (3 - oy) / dy); if (dy < -1e-9) best = Math.min(best, -oy / dy);
      obs.forEach(function (o) {
        var fx = ox - o.x, fy = oy - o.y, b = fx * dx + fy * dy, cc = fx * fx + fy * fy - o.r * o.r, disc = b * b - cc;
        if (disc >= 0) { var t = -b - Math.sqrt(disc); if (t > 0) best = Math.min(best, t); }
      });
      return best;
    }
    function smin(a0, a1) { var m = Infinity; for (var i = 0; i < N; i++) { var a = AMIN + i * INC; if (a >= a0 && a <= a1 && ranges[i] >= 0.12) m = Math.min(m, ranges[i]); } return m; }
    addLoop(root, function (dt) {
      var lx = robot.x + 0.103 * Math.cos(robot.th), ly = robot.y + 0.103 * Math.sin(robot.th);
      for (var i = 0; i < N; i++) ranges[i] = cast(lx, ly, robot.th + AMIN + i * INC);
      var front = smin(-0.35, 0.35), left = smin(0.35, 1.5), right = smin(-1.5, -0.35);
      var dec = front > safety ? 'GO: linear.x = 0.15' : (left > right ? 'TURN LEFT: angular.z = +0.6' : 'TURN RIGHT: angular.z = −0.6');
      if (running && !crash) {
        var v = front > safety ? 0.15 : 0, w = front > safety ? 0 : (left > right ? 0.6 : -0.6);
        robot.th = wrap(robot.th + w * dt * 2); robot.x += v * Math.cos(robot.th) * dt * 2; robot.y += v * Math.sin(robot.th) * dt * 2;
        obs.forEach(function (o) { if (Math.hypot(o.x - robot.x, o.y - robot.y) < o.r + 0.13) crash = true; });
        if (robot.x < 0.13 || robot.x > 2.87 || robot.y < 0.13 || robot.y > 2.87) crash = true;
      }
      var c = C();
      ctx.clearRect(0, 0, WD, WD); ctx.fillStyle = c.bg2; ctx.fillRect(0, 0, WD, WD);
      ctx.strokeStyle = c.text; ctx.lineWidth = 4; ctx.strokeRect(2, 2, WD - 4, WD - 4);
      for (var k = 0; k < N; k += 3) {
        var a = robot.th + AMIN + k * INC, px = lx + ranges[k] * Math.cos(a), py = ly + ranges[k] * Math.sin(a);
        var inFront = Math.abs(AMIN + k * INC) <= 0.35;
        ctx.strokeStyle = (hover >= 0 && k === hover - hover % 3) ? c.accent : inFront ? 'rgba(200,134,44,.35)' : 'rgba(214,74,60,.12)';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx * SC, WD - ly * SC); ctx.lineTo(px * SC, WD - py * SC); ctx.stroke();
        ctx.fillStyle = c.red; ctx.fillRect(px * SC - 1.5, WD - py * SC - 1.5, 3, 3);
      }
      obs.forEach(function (o) { ctx.beginPath(); ctx.arc(o.x * SC, WD - o.y * SC, o.r * SC, 0, 7); ctx.fillStyle = c.muted; ctx.fill(); });
      ctx.save(); ctx.translate(robot.x * SC, WD - robot.y * SC); ctx.rotate(-robot.th);
      rr(ctx, -0.16 * SC, -0.11 * SC, 0.32 * SC, 0.22 * SC, 6); ctx.fillStyle = crash ? c.red : c.accent; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.103 * SC, 0, 5, 0, 7); ctx.fill(); ctx.restore();
      if (crash) label(ctx, '💥 Collision! Press ↺ Robot', WD / 2, 20, c.red, 13, 'center', true);
      bctx.clearRect(0, 0, 420, 120); bctx.fillStyle = c.bg2; bctx.fillRect(0, 0, 420, 120);
      var bw = 420 / N;
      for (var j = 0; j < N; j++) {
        var hh = Math.min(1, ranges[j] / 3) * 100, fr = Math.abs(AMIN + j * INC) <= 0.35;
        bctx.fillStyle = j === hover ? c.accent : fr ? c.gold : c.red;
        bctx.fillRect(j * bw, 110 - hh, Math.max(1, bw), hh);
      }
      bctx.strokeStyle = c.green; bctx.setLineDash([4, 3]); var sy = 110 - safety / 3 * 100; bctx.beginPath(); bctx.moveTo(0, sy); bctx.lineTo(420, sy); bctx.stroke(); bctx.setLineDash([]);
      label(bctx, 'index 0 (right)', 40, 8, c.muted, 10); label(bctx, '≈180 (ahead)', 210, 8, c.muted, 10); label(bctx, '359 (left)', 385, 8, c.muted, 10);
      var ni = 0; for (var q = 1; q < N; q++) if (ranges[q] < ranges[ni]) ni = q;
      rd.set('n', f2(ranges[ni]) + ' m at ' + deg(AMIN + ni * INC).toFixed(0) + '°');
      rd.set('f', f2(front) + ' m'); rd.set('l', f2(left) + ' m'); rd.set('r', f2(right) + ' m'); rd.set('d', dec);
      rd.set('h', hover < 0 ? 'hover the bars' : 'ranges[' + hover + '] = ' + f2(ranges[hover]) + ' m @ ' + deg(AMIN + hover * INC).toFixed(0) + '°');
    });
  };

  /* ================================================== L11: hsv */
  W.hsv = function (root) {
    var body = shell(root, 'HSV colour mask + blob tracker (what color_tracker.py does)');
    var IW = 320, IH = 200;
    var img = mkCanvas(IW, IH), mask = mkCanvas(IW, IH), ictx = img.ctx, mctx = mask.ctx;
    var off = document.createElement('canvas'); off.width = IW; off.height = IH; var octx = off.getContext('2d');
    var p = { hlo: 0, hhi: 10, wrapRed: true, smin: 120, vmin: 70, light: 1, objx: 110 };
    var rd = readouts([['x', 'error x (−1 … +1)'], ['a', 'blob area (px)'], ['w', 'follower angular.z'], ['k', 'clicked pixel']]);
    var sls = {};
    function sl(k, lbl, mn, mx, st) { var s = slider(lbl, mn, mx, st, p[k], function (v) { p[k] = v; run(); }); sls[k] = s; return s.el; }
    function preset(lo, hi, wr) { return function () { p.hlo = lo; p.hhi = hi; p.wrapRed = wr; sls.hlo.set(lo); sls.hhi.set(hi); wrapBox.querySelector('input').checked = wr; run(); }; }
    var wrapBox = check('also keep H 170–180 (red wraps around)', p.wrapRed, function (v) { p.wrapRed = v; run(); });
    body.appendChild(h('div', { class: 'hsv-imgs' }, [h('div', {}, [img.c, h('div', { class: 'cap', text: 'camera image (click a pixel)' })]), h('div', {}, [mask.c, h('div', { class: 'cap', text: 'mask = cv2.inRange(hsv, low, high)' })])]));
    body.appendChild(h('div', { class: 'sim-split2' }, [h('div', {}, [
      row([h('span', { class: 'wlbl', text: 'Presets:' }), btn('🔴 Red', 'chipbtn', preset(0, 10, true)), btn('🟢 Green', 'chipbtn', preset(40, 80, false)), btn('🔵 Blue', 'chipbtn', preset(100, 130, false)), btn('🟡 Yellow', 'chipbtn', preset(20, 35, false))]),
      sl('hlo', 'H low', 0, 180, 1), sl('hhi', 'H high', 0, 180, 1), wrapBox, sl('smin', 'S min', 0, 255, 5), sl('vmin', 'V min', 0, 255, 5),
      slider('room lighting', 0.4, 1.4, 0.05, p.light, function (v) { p.light = v; scene(); run(); }, function (v) { return Math.round(v * 100) + ' %'; }).el,
      slider('red box position', 30, 290, 5, p.objx, function (v) { p.objx = v; scene(); run(); }, function (v) { return v + ' px'; }).el
    ]), rd.el]));
    function scene() {
      var g = octx.createLinearGradient(0, 0, 0, IH); g.addColorStop(0, '#b9bcc4'); g.addColorStop(0.6, '#9a9ca3'); g.addColorStop(1, '#6f7076');
      octx.fillStyle = g; octx.fillRect(0, 0, IW, IH);
      octx.fillStyle = '#7d6a55'; octx.fillRect(0, 150, IW, 50);
      octx.fillStyle = '#2fae4a'; octx.beginPath(); octx.arc(250, 90, 26, 0, 7); octx.fill();
      octx.fillStyle = '#2f5fd0'; octx.fillRect(170, 110, 40, 45);
      octx.fillStyle = '#e8c41e'; octx.beginPath(); octx.arc(45, 60, 18, 0, 7); octx.fill();
      octx.fillStyle = '#d42a2a'; octx.fillRect(p.objx - 22, 105, 44, 44);
      octx.fillStyle = '#b01e22'; octx.fillRect(p.objx - 22, 105, 44, 10);
      octx.fillStyle = 'rgba(0,0,0,.28)'; octx.fillRect(0, 0, 90, IH);
      var d = octx.getImageData(0, 0, IW, IH), a = d.data;
      for (var i = 0; i < a.length; i += 4) { var n = (Math.random() - 0.5) * 14; for (var k = 0; k < 3; k++) a[i + k] = clamp(a[i + k] * p.light + n, 0, 255); }
      octx.putImageData(d, 0, 0);
    }
    function hsvOf(r, g, b) {
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn, hh = 0;
      if (dl) { if (mx === r) hh = 60 * (((g - b) / dl) % 6); else if (mx === g) hh = 60 * ((b - r) / dl + 2); else hh = 60 * ((r - g) / dl + 4); }
      if (hh < 0) hh += 360;
      return [Math.round(hh / 2), mx ? Math.round(dl / mx * 255) : 0, mx];
    }
    var lastData = null;
    function run() {
      var d = octx.getImageData(0, 0, IW, IH), a = d.data; lastData = a;
      var m = new Uint8Array(IW * IH), md = mctx.createImageData(IW, IH);
      for (var i = 0, j = 0; i < a.length; i += 4, j++) {
        var hv = hsvOf(a[i], a[i + 1], a[i + 2]);
        var inH = (hv[0] >= p.hlo && hv[0] <= p.hhi) || (p.wrapRed && hv[0] >= 170);
        var on = inH && hv[1] >= p.smin && hv[2] >= p.vmin;
        m[j] = on ? 1 : 0; var v = on ? 255 : 0;
        md.data[i] = md.data[i + 1] = md.data[i + 2] = v; md.data[i + 3] = 255;
      }
      mctx.putImageData(md, 0, 0);
      var seen = new Uint8Array(IW * IH), best = null;
      for (var s = 0; s < m.length; s++) {
        if (!m[s] || seen[s]) continue;
        var st = [s], cnt = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; seen[s] = 1;
        while (st.length) {
          var q = st.pop(), qx = q % IW, qy = (q / IW) | 0; cnt++;
          if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
          var nb = [q - 1, q + 1, q - IW, q + IW];
          for (var t = 0; t < 4; t++) { var nq = nb[t]; if (nq < 0 || nq >= m.length) continue; if ((t === 0 && qx === 0) || (t === 1 && qx === IW - 1)) continue; if (m[nq] && !seen[nq]) { seen[nq] = 1; st.push(nq); } }
        }
        if (!best || cnt > best.cnt) best = { cnt: cnt, x0: x0, x1: x1, y0: y0, y1: y1 };
      }
      ictx.drawImage(off, 0, 0);
      if (best && best.cnt > 50) {
        ictx.strokeStyle = '#00ff66'; ictx.lineWidth = 2; ictx.strokeRect(best.x0, best.y0, best.x1 - best.x0, best.y1 - best.y0);
        var cx = (best.x0 + best.x1) / 2, err = (cx - IW / 2) / (IW / 2);
        ictx.fillStyle = '#00ff66'; ictx.beginPath(); ictx.arc(cx, (best.y0 + best.y1) / 2, 4, 0, 7); ictx.fill();
        rd.set('x', (err >= 0 ? '+' : '') + err.toFixed(2) + (err > 0.1 ? ' (right)' : err < -0.1 ? ' (left)' : ' (centred)'));
        rd.set('a', String(best.cnt)); rd.set('w', (-1.0 * err).toFixed(2) + ' rad/s');
      } else { rd.set('x', 'not found'); rd.set('a', '0'); rd.set('w', '0.3 (search)'); }
      ictx.strokeStyle = 'rgba(255,255,255,.5)'; ictx.setLineDash([4, 4]); ictx.beginPath(); ictx.moveTo(IW / 2, 0); ictx.lineTo(IW / 2, IH); ictx.stroke(); ictx.setLineDash([]);
    }
    img.c.addEventListener('click', function (e) {
      if (!lastData) return;
      var q = pos(img.c, e), x = Math.floor(q.x), y = Math.floor(q.y), i = (y * IW + x) * 4;
      var hv = hsvOf(lastData[i], lastData[i + 1], lastData[i + 2]);
      rd.set('k', 'BGR(' + lastData[i + 2] + ',' + lastData[i + 1] + ',' + lastData[i] + ') → HSV(' + hv.join(',') + ')');
    });
    scene(); run();
  };

  /* ================================================== L12: particles */
  W.particles = function (root) {
    var body = shell(root, 'Particle filter: how AMCL finds the robot');
    var WD = 640, HT = 240, cv = mkCanvas(WD, HT), ctx = cv.ctx, L = 10, SX = (WD - 40) / L;
    var DOORS = [1.5, 4.0, 7.0], NP = 300, recovery = true;
    var robot, parts, dir, lastZ = null, auto = false, acc = 0;
    function reset() { robot = 2.0; dir = 1; parts = []; for (var i = 0; i < NP; i++) parts.push(Math.random() * L); lastZ = null; }
    reset();
    var logEl = h('div', { class: 'sim-log' });
    function log(s) { logEl.insertBefore(h('div', { text: s }), logEl.firstChild); while (logEl.childNodes.length > 5) logEl.removeChild(logEl.lastChild); }
    var rd = readouts([['t', 'true position'], ['e', 'estimate (mean)'], ['s', 'spread (std)'], ['z', 'last sensor reading']]);
    function atDoor(x) { return DOORS.some(function (d) { return Math.abs(x - d) < 0.4; }); }
    function move() {
      var stepv = 0.5 * dir;
      if (robot + stepv > L - 0.2 || robot + stepv < 0.2) { dir = -dir; stepv = -stepv; }
      robot += stepv;
      parts = parts.map(function (x) { return clamp(x + stepv + gauss() * 0.12, 0, L); });
    }
    function sense() {
      var z = atDoor(robot); if (Math.random() < 0.1) z = !z; lastZ = z;
      var wts = parts.map(function (x) { return atDoor(x) === z ? 0.8 : 0.2; });
      var sum = wts.reduce(function (a, b) { return a + b; }, 0), out = [], step = sum / NP, u = Math.random() * step, cw = wts[0], i = 0;
      for (var k = 0; k < NP; k++) { var target = u + k * step; while (target > cw && i < NP - 1) { i++; cw += wts[i]; } out.push(parts[i] + gauss() * 0.03); }
      if (recovery) for (var r = 0; r < NP * 0.03; r++) out[Math.floor(Math.random() * NP)] = Math.random() * L;
      parts = out;
      log('sensor: ' + (z ? '🚪 DOOR' : '🧱 wall') + ' → particles re-weighted and resampled');
    }
    body.appendChild(cv.c);
    body.appendChild(row([
      btn('➡ Move 0.5 m', '', function () { move(); log('odometry: moved ' + (0.5 * dir > 0 ? '+' : '−') + '0.5 m (particles move too, with noise)'); }),
      btn('👁 Sense', '', sense),
      btn('▶ Auto', 'primary', function () { auto = !auto; this.textContent = auto ? '⏸ Stop' : '▶ Auto'; }),
      btn('🧲 Kidnap robot', 'ghost', function () { robot = Math.random() * L; log('🧲 robot teleported (the "kidnapped robot" problem)'); }),
      btn('↺ Reset (global localisation)', 'ghost', reset),
      check('recovery: add a few random particles', recovery, function (v) { recovery = v; })
    ]));
    body.appendChild(h('div', { class: 'sim-split2' }, [logEl, rd.el]));
    body.appendChild(h('p', { class: 'sim-hint', html: 'The robot only knows "I see a door" or "I see a wall". Each particle is one guess of where the robot is. <strong>Move → Sense → Resample</strong>, repeated, makes the guesses pile up at the true position. Kidnap the robot and watch recovery (untick it to see AMCL get lost).' }));
    addLoop(root, function (dt) {
      if (auto) { acc += dt; if (acc > 0.6) { acc = 0; move(); sense(); } }
      var c = C();
      ctx.clearRect(0, 0, WD, HT); ctx.fillStyle = c.bg2; rr(ctx, 0, 0, WD, HT, 14); ctx.fill();
      var y0 = 70;
      ctx.fillStyle = c.muted; ctx.fillRect(20, y0 - 30, WD - 40, 12);
      DOORS.forEach(function (d) { ctx.fillStyle = c.gold; ctx.fillRect(20 + (d - 0.4) * SX, y0 - 34, 0.8 * SX, 20); label(ctx, '🚪', 20 + d * SX, y0 - 24, c.text, 12); });
      var bins = new Array(50).fill(0); parts.forEach(function (x) { bins[Math.min(49, Math.floor(x / L * 50))]++; });
      var mx = Math.max.apply(null, bins);
      bins.forEach(function (b, i) { var hh = b / mx * 90; ctx.fillStyle = c.accent; ctx.globalAlpha = 0.75; ctx.fillRect(20 + i * (WD - 40) / 50 + 1, 205 - hh, (WD - 40) / 50 - 2, hh); ctx.globalAlpha = 1; });
      parts.forEach(function (x, i) { ctx.fillStyle = c.accent; ctx.fillRect(20 + x * SX - 1, y0 + 6 + (i % 12) * 3, 2, 2); });
      ctx.beginPath(); ctx.arc(20 + robot * SX, y0 - 45, 9, 0, 7); ctx.fillStyle = c.green; ctx.fill();
      label(ctx, 'robot', 20 + robot * SX, y0 - 60, c.green, 11, 'center', true);
      var mean = parts.reduce(function (a, b) { return a + b; }, 0) / NP;
      var sd = Math.sqrt(parts.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / NP);
      ctx.strokeStyle = c.red; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(20 + mean * SX, 110); ctx.lineTo(20 + mean * SX, 210); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, 'particle density →', 70, 118, c.muted, 10);
      rd.set('t', robot.toFixed(2) + ' m'); rd.set('e', mean.toFixed(2) + ' m'); rd.set('s', sd.toFixed(2) + (sd < 0.4 ? ' m ✅ localised' : ' m (unsure)'));
      rd.set('z', lastZ === null ? '–' : lastZ ? 'door' : 'wall');
    });
  };

  /* ================================================== L13: planner */
  W.planner = function (root) {
    var body = shell(root, 'Costmap + path planner (what Nav2\'s planner does)');
    var COLS = 40, ROWS = 25, CS = 14, WD = COLS * CS, HT = ROWS * CS, cv = mkCanvas(WD, HT), ctx = cv.ctx;
    var grid = new Uint8Array(COLS * ROWS), start = [3, 12], goal = [36, 12], robotR = 2, infl = 6, mode = 'wall', painting = false, res = null;
    function I(x, y) { return y * COLS + x; }
    function preset() {
      grid.fill(0);
      for (var x = 0; x < COLS; x++) { grid[I(x, 0)] = grid[I(x, ROWS - 1)] = 1; }
      for (var y = 0; y < ROWS; y++) { grid[I(0, y)] = grid[I(COLS - 1, y)] = 1; }
      for (y = 0; y < ROWS; y++) if (y < 9 || y > 16) grid[I(14, y)] = 1;     // wide door
      for (y = 0; y < ROWS; y++) if (y < 3 || y > 8) grid[I(26, y)] = 1;      // narrower door
      for (x = 18; x < 23; x++) for (y = 14; y < 19; y++) grid[I(x, y)] = 1;
    }
    preset();
    var rd = readouts([['s', 'status'], ['l', 'path length'], ['x', 'cells expanded']]);
    var mb = h('span', { class: 'wlbl' });
    function setMode(m) { mode = m; mb.textContent = 'tool: ' + m; }
    setMode('wall');
    body.appendChild(cv.c);
    body.appendChild(row([btn('🧱 Wall', '', function () { setMode('wall'); }), btn('🧽 Erase', '', function () { setMode('erase'); }), btn('🟢 Start', '', function () { setMode('start'); }), btn('🔴 Goal', '', function () { setMode('goal'); }), btn('↺ Default map', 'ghost', function () { preset(); plan(); }), mb]));
    body.appendChild(h('div', { class: 'sim-split2' }, [h('div', {}, [
      slider('robot_radius', 0, 4, 1, robotR, function (v) { robotR = v; plan(); }, function (v) { return (v * 0.05).toFixed(2) + ' m'; }).el,
      slider('inflation_radius', 0, 12, 1, infl, function (v) { infl = v; plan(); }, function (v) { return (v * 0.05).toFixed(2) + ' m'; }).el
    ]), rd.el]));
    body.appendChild(h('p', { class: 'sim-hint', html: 'One cell = 5 cm (like <code>resolution: 0.05</code>). <strong>Pink</strong> = lethal (the robot\'s centre would hit something), <strong>blue → cyan</strong> = inflation (allowed but expensive). Make the robot bigger or the inflation wider and watch the path move away from walls, or fail to fit through the door.' }));
    function cellAt(e) { var p = pos(cv.c, e); return [clamp(Math.floor(p.x / CS), 0, COLS - 1), clamp(Math.floor(p.y / CS), 0, ROWS - 1)]; }
    function apply(e) {
      var c = cellAt(e);
      if (mode === 'wall') grid[I(c[0], c[1])] = 1; else if (mode === 'erase') grid[I(c[0], c[1])] = 0;
      else if (mode === 'start') start = c; else if (mode === 'goal') goal = c;
      plan();
    }
    cv.c.addEventListener('mousedown', function (e) { painting = true; apply(e); });
    cv.c.addEventListener('mousemove', function (e) { if (painting && (mode === 'wall' || mode === 'erase')) apply(e); });
    window.addEventListener('mouseup', function () { painting = false; });
    function plan() {
      var dist = new Float32Array(COLS * ROWS).fill(1e9), q = [];
      for (var i = 0; i < grid.length; i++) if (grid[i]) { dist[i] = 0; q.push(i); }
      var dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
      for (var pass = 0; pass < 2; pass++) {
        for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
          var xx = pass ? COLS - 1 - x : x, yy = pass ? ROWS - 1 - y : y, id = I(xx, yy);
          dirs.forEach(function (d) { var nx = xx + d[0], ny = yy + d[1]; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return; var v = dist[I(nx, ny)] + d[2]; if (v < dist[id]) dist[id] = v; });
        }
      }
      var cost = new Float32Array(COLS * ROWS);
      for (i = 0; i < grid.length; i++) {
        if (grid[i]) cost[i] = 255; else if (dist[i] <= robotR) cost[i] = 254;
        else if (dist[i] <= infl) cost[i] = 250 * Math.exp(-0.6 * (dist[i] - robotR)); else cost[i] = 0;
      }
      var s = I(start[0], start[1]), g = I(goal[0], goal[1]);
      res = { cost: cost, path: null, exp: 0, fail: '' };
      if (cost[s] >= 254) { res.fail = 'start is inside an obstacle or lethal zone'; show(); return; }
      if (cost[g] >= 254) { res.fail = 'goal is inside an obstacle or lethal zone'; show(); return; }
      var gS = new Float32Array(COLS * ROWS).fill(1e9), from = new Int32Array(COLS * ROWS).fill(-1), closed = new Uint8Array(COLS * ROWS), open = [s];
      gS[s] = 0;
      function hf(id) { var x = id % COLS, y = (id / COLS) | 0; return Math.hypot(x - goal[0], y - goal[1]); }
      while (open.length) {
        var bi = 0; for (var k = 1; k < open.length; k++) if (gS[open[k]] + hf(open[k]) < gS[open[bi]] + hf(open[bi])) bi = k;
        var cur = open.splice(bi, 1)[0]; if (closed[cur]) continue; closed[cur] = 1; res.exp++;
        if (cur === g) break;
        var cx = cur % COLS, cy = (cur / COLS) | 0;
        for (var dd = 0; dd < 8; dd++) {
          var nx = cx + dirs[dd][0], ny = cy + dirs[dd][1]; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          var n = I(nx, ny); if (closed[n] || cost[n] >= 254) continue;
          var ng = gS[cur] + dirs[dd][2] * (1 + cost[n] / 60);
          if (ng < gS[n]) { gS[n] = ng; from[n] = cur; open.push(n); }
        }
      }
      if (from[g] === -1 && g !== s) res.fail = 'no path: the robot does not fit through any gap';
      else { var p = [g], c2 = g; while (c2 !== s) { c2 = from[c2]; p.push(c2); } res.path = p.reverse(); }
      show();
    }
    function show() {
      var c = C();
      ctx.clearRect(0, 0, WD, HT);
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        var v = res.cost[I(x, y)], col;
        if (v === 255) col = '#111'; else if (v >= 254) col = '#e879c5'; else if (v > 1) { var t = v / 250; col = 'rgb(' + Math.round(40 + 40 * (1 - t)) + ',' + Math.round(120 + 110 * (1 - t)) + ',' + Math.round(200 + 55 * (1 - t)) + ')'; } else col = '#fafafa';
        ctx.fillStyle = col; ctx.fillRect(x * CS, y * CS, CS - 0.5, CS - 0.5);
      }
      if (res.path) {
        ctx.strokeStyle = '#11a44a'; ctx.lineWidth = 4; ctx.beginPath();
        res.path.forEach(function (id, i) { var px = (id % COLS + 0.5) * CS, py = (((id / COLS) | 0) + 0.5) * CS; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke();
      }
      [[start, '#11a44a', 'S'], [goal, '#d64a3c', 'G']].forEach(function (m) {
        ctx.beginPath(); ctx.arc((m[0][0] + 0.5) * CS, (m[0][1] + 0.5) * CS, CS * 0.7, 0, 7); ctx.fillStyle = m[1]; ctx.fill();
        label(ctx, m[2], (m[0][0] + 0.5) * CS, (m[0][1] + 0.5) * CS, '#fff', 11, 'center', true);
      });
      if (res.fail) { rd.set('s', '❌ ' + res.fail); rd.set('l', '–'); }
      else { var len = 0; for (var i = 1; i < res.path.length; i++) { var a = res.path[i - 1], b = res.path[i]; len += Math.hypot(a % COLS - b % COLS, ((a / COLS) | 0) - ((b / COLS) | 0)); } rd.set('s', '✅ path found'); rd.set('l', (len * 0.05).toFixed(2) + ' m'); }
      rd.set('x', String(res.exp));
      void c;
    }
    themeCbs.push(show);
    plan();
  };

  /* ---------------------------------------------------------- boot */
  function boot() {
    $$('[data-widget]').forEach(function (r) {
      var f = W[r.getAttribute('data-widget')];
      if (f && !r._wInit) { r._wInit = true; try { f(r); } catch (e) { console.error('widget', r.getAttribute('data-widget'), e); } }
    });
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
