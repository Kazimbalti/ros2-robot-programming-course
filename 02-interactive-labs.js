/* ============================================================
   02-interactive-labs.js — interactive widgets for Lecture 2
   (ROS 2 Architecture & Your First LIMO Simulation)

   Every widget looks for its own root element and quietly does
   nothing if that element is missing, so sections can be moved
   or deleted freely.

     #graph-lab    live ROS graph: stop nodes, ROS 1 vs ROS 2
     #ts-lab       virtual turtlesim + ros2 CLI simulator
     #ps-lab       publish/subscribe playground (+ QoS depth)
     .pp-lab       Topic / Service / Action pattern player
     #cls-lab      "Topic, Service, Action or Parameter?" game
     #mix-lab      turtlesim background parameter mixer
     #msg-lab      custom .msg builder
     #tw-lab       Twist -> LIMO trajectory planner
     #scan-lab     LaserScan explorer
     #dds-lab      DDS discovery classroom + RMW stack
     #fix-lab      troubleshooting clinic
     #quiz-lab     self-check quiz
     .worksheet    lab worksheet (progress saved per browser)
     .checkpoint   learning checkpoint (click to tick)
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------- helpers */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem('l02:' + k));
      localStorage.setItem('l02:' + k, JSON.stringify(v));
    } catch (e) { return null; }
    return null;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hex32() { var s = ''; for (var i = 0; i < 32; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return s; }
  function pyf(n) {
    if (n === Infinity) return 'inf'; if (n === -Infinity) return '-inf'; if (isNaN(n)) return 'nan';
    var s = String(n); if (/^-?\d+$/.test(s)) s += '.0'; return s;
  }
  function f32(n) { return pyf(Math.fround(n)); }
  function normAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /* A crisp (HiDPI) canvas with a fixed logical size */
  function hidpi(c, w, h) {
    var d = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(w * d); c.height = Math.round(h * d);
    var ctx = c.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    return ctx;
  }
  function canvasPoint(c, ev, w, h) {
    var r = c.getBoundingClientRect();
    return [(ev.clientX - r.left) * w / r.width, (ev.clientY - r.top) * h / r.height];
  }

  /* one animation loop for every widget; off-screen widgets sleep */
  var tickers = [];
  function ticker(root, fn, always) {
    var t = { fn: fn, vis: true, always: !!always };
    tickers.push(t);
    if (!always && 'IntersectionObserver' in window) {
      t.vis = false;
      new IntersectionObserver(function (es) { t.vis = es[es.length - 1].isIntersecting; }, { rootMargin: '120px' }).observe(root);
    }
  }
  var lastT = 0;
  function frame(now) {
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
    for (var i = 0; i < tickers.length; i++) {
      var t = tickers[i];
      if (t.vis || t.always) { try { t.fn(dt, now); } catch (e) { if (window.console) console.error(e); } }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* redraw hooks for canvases when the light/dark theme flips */
  var themeHooks = [];
  new MutationObserver(function () { themeHooks.forEach(function (f) { f(); }); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* shell-like split that respects quotes */
  function shsplit(line) {
    var out = [], cur = '', q = null, has = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === q) q = null; else cur += c; }
      else if (c === '"' || c === "'") { q = c; has = true; }
      else if (/\s/.test(c)) { if (cur || has) { out.push(cur); cur = ''; has = false; } }
      else cur += c;
    }
    if (q) throw new Error('quote');
    if (cur || has) out.push(cur);
    return out;
  }

  /* tiny YAML flow-style parser: {linear: {x: 2.0}, name: 'turtle2'} */
  function parseYaml(src) {
    var s = String(src || '').trim();
    if (!s) return {};
    if (s[0] !== '{') s = '{' + s + '}';
    var i = 0;
    function ws() { while (i < s.length && /\s/.test(s[i])) i++; }
    function scalar(isKey) {
      ws();
      var c = s[i];
      if (c === "'" || c === '"') {
        var q = c; i++; var st = i;
        while (i < s.length && s[i] !== q) i++;
        if (i >= s.length) throw new Error('unterminated string');
        var r = s.slice(st, i); i++; return r;
      }
      var st2 = i;
      while (i < s.length && (isKey ? s[i] !== ':' : !/[,}\]]/.test(s[i]))) i++;
      var raw = s.slice(st2, i).trim();
      if (isKey) return raw;
      if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(raw)) return Number(raw);
      if (/^(true|True)$/.test(raw)) return true;
      if (/^(false|False)$/.test(raw)) return false;
      return raw;
    }
    function val() {
      ws();
      var c = s[i];
      if (c === '{') {
        i++; var o = {}; ws();
        if (s[i] === '}') { i++; return o; }
        for (;;) {
          var k = scalar(true); ws();
          if (s[i] !== ':') throw new Error('expected ":" after ' + k);
          i++; o[k] = val(); ws();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === '}') { i++; return o; }
          throw new Error('expected "," or "}"');
        }
      }
      if (c === '[') {
        i++; var a = []; ws();
        if (s[i] === ']') { i++; return a; }
        for (;;) {
          a.push(val()); ws();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === ']') { i++; return a; }
          throw new Error('expected "," or "]"');
        }
      }
      return scalar(false);
    }
    var v = val(); ws();
    if (i < s.length) throw new Error('unexpected text: ' + s.slice(i));
    return v;
  }

  /* ---------------------------------------------------------- message registry */
  var MSG = {
    'geometry_msgs/msg/Twist': { linear: 'geometry_msgs/msg/Vector3', angular: 'geometry_msgs/msg/Vector3' },
    'geometry_msgs/msg/Vector3': { x: 'float64', y: 'float64', z: 'float64' },
    'turtlesim/msg/Pose': { x: 'float32', y: 'float32', theta: 'float32', linear_velocity: 'float32', angular_velocity: 'float32' },
    'turtlesim/msg/Color': { r: 'uint8', g: 'uint8', b: 'uint8' },
    'std_msgs/msg/String': { data: 'string' },
    'std_msgs/msg/Int32': { data: 'int32' },
    'std_msgs/msg/Float64': { data: 'float64' },
    'std_msgs/msg/Bool': { data: 'bool' },
    'std_srvs/srv/Empty_Request': {}, 'std_srvs/srv/Empty_Response': {},
    'turtlesim/srv/Spawn_Request': { x: 'float32', y: 'float32', theta: 'float32', name: 'string' },
    'turtlesim/srv/Spawn_Response': { name: 'string' },
    'turtlesim/srv/Kill_Request': { name: 'string' }, 'turtlesim/srv/Kill_Response': {},
    'turtlesim/srv/SetPen_Request': { r: 'uint8', g: 'uint8', b: 'uint8', width: 'uint8', off: 'uint8' },
    'turtlesim/srv/SetPen_Response': {},
    'turtlesim/srv/TeleportAbsolute_Request': { x: 'float32', y: 'float32', theta: 'float32' },
    'turtlesim/srv/TeleportAbsolute_Response': {},
    'turtlesim/srv/TeleportRelative_Request': { linear: 'float32', angular: 'float32' },
    'turtlesim/srv/TeleportRelative_Response': {},
    'turtlesim/action/RotateAbsolute_Goal': { theta: 'float32' }
  };
  var SRV_TYPES = ['std_srvs/srv/Empty', 'turtlesim/srv/Spawn', 'turtlesim/srv/Kill', 'turtlesim/srv/SetPen',
    'turtlesim/srv/TeleportAbsolute', 'turtlesim/srv/TeleportRelative'];
  function shortT(t) { return t.split('/').pop(); }
  function normType(t, kind) {
    var p = String(t).split('/');
    return p.length === 2 ? p[0] + '/' + kind + '/' + p[1] : t;
  }
  function fill(type, val) {
    var d = MSG[type], o = {};
    if (val === undefined || val === null) val = {};
    if (typeof val !== 'object' || Array.isArray(val)) throw new Error("Failed to populate field: value for '" + shortT(type) + "' must be a dictionary");
    Object.keys(val).forEach(function (k) {
      if (!(k in d)) throw new Error("Failed to populate field: '" + shortT(type) + "' object has no attribute '" + k + "'");
    });
    Object.keys(d).forEach(function (k) {
      var ft = d[k], v = val[k];
      if (MSG[ft]) { o[k] = fill(ft, v); return; }
      if (v === undefined) { o[k] = ft === 'string' ? '' : (ft === 'bool' ? false : 0); return; }
      if (ft === 'string') { o[k] = String(v); return; }
      if (ft === 'bool') { o[k] = !!v; return; }
      if (typeof v !== 'number') throw new Error("Failed to populate field: The '" + k + "' field must be of type '" + (/^float/.test(ft) ? 'float' : 'int') + "'");
      if (/int/.test(ft)) {
        if (v % 1 !== 0) throw new Error("Failed to populate field: The '" + k + "' field must be of type 'int'");
        if (/^uint8/.test(ft) && (v < 0 || v > 255)) throw new Error("Failed to populate field: The '" + k + "' field must be an unsigned integer in [0, 255]");
      }
      o[k] = v;
    });
    return o;
  }
  function pyScal(ft, v) {
    if (ft === 'string') return "'" + v + "'";
    if (ft === 'float32') return f32(v);
    if (ft === 'float64') return pyf(v);
    if (ft === 'bool') return v ? 'True' : 'False';
    return String(v);
  }
  function pyRepr(type, obj) {
    var d = MSG[type];
    return type.replace(/\//g, '.') + '(' + Object.keys(d).map(function (k) {
      return k + '=' + (MSG[d[k]] ? pyRepr(d[k], obj[k]) : pyScal(d[k], obj[k]));
    }).join(', ') + ')';
  }
  function yamlOut(type, obj, ind) {
    ind = ind || '';
    var d = MSG[type], lines = [];
    Object.keys(d).forEach(function (k) {
      var ft = d[k];
      if (MSG[ft]) { lines.push(ind + k + ':'); lines.push(yamlOut(ft, obj[k], ind + '  ')); }
      else lines.push(ind + k + ': ' + (ft === 'string' ? "'" + obj[k] + "'" : ft === 'bool' ? (obj[k] ? 'true' : 'false') : pyScal(ft, obj[k])));
    });
    return lines.join('\n');
  }

  /* turtle sprite shared by turtlesim + the parameter mixer */
  function drawTurtle(ctx, px, py, theta, s, shell) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(-theta);
    ctx.fillStyle = '#3f8f3f';
    [[0.26, 0.3], [0.26, -0.3], [-0.26, 0.3], [-0.26, -0.3]].forEach(function (l) {
      ctx.beginPath(); ctx.ellipse(l[0] * s, l[1] * s, 0.13 * s, 0.08 * s, 0, 0, 6.2832); ctx.fill();
    });
    ctx.beginPath(); ctx.arc(0.46 * s, 0, 0.13 * s, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.34 * s, 0); ctx.lineTo(-0.5 * s, 0.05 * s); ctx.lineTo(-0.5 * s, -0.05 * s); ctx.fill();
    ctx.fillStyle = shell || '#7cc36a'; ctx.strokeStyle = '#2c602c'; ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.36 * s, 0.28 * s, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 0.16 * s, 0.12 * s, 0, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.36 * s, 0); ctx.lineTo(-0.16 * s, 0); ctx.moveTo(0.16 * s, 0); ctx.lineTo(0.36 * s, 0);
    ctx.moveTo(0, -0.28 * s); ctx.lineTo(0, -0.12 * s); ctx.moveTo(0, 0.12 * s); ctx.lineTo(0, 0.28 * s); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.52 * s, 0.05 * s, 0.025 * s, 0, 6.2832); ctx.arc(0.52 * s, -0.05 * s, 0.025 * s, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  /* =================================================================
     1. LIVE GRAPH EXPLORER  (#graph-lab)
     ================================================================= */
  function graphLab() {
    var root = $('#graph-lab'); if (!root) return;
    var svg = $('#gl-svg', root), info = $('#gl-info', root), logEl = $('#gl-log', root);
    var btnToggle = $('#gl-toggle', root), btnMaster = $('#gl-master', root);
    var BW = 172, BH = 54, mode = 'ros2', masterUp = true, sel = 'avoid';
    var N = {
      lidar: { name: '/lidar_driver', x: 24, y: 40, pubs: [['/scan', 'sensor_msgs/msg/LaserScan']], subs: [] },
      camera: { name: '/camera_driver', x: 24, y: 236, pubs: [['/camera/image_raw', 'sensor_msgs/msg/Image']], subs: [] },
      avoid: { name: '/obstacle_avoider', x: 296, y: 138, pubs: [['/cmd_vel', 'geometry_msgs/msg/Twist']], subs: [['/scan', 'sensor_msgs/msg/LaserScan'], ['/camera/image_raw', 'sensor_msgs/msg/Image']] },
      teleop: { name: '/teleop_keyboard', x: 296, y: 262, pubs: [['/cmd_vel', 'geometry_msgs/msg/Twist']], subs: [] },
      motor: { name: '/motor_driver', x: 566, y: 138, pubs: [['/odom', 'nav_msgs/msg/Odometry']], subs: [['/cmd_vel', 'geometry_msgs/msg/Twist']] }
    };
    var E = [
      { s: 'lidar', d: 'avoid', t: '/scan', rate: 6 },
      { s: 'camera', d: 'avoid', t: '/camera/image_raw', rate: 3 },
      { s: 'avoid', d: 'motor', t: '/cmd_vel', rate: 5 },
      { s: 'teleop', d: 'motor', t: '/cmd_vel', rate: 2 }
    ];
    var defs = S('defs', null, svg);
    var mk = S('marker', { id: 'gl-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
    S('path', { d: 'M0 0 L10 5 L0 10 z', class: 'gl-arrowhead' }, mk);
    var gReg = S('g', null, svg), gEdge = S('g', null, svg), gMaster = S('g', { class: 'gl-master' }, svg);
    var gDots = S('g', null, svg), gLbl = S('g', null, svg), gNodes = S('g', null, svg);

    S('rect', { x: 296, y: 8, width: BW, height: 40, rx: 10 }, gMaster);
    var mText = S('text', { x: 382, y: 33, 'text-anchor': 'middle', class: 'gl-t' }, gMaster); mText.textContent = 'roscore (master)';
    Object.keys(N).forEach(function (k) {
      var n = N[k];
      n.alive = true; n.reg = true; n.rx = 0; n.flash = 0;
      n.regLine = S('line', { x1: n.x + BW / 2, y1: n.y, x2: 382, y2: 48, class: 'gl-reg' }, gReg);
      var g = S('g', { class: 'gl-node', tabindex: '0', role: 'button', 'aria-label': 'Select node ' + n.name }, gNodes);
      n.rect = S('rect', { x: n.x, y: n.y, width: BW, height: BH, rx: 12 }, g);
      var t = S('text', { x: n.x + BW / 2, y: n.y + 23, 'text-anchor': 'middle', class: 'gl-t' }, g); t.textContent = n.name;
      n.sub = S('text', { x: n.x + BW / 2, y: n.y + 42, 'text-anchor': 'middle', class: 'gl-s' }, g);
      n.g = g;
      g.addEventListener('click', function () { sel = k; paint(); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sel = k; paint(); } });
    });
    E.forEach(function (e) {
      var s = N[e.s], d = N[e.d], sx = s.x + BW, sy = s.y + BH / 2, dx = d.x, dy = d.y + BH / 2;
      e.path = S('path', { d: 'M' + sx + ' ' + sy + ' C' + (sx + 70) + ' ' + sy + ',' + (dx - 70) + ' ' + dy + ',' + dx + ' ' + dy, class: 'gl-edge', 'marker-end': 'url(#gl-arrow)' }, gEdge);
      e.len = e.path.getTotalLength();
      var mid = e.path.getPointAtLength(e.len * 0.5);
      e.label = S('text', { x: mid.x, y: mid.y - 9, 'text-anchor': 'middle', class: 'gl-lbl' }, gLbl); e.label.textContent = e.t;
      e.dots = []; e.acc = Math.random(); e.pool = [];
    });

    function log(msg, cls) {
      var d = document.createElement('div'); d.className = cls || ''; d.textContent = msg;
      logEl.insertBefore(d, logEl.firstChild);
      while (logEl.childNodes.length > 40) logEl.removeChild(logEl.lastChild);
    }
    function edgeState(e) {
      var s = N[e.s], d = N[e.d];
      if (!s.alive) return 'off';
      if (!d.alive) return 'lost';
      if (mode === 'ros1' && (!s.reg || !d.reg)) return 'lost';
      return 'ok';
    }
    function ros1(t) { return t.replace('/msg/', '/'); }
    function paint() {
      Object.keys(N).forEach(function (k) {
        var n = N[k];
        n.g.setAttribute('class', 'gl-node' + (n.alive ? '' : ' dead') + (mode === 'ros1' && n.alive && !n.reg ? ' isolated' : '') + (k === sel ? ' sel' : ''));
        n.sub.textContent = !n.alive ? 'stopped' : (mode === 'ros1' && !n.reg ? 'not registered!' : (n.subs.length ? 'received: ' + n.rx : 'publishing'));
        n.regLine.style.display = mode === 'ros1' ? '' : 'none';
        n.regLine.setAttribute('class', 'gl-reg' + (n.alive && n.reg ? ' on' : ''));
      });
      gMaster.style.display = mode === 'ros1' ? '' : 'none';
      gMaster.setAttribute('class', 'gl-master' + (masterUp ? '' : ' down'));
      mText.textContent = masterUp ? 'roscore (master)' : 'roscore — DEAD';
      E.forEach(function (e) { e.path.setAttribute('class', 'gl-edge ' + edgeState(e)); });
      var n = N[sel];
      btnToggle.textContent = n.alive ? '⏹ Stop ' + n.name : '▶ Start ' + n.name;
      btnMaster.hidden = mode !== 'ros1';
      btnMaster.textContent = masterUp ? '💥 Kill roscore' : '▶ Restart roscore';
      var lines;
      if (mode === 'ros2') {
        lines = ['$ ros2 node info ' + n.name];
        if (!n.alive) lines.push("Unable to find node '" + n.name + "'");
        else {
          lines.push(n.name, '  Subscribers:');
          n.subs.forEach(function (p) { lines.push('    ' + p[0] + ': ' + p[1]); });
          lines.push('  Publishers:');
          n.pubs.forEach(function (p) { lines.push('    ' + p[0] + ': ' + p[1]); });
          lines.push('    /parameter_events: rcl_interfaces/msg/ParameterEvent', '    /rosout: rcl_interfaces/msg/Log');
        }
      } else {
        lines = ['$ rosnode info ' + n.name];
        if (!masterUp) lines.push('ERROR: Unable to communicate with master!');
        else if (!n.alive || !n.reg) lines.push('ERROR: Unknown node ' + n.name);
        else {
          lines.push('Node [' + n.name + ']', 'Publications:');
          n.pubs.forEach(function (p) { lines.push(' * ' + p[0] + ' [' + ros1(p[1]) + ']'); });
          lines.push('', 'Subscriptions:');
          if (!n.subs.length) lines.push(' None');
          n.subs.forEach(function (p) { lines.push(' * ' + p[0] + ' [' + ros1(p[1]) + ']'); });
        }
      }
      info.textContent = lines.join('\n');
    }
    btnToggle.addEventListener('click', function () {
      var n = N[sel];
      if (n.alive) {
        n.alive = false; n.reg = false;
        log('[' + n.name + '] shut down (Ctrl+C)', 'bad');
        var down = E.filter(function (e) { return e.d === sel; }).map(function (e) { return e.t; });
        if (down.length) log('Publishers of ' + down.join(', ') + ' keep publishing — nobody is listening now', 'warn');
      } else {
        n.alive = true;
        if (mode === 'ros2') { n.reg = true; log('[' + n.name + '] started — found its peers by DDS discovery ✓', 'ok'); }
        else if (masterUp) { n.reg = true; log('[' + n.name + '] started — registered with master at http://localhost:11311 ✓', 'ok'); }
        else { n.reg = false; log('[' + n.name + '] Unable to register with master node [http://localhost:11311]: master may not be running yet. Will keep trying.', 'bad'); }
      }
      paint();
    });
    btnMaster.addEventListener('click', function () {
      masterUp = !masterUp;
      if (!masterUp) log('roscore died. Existing connections keep working… but nothing new can join.', 'bad');
      else {
        Object.keys(N).forEach(function (k) { if (N[k].alive) N[k].reg = true; });
        log('roscore restarted — running nodes re-register ✓', 'ok');
      }
      paint();
    });
    $$('#gl-mode button', root).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#gl-mode button', root).forEach(function (x) { x.classList.toggle('on', x === b); });
        mode = b.getAttribute('data-m'); reset(true);
        log(mode === 'ros1' ? 'ROS 1 mode: every node registers with one central roscore.' : 'ROS 2 mode: no master — nodes discover each other directly via DDS.', 'info');
      });
    });
    function reset(quiet) {
      masterUp = true;
      Object.keys(N).forEach(function (k) { N[k].alive = true; N[k].reg = true; N[k].rx = 0; });
      E.forEach(function (e) { e.dots = []; });
      if (!quiet) { logEl.textContent = ''; log('Graph reset — all nodes running.', 'info'); }
      paint();
    }
    $('#gl-reset', root).addEventListener('click', function () { reset(false); });

    ticker(root, function (dt) {
      E.forEach(function (e) {
        var stt = edgeState(e);
        if (stt !== 'off') {
          e.acc += dt;
          if (e.acc > 1 / e.rate) { e.acc = 0; e.dots.push({ t: 0, st: stt }); }
        }
        for (var i = e.dots.length - 1; i >= 0; i--) {
          var d = e.dots[i]; d.t += dt * 0.75;
          if (d.t >= 1) {
            e.dots.splice(i, 1);
            if (d.st === 'ok' && N[e.d].alive) { N[e.d].rx++; N[e.d].flash = 0.25; }
          }
        }
        while (e.pool.length < e.dots.length) e.pool.push(S('circle', { r: 5 }, gDots));
        e.pool.forEach(function (c, j) {
          var d = e.dots[j];
          if (!d) { c.style.display = 'none'; return; }
          var p = e.path.getPointAtLength(d.t * e.len);
          c.style.display = '';
          c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
          c.setAttribute('class', 'gl-dot' + (d.st === 'lost' ? ' lost' : ''));
          c.style.opacity = d.st === 'lost' ? (d.t < 0.5 ? 1 : Math.max(0, 1 - (d.t - 0.5) * 3)) : 1;
        });
      });
      Object.keys(N).forEach(function (k) {
        var n = N[k];
        if (n.flash > 0) { n.flash -= dt; n.rect.style.strokeWidth = n.flash > 0 ? 4 : ''; }
        if (n.subs.length && n.alive) n.sub.textContent = mode === 'ros1' && !n.reg ? 'not registered!' : 'received: ' + n.rx;
      });
    });
    reset(true);
    log('Click a node, then stop it. Watch which dots still arrive.', 'info');
  }

  /* =================================================================
     2. VIRTUAL TURTLESIM + ros2 CLI  (#ts-lab)
     ================================================================= */
  var Lab = null;
  function turtleLab() {
    var root = $('#ts-lab'); if (!root) return;
    var cvs = $('#ts-canvas', root), ctx = cvs.getContext('2d');
    var pathC = document.createElement('canvas'); pathC.width = 500; pathC.height = 500;
    var pctx = pathC.getContext('2d', { willReadFrequently: true });
    var outEl = $('#ts-out', root), inp = $('#ts-in', root), procsEl = $('#ts-procs', root);
    var stopBtn = $('#ts-stop', root), overlay = $('#ts-overlay', root), padEl = $('#ts-pad', root);
    var stage = $('.ts-stage', root);
    var PX = 45, WM = 499 / 45, DT = 0.016;
    var TW = 'geometry_msgs/msg/Twist', POSE = 'turtlesim/msg/Pose', COL = 'turtlesim/msg/Color';
    var PE = 'rcl_interfaces/msg/ParameterEvent', LOGT = 'rcl_interfaces/msg/Log', RA = 'turtlesim/action/RotateAbsolute';
    var PSRV = [['describe_parameters', 'DescribeParameters'], ['get_parameter_types', 'GetParameterTypes'], ['get_parameters', 'GetParameters'],
      ['list_parameters', 'ListParameters'], ['set_parameters', 'SetParameters'], ['set_parameters_atomically', 'SetParametersAtomically']];
    var HUES = ['#7cc36a', '#e8b24c', '#6ab4e8', '#d68ad6', '#ea7b6a', '#a4e06a'];
    var st, hist = store('ts-hist') || [], hi = hist.length;

    function fresh() {
      return { running: false, bg: { r: 69, g: 86, b: 255 }, turtles: {}, spawnCount: 0, teleop: null, panes: [], fg: null,
        t: 0, acc: 0, pubTimes: {}, graph: false, graphAcc: 0, scale: { lin: 2.0, ang: 2.0 }, useSim: false, pid: 4200 };
    }
    st = fresh();

    /* ---------- output ---------- */
    function out(text, cls) {
      var d = document.createElement('div'); d.className = cls || 'vt-out'; d.textContent = text;
      outEl.appendChild(d);
      while (outEl.childNodes.length > 700) outEl.removeChild(outEl.firstChild);
      outEl.scrollTop = outEl.scrollHeight;
    }
    function hint(t) { out('💡 ' + t, 'vt-hint'); }
    function err(t) { out(t, 'vt-err'); }
    function rlog(node, msg, lvl) {
      lvl = lvl || 'INFO';
      out('[' + lvl + '] [' + (1727400000 + st.t).toFixed(9) + '] [' + node + ']: ' + msg, lvl === 'WARN' ? 'vt-warn' : lvl === 'ERROR' ? 'vt-err' : 'vt-log');
    }

    /* ---------- missions (auto-ticked) ---------- */
    var MISS = [['start', 'Start turtlesim'], ['nodes', 'List the nodes'], ['teleop', 'Drive with teleop'], ['echo', 'Echo /turtle1/pose'],
      ['hz', 'Measure a rate with hz'], ['once', 'Publish a Twist --once'], ['clear', 'Call /clear'], ['spawn', 'Spawn turtle2'],
      ['pen', 'Change a pen colour'], ['param', 'Set a background param'], ['action', 'Send a rotate goal'], ['graph', 'Open rqt_graph']];
    var done = store('ts-missions') || {};
    var missEl = $('#ts-missions', root);
    function renderMissions() {
      if (!missEl) return;
      var n = MISS.filter(function (m) { return done[m[0]]; }).length;
      missEl.innerHTML = '<div class="tm-head"><span>🎯 Lab missions</span><span class="tm-count">' + n + ' / ' + MISS.length + '</span></div>' +
        '<div class="tm-bar"><i style="width:' + (100 * n / MISS.length) + '%"></i></div><div class="tm-list">' +
        MISS.map(function (m) { return '<span class="tm' + (done[m[0]] ? ' ok' : '') + '">' + (done[m[0]] ? '✅' : '⬜') + ' ' + esc(m[1]) + '</span>'; }).join('') +
        '</div>' + (n === MISS.length ? '<div class="tm-win">🏆 All missions done — you are ready for LIMO in Gazebo!</div>' : '') +
        '<button class="linkbtn" id="ts-miss-reset">reset progress</button>';
      $('#ts-miss-reset', missEl).addEventListener('click', function () { done = {}; store('ts-missions', done); renderMissions(); });
    }
    function mission(k) { if (done[k]) return; done[k] = 1; store('ts-missions', done); renderMissions(); }
    renderMissions();

    /* ---------- drawing ---------- */
    function rgb(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }
    function clearPath() { pctx.fillStyle = rgb(st.bg); pctx.fillRect(0, 0, 500, 500); }
    function toPx(x, y) { return [x * PX, 500 - y * PX]; }
    function penLine(t, x0, y0, x1, y1) {
      if (t.pen.off) return;
      var a = toPx(x0, y0), b = toPx(x1, y1);
      pctx.strokeStyle = rgb(t.pen); pctx.lineWidth = t.pen.w; pctx.lineCap = 'round';
      pctx.beginPath(); pctx.moveTo(a[0], a[1]); pctx.lineTo(b[0], b[1]); pctx.stroke();
    }
    function render() {
      if (!st.running) {
        ctx.fillStyle = '#1b1e30'; ctx.fillRect(0, 0, 500, 500);
        overlay.hidden = false; return;
      }
      overlay.hidden = true;
      ctx.drawImage(pathC, 0, 0);
      Object.keys(st.turtles).forEach(function (n) {
        var t = st.turtles[n], p = toPx(t.x, t.y);
        drawTurtle(ctx, p[0], p[1], t.th, 44, t.hue);
      });
    }

    /* ---------- the ROS graph, derived from state ---------- */
    function graph() {
      var g = {};
      function node(n, hidden) { return g[n] || (g[n] = { pubs: {}, subs: {}, srvs: {}, acts: {}, actc: {}, hidden: !!hidden }); }
      function base(n) {
        var o = node(n); o.pubs['/parameter_events'] = PE; o.pubs['/rosout'] = LOGT;
        PSRV.forEach(function (p) { o.srvs[n + '/' + p[0]] = 'rcl_interfaces/srv/' + p[1]; });
        return o;
      }
      if (st.running) {
        var o = base('/turtlesim');
        o.subs['/parameter_events'] = PE;
        o.srvs['/clear'] = 'std_srvs/srv/Empty'; o.srvs['/reset'] = 'std_srvs/srv/Empty';
        o.srvs['/spawn'] = 'turtlesim/srv/Spawn'; o.srvs['/kill'] = 'turtlesim/srv/Kill';
        Object.keys(st.turtles).forEach(function (n) {
          o.subs['/' + n + '/cmd_vel'] = TW; o.pubs['/' + n + '/pose'] = POSE; o.pubs['/' + n + '/color_sensor'] = COL;
          o.srvs['/' + n + '/set_pen'] = 'turtlesim/srv/SetPen';
          o.srvs['/' + n + '/teleport_absolute'] = 'turtlesim/srv/TeleportAbsolute';
          o.srvs['/' + n + '/teleport_relative'] = 'turtlesim/srv/TeleportRelative';
          o.acts['/' + n + '/rotate_absolute'] = RA;
        });
      }
      if (st.teleop) {
        var t = base('/teleop_turtle');
        t.pubs['/turtle1/cmd_vel'] = TW; t.actc['/turtle1/rotate_absolute'] = RA;
      }
      st.panes.forEach(function (p) { if (p.topic) node('/_ros2cli_' + p.pid, true).pubs[p.topic] = p.type; });
      return g;
    }
    function topics(g) {
      var m = {};
      Object.keys(g).forEach(function (n) {
        ['pubs', 'subs'].forEach(function (k) { Object.keys(g[n][k]).forEach(function (t) { m[t] = g[n][k][t]; }); });
      });
      return m;
    }
    function collect(g, key) {
      var m = {};
      Object.keys(g).forEach(function (n) { Object.keys(g[n][key]).forEach(function (s) { m[s] = g[n][key][s]; }); });
      return m;
    }
    function countOn(g, key, t) { return Object.keys(g).filter(function (n) { return t in g[n][key]; }).length; }

    /* ---------- turtles & physics ---------- */
    function mkTurtle(name, x, y, th) {
      var i = st.spawnCount;
      st.spawnCount++;
      return { name: name, x: x, y: y, th: th || 0, lv: 0, av: 0, last: -99, pen: { r: 179, g: 184, b: 255, w: 3, off: false }, goal: null, hue: HUES[i % HUES.length], wallT: -9 };
    }
    function spawn(name, x, y, th) {
      st.turtles[name] = mkTurtle(name, x, y, th);
      rlog('turtlesim', 'Spawning turtle [' + name + '] at x=[' + x.toFixed(6) + '], y=[' + y.toFixed(6) + '], theta=[' + (th || 0).toFixed(6) + ']');
    }
    function record(topic) {
      var a = st.pubTimes[topic] || (st.pubTimes[topic] = []);
      a.push(st.t); if (a.length > 130) a.shift();
      if (st.fg && st.fg.kind === 'hz' && st.fg.topic === topic) st.fg.times.push(st.t);
    }
    function pub(topic, obj) {
      record(topic);
      if (st.fg && st.fg.onMsg && st.fg.topic === topic) st.fg.onMsg(obj);
    }
    function publishTwist(topic, msg) {
      pub(topic, msg);
      var m = /^\/([A-Za-z_]\w*)\/cmd_vel$/.exec(topic);
      if (m && st.running && st.turtles[m[1]]) {
        var t = st.turtles[m[1]]; t.lv = msg.linear.x; t.av = msg.angular.z; t.last = st.t;
      }
    }
    function finishGoal(t, status) {
      var g = t.goal; if (!g) return;
      t.goal = null; t.av = 0;
      if (g.onDone) g.onDone(status, normAng(g.start - t.th));
    }
    function startGoal(t, theta, h) {
      if (t.goal) {
        rlog('turtlesim', 'Rotation goal received before a previous goal finished. Aborting previous goal', 'WARN');
        finishGoal(t, 'ABORTED');
      }
      t.goal = { theta: theta, start: t.th, onFb: h.onFb, onDone: h.onDone };
      return t.goal;
    }
    function physics() {
      st.t += DT;
      st.panes.forEach(function (p) { if (p.tick) p.tick(DT); });
      if (st.fg && st.fg.tick) st.fg.tick(DT);
      if (!st.running) return;
      Object.keys(st.turtles).forEach(function (n) {
        var t = st.turtles[n];
        if (!t) return;
        if (t.goal) {
          var rem = normAng(t.goal.theta - t.th);
          if (Math.abs(rem) < 0.02) finishGoal(t, 'SUCCEEDED');
          else { t.av = rem < 0 ? -1 : 1; t.last = st.t; if (t.goal.onFb) t.goal.onFb(rem); }
        }
        if (st.t - t.last > 1.0) { t.lv = 0; t.av = 0; }
        var x0 = t.x, y0 = t.y;
        t.th = normAng(t.th + t.av * DT);
        t.x += Math.cos(t.th) * t.lv * DT; t.y += Math.sin(t.th) * t.lv * DT;
        var cx = clamp(t.x, 0, WM), cy = clamp(t.y, 0, WM);
        if (cx !== t.x || cy !== t.y) {
          if (st.t - t.wallT > 1) { rlog('turtlesim', 'Oh no! I hit the wall! (Clamping from [x=' + t.x.toFixed(6) + ', y=' + t.y.toFixed(6) + '])', 'WARN'); t.wallT = st.t; }
          t.x = cx; t.y = cy;
        }
        if (x0 !== t.x || y0 !== t.y) penLine(t, x0, y0, t.x, t.y);
        pub('/' + n + '/pose');
        pub('/' + n + '/color_sensor');
      });
    }
    function snapshot(topic) {
      var m = /^\/(\w+)\/(pose|color_sensor)$/.exec(topic);
      var t = m && st.turtles[m[1]]; if (!t) return null;
      if (m[2] === 'pose') return { x: t.x, y: t.y, theta: t.th, linear_velocity: t.lv, angular_velocity: t.av };
      var p = toPx(t.x, t.y), d = pctx.getImageData(clamp(Math.round(p[0]), 0, 499), clamp(Math.round(p[1]), 0, 499), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }

    /* ---------- panes (long-running processes) ---------- */
    function renderPanes() {
      procsEl.innerHTML = st.panes.length ? '<span class="procs-l">Running in other panes:</span>' : '<span class="procs-l">No other panes running.</span>';
      st.panes.forEach(function (p) {
        var c = document.createElement('span'); c.className = 'proc';
        c.innerHTML = '<i class="pdot"></i><span class="plbl"></span><button title="Ctrl+C this pane" aria-label="Stop ' + esc(p.label) + '">✕</button>';
        $('.plbl', c).textContent = p.label + (p.count ? ' #' + p.count : '');
        p.chip = $('.plbl', c);
        $('button', c).addEventListener('click', function () { p.kill(); });
        procsEl.appendChild(c);
      });
      padEl.hidden = !st.teleop;
      renderGraph();
    }
    function addPane(p) { st.panes.push(p); renderPanes(); }
    function removePane(p) { var i = st.panes.indexOf(p); if (i >= 0) st.panes.splice(i, 1); renderPanes(); }

    function setFg(p) {
      st.fg = p; stopBtn.hidden = !p;
      inp.placeholder = p ? (p.hint || 'running… press Ctrl+C to stop') : 'type a command — try: help';
      root.classList.toggle('busy', !!p);
    }
    function ctrlC() {
      if (st.fg) { out('^C'); var p = st.fg; setFg(null); if (p.stop) p.stop(); }
      else { out('$ ' + inp.value + '^C', 'vt-cmd'); inp.value = ''; }
    }

    /* ---------- turtlesim node ---------- */
    function startTurtlesim(args) {
      if (st.running) { hint('turtlesim is already running (see the pane chip). A second copy would start with the same node name — avoid that in real ROS 2 too!'); return; }
      var bg = { r: 69, g: 86, b: 255 };
      var ra = args.indexOf('--ros-args');
      if (ra >= 0) {
        for (var i = ra + 1; i < args.length; i++) {
          if ((args[i] === '-p' || args[i] === '--param') && args[i + 1]) {
            var kv = args[i + 1].split(':='), k = kv[0], v = Number(kv[1]);
            var ch = { background_r: 'r', background_g: 'g', background_b: 'b' }[k];
            if (ch && /^\d+$/.test(kv[1]) && v >= 0 && v <= 255) bg[ch] = v;
            else if (ch) { err("[ERROR] [turtlesim]: parameter '" + k + "' value " + kv[1] + ' is invalid (integer 0–255 expected)'); return; }
            i++;
          }
        }
      }
      st.running = true; st.bg = bg; st.turtles = {}; st.spawnCount = 0;
      clearPath();
      rlog('turtlesim', 'Starting turtlesim with node name /turtlesim');
      spawn('turtle1', WM / 2, WM / 2, 0);
      var pane = { label: '🐢 turtlesim_node', kill: stopTurtlesim };
      st.tsPane = pane; addPane(pane);
      hint('turtlesim now runs in its own pane (chip below the window). This terminal is free for the next command.');
      mission('start');
    }
    function stopTurtlesim() {
      if (!st.running) return;
      st.running = false; st.turtles = {};
      out('[INFO] [' + (1727400000 + st.t).toFixed(9) + '] [rclcpp]: signal_handler(signum=2)', 'vt-log');
      removePane(st.tsPane);
    }

    /* ---------- teleop ---------- */
    function startTeleop() {
      if (st.teleop) { hint('teleop is already running in its own pane — use the pad under the turtle window.'); return; }
      out('Reading from keyboard\n---------------------------\nUse arrow keys to move the turtle.\nUse G|B|V|C|D|E|R|T keys to rotate to absolute orientations. \'F\' to cancel a rotation.\n\'Q\' to quit.');
      var pane = { label: '🎮 turtle_teleop_key', kill: function () { cancelTeleopGoal(true); st.teleop = null; removePane(pane); } };
      st.teleop = pane; addPane(pane);
      hint('teleop runs in its own pane: click the turtle window and use the arrow keys, or use the on-screen pad.');
      setTimeout(function () { try { stage.focus({ preventScroll: true }); } catch (e) { stage.focus(); } }, 50);
    }
    var ROT = { g: 0, t: 0.7854, r: 1.5708, e: 2.3562, d: 3.1416, c: -2.3562, v: -1.5708, b: -0.7854 };
    function cancelTeleopGoal(quiet) {
      var t = st.turtles.turtle1;
      if (t && t.goal && t.goal.fromTeleop) { t.goal = null; t.av = 0; if (!quiet) rlog('teleop_turtle', 'Rotation goal canceled'); }
    }
    function teleopKey(k) {
      if (!st.teleop) return false;
      var lin = 0, ang = 0, key = k.length === 1 ? k.toLowerCase() : k;
      if (key === 'ArrowUp') lin = 1; else if (key === 'ArrowDown') lin = -1;
      else if (key === 'ArrowLeft') ang = 1; else if (key === 'ArrowRight') ang = -1;
      else if (key in ROT) {
        var t = st.turtles.turtle1;
        if (st.running && t) {
          var g = startGoal(t, ROT[key], { onDone: function (status) { rlog('teleop_turtle', status === 'SUCCEEDED' ? 'Rotation goal completed successfully' : 'Rotation goal ' + status.toLowerCase()); } });
          g.fromTeleop = true; mission('action');
        }
        return true;
      } else if (key === 'f') { cancelTeleopGoal(false); return true; }
      else if (key === 'q') { st.teleop.kill(); return true; }
      else return false;
      publishTwist('/turtle1/cmd_vel', { linear: { x: st.scale.lin * lin, y: 0, z: 0 }, angular: { x: 0, y: 0, z: st.scale.ang * ang } });
      if (st.running && st.turtles.turtle1) mission('teleop');
      return true;
    }
    stage.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (teleopKey(ev.key)) ev.preventDefault();
    });
    $$('[data-k]', padEl).forEach(function (b) {
      b.addEventListener('click', function () { teleopKey(b.getAttribute('data-k')); });
    });

    /* ---------- rqt_graph ---------- */
    var gWrap = $('#ts-graph', root), gSvg = $('#ts-graph-svg', root);
    function renderGraph() {
      if (!st.graph) { gWrap.hidden = true; return; }
      gWrap.hidden = false;
      var g = graph(), tm = topics(g), rows = [];
      Object.keys(tm).sort().forEach(function (t) {
        if (t === '/parameter_events' || t === '/rosout') return;
        var p = Object.keys(g).filter(function (n) { return t in g[n].pubs; });
        var s = Object.keys(g).filter(function (n) { return t in g[n].subs; });
        if (p.length && s.length) rows.push({ t: t, p: p, s: s });
      });
      gSvg.innerHTML = '';
      if (!rows.length) {
        gSvg.setAttribute('viewBox', '0 0 760 70');
        var tx = S('text', { x: 380, y: 40, 'text-anchor': 'middle', class: 'rq-empty' }, gSvg);
        tx.textContent = st.running ? 'Only /turtlesim is running — start teleop or a topic pub to see a connection.' : 'Nothing running yet — start turtlesim.';
        return;
      }
      var left = [], right = [];
      rows.forEach(function (r) {
        r.p.forEach(function (n) { if (left.indexOf(n) < 0) left.push(n); });
        r.s.forEach(function (n) { if (right.indexOf(n) < 0) right.push(n); });
      });
      var H = Math.max(left.length, right.length, rows.length) * 64 + 24;
      gSvg.setAttribute('viewBox', '0 0 760 ' + H);
      function y(i, n) { return H / 2 + (i - (n - 1) / 2) * 64; }
      var pos = {};
      rows.forEach(function (r, i) { pos['t:' + r.t] = [380, y(i, rows.length)]; });
      left.forEach(function (n, i) { pos['l:' + n] = [110, y(i, left.length)]; });
      right.forEach(function (n, i) { pos['r:' + n] = [650, y(i, right.length)]; });
      rows.forEach(function (r) {
        var tp = pos['t:' + r.t];
        r.p.forEach(function (n) { var a = pos['l:' + n]; S('path', { d: 'M' + (a[0] + 95) + ' ' + a[1] + ' C' + (a[0] + 170) + ' ' + a[1] + ',' + (tp[0] - 170) + ' ' + tp[1] + ',' + (tp[0] - 92) + ' ' + tp[1], class: 'rq-e', 'marker-end': 'url(#gl-arrow)' }, gSvg); });
        r.s.forEach(function (n) { var a = pos['r:' + n]; S('path', { d: 'M' + (tp[0] + 92) + ' ' + tp[1] + ' C' + (tp[0] + 170) + ' ' + tp[1] + ',' + (a[0] - 170) + ' ' + a[1] + ',' + (a[0] - 95) + ' ' + a[1], class: 'rq-e', 'marker-end': 'url(#gl-arrow)' }, gSvg); });
      });
      function box(key, label, hidden) {
        var p = pos[key];
        S('ellipse', { cx: p[0], cy: p[1], rx: 95, ry: 20, class: 'rq-n' + (hidden ? ' hid' : '') }, gSvg);
        var t = S('text', { x: p[0], y: p[1] + 4, 'text-anchor': 'middle', class: 'rq-t' }, gSvg); t.textContent = label;
      }
      left.forEach(function (n) { box('l:' + n, n, g[n].hidden); });
      right.forEach(function (n) { box('r:' + n, n, g[n].hidden); });
      rows.forEach(function (r) {
        var p = pos['t:' + r.t];
        S('rect', { x: p[0] - 92, y: p[1] - 17, width: 184, height: 34, class: 'rq-topic' }, gSvg);
        var t = S('text', { x: p[0], y: p[1] + 4, 'text-anchor': 'middle', class: 'rq-t' }, gSvg); t.textContent = r.t;
      });
    }
    $('#ts-graph-close', root).addEventListener('click', function () { st.graph = false; renderGraph(); });

    /* ---------- CLI: node / topic / service / param / action ---------- */
    function usageErr(u, missing) { err('usage: ' + u); err(u.split(' ').slice(0, 3).join(' ') + ': error: the following arguments are required: ' + missing); }
    function info(lines) { out(lines.join('\n')); }
    function sortedKeys(o) { return Object.keys(o).sort(); }

    function cmdNode(a) {
      var g = graph();
      if (a[0] === 'list') {
        var ns = Object.keys(g).filter(function (n) { return !g[n].hidden || a.indexOf('-a') >= 0; }).sort();
        if (ns.length) out(ns.join('\n'));
        mission('nodes');
        if (!ns.length) hint('Nothing is running. Start a node first: ros2 run turtlesim turtlesim_node');
        return;
      }
      if (a[0] === 'info') {
        var n = a[1];
        if (!n) return usageErr('ros2 node info [-h] [--spin-time SPIN_TIME] node_name', 'node_name');
        if (n[0] !== '/') n = '/' + n;
        var o = g[n];
        if (!o) { err("Unable to find node '" + n + "'"); return; }
        var L = [n];
        function sect(title, obj) { L.push('  ' + title + ':'); sortedKeys(obj).forEach(function (k) { L.push('    ' + k + ': ' + obj[k]); }); }
        sect('Subscribers', o.subs); sect('Publishers', o.pubs); sect('Service Servers', o.srvs);
        L.push('  Service Clients:', ''); sect('Action Servers', o.acts); sect('Action Clients', o.actc);
        info(L); return;
      }
      err("ros2 node: choose 'list' or 'info'");
    }

    function parseTypeArgOrErr(t) { var n = normType(t, 'msg'); if (!MSG[n] || /_Request|_Response|_Goal/.test(n)) { err('The passed message type is invalid'); return null; } return n; }

    function cmdTopic(a) {
      var g = graph(), tm = topics(g), sub = a[0];
      if (sub === 'list') {
        var showT = a.indexOf('-t') >= 0 || a.indexOf('--show-types') >= 0;
        out(sortedKeys(tm).map(function (t) { return t + (showT ? ' [' + tm[t] + ']' : ''); }).join('\n'));
        return;
      }
      var name = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
      if (sub === 'type') { if (!name) return usageErr('ros2 topic type [-h] topic_name', 'topic_name'); if (tm[name]) out(tm[name]); else err("Unknown topic '" + name + "'"); return; }
      if (sub === 'info') {
        if (!name) return usageErr('ros2 topic info [-h] [--verbose] topic_name', 'topic_name');
        if (!tm[name]) { err("Unknown topic '" + name + "'"); return; }
        info(['Type: ' + tm[name], 'Publisher count: ' + countOn(g, 'pubs', name), 'Subscription count: ' + countOn(g, 'subs', name)]);
        return;
      }
      if (sub === 'echo') {
        if (!name) return usageErr('ros2 topic echo [-h] [--once] topic_name [message_type]', 'topic_name');
        var type = tm[name];
        if (!type) { out('WARNING: topic [' + name + '] does not appear to be published yet', 'vt-warn'); err('Could not determine the type for the passed topic'); return; }
        var once = a.indexOf('--once') >= 0, n = 0;
        var fast = /(pose|color_sensor)$/.test(name);
        var proc = { kind: 'echo', topic: name, hint: 'echoing ' + name + ' … press Ctrl+C to stop', onMsg: function (obj) {
          n++;
          if (fast) { if (!once && n % 6 !== 1) return; obj = snapshot(name); if (!obj) return; }
          if (!MSG[type] || !obj) return;
          out(yamlOut(type, obj) + '\n---');
          if (/\/pose$/.test(name)) mission('echo');
          if (once && st.fg === proc) setFg(null);
        } };
        setFg(proc);
        if (fast && !once) hint('Showing ~1 in 6 messages so you can read them — the real rate is 62.5 Hz. Ctrl+C to stop.');
        else if (!once && !fast) hint('Waiting for messages on ' + name + ' … publish something (teleop pad / topic pub), or Ctrl+C.');
        return;
      }
      if (sub === 'hz') {
        if (!name) return usageErr('ros2 topic hz [-h] topic_name', 'topic_name');
        if (!tm[name]) { out('WARNING: topic [' + name + '] does not appear to be published yet', 'vt-warn'); }
        var hp = { kind: 'hz', topic: name, times: [], acc: 0, hint: 'measuring rate of ' + name + ' … Ctrl+C to stop', tick: function (dt) {
          hp.acc += dt; if (hp.acc < 1) return; hp.acc = 0;
          var ts = hp.times; if (ts.length < 2) return;
          var d = []; for (var i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
          var mean = d.reduce(function (s, x) { return s + x; }, 0) / d.length;
          var sd = Math.sqrt(d.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / d.length);
          out('average rate: ' + (1 / mean).toFixed(3) + '\n\tmin: ' + Math.min.apply(null, d).toFixed(3) + 's max: ' + Math.max.apply(null, d).toFixed(3) + 's std dev: ' + sd.toFixed(5) + 's window: ' + ts.length);
          mission('hz');
        } };
        setFg(hp);
        return;
      }
      if (sub === 'pub') {
        var once2 = false, rate = 1, times = 0, pos = [];
        for (var i = 1; i < a.length; i++) {
          var x = a[i];
          if (x === '--once' || x === '-1') once2 = true;
          else if (x === '-r' || x === '--rate') { rate = Number(a[++i]) || 1; }
          else if (x === '-t' || x === '--times') { times = Number(a[++i]) || 0; }
          else if (x === '-w' || x === '--wait-matching-subscriptions' || x === '--qos-profile' || x === '--qos-depth') { i++; }
          else if (x[0] === '-' && !/^-?\d/.test(x)) { /* ignore unknown flag */ }
          else pos.push(x);
        }
        var topic = pos[0], tstr = pos[1], vals = pos[2];
        if (!topic || !tstr) return usageErr('ros2 topic pub [-h] [-r N] [-p N] [-1] [-t TIMES] topic_name message_type [values]', !topic ? 'topic_name, message_type' : 'message_type');
        var mt = parseTypeArgOrErr(tstr); if (!mt) return;
        var msg;
        try { msg = fill(mt, parseYaml(vals)); } catch (e) { err(e.message); return; }
        if (tm[topic] && tm[topic] !== mt) hint(topic + ' carries ' + tm[topic] + ' — nobody will receive a ' + mt + ' on it.');
        var doPub = function () { if (mt === TW) publishTwist(topic, msg); else pub(topic, msg); };
        if (once2 || times) {
          var n1 = times || 1, sent = 0;
          var go = function () {
            out('publisher: beginning loop');
            var tick = { kind: 'pubonce', acc: 1 / rate, hint: 'publishing… Ctrl+C to stop', tick: function (dt) {
              tick.acc += dt; if (tick.acc < 1 / rate) return; tick.acc = 0;
              sent++; doPub(); out('publishing #' + sent + ': ' + pyRepr(mt, msg) + '\n');
              if (sent >= n1) { if (st.fg === tick) setFg(null); if (mt === TW && once2) mission('once'); }
            } };
            setFg(tick);
          };
          if (!countOn(graph(), 'subs', topic)) {
            out('Waiting for at least 1 matching subscription(s)...');
            var w = { kind: 'wait', hint: 'waiting for a subscriber on ' + topic + ' … Ctrl+C to stop', tick: function () {
              if (countOn(graph(), 'subs', topic)) { setFg(null); go(); }
            } };
            setFg(w);
            hint('No node subscribes to ' + topic + ' yet. --once waits for one (is turtlesim running? right topic name?). Ctrl+C to give up.');
          } else go();
          return;
        }
        out('publisher: beginning loop');
        out('publishing #1: ' + pyRepr(mt, msg) + '\n');
        var pane = { label: '📤 topic pub ' + topic, topic: topic, type: mt, pid: ++st.pid, count: 1, acc: 0, tick: function (dt) {
          pane.acc += dt; if (pane.acc < 1 / rate) return; pane.acc -= 1 / rate;
          pane.count++; doPub(); if (pane.chip) pane.chip.textContent = pane.label + ' #' + pane.count;
        }, kill: function () { removePane(pane); } };
        doPub(); addPane(pane);
        hint('This publisher keeps going at ' + rate + ' Hz in its own pane — that is the "forgot --once" runaway! Click ✕ on its chip to stop it.');
        return;
      }
      err("ros2 topic: choose one of list, info, type, echo, hz, pub");
    }

    function cmdService(a) {
      var g = graph(), sm = collect(g, 'srvs'), sub = a[0];
      if (sub === 'list') {
        var showT = a.indexOf('-t') >= 0 || a.indexOf('--show-types') >= 0;
        out(sortedKeys(sm).map(function (s) { return s + (showT ? ' [' + sm[s] + ']' : ''); }).join('\n'));
        return;
      }
      if (sub === 'type') { if (!a[1]) return usageErr('ros2 service type [-h] service_name', 'service_name'); if (sm[a[1]]) out(sm[a[1]]); else err("Unknown service '" + a[1] + "'"); return; }
      if (sub === 'call') {
        var name = a[1], tstr = a[2], vals = a[3];
        if (!name || !tstr) return usageErr('ros2 service call [-h] [-r N] service_name service_type [values]', !name ? 'service_name, service_type' : 'service_type');
        var type = normType(tstr, 'srv');
        if (SRV_TYPES.indexOf(type) < 0 && !/^rcl_interfaces/.test(type)) { err('The passed service type is invalid'); return; }
        if (sm[name] !== type) {
          out('waiting for service to become available...');
          setFg({ kind: 'wait', hint: 'waiting for ' + name + ' … Ctrl+C to give up' });
          hint(sm[name] ? name + ' exists but its type is ' + sm[name] + ' — the types must match exactly.' : 'No server offers ' + name + ' right now (check: ros2 service list -t). Real ros2 waits forever — press Ctrl+C.');
          return;
        }
        if (/^rcl_interfaces/.test(type)) { hint('Parameter services work, but use the friendlier ros2 param get/set commands instead.'); return; }
        var req;
        try { req = fill(type + '_Request', parseYaml(vals)); } catch (e) { err(e.message); return; }
        out('requester: making request: ' + pyRepr(type + '_Request', req) + '\n');
        var res = serve(name, req);
        out('response:\n' + pyRepr(type + '_Response', res) + '\n');
        return;
      }
      err("ros2 service: choose one of list, type, call");
    }
    function serve(name, req) {
      var m;
      if (name === '/clear') { rlog('turtlesim', 'Clearing turtlesim.'); clearPath(); mission('clear'); return {}; }
      if (name === '/reset') {
        rlog('turtlesim', 'Resetting turtlesim.'); st.turtles = {}; st.spawnCount = 0; clearPath();
        spawn('turtle1', WM / 2, WM / 2, 0); renderPanes(); return {};
      }
      if (name === '/spawn') {
        var nm = req.name || ('turtle' + (st.spawnCount + 1));
        if (st.turtles[nm]) { rlog('turtlesim', 'A turtle named [' + nm + '] already exists', 'ERROR'); return { name: '' }; }
        spawn(nm, req.x, req.y, req.theta); mission('spawn'); renderPanes(); return { name: nm };
      }
      if (name === '/kill') {
        if (!st.turtles[req.name]) { rlog('turtlesim', 'Tried to kill turtle [' + req.name + '], which does not exist', 'ERROR'); return {}; }
        delete st.turtles[req.name]; renderPanes(); return {};
      }
      if ((m = /^\/(\w+)\/(set_pen|teleport_absolute|teleport_relative)$/.exec(name))) {
        var t = st.turtles[m[1]];
        if (m[2] === 'set_pen') { t.pen = { r: req.r, g: req.g, b: req.b, w: req.width, off: !!req.off }; mission('pen'); }
        else if (m[2] === 'teleport_absolute') { var x0 = t.x, y0 = t.y; t.x = clamp(req.x, 0, WM); t.y = clamp(req.y, 0, WM); t.th = normAng(req.theta); penLine(t, x0, y0, t.x, t.y); }
        else { var x1 = t.x, y1 = t.y; t.th = normAng(t.th + req.angular); t.x = clamp(t.x + Math.cos(t.th) * req.linear, 0, WM); t.y = clamp(t.y + Math.sin(t.th) * req.linear, 0, WM); penLine(t, x1, y1, t.x, t.y); }
        return {};
      }
      return {};
    }

    function paramsOf(node) {
      var q = { 'qos_overrides./parameter_events.publisher.depth': ['integer', 1000, 1], 'qos_overrides./parameter_events.publisher.durability': ['string', 'volatile', 1],
        'qos_overrides./parameter_events.publisher.history': ['string', 'keep_last', 1], 'qos_overrides./parameter_events.publisher.reliability': ['string', 'reliable', 1] };
      var p = null;
      if (node === '/turtlesim' && st.running) p = { background_b: ['integer', st.bg.b], background_g: ['integer', st.bg.g], background_r: ['integer', st.bg.r] };
      if (node === '/teleop_turtle' && st.teleop) p = { scale_angular: ['double', st.scale.ang], scale_linear: ['double', st.scale.lin] };
      if (!p) return null;
      for (var k in q) p[k] = q[k];
      p.use_sim_time = ['bool', st.useSim];
      return p;
    }
    function pval(t, v) { return t === 'bool' ? (v ? 'True' : 'False') : t === 'double' ? pyf(v) : String(v); }
    function cmdParam(a) {
      var sub = a[0], node = a[1], g = graph();
      if (node && node[0] !== '/') node = '/' + node;
      if (sub === 'list') {
        var ns = node ? [node] : Object.keys(g).filter(function (n) { return !g[n].hidden; }).sort();
        var L = [];
        ns.forEach(function (n) { var p = paramsOf(n); if (!p) { if (node) L.push('Node not found'); return; } L.push(n + ':'); sortedKeys(p).forEach(function (k) { L.push('  ' + k); }); });
        if (L.length) out(L.join('\n'));
        return;
      }
      if (sub === 'get') {
        if (!node || !a[2]) return usageErr('ros2 param get [-h] node_name parameter_name', 'node_name, parameter_name');
        var p = paramsOf(node); if (!p) { err('Node not found'); return; }
        var e = p[a[2]]; if (!e) { out('Parameter not set.'); return; }
        out({ integer: 'Integer', double: 'Double', bool: 'Boolean', string: 'String' }[e[0]] + ' value is: ' + pval(e[0], e[1]));
        return;
      }
      if (sub === 'set') {
        if (!node || !a[2] || a[3] === undefined) return usageErr('ros2 param set [-h] node_name parameter_name value', 'node_name, parameter_name, value');
        var pp = paramsOf(node); if (!pp) { err('Node not found'); return; }
        var name = a[2], raw = a[3], ent = pp[name];
        var vt, vv;
        if (/^[-+]?\d+$/.test(raw)) { vt = 'integer'; vv = Number(raw); }
        else if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(raw)) { vt = 'double'; vv = Number(raw); }
        else if (/^(true|false)$/i.test(raw)) { vt = 'bool'; vv = /^true$/i.test(raw); }
        else { vt = 'string'; vv = raw; }
        if (!ent) { err("Setting parameter failed: parameter '" + name + "' cannot be set because it was not declared"); return; }
        if (ent[2]) { err("Setting parameter failed: parameter '" + name + "' cannot be set because it is read-only"); return; }
        if (ent[0] !== vt) {
          err('Setting parameter failed: Wrong parameter type, parameter {' + name + '} is of type {' + ent[0] + '}, setting it to {' + vt + '} is not allowed.');
          if (ent[0] === 'integer' && vt === 'double') hint('Drop the decimal point: ' + Math.round(vv) + ' is an integer, ' + raw + ' is a double.');
          return;
        }
        if (/^background_/.test(name)) {
          if (vv < 0 || vv > 255) { err('Setting parameter failed: Parameter {' + name + "} doesn't comply with integer range."); return; }
          st.bg[name.slice(-1)] = vv; clearPath(); mission('param');
        } else if (name === 'scale_linear') st.scale.lin = vv;
        else if (name === 'scale_angular') st.scale.ang = vv;
        else if (name === 'use_sim_time') st.useSim = vv;
        out('Set parameter successful');
        return;
      }
      if (sub === 'dump') {
        if (!node) return usageErr('ros2 param dump [-h] node_name', 'node_name');
        var pd = paramsOf(node); if (!pd) { err('Node not found'); return; }
        var L2 = [node + ':', '  ros__parameters:'];
        sortedKeys(pd).forEach(function (k) { if (!/^qos/.test(k)) L2.push('    ' + k + ': ' + (pd[k][0] === 'bool' ? String(pd[k][1]) : pd[k][0] === 'double' ? pyf(pd[k][1]) : pd[k][1])); });
        L2.splice(L2.length - 1, 0, '    qos_overrides:', '      /parameter_events:', '        publisher:', '          depth: 1000', '          durability: volatile', '          history: keep_last', '          reliability: reliable');
        out(L2.join('\n'));
        return;
      }
      err("ros2 param: choose one of list, get, set, dump");
    }

    function cmdAction(a) {
      var g = graph(), am = collect(g, 'acts'), sub = a[0];
      if (sub === 'list') {
        var showT = a.indexOf('-t') >= 0 || a.indexOf('--show-types') >= 0;
        var cm = collect(g, 'actc'); for (var k in cm) am[k] = cm[k];
        out(sortedKeys(am).map(function (s) { return s + (showT ? ' [' + am[s] + ']' : ''); }).join('\n'));
        return;
      }
      if (sub === 'info') {
        var nm = a[1]; if (!nm) return usageErr('ros2 action info [-h] [-t] action_name', 'action_name');
        var cl = Object.keys(g).filter(function (n) { return nm in g[n].actc; }), sv = Object.keys(g).filter(function (n) { return nm in g[n].acts; });
        var L = ['Action: ' + nm, 'Action clients: ' + cl.length]; cl.forEach(function (n) { L.push('    ' + n); });
        L.push('Action servers: ' + sv.length); sv.forEach(function (n) { L.push('    ' + n); });
        info(L); return;
      }
      if (sub === 'send_goal') {
        var fb = false, pos = [];
        a.slice(1).forEach(function (x) { if (x === '-f' || x === '--feedback') fb = true; else pos.push(x); });
        var name = pos[0], tstr = pos[1], vals = pos[2];
        if (!name || !tstr || vals === undefined) return usageErr('ros2 action send_goal [-h] [-f] action_name action_type goal', 'action_name, action_type, goal');
        var type = normType(tstr, 'action');
        if (type !== RA) { err('The passed action type is invalid'); return; }
        var goal;
        try { goal = fill(RA + '_Goal', parseYaml(vals)); } catch (e) { err(e.message); return; }
        out('Waiting for an action server to become available...');
        var m = /^\/(\w+)\/rotate_absolute$/.exec(name), t = m && st.running && st.turtles[m[1]];
        if (am[name] !== RA || !t) { setFg({ kind: 'wait', hint: 'waiting for action server ' + name + ' … Ctrl+C' }); hint('No action server called ' + name + ' (try ros2 action list). Ctrl+C to give up.'); return; }
        out('Sending goal:\n     theta: ' + pyf(goal.theta) + '\n');
        out('Goal accepted with ID: ' + hex32() + '\n');
        var lastFb = -1, proc;
        var gl = startGoal(t, goal.theta, {
          onFb: function (rem) { if (!fb || st.t - lastFb < 0.25) return; lastFb = st.t; out('Feedback:\n    remaining: ' + f32(rem) + '\n'); },
          onDone: function (status, delta) {
            out('Result:\n    delta: ' + f32(delta) + '\n'); out('Goal finished with status: ' + status);
            if (st.fg === proc) setFg(null);
          }
        });
        proc = { kind: 'action', hint: 'goal running … Ctrl+C cancels it', stop: function () {
          if (t.goal === gl) { t.goal = null; t.av = 0; out('Canceling goal...\nGoal canceled.'); }
        } };
        setFg(proc);
        mission('action');
        return;
      }
      err("ros2 action: choose one of list, info, send_goal");
    }

    var IFACE = {
      'geometry_msgs/msg/Twist': '# This expresses velocity in free space broken into its linear and angular parts.\n\nVector3  linear\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z\nVector3  angular\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z',
      'geometry_msgs/msg/Vector3': 'float64 x\nfloat64 y\nfloat64 z',
      'turtlesim/msg/Pose': 'float32 x\nfloat32 y\nfloat32 theta\n\nfloat32 linear_velocity\nfloat32 angular_velocity',
      'turtlesim/msg/Color': 'uint8 r\nuint8 g\nuint8 b',
      'std_srvs/srv/Empty': '---',
      'turtlesim/srv/Spawn': 'float32 x\nfloat32 y\nfloat32 theta\nstring name # Optional.  A unique name will be created and returned if this is empty\n---\nstring name',
      'turtlesim/srv/Kill': 'string name\n---',
      'turtlesim/srv/SetPen': 'uint8 r\nuint8 g\nuint8 b\nuint8 width\nuint8 off\n---',
      'turtlesim/srv/TeleportAbsolute': 'float32 x\nfloat32 y\nfloat32 theta\n---',
      'turtlesim/srv/TeleportRelative': 'float32 linear\nfloat32 angular\n---',
      'turtlesim/action/RotateAbsolute': '# The desired heading in radians\nfloat32 theta\n---\n# The angular displacement in radians to the starting position\nfloat32 delta\n---\n# The remaining rotation in radians\nfloat32 remaining',
      'std_msgs/msg/String': 'string data',
      'limo_msgs/msg/LimoStatus': 'std_msgs/Header header\nuint8   vehicle_state\nuint8   control_mode\nfloat64 battery_voltage\nuint16  error_code\nuint8   motion_mode',
      'sensor_msgs/msg/LaserScan': 'std_msgs/Header header\nfloat32 angle_min        # start angle of the scan [rad]\nfloat32 angle_max        # end angle of the scan [rad]\nfloat32 angle_increment  # angular distance between measurements [rad]\nfloat32 time_increment   # time between measurements [seconds]\nfloat32 scan_time        # time between scans [seconds]\nfloat32 range_min        # minimum range value [m]\nfloat32 range_max        # maximum range value [m]\nfloat32[] ranges         # range data [m]\nfloat32[] intensities    # intensity data'
    };
    function cmdInterface(a) {
      if (a[0] === 'show' && a[1]) {
        var t = a[1], n = IFACE[t] ? t : IFACE[normType(t, 'msg')] ? normType(t, 'msg') : IFACE[normType(t, 'srv')] ? normType(t, 'srv') : normType(t, 'action');
        if (IFACE[n]) out(IFACE[n]); else err("Could not find the interface '" + t + "'");
        return;
      }
      err('try: ros2 interface show geometry_msgs/msg/Twist');
    }

    /* ---------- dispatcher ---------- */
    var HELP = ['Virtual lab — supported commands', '  ros2 run turtlesim turtlesim_node [--ros-args -p background_r:=255]', '  ros2 run turtlesim turtle_teleop_key',
      '  ros2 node list | info <node>', '  ros2 topic list [-t] | info | type | echo [--once] | hz | pub [--once | -r N] <topic> <type> "<yaml>"',
      '  ros2 service list [-t] | type | call <service> <type> "<yaml>"', '  ros2 param list | get | set | dump <node> ...',
      '  ros2 action list [-t] | info | send_goal <action> <type> "<yaml>" [--feedback]', '  ros2 interface show <type>', '  rqt_graph · clear · help',
      'Keys: Tab completes · ↑/↓ history · Ctrl+C stops · Ctrl+L clears'];
    function run(line, fromChip) {
      line = String(line).trim();
      if (st.fg) { if (fromChip) ctrlC(); else return; }
      out('$ ' + line, 'vt-cmd');
      if (!line) return;
      if (hist[hist.length - 1] !== line) { hist.push(line); if (hist.length > 60) hist.shift(); store('ts-hist', hist); }
      hi = hist.length;
      var argv;
      try { argv = shsplit(line); } catch (e) { err('bash: unexpected EOF while looking for matching quote'); return; }
      var rd = argv.indexOf('>');
      if (rd >= 0) { argv = argv.slice(0, rd); hint('File redirection is not simulated here — the output is shown instead. On your VM this would write a file.'); }
      var c = argv[0];
      if (c === 'clear') { outEl.textContent = ''; return; }
      if (c === 'help' || (c === 'ros2' && (!argv[1] || argv[1] === '-h' || argv[1] === '--help'))) { out(HELP.join('\n'), 'vt-info'); return; }
      if (c === 'rqt_graph' || (c === 'ros2' && argv[1] === 'run' && argv[2] === 'rqt_graph')) { st.graph = true; renderGraph(); hint('rqt_graph opened below the lab ↓ (it refreshes live).'); mission('graph'); return; }
      if (c === 'source' || c === 'cd' || c === 'export') return;
      if (c === 'echo') { var v = argv.slice(1).join(' '); out(v === '$ROS_DISTRO' ? 'humble' : v === '$ROS_DOMAIN_ID' ? '' : v === '$ROS_LOCALHOST_ONLY' ? '1' : v); return; }
      if (c === 'printenv' || c === 'env') { out('ROS_VERSION=2\nROS_PYTHON_VERSION=3\nROS_DISTRO=humble\nROS_LOCALHOST_ONLY=1'); return; }
      if (c === 'ls' || c === 'pwd' || c === 'whoami') { out(c === 'pwd' ? '/home/limo' : c === 'whoami' ? 'limo' : 'limo_ws'); return; }
      if (c === 'gazebo' || c === 'rviz2') { hint(c + ' needs a real desktop — run it on your Ubuntu VM.'); return; }
      if (c === 'roscore' || c === 'rosrun' || c === 'rostopic' || c === 'rosnode') { err('bash: ' + c + ': command not found'); hint(c + ' is ROS 1. In ROS 2 there is no master, and the tools are all under "ros2 …".'); return; }
      if (c !== 'ros2') { err('bash: ' + c + ': command not found'); return; }
      var sub = argv[1], rest = argv.slice(2);
      switch (sub) {
        case 'run':
          if (!rest[0] || !rest[1]) return usageErr('ros2 run [-h] [--prefix PREFIX] package_name executable_name ...', 'package_name, executable_name');
          if (rest[0] === 'turtlesim') {
            if (rest[1] === 'turtlesim_node') return startTurtlesim(rest.slice(2));
            if (rest[1] === 'turtle_teleop_key') return startTeleop();
            if (rest[1] === 'draw_square' || rest[1] === 'mimic') { hint(rest[1] + ' exists in real turtlesim but is not simulated here — try it on your VM!'); return; }
            err('No executable found'); return;
          }
          if (rest[0] === 'teleop_twist_keyboard') { hint('That teleop drives /cmd_vel for LIMO. For the turtle use: ros2 run turtlesim turtle_teleop_key'); return; }
          err("Package '" + rest[0] + "' not found"); return;
        case 'node': return cmdNode(rest);
        case 'topic': return cmdTopic(rest);
        case 'service': return cmdService(rest);
        case 'param': return cmdParam(rest);
        case 'action': return cmdAction(rest);
        case 'interface': return cmdInterface(rest);
        case 'pkg':
          if (rest[0] === 'executables' && rest[1] === 'turtlesim') { out('turtlesim draw_square\nturtlesim mimic\nturtlesim turtle_teleop_key\nturtlesim turtlesim_node'); return; }
          hint('Try: ros2 pkg executables turtlesim'); return;
        case 'launch': hint('Launch files (and Gazebo) need your Ubuntu VM. The LIMO widgets in §2.8 show what happens next.'); return;
        default: err("ros2: error: invalid choice: '" + sub + "'"); hint('Type help to see what this virtual lab understands.');
      }
    }

    /* ---------- input: history, Tab completion, Ctrl+C ---------- */
    function words() {
      var g = graph(), w = ['ros2', 'run', 'node', 'topic', 'service', 'param', 'action', 'interface', 'list', 'info', 'echo', 'hz', 'pub', 'call', 'type',
        'get', 'set', 'dump', 'send_goal', 'show', 'turtlesim', 'turtlesim_node', 'turtle_teleop_key', '--once', '--feedback', '--ros-args', 'rqt_graph', 'clear', 'help',
        'geometry_msgs/msg/Twist', 'std_srvs/srv/Empty', 'turtlesim/srv/Spawn', 'turtlesim/srv/SetPen', 'turtlesim/srv/Kill', 'turtlesim/srv/TeleportAbsolute',
        'turtlesim/srv/TeleportRelative', 'turtlesim/action/RotateAbsolute', 'turtlesim/msg/Pose', 'background_r', 'background_g', 'background_b', 'use_sim_time',
        'scale_linear', 'scale_angular'];
      w = w.concat(Object.keys(g), Object.keys(topics(g)), Object.keys(collect(g, 'srvs')), Object.keys(collect(g, 'acts')));
      return w.filter(function (x, i) { return w.indexOf(x) === i; });
    }
    inp.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey && (ev.key === 'c' || ev.key === 'C')) { if (!window.getSelection().toString()) { ev.preventDefault(); ctrlC(); } return; }
      if (ev.ctrlKey && (ev.key === 'l' || ev.key === 'L')) { ev.preventDefault(); outEl.textContent = ''; return; }
      if (st.fg) { if (ev.key === 'Enter') ev.preventDefault(); return; }
      if (ev.key === 'Enter') { ev.preventDefault(); var v = inp.value; inp.value = ''; run(v); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (hi > 0) { hi--; inp.value = hist[hi] || ''; } }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); if (hi < hist.length) { hi++; inp.value = hist[hi] || ''; } }
      else if (ev.key === 'Tab') {
        ev.preventDefault();
        var v2 = inp.value, frag = /(\S*)$/.exec(v2)[1]; if (!frag) return;
        var c = words().filter(function (w) { return w.indexOf(frag) === 0; });
        if (c.length === 1) inp.value = v2.slice(0, v2.length - frag.length) + c[0] + ' ';
        else if (c.length > 1) {
          var p = c[0]; c.forEach(function (w) { while (w.indexOf(p) !== 0) p = p.slice(0, -1); });
          if (p.length > frag.length) inp.value = v2.slice(0, v2.length - frag.length) + p;
          else out(c.sort().join('   '), 'vt-log');
        }
      }
    });
    stopBtn.addEventListener('click', function () { ctrlC(); inp.focus(); });
    outEl.addEventListener('click', function () { if (!window.getSelection().toString()) inp.focus({ preventScroll: true }); });

    /* ---------- quick chips, dock, reset ---------- */
    var QUICK = [
      ['▶ start turtlesim', 'ros2 run turtlesim turtlesim_node'], ['🎮 teleop', 'ros2 run turtlesim turtle_teleop_key'], ['node list', 'ros2 node list'],
      ['node info', 'ros2 node info /turtlesim'], ['topic list -t', 'ros2 topic list -t'], ['echo pose', 'ros2 topic echo /turtle1/pose'],
      ['hz pose', 'ros2 topic hz /turtle1/pose'], ['pub --once', 'ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"'],
      ['spawn turtle2', 'ros2 service call /spawn turtlesim/srv/Spawn "{x: 2.0, y: 2.0, theta: 0.0, name: \'turtle2\'}"'],
      ['red pen', 'ros2 service call /turtle1/set_pen turtlesim/srv/SetPen "{r: 255, g: 60, b: 60, width: 5, off: 0}"'],
      ['clear', 'ros2 service call /clear std_srvs/srv/Empty'], ['param set', 'ros2 param set /turtlesim background_r 150'],
      ['rotate goal', 'ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}" --feedback'],
      ['rqt_graph', 'rqt_graph'], ['help', 'help']
    ];
    var chipsEl = $('#ts-chips', root);
    QUICK.forEach(function (q) {
      var b = document.createElement('button'); b.className = 'chip-cmd'; b.textContent = q[0]; b.title = q[1];
      b.addEventListener('click', function () { run(q[1], true); });
      chipsEl.appendChild(b);
    });
    var ph = $('#ts-ph');
    function dock(on) {
      root.classList.toggle('docked', on);
      if (ph) ph.hidden = !on;
      $('#ts-dock', root).textContent = on ? '↩ Undock' : '📌 Dock to side';
    }
    $('#ts-dock', root).addEventListener('click', function () { dock(!root.classList.contains('docked')); });
    if (ph) $('#ts-undock', ph).addEventListener('click', function () { dock(false); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('#ts-reset', root).addEventListener('click', function () {
      if (st.fg) setFg(null);
      st = fresh(); outEl.textContent = ''; renderPanes(); setFg(null); boot();
    });
    function boot() {
      out('limo@ubuntu:~ virtual terminal · ROS 2 Humble (simulated)', 'vt-info');
      out('Start with:  ros2 run turtlesim turtlesim_node      (type help for the full list)', 'vt-log');
    }

    ticker(root, function (dt) {
      st.acc += dt;
      var n = 0;
      while (st.acc >= DT && n < 12) { st.acc -= DT; physics(); n++; }
      if (n === 12) st.acc = 0;
      render();
      st.graphAcc += dt;
      if (st.graph && st.graphAcc > 0.6) { st.graphAcc = 0; renderGraph(); }
    }, true);

    renderPanes(); setFg(null); boot();

    Lab = {
      run: function (cmd) {
        if (!root.classList.contains('docked')) {
          var r = root.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        run(cmd, true);
        try { inp.focus({ preventScroll: true }); } catch (e) { /* old browsers */ }
      },
      isRunning: function () { return st.running; }
    };

    /* ▶ chips on the static terminal blocks of sections 2.2 – 2.6 */
    ['#nodes', '#topics', '#services', '#actions', '#parameters'].forEach(function (sec) {
      $$(sec + ' .term', document).forEach(function (term) {
        if (term.closest('.lab')) return;
        var cmds = term.querySelector('.term-body').textContent.split('\n')
          .filter(function (l) { return /^\$ /.test(l); }).map(function (l) { return l.slice(2).trim(); });
        if (!cmds.length) return;
        var bar = term.querySelector('.term-bar'), box = document.createElement('div');
        box.className = 'run-chips';
        cmds.forEach(function (c) {
          var b = document.createElement('button'); b.className = 'run-chip'; b.title = 'Run in the virtual lab: ' + c;
          b.textContent = '▶ ' + (c.length > 34 ? c.slice(0, 32) + '…' : c);
          b.addEventListener('click', function () { Lab.run(c); });
          box.appendChild(b);
        });
        bar.appendChild(box);
      });
    });
    $$('[data-lab-cmd]').forEach(function (b) {
      b.addEventListener('click', function () { Lab.run(b.getAttribute('data-lab-cmd')); });
    });
  }

  /* =================================================================
     3. PUB/SUB PLAYGROUND  (#ps-lab)
     ================================================================= */
  function pubsubLab() {
    var root = $('#ps-lab'); if (!root) return;
    var svg = $('#ps-svg', root), rowsEl = $('#ps-rows', root), rate = $('#ps-rate', root), depth = $('#ps-depth', root), infoEl = $('#ps-info', root);
    var PN = ['lidar_driver', 'bag_player', 'lidar_sim'], SN = ['obstacle_avoider', 'rviz2', 'slam_toolbox', 'data_logger'];
    var pubs = [], subs = [], dots = [], seq = 0, W = 760, H = 300, TX = 380, TY = 150;
    function addPub() { var n = PN.filter(function (x) { return !pubs.some(function (p) { return p.name === x; }); })[0]; if (n) pubs.push({ name: n, acc: Math.random() * 0.2, sent: 0 }); build(); }
    function addSub() { var n = SN.filter(function (x) { return !subs.some(function (s) { return s.name === x; }); })[0]; if (n) subs.push({ name: n, rx: 0, drop: 0, slow: false, q: [], work: 0 }); build(); }
    function py(i, n) { return TY + (i - (n - 1) / 2) * 68; }
    var gStatic, gDots, pool = [];
    function build() {
      svg.innerHTML = '';
      gStatic = S('g', null, svg); gDots = S('g', null, svg); pool = [];
      pubs.forEach(function (p, i) {
        var y = py(i, pubs.length); p.y = y;
        S('path', { d: 'M200 ' + y + ' C260 ' + y + ',260 ' + TY + ',' + (TX - 70) + ' ' + TY, class: 'ps-wire' }, gStatic);
        S('rect', { x: 24, y: y - 25, width: 176, height: 50, rx: 12, class: 'ps-pub' }, gStatic);
        var t = S('text', { x: 112, y: y - 3, 'text-anchor': 'middle', class: 'gl-t' }, gStatic); t.textContent = p.name;
        p.label = S('text', { x: 112, y: y + 15, 'text-anchor': 'middle', class: 'gl-s' }, gStatic);
      });
      subs.forEach(function (s, i) {
        var y = py(i, subs.length); s.y = y;
        S('path', { d: 'M' + (TX + 70) + ' ' + TY + ' C500 ' + TY + ',500 ' + y + ',556 ' + y, class: 'ps-wire' }, gStatic);
        s.rect = S('rect', { x: 556, y: y - 25, width: 180, height: 50, rx: 12, class: 'ps-sub' + (s.slow ? ' slow' : '') }, gStatic);
        var t = S('text', { x: 646, y: y - 5, 'text-anchor': 'middle', class: 'gl-t' }, gStatic); t.textContent = s.name + (s.slow ? ' 🐢' : '');
        s.label = S('text', { x: 646, y: y + 13, 'text-anchor': 'middle', class: 'gl-s' }, gStatic);
        s.qg = S('g', null, gStatic);
      });
      S('rect', { x: TX - 70, y: TY - 22, width: 140, height: 44, rx: 22, class: 'ps-topic' }, gStatic);
      var tt = S('text', { x: TX, y: TY + 5, 'text-anchor': 'middle', class: 'ps-tt' }, gStatic); tt.textContent = '/scan';
      if (!subs.length) { var e = S('text', { x: 646, y: TY + 4, 'text-anchor': 'middle', class: 'gl-s' }, gStatic); e.textContent = '(no subscribers)'; }
      if (!pubs.length) { var e2 = S('text', { x: 112, y: TY + 4, 'text-anchor': 'middle', class: 'gl-s' }, gStatic); e2.textContent = '(no publishers)'; }
      rowsEl.innerHTML = '';
      pubs.forEach(function (p) { row('📤 ' + p.name, [['✕ remove', function () { pubs.splice(pubs.indexOf(p), 1); build(); }]]); });
      subs.forEach(function (s) {
        row('📥 ' + s.name, [[s.slow ? '⚡ make fast' : '🐢 make slow (1 msg/s)', function () { s.slow = !s.slow; s.q = []; build(); }],
          ['✕ remove', function () { subs.splice(subs.indexOf(s), 1); build(); }]]);
      });
      $('#ps-addp', root).disabled = pubs.length >= PN.length;
      $('#ps-adds', root).disabled = subs.length >= SN.length;
      labels();
    }
    function row(label, btns) {
      var d = document.createElement('div'); d.className = 'ps-row';
      var l = document.createElement('span'); l.textContent = label; d.appendChild(l);
      btns.forEach(function (b) { var x = document.createElement('button'); x.className = 'btn sm'; x.textContent = b[0]; x.addEventListener('click', b[1]); d.appendChild(x); });
      rowsEl.appendChild(d);
    }
    function labels() {
      pubs.forEach(function (p) { p.label.textContent = 'sent: ' + p.sent; });
      var dp = +depth.value;
      subs.forEach(function (s) {
        s.label.textContent = 'got ' + s.rx + (s.slow ? ' · dropped ' + s.drop : '');
        s.qg.innerHTML = '';
        if (s.slow) for (var i = 0; i < dp; i++) S('rect', { x: 560 + i * (172 / dp), y: s.y + 28, width: 172 / dp - 2, height: 7, rx: 2, class: 'ps-q' + (i < s.q.length ? ' on' : '') }, s.qg);
      });
      infoEl.textContent = '$ ros2 topic info /scan\nType: sensor_msgs/msg/LaserScan\nPublisher count: ' + pubs.length + '\nSubscription count: ' + subs.length;
    }
    $('#ps-addp', root).addEventListener('click', addPub);
    $('#ps-adds', root).addEventListener('click', addSub);
    [rate, depth].forEach(function (r) { r.addEventListener('input', function () { r.nextElementSibling.textContent = r === rate ? r.value + ' Hz' : r.value; labels(); }); });
    pubs.push({ name: 'lidar_driver', acc: 0, sent: 0 });
    subs.push({ name: 'obstacle_avoider', rx: 0, drop: 0, slow: false, q: [], work: 0 }, { name: 'rviz2', rx: 0, drop: 0, slow: false, q: [], work: 0 });
    build();
    var labAcc = 0;
    ticker(root, function (dt) {
      var hz = +rate.value, dp = +depth.value;
      pubs.forEach(function (p) {
        p.acc += dt;
        if (p.acc >= 1 / hz) { p.acc = 0; p.sent++; seq++; dots.push({ x0: 200, y0: p.y, x1: TX - 70, y1: TY, t: 0, leg: 1 }); }
      });
      for (var i = dots.length - 1; i >= 0; i--) {
        var d = dots[i]; d.t += dt / 0.45;
        if (d.t >= 1) {
          dots.splice(i, 1);
          if (d.leg === 1) subs.forEach(function (s) { dots.push({ x0: TX + 70, y0: TY, x1: 556, y1: s.y, t: 0, leg: 2, sub: s }); });
          else if (subs.indexOf(d.sub) >= 0) {
            var s = d.sub;
            if (!s.slow) s.rx++;
            else { s.q.push(1); if (s.q.length > dp) { s.q.shift(); s.drop++; } }
          }
        }
      }
      subs.forEach(function (s) {
        if (!s.slow) return;
        while (s.q.length > dp) { s.q.shift(); s.drop++; }
        if (s.q.length) { s.work += dt; if (s.work >= 1) { s.work = 0; s.q.shift(); s.rx++; } } else s.work = 0;
      });
      while (pool.length < dots.length) pool.push(S('circle', { r: 5, class: 'gl-dot' }, gDots));
      pool.forEach(function (c, j) {
        var d = dots[j];
        if (!d) { c.style.display = 'none'; return; }
        var t = d.t, e = t * t * (3 - 2 * t);
        c.style.display = '';
        c.setAttribute('cx', d.x0 + (d.x1 - d.x0) * t);
        c.setAttribute('cy', d.y0 + (d.y1 - d.y0) * e);
      });
      labAcc += dt; if (labAcc > 0.15) { labAcc = 0; labels(); }
    });
  }

  /* =================================================================
     4. PATTERN PLAYER — Topic / Service / Action  (.pp-lab)
     ================================================================= */
  function patternLab(root) {
    var svg = $('.pp-svg', root), logEl = $('.pp-log', root), ctl = $('.pp-ctl', root);
    var cs = $('.pp-cs', root), ss = $('.pp-ss', root), work = $('.pp-work', root);
    var mode = root.getAttribute('data-mode') || 'service';
    var msgs = [], clock = 0, other = 0, st = {};
    function log(t, cls) {
      var d = document.createElement('div'); d.className = cls || ''; d.textContent = '[' + clock.toFixed(1) + 's] ' + t;
      logEl.appendChild(d); while (logEl.childNodes.length > 60) logEl.removeChild(logEl.firstChild); logEl.scrollTop = logEl.scrollHeight;
    }
    var gMsgs;
    function drawStage() {
      svg.innerHTML = '';
      var names = { topic: ['Publisher', '/lidar_driver', 'Subscriber', '/obstacle_avoider'], service: ['Client', 'your node', 'Server', '/map_saver'],
        action: ['Action client', 'your app', 'Action server', 'Nav2 · navigate_to_pose'] }[mode];
      [[24, names[0], names[1]], [536, names[2], names[3]]].forEach(function (b) {
        S('rect', { x: b[0], y: 40, width: 200, height: 76, rx: 14, class: 'pp-box' }, svg);
        var t = S('text', { x: b[0] + 100, y: 72, 'text-anchor': 'middle', class: 'gl-t' }, svg); t.textContent = b[1];
        var t2 = S('text', { x: b[0] + 100, y: 94, 'text-anchor': 'middle', class: 'gl-s' }, svg); t2.textContent = b[2];
      });
      S('line', { x1: 224, y1: 78, x2: 536, y2: 78, class: 'pp-lane' }, svg);
      gMsgs = S('g', null, svg);
    }
    function send(label, dir, cls, cb) {
      var g = S('g', { class: 'pp-msg ' + (cls || '') }, gMsgs);
      var w = Math.max(70, label.length * 7.4 + 22);
      S('rect', { x: -w / 2, y: -13, width: w, height: 26, rx: 13 }, g);
      var t = S('text', { x: 0, y: 5, 'text-anchor': 'middle' }, g); t.textContent = label;
      msgs.push({ g: g, t: 0, dir: dir, cb: cb, dur: 0.9, cls: cls });
    }
    function btn(label, fn, cls) { var b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); ctl.appendChild(b); return b; }
    function setup() {
      msgs = []; ctl.innerHTML = ''; logEl.textContent = ''; st = { busy: false }; other = 0; work.style.width = '0%';
      $$('.seg button', root).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === mode); });
      drawStage();
      if (mode === 'topic') {
        st.on = false; st.acc = 0; st.n = 0;
        st.b = btn('▶ Start publishing /scan', function () { st.on = !st.on; st.b.textContent = st.on ? '⏸ Stop publishing' : '▶ Start publishing /scan'; log(st.on ? 'publisher started streaming at 5 Hz' : 'publisher stopped'); }, 'pri');
        log('A Topic is a one-way stream. The publisher never waits and never gets a reply.');
      } else if (mode === 'service') {
        st.b = btn('📨 Call /save_map', callService, 'pri');
        var lab = document.createElement('label'); lab.className = 'ctl inline';
        lab.innerHTML = 'server work time <input type="range" min="0.5" max="5" step="0.5" value="2"><output>2.0 s</output>';
        ctl.appendChild(lab); st.wt = $('input', lab);
        st.wt.addEventListener('input', function () { $('output', lab).textContent = (+st.wt.value).toFixed(1) + ' s'; });
        var off = document.createElement('label'); off.className = 'ctl inline';
        off.innerHTML = '<input type="checkbox"> server offline';
        ctl.appendChild(off); st.off = $('input', off);
        log('A Service is one request → one response. A plain call() blocks the caller until the answer comes back.');
      } else {
        st.b = btn('🎯 Send goal (drive 5 m)', sendGoal, 'pri');
        st.c = btn('✋ Cancel goal', cancelGoal); st.c.disabled = true;
        log('An Action = Goal → stream of Feedback → one Result, and it can be cancelled.');
      }
      status();
    }
    function status() {
      if (mode === 'topic') { cs.textContent = st.on ? '📡 streaming — never waits' : '💤 idle'; ss.textContent = 'received: ' + (st.n || 0); }
      else if (mode === 'service') {
        cs.innerHTML = st.busy ? '<span class="bad">⛔ BLOCKED — waiting ' + (clock - st.t0).toFixed(1) + ' s</span>' : '🟢 free';
        ss.textContent = st.serverWork ? '⚙️ saving map…' : (st.off && st.off.checked ? '🔌 offline' : '💤 ready');
      } else {
        cs.innerHTML = st.busy ? '<span class="ok">🟢 free — doing other work while feedback streams</span>' : '🟢 free';
        ss.textContent = st.running ? '🚗 driving… ' + st.remain.toFixed(1) + ' m left' : '💤 ready';
      }
      $('.pp-other', root).textContent = Math.floor(other);
    }
    function callService() {
      if (st.busy) return;
      st.busy = true; st.t0 = clock; st.b.disabled = true;
      log('client → call /save_map  (client is now blocked)');
      var go = function () {
        send('Request {name: my_map}', 1, 'req', function () {
          st.serverWork = true; st.wleft = +st.wt.value; st.wtot = st.wleft; log('server received the request, working…');
        });
      };
      if (st.off.checked) {
        log('waiting for service to become available...', 'warn');
        st.waitSrv = go;
      } else go();
    }
    function sendGoal() {
      if (st.busy) return;
      st.busy = true; st.b.disabled = true;
      log('client → Goal: NavigateToPose (x=4.0, y=1.5)');
      send('Goal x=4.0 y=1.5', 1, 'req', function () {
        log('server: goal accepted'); st.running = true; st.remain = 5; st.fbAcc = 0;
        send('Goal accepted ✓', -1, 'res', function () { if (st.running) st.c.disabled = false; });
      });
    }
    function cancelGoal() {
      if (!st.busy) return;
      st.c.disabled = true; log('client → cancel request', 'warn');
      send('Cancel', 1, 'cancel', function () {
        if (!st.running) return;
        st.running = false; log('server: goal canceled, robot stops');
        msgs = msgs.filter(function (m) { if (m.cls !== 'fb') return true; m.g.remove(); return false; });
        send('Result: CANCELED', -1, 'cancel', function () { st.busy = false; st.b.disabled = false; log('client ← Result: CANCELED'); });
      });
    }
    $$('.seg button', root).forEach(function (b) { b.addEventListener('click', function () { mode = b.getAttribute('data-m'); setup(); }); });
    setup();
    ticker(root, function (dt) {
      clock += dt;
      var blocked = mode === 'service' && st.busy;
      if (!blocked) other += dt * 5;
      $('.pp-other', root).textContent = Math.floor(other);
      if (mode === 'topic' && st.on) {
        st.acc += dt;
        if (st.acc > 0.2) { st.acc = 0; send('/scan', 1, 'stream', function () { st.n++; }); }
      }
      if (mode === 'service') {
        if (st.waitSrv && !st.off.checked) { var f = st.waitSrv; st.waitSrv = null; log('service is available now'); f(); }
        if (st.serverWork) {
          st.wleft -= dt; work.style.width = (100 * (1 - Math.max(0, st.wleft) / st.wtot)) + '%';
          if (st.wleft <= 0) {
            st.serverWork = false; log('server → response');
            send('Response {result: true}', -1, 'res', function () {
              log('client ← response after ' + (clock - st.t0).toFixed(1) + ' s — unblocked', 'ok');
              st.busy = false; st.b.disabled = false; work.style.width = '0%';
            });
          }
        }
      }
      if (mode === 'action' && st.running) {
        st.remain = Math.max(0, st.remain - dt * 0.8); st.fbAcc += dt;
        work.style.width = (100 * (1 - st.remain / 5)) + '%';
        if (st.fbAcc > 0.9 && st.remain > 0) { st.fbAcc = 0; var r = st.remain.toFixed(1); send('Feedback ' + r + ' m', -1, 'fb', function () { log('client ← feedback: distance_remaining = ' + r + ' m'); }); }
        if (st.remain <= 0) {
          st.running = false; st.c.disabled = true; log('server: goal reached');
          send('Result: SUCCEEDED', -1, 'res', function () { st.busy = false; st.b.disabled = false; log('client ← Result: SUCCEEDED', 'ok'); });
        }
      }
      for (var i = msgs.length - 1; i >= 0; i--) {
        var m = msgs[i]; m.t += dt / m.dur;
        var x = m.dir > 0 ? 224 + 312 * Math.min(1, m.t) : 536 - 312 * Math.min(1, m.t);
        x = clamp(x, 224 + 60, 536 - 60);
        m.g.setAttribute('transform', 'translate(' + x + ',' + (m.dir > 0 ? 62 : 96) + ')');
        if (m.t >= 1) { msgs.splice(i, 1); m.g.remove(); if (m.cb) m.cb(); }
      }
      status();
    });
  }

  /* =================================================================
     5. CLASSIFIER GAME  (#cls-lab)
     ================================================================= */
  function classifyLab() {
    var root = $('#cls-lab'); if (!root) return;
    var Q = [
      ['LIMO\'s LiDAR sends 360° distance readings 10 times per second.', 'T', 'Continuous sensor data that nobody replies to → Topic (/scan).'],
      ['Tell Nav2 to drive LIMO to the kitchen door 20 m away and report progress.', 'A', 'Long-running, needs feedback and must be cancellable → Action (NavigateToPose).'],
      ['Limit LIMO\'s maximum linear speed to 0.5 m/s for this whole session.', 'P', 'A stable setting that configures a node → Parameter.'],
      ['Ask the map server to save the current map to disk and confirm it worked.', 'S', 'One question, one definite answer, short → Service.'],
      ['Wheel odometry estimates streamed while LIMO drives.', 'T', 'Streaming, timestamped state → Topic (/odom).'],
      ['Reset turtlesim to its starting state.', 'S', 'A one-shot command with a reply → Service (/reset).'],
      ['Rotate the turtle to exactly 90° and report how far is left while turning.', 'A', 'That is literally turtlesim\'s /turtle1/rotate_absolute Action.'],
      ['Which frame_id the camera driver stamps on its images, chosen at launch.', 'P', 'Configuration chosen before/at start-up → Parameter.'],
      ['Keyboard teleop sending velocity commands.', 'T', 'Commands streamed many times per second → Topic (/cmd_vel).'],
      ['Dock LIMO onto its charger — takes up to 2 minutes, must be abortable.', 'A', 'Long + progress + cancel → Action.'],
      ['Switch a gripper on and get a success/failure reply.', 'S', 'Quick request with a definite answer → Service.'],
      ['LIMO\'s live battery voltage from LimoStatus.', 'T', 'A reading that keeps changing → Topic.']
    ];
    var NAMES = { T: 'Topic', S: 'Service', A: 'Action', P: 'Parameter' }, ans = store('cls') || {};
    var list = $('.cls-list', root), score = $('.cls-score', root);
    function render() {
      list.innerHTML = '';
      Q.forEach(function (q, i) {
        var d = document.createElement('div'); d.className = 'cls-row' + (ans[i] ? (ans[i] === q[1] ? ' right' : ' wrong') : '');
        d.innerHTML = '<div class="cls-q"><span class="cls-n">' + (i + 1) + '</span>' + esc(q[0]) + '</div><div class="cls-o"></div>' +
          (ans[i] ? '<div class="cls-fb">' + (ans[i] === q[1] ? '✅ ' : '❌ It\'s a <u>' + NAMES[q[1]] + '</u>. ') + esc(q[2]) + '</div>' : '');
        'TSAP'.split('').forEach(function (k) {
          var b = document.createElement('button'); b.textContent = NAMES[k]; b.className = 'cls-b b' + k;
          if (ans[i]) { b.disabled = true; if (k === q[1]) b.classList.add('right'); else if (k === ans[i]) b.classList.add('wrong'); }
          b.addEventListener('click', function () { ans[i] = k; store('cls', ans); render(); });
          $('.cls-o', d).appendChild(b);
        });
        list.appendChild(d);
      });
      var n = Object.keys(ans).length, ok = Object.keys(ans).filter(function (i) { return ans[i] === Q[i][1]; }).length;
      score.textContent = n ? ok + ' / ' + n + ' correct' + (n === Q.length ? (ok === Q.length ? ' — perfect! 🏆' : ' — read the ❌ explanations, then retry') : '') : 'Pick an answer for each scenario.';
    }
    $('.cls-reset', root).addEventListener('click', function () { ans = {}; store('cls', ans); render(); });
    render();
  }

  /* =================================================================
     6. PARAMETER MIXER  (#mix-lab)
     ================================================================= */
  function mixLab() {
    var root = $('#mix-lab'); if (!root) return;
    var c = $('canvas', root), ctx = hidpi(c, 260, 260), out = $('.mix-out', root), goal = $('.mix-goal', root);
    var sl = { r: $('#mix-r', root), g: $('#mix-g', root), b: $('#mix-b', root) };
    function draw() {
      var r = +sl.r.value, g = +sl.g.value, b = +sl.b.value;
      Object.keys(sl).forEach(function (k) { sl[k].nextElementSibling.textContent = sl[k].value; });
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'; ctx.fillRect(0, 0, 260, 260);
      ctx.strokeStyle = 'rgb(179,184,255)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 200); ctx.quadraticCurveTo(90, 120, 130, 130); ctx.stroke();
      drawTurtle(ctx, 130, 130, 0.5, 46, '#7cc36a');
      out.textContent = 'ros2 param set /turtlesim background_r ' + r + '\nros2 param set /turtlesim background_g ' + g + '\nros2 param set /turtlesim background_b ' + b +
        '\n\n# …or keep them in a YAML file (colors.yaml):\nturtlesim:\n  ros__parameters:\n    background_r: ' + r + '\n    background_g: ' + g + '\n    background_b: ' + b +
        '\n\n# …and load it at start-up:\nros2 run turtlesim turtlesim_node --ros-args --params-file colors.yaml';
      var purple = r >= 100 && b >= 100 && g <= 80 && Math.abs(r - b) < 120;
      goal.className = 'mix-goal' + (purple ? ' ok' : '');
      goal.textContent = purple ? '✅ That\'s purple — exercise solved. Now try it for real in the virtual lab or on your VM.' : '🎯 Exercise: make the canvas roughly purple (lots of red + blue, very little green).';
    }
    Object.keys(sl).forEach(function (k) { sl[k].addEventListener('input', draw); });
    $('.mix-send', root).addEventListener('click', function () {
      if (!Lab) return;
      var r = sl.r.value, g = sl.g.value, b = sl.b.value;
      if (!Lab.isRunning()) Lab.run('ros2 run turtlesim turtlesim_node --ros-args -p background_r:=' + r + ' -p background_g:=' + g + ' -p background_b:=' + b);
      else { Lab.run('ros2 param set /turtlesim background_r ' + r); Lab.run('ros2 param set /turtlesim background_g ' + g); Lab.run('ros2 param set /turtlesim background_b ' + b); }
    });
    $('.mix-reset', root).addEventListener('click', function () { sl.r.value = 69; sl.g.value = 86; sl.b.value = 255; draw(); });
    draw();
  }

  /* =================================================================
     7. CUSTOM .msg BUILDER  (#msg-lab)
     ================================================================= */
  function msgLab() {
    var root = $('#msg-lab'); if (!root) return;
    var TYPES = ['bool', 'uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64', 'float32', 'float64', 'string',
      'std_msgs/Header', 'geometry_msgs/Point', 'builtin_interfaces/Time'];
    var SIZE = { bool: 1, uint8: 1, int8: 1, uint16: 2, int16: 2, uint32: 4, int32: 4, uint64: 8, int64: 8, float32: 4, float64: 8, 'geometry_msgs/Point': 24, 'builtin_interfaces/Time': 8 };
    var PRESETS = {
      limo: { pkg: 'limo_msgs', name: 'LimoStatus', f: [['std_msgs/Header', 0, 'header'], ['uint8', 0, 'vehicle_state'], ['uint8', 0, 'control_mode'], ['float64', 0, 'battery_voltage'], ['uint16', 0, 'error_code'], ['uint8', 0, 'motion_mode']] },
      battery: { pkg: 'my_robot_msgs', name: 'BatteryReport', f: [['std_msgs/Header', 0, 'header'], ['float32', 0, 'voltage'], ['float32', 0, 'current'], ['uint8', 0, 'percentage'], ['bool', 0, 'is_charging'], ['float32', 1, 'cell_voltages']] },
      target: { pkg: 'my_robot_msgs', name: 'DetectedObject', f: [['std_msgs/Header', 0, 'header'], ['string', 0, 'label'], ['float32', 0, 'confidence'], ['geometry_msgs/Point', 0, 'position']] }
    };
    var pkgIn = $('.msg-pkg', root), nameIn = $('.msg-name', root), rows = $('.msg-rows', root), outEl = $('.msg-out', root), errEl = $('.msg-err', root);
    var fields = [], tab = 'msg';
    function load(p) { pkgIn.value = p.pkg; nameIn.value = p.name; fields = p.f.map(function (f) { return { type: f[0], arr: !!f[1], name: f[2] }; }); build(); }
    function build() {
      rows.innerHTML = '';
      fields.forEach(function (f, i) {
        var d = document.createElement('div'); d.className = 'msg-row';
        d.innerHTML = '<select aria-label="field type">' + TYPES.map(function (t) { return '<option' + (t === f.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
          '<label class="msg-arr"><input type="checkbox"' + (f.arr ? ' checked' : '') + '>[ ]</label><input class="msg-fn" aria-label="field name" value="' + esc(f.name) + '" spellcheck="false">' +
          '<button class="btn sm" title="remove field" aria-label="remove field">✕</button>';
        $('select', d).addEventListener('change', function (e) { f.type = e.target.value; update(); });
        $('input[type=checkbox]', d).addEventListener('change', function (e) { f.arr = e.target.checked; update(); });
        $('.msg-fn', d).addEventListener('input', function (e) { f.name = e.target.value; update(); });
        $('button', d).addEventListener('click', function () { fields.splice(i, 1); build(); });
        rows.appendChild(d);
      });
      update();
    }
    function defVal(f, ind) {
      if (f.arr) return '[]';
      switch (f.type) {
        case 'bool': return 'false';
        case 'string': return "''";
        case 'float32': case 'float64': return '0.0';
        case 'std_msgs/Header': return '\n' + ind + '  stamp:\n' + ind + '    sec: 0\n' + ind + '    nanosec: 0\n' + ind + "  frame_id: ''";
        case 'geometry_msgs/Point': return '\n' + ind + '  x: 0.0\n' + ind + '  y: 0.0\n' + ind + '  z: 0.0';
        case 'builtin_interfaces/Time': return '\n' + ind + '  sec: 0\n' + ind + '  nanosec: 0';
        default: return '0';
      }
    }
    function update() {
      var errs = [], names = {};
      var pkg = pkgIn.value.trim(), nm = nameIn.value.trim();
      if (!/^[a-z][a-z0-9_]*$/.test(pkg)) errs.push('Package names are lower_snake_case (e.g. limo_msgs).');
      if (!/^[A-Z][A-Za-z0-9]*$/.test(nm)) errs.push('Message names are CamelCase and start with a capital letter (e.g. LimoStatus).');
      fields.forEach(function (f) {
        if (!/^[a-z][a-z0-9_]*$/.test(f.name) || /__/.test(f.name) || /_$/.test(f.name)) errs.push('“' + f.name + '” — field names must be lower_snake_case: start with a letter, no double or trailing underscore.');
        if (names[f.name]) errs.push('“' + f.name + '” is used twice.');
        names[f.name] = 1;
      });
      if (!fields.length) errs.push('Add at least one field.');
      errEl.innerHTML = errs.length ? errs.map(function (e) { return '⚠️ ' + esc(e); }).join('<br>') : '✅ Valid message definition — colcon build would generate C++ and Python code for it.';
      errEl.className = 'msg-err' + (errs.length ? ' bad' : ' ok');
      var full = pkg + '/msg/' + nm, txt = '';
      var fixed = 0, variable = false;
      fields.forEach(function (f) { if (f.arr || !SIZE[f.type]) variable = true; else fixed += SIZE[f.type]; });
      if (tab === 'msg') {
        txt = '# ' + pkg + '/msg/' + nm + '.msg\n' + fields.map(function (f) { return (f.type + (f.arr ? '[]' : '') + '        ').slice(0, Math.max(8, f.type.length + (f.arr ? 3 : 0) + 1)) + ' ' + f.name; }).join('\n') +
          '\n\n# payload: ' + fixed + ' bytes of fixed-size fields' + (variable ? ' + variable-length parts (strings / arrays / header)' : '');
      } else if (tab === 'echo') {
        txt = '$ ros2 topic echo /status  # a topic of type ' + full + '\n' + fields.map(function (f) { return f.name + ': ' + defVal(f, ''); }).join('\n') + '\n---';
      } else if (tab === 'py') {
        txt = 'from ' + pkg + '.msg import ' + nm + '\n\nmsg = ' + nm + '()\n' + fields.filter(function (f) { return f.type !== 'std_msgs/Header'; }).slice(0, 4).map(function (f) {
          var v = f.arr ? '[3.7, 3.7, 3.6]' : f.type === 'bool' ? 'True' : f.type === 'string' ? "'hello'" : /float/.test(f.type) ? '12.1' : /Point/.test(f.type) ? 'Point(x=1.0, y=2.0, z=0.0)' : '1';
          return 'msg.' + f.name + ' = ' + v;
        }).join('\n') + (fields.some(function (f) { return f.type === 'std_msgs/Header'; }) ? '\nmsg.header.stamp = node.get_clock().now().to_msg()' : '') + '\npublisher.publish(msg)';
      } else {
        var deps = []; fields.forEach(function (f) { var p = f.type.split('/')[0]; if (f.type.indexOf('/') > 0 && deps.indexOf(p) < 0) deps.push(p); });
        txt = '# CMakeLists.txt  (package: ' + pkg + ')\nfind_package(rosidl_default_generators REQUIRED)\n' + deps.map(function (d) { return 'find_package(' + d + ' REQUIRED)'; }).join('\n') +
          '\nrosidl_generate_interfaces(${PROJECT_NAME}\n  "msg/' + nm + '.msg"' + (deps.length ? '\n  DEPENDENCIES ' + deps.join(' ') : '') + '\n)\n\n# package.xml\n<buildtool_depend>rosidl_default_generators</buildtool_depend>\n' +
          deps.map(function (d) { return '<depend>' + d + '</depend>'; }).join('\n') + (deps.length ? '\n' : '') + '<exec_depend>rosidl_default_runtime</exec_depend>\n<member_of_group>rosidl_interface_packages</member_of_group>';
      }
      outEl.textContent = txt;
    }
    $$('.msg-tabs button', root).forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-t'); $$('.msg-tabs button', root).forEach(function (x) { x.classList.toggle('on', x === b); }); update(); });
    });
    $$('[data-preset]', root).forEach(function (b) { b.addEventListener('click', function () { load(PRESETS[b.getAttribute('data-preset')]); }); });
    $('.msg-add', root).addEventListener('click', function () { fields.push({ type: 'float32', arr: false, name: 'new_field_' + (fields.length + 1) }); build(); });
    [pkgIn, nameIn].forEach(function (x) { x.addEventListener('input', update); });
    load(PRESETS.limo);
  }

  /* =================================================================
     8. TWIST → LIMO TRAJECTORY  (#tw-lab)
     ================================================================= */
  function twistLab() {
    var root = $('#tw-lab'); if (!root) return;
    var c = $('canvas', root), W = 760, H = 420, ctx = hidpi(c, W, H), K = 64, OX = 250, OY = 230;
    var v = $('#tw-v', root), w = $('#tw-w', root), T = $('#tw-t', root), rd = $('.tw-read', root), cmd = $('.tw-cmd', root);
    var anim = null;
    function pose(t) {
      var vv = +v.value, ww = +w.value;
      if (Math.abs(ww) < 1e-6) return [vv * t, 0, 0];
      return [vv / ww * Math.sin(ww * t), vv / ww * (1 - Math.cos(ww * t)), ww * t];
    }
    function P(x, y) { return [OX + x * K, OY - y * K]; }
    function robot(x, y, th, ghost) {
      var p = P(x, y);
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-th); ctx.globalAlpha = ghost ? 0.45 : 1;
      var L = 0.322 * K, Wd = 0.22 * K;
      ctx.fillStyle = '#23252f'; [[-L * 0.3, -Wd / 2 - 3], [L * 0.3, -Wd / 2 - 3], [-L * 0.3, Wd / 2 + 3], [L * 0.3, Wd / 2 + 3]].forEach(function (q) { ctx.fillRect(q[0] - 5, q[1] - 3, 10, 6); });
      ctx.fillStyle = ghost ? cssv('--muted') : '#e9eaf2'; ctx.strokeStyle = '#1c1e28'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(-L / 2, -Wd / 2, L, Wd); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cssv('--accent'); ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke();
      ctx.restore();
    }
    function draw() {
      var vv = +v.value, ww = +w.value, tt = +T.value;
      $('#tw-v-o', root).textContent = vv.toFixed(2) + ' m/s'; $('#tw-w-o', root).textContent = ww.toFixed(2) + ' rad/s'; $('#tw-t-o', root).textContent = tt.toFixed(1) + ' s';
      ctx.fillStyle = cssv('--panel2'); ctx.fillRect(0, 0, W, H);
      /* auto-zoom so the whole predicted path fits */
      var x0 = -0.3, x1 = 0.3, y0 = -0.3, y1 = 0.3;
      for (var s = 0; s <= 120; s++) { var pp = pose(tt * s / 120); x0 = Math.min(x0, pp[0] - 0.3); x1 = Math.max(x1, pp[0] + 0.3); y0 = Math.min(y0, pp[1] - 0.3); y1 = Math.max(y1, pp[1] + 0.3); }
      K = Math.min(260, (W - 60) / (x1 - x0), (H - 50) / (y1 - y0));
      OX = W / 2 - (x0 + x1) / 2 * K; OY = H / 2 + (y0 + y1) / 2 * K;
      var step = [0.1, 0.25, 0.5, 1, 2, 5].filter(function (g) { return g * K >= 26; })[0] || 5;
      ctx.lineWidth = 1; ctx.strokeStyle = cssv('--border'); ctx.globalAlpha = 0.7;
      for (var gx = Math.floor(-OX / K / step) * step; OX + gx * K < W; gx += step) { ctx.beginPath(); ctx.moveTo(OX + gx * K, 0); ctx.lineTo(OX + gx * K, H); ctx.stroke(); }
      for (var gy = Math.floor((OY - H) / K / step) * step; OY - gy * K > 0; gy += step) { ctx.beginPath(); ctx.moveTo(0, OY - gy * K); ctx.lineTo(W, OY - gy * K); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.font = '600 11px Inter, sans-serif'; ctx.fillStyle = cssv('--muted'); ctx.fillText('grid: ' + step + ' m (auto-zoom)', 10, H - 10);
      /* axes at start */
      ctx.lineWidth = 2; ctx.strokeStyle = '#e5484d'; ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(OX + 48, OY); ctx.stroke();
      ctx.strokeStyle = '#30a46c'; ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(OX, OY - 48); ctx.stroke();
      ctx.fillStyle = '#e5484d'; ctx.fillText('x (forward)', OX + 52, OY + 4); ctx.fillStyle = '#30a46c'; ctx.fillText('y (left)', OX + 4, OY - 54);
      /* path */
      ctx.strokeStyle = cssv('--accent'); ctx.lineWidth = 3; ctx.setLineDash([7, 6]); ctx.beginPath();
      for (var i = 0; i <= 200; i++) { var q = pose(tt * i / 200), p = P(q[0], q[1]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      /* circle centre */
      if (Math.abs(ww) > 1e-6 && Math.abs(vv) > 1e-6) {
        var R = vv / ww, cc = P(0, R);
        ctx.fillStyle = cssv('--gold'); ctx.beginPath(); ctx.arc(cc[0], cc[1], 3.5, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = cssv('--gold'); ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(cc[0], cc[1]); ctx.stroke(); ctx.globalAlpha = 1;
      }
      var end = pose(tt);
      robot(0, 0, 0, !!anim); robot(end[0], end[1], end[2], true);
      if (anim) { var a = pose(Math.min(tt, anim.t)); robot(a[0], a[1], a[2], false); }
      var Rtxt = Math.abs(ww) < 1e-6 ? '∞ (straight line)' : Math.abs(vv) < 1e-6 ? '0 (spin in place)' : Math.abs(vv / ww).toFixed(2) + ' m';
      rd.textContent = 'turning radius  R = |v / ω| = ' + Rtxt + '\ndistance driven = |v| · t = ' + Math.abs(vv * tt).toFixed(2) + ' m\nheading change  = ω · t = ' + (ww * tt * 180 / Math.PI).toFixed(0) + '°' +
        '\nfinal pose      = (x ' + end[0].toFixed(2) + ' m, y ' + end[1].toFixed(2) + ' m, θ ' + (normAng(end[2]) * 180 / Math.PI).toFixed(0) + '°)' +
        '\nturn direction  = ' + (Math.abs(ww) < 1e-6 ? 'none' : ww > 0 ? 'left ↺ (counter-clockwise, +angular.z)' : 'right ↻ (clockwise, −angular.z)');
      cmd.textContent = '# stream the command at 10 Hz for ' + tt.toFixed(1) + ' s (Ctrl+C to stop)…\nros2 topic pub -r 10 /cmd_vel geometry_msgs/msg/Twist "{linear: {x: ' + pyf(+vv.toFixed(2)) + '}, angular: {z: ' + pyf(+ww.toFixed(2)) + '}}"\n\n# …then always send a zero Twist so LIMO really stops:\nros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist "{}"';
    }
    [v, w, T].forEach(function (s) { s.addEventListener('input', function () { anim = null; draw(); }); });
    $$('[data-tw]', root).forEach(function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-tw').split(','); v.value = p[0]; w.value = p[1]; T.value = p[2]; anim = null; draw(); });
    });
    $('.tw-play', root).addEventListener('click', function () { anim = { t: 0 }; });
    ticker(root, function (dt) {
      if (!anim) return;
      anim.t += dt; draw();
      if (anim.t > +T.value + 0.6) { anim = null; draw(); }
    });
    themeHooks.push(draw);
    draw();
  }

  /* =================================================================
     9. LaserScan EXPLORER  (#scan-lab)
     ================================================================= */
  function scanLab() {
    var root = $('#scan-lab'); if (!root) return;
    var c = $('canvas', root), W = 760, H = 470, ctx = hidpi(c, W, H), K = 70, OX = 30, OY = 18;
    var AMIN = -3.1241390705108643, AMAX = 3.1241390705108643, AINC = 0.005817705299, RMIN = 0.15, RMAX = 12.0;
    var NR = Math.round((AMAX - AMIN) / AINC) + 1;
    var idx = $('#scan-i', root), hd = $('#scan-h', root), showRays = $('#scan-rays', root), rd = $('.scan-read', root), echo = $('.scan-echo', root), dec = $('.scan-dec', root);
    idx.max = NR - 1; idx.value = Math.round(-AMIN / AINC);
    var segs = [], circles = [[6.6, 2.0, 0.35], [3.3, 4.7, 0.25]];
    function wall(a, b, c2, d) { segs.push([a, b, c2, d]); }
    function box(x0, y0, x1, y1) { wall(x0, y0, x1, y0); wall(x1, y0, x1, y1); wall(x1, y1, x0, y1); wall(x0, y1, x0, y0); }
    wall(0, 0, 10, 0); wall(10, 0, 10, 2.6); wall(10, 3.6, 10, 6.2); wall(10, 6.2, 0, 6.2); wall(0, 6.2, 0, 0);
    box(2.2, 1.0, 3.4, 1.8); box(6.8, 4.3, 8.0, 5.2); wall(5, 0, 5, 1.8);
    var rob = { x: 1.6, y: 3.1 }, ranges = [];
    function P(x, y) { return [OX + x * K, OY + (6.2 - y) * K]; }
    function cast(ox, oy, a) {
      var dx = Math.cos(a), dy = Math.sin(a), best = Infinity;
      segs.forEach(function (s) {
        var ex = s[2] - s[0], ey = s[3] - s[1], den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) return;
        var t = ((s[0] - ox) * ey - (s[1] - oy) * ex) / den, u = ((s[0] - ox) * dy - (s[1] - oy) * dx) / den;
        if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
      });
      circles.forEach(function (ci) {
        var fx = ox - ci[0], fy = oy - ci[1], b = fx * dx + fy * dy, cc = fx * fx + fy * fy - ci[2] * ci[2], disc = b * b - cc;
        if (disc < 0) return;
        var t = -b - Math.sqrt(disc); if (t > 1e-6 && t < best) best = t;
      });
      return best > RMAX ? Infinity : best;
    }
    function scan() {
      var h = +hd.value * Math.PI / 180;
      ranges = [];
      for (var i = 0; i < NR; i++) ranges.push(cast(rob.x, rob.y, h + AMIN + i * AINC));
    }
    function fmt(r) { return r === Infinity ? 'inf' : r.toFixed(3); }
    function sectorMin(a0, a1) {
      var m = Infinity, mi = -1;
      for (var i = 0; i < NR; i++) { var a = AMIN + i * AINC; if (a >= a0 && a <= a1 && ranges[i] < m) { m = ranges[i]; mi = i; } }
      return [m, mi];
    }
    function draw() {
      var h = +hd.value * Math.PI / 180, i0 = +idx.value;
      $('#scan-h-o', root).textContent = (+hd.value).toFixed(0) + '°'; $('#scan-i-o', root).textContent = i0;
      ctx.fillStyle = cssv('--panel2'); ctx.fillRect(0, 0, W, H);
      var o = P(rob.x, rob.y);
      /* front sector */
      ctx.fillStyle = cssv('--accent'); ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.arc(o[0], o[1], 1.2 * K, -h - Math.PI / 6, -h + Math.PI / 6); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      if (showRays.checked) {
        ctx.strokeStyle = cssv('--accent2'); ctx.globalAlpha = 0.18; ctx.lineWidth = 1; ctx.beginPath();
        for (var i = 0; i < NR; i += 6) { if (ranges[i] === Infinity) continue; var a = h + AMIN + i * AINC, p = P(rob.x + Math.cos(a) * ranges[i], rob.y + Math.sin(a) * ranges[i]); ctx.moveTo(o[0], o[1]); ctx.lineTo(p[0], p[1]); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = cssv('--accent2');
      for (var j = 0; j < NR; j++) { if (ranges[j] === Infinity) continue; var a2 = h + AMIN + j * AINC, q = P(rob.x + Math.cos(a2) * ranges[j], rob.y + Math.sin(a2) * ranges[j]); ctx.fillRect(q[0] - 1.3, q[1] - 1.3, 2.6, 2.6); }
      /* world */
      ctx.strokeStyle = cssv('--text'); ctx.lineWidth = 4; ctx.lineCap = 'round';
      segs.forEach(function (s) { var a = P(s[0], s[1]), b = P(s[2], s[3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      circles.forEach(function (ci) { var p = P(ci[0], ci[1]); ctx.beginPath(); ctx.arc(p[0], p[1], ci[2] * K, 0, 6.2832); ctx.lineWidth = 3; ctx.stroke(); });
      ctx.font = '600 11px Inter, sans-serif'; ctx.fillStyle = cssv('--muted'); var dg = P(10, 3.1); ctx.fillText('open door → inf', dg[0] - 104, dg[1] + 4);
      /* selected ray */
      var sa = h + AMIN + i0 * AINC, sr = ranges[i0], L = sr === Infinity ? RMAX : sr, e = P(rob.x + Math.cos(sa) * L, rob.y + Math.sin(sa) * L);
      ctx.strokeStyle = cssv('--gold'); ctx.lineWidth = 3; ctx.setLineDash(sr === Infinity ? [6, 5] : []); ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.setLineDash([]);
      if (sr !== Infinity) { ctx.fillStyle = cssv('--gold'); ctx.beginPath(); ctx.arc(e[0], e[1], 6, 0, 6.2832); ctx.fill(); }
      /* robot */
      ctx.save(); ctx.translate(o[0], o[1]); ctx.rotate(-h);
      var Lr = 0.322 * K, Wr = 0.22 * K;
      ctx.fillStyle = '#e9eaf2'; ctx.strokeStyle = '#1c1e28'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(-Lr / 2, -Wr / 2, Lr, Wr); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Lr * 0.9, 0); ctx.stroke();
      ctx.fillStyle = '#23252f'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.2832); ctx.fill();
      ctx.restore();
      ctx.fillStyle = cssv('--muted'); ctx.fillText('drag LIMO · click anywhere to pick that ray', 10, H - 8);
      /* read-outs */
      var ang = AMIN + i0 * AINC;
      if (Math.abs(ang) < 5e-4) ang = 0;
      rd.textContent = 'i = ' + i0 + '   (of ' + NR + ' readings)\nangle = angle_min + i × angle_increment\n      = ' + AMIN.toFixed(4) + ' + ' + i0 + ' × ' + AINC.toFixed(6) + '\n      = ' + ang.toFixed(4) + ' rad  (' + (ang * 180 / Math.PI).toFixed(1) + '°'
        + (Math.abs(ang) < 0.01 ? ', straight ahead' : ang > 0 ? ', to the left' : ', to the right') + ')\nranges[' + i0 + '] = ' + fmt(sr) + (sr === Infinity ? '   ← nothing within range_max (12 m)' : ' m');
      var shown = [0, 1, 2].map(function (k) { return fmt(ranges[k]); }).concat(['...'], [NR - 3, NR - 2, NR - 1].map(function (k) { return fmt(ranges[k]); }));
      echo.textContent = '$ ros2 topic echo /scan --once\nheader:\n  frame_id: limo/laser_link\nangle_min: ' + AMIN + '\nangle_max: ' + AMAX + '\nangle_increment: ' + AINC + '\nrange_min: ' + f32(RMIN) + '\nrange_max: ' + pyf(RMAX) + '\nranges: [' + shown.join(', ') + ']\n---';
      var f = sectorMin(-Math.PI / 6, Math.PI / 6), l = sectorMin(Math.PI / 6, 5 * Math.PI / 6), r = sectorMin(-5 * Math.PI / 6, -Math.PI / 6);
      var decision = f[0] < 0.6 ? (l[0] > r[0] ? '↺ obstacle ahead — turn LEFT (more space there)' : '↻ obstacle ahead — turn RIGHT (more space there)') : '⬆ path clear — drive forward';
      dec.innerHTML = '<span>front min <b>' + fmt(f[0]) + '</b></span><span>left min <b>' + fmt(l[0]) + '</b></span><span>right min <b>' + fmt(r[0]) + '</b></span><span class="scan-go">' + decision + '</span>';
    }
    function all() { scan(); draw(); }
    idx.addEventListener('input', draw);
    hd.addEventListener('input', all);
    showRays.addEventListener('change', draw);
    var drag = false;
    function inObstacle(x, y) {
      if (x < 0.25 || x > 9.75 || y < 0.25 || y > 5.95) return true;
      if (x > 2.0 && x < 3.6 && y > 0.8 && y < 2.0) return true;
      if (x > 6.6 && x < 8.2 && y > 4.1 && y < 5.4) return true;
      if (x > 4.8 && x < 5.2 && y < 2.0) return true;
      return circles.some(function (ci) { return Math.hypot(x - ci[0], y - ci[1]) < ci[2] + 0.22; });
    }
    function world(ev) { var p = canvasPoint(c, ev, W, H); return [(p[0] - OX) / K, 6.2 - (p[1] - OY) / K]; }
    c.addEventListener('pointerdown', function (ev) {
      var w0 = world(ev);
      if (Math.hypot(w0[0] - rob.x, w0[1] - rob.y) < 0.4) { drag = true; c.setPointerCapture(ev.pointerId); return; }
      var a = normAng(Math.atan2(w0[1] - rob.y, w0[0] - rob.x) - (+hd.value * Math.PI / 180));
      idx.value = clamp(Math.round((a - AMIN) / AINC), 0, NR - 1); draw();
    });
    c.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var w0 = world(ev);
      if (!inObstacle(w0[0], w0[1])) { rob.x = w0[0]; rob.y = w0[1]; all(); }
    });
    c.addEventListener('pointerup', function () { drag = false; });
    themeHooks.push(draw);
    all();
  }

  /* =================================================================
     10. DDS CLASSROOM  (#dds-lab)  +  RMW STACK (#rmw-lab)
     ================================================================= */
  function ddsLab() {
    var root = $('#dds-lab'); if (!root) return;
    var svg = $('.dds-svg', root), ctlEl = $('.dds-ctl', root), term = $('.dds-term', root), verdict = $('.dds-verdict', root);
    var L = [{ n: 'Your laptop', x: 110, y: 170, me: true }, { n: 'Student B', x: 300, y: 250 }, { n: 'Student C', x: 460, y: 250 }, { n: 'Student D', x: 650, y: 170 }];
    L.forEach(function (l) { l.dom = 0; l.lo = false; l.off = 0; l.shock = 0; });
    function linked(a, b) { return a.dom === b.dom && !a.lo && !b.lo; }
    var gLinks, gLaps;
    function build() {
      svg.innerHTML = '';
      S('text', { x: 380, y: 38, 'text-anchor': 'middle', class: 'dds-wifi' }, svg).textContent = '📶';
      S('text', { x: 380, y: 60, 'text-anchor': 'middle', class: 'gl-s' }, svg).textContent = 'classroom Wi-Fi';
      L.forEach(function (l) { S('line', { x1: 380, y1: 66, x2: l.x, y2: l.y - 40, class: 'dds-air' }, svg); });
      gLinks = S('g', null, svg); gLaps = S('g', null, svg);
      L.forEach(function (l) {
        var g = S('g', { class: 'dds-lap' + (l.me ? ' me' : '') }, gLaps);
        S('rect', { x: l.x - 62, y: l.y - 40, width: 124, height: 74, rx: 8, class: 'dds-scr' }, g);
        S('rect', { x: l.x - 74, y: l.y + 34, width: 148, height: 9, rx: 4, class: 'dds-base' }, g);
        l.turtle = S('text', { x: l.x, y: l.y + 8, 'text-anchor': 'middle', class: 'dds-turtle' }, g); l.turtle.textContent = '🐢';
        l.label = S('text', { x: l.x, y: l.y + 62, 'text-anchor': 'middle', class: 'gl-t' }, g); l.label.textContent = l.n;
        l.env = S('text', { x: l.x, y: l.y + 78, 'text-anchor': 'middle', class: 'gl-s' }, g);
        l.say = S('text', { x: l.x, y: l.y - 48, 'text-anchor': 'middle', class: 'dds-say' }, g);
      });
      ctlEl.innerHTML = '';
      L.forEach(function (l) {
        var d = document.createElement('div'); d.className = 'dds-c' + (l.me ? ' me' : '');
        d.innerHTML = '<b>' + esc(l.n) + '</b><label>ROS_DOMAIN_ID <select>' + [0, 1, 2, 3, 7, 42].map(function (v) { return '<option' + (v === l.dom ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></label>' +
          '<label title="export ROS_LOCALHOST_ONLY=1"><input type="checkbox"' + (l.lo ? ' checked' : '') + '> LOCALHOST_ONLY</label>';
        $('select', d).addEventListener('change', function (e) { l.dom = +e.target.value; paint(); });
        $('input', d).addEventListener('change', function (e) { l.lo = e.target.checked; paint(); });
        ctlEl.appendChild(d);
      });
      paint();
    }
    function paint() {
      gLinks.innerHTML = '';
      var me = L[0], peers = 0;
      for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
        if (!linked(L[i], L[j])) continue;
        S('line', { x1: L[i].x, y1: L[i].y, x2: L[j].x, y2: L[j].y, class: 'dds-link' + (i === 0 ? ' mine' : '') }, gLinks);
        if (i === 0) peers++;
      }
      L.forEach(function (l) { l.env.textContent = 'domain ' + l.dom + (l.lo ? ' · localhost' : ''); });
      var lines = ['$ ros2 node list'];
      if (peers) lines.push('WARNING: Be aware that there are nodes in the graph that share an exact name, which can have unintended side effects.');
      lines.push('/teleop_turtle'); for (var k = 0; k <= peers; k++) lines.push('/turtlesim');
      term.textContent = lines.join('\n');
      verdict.className = 'dds-verdict ' + (peers ? 'bad' : 'ok');
      verdict.textContent = peers ? '⚠️ Your laptop can see ' + peers + ' classmate' + (peers > 1 ? 's' : '') + '. Your teleop will also drive their turtle' + (peers > 1 ? 's' : '') + '!' : '✅ Your ROS 2 graph is private — only your own nodes see each other.';
      var b = $('.dds-bashrc', root);
      b.textContent = '# ~/.bashrc on your laptop\nexport ROS_DOMAIN_ID=' + me.dom + (me.lo ? '\nexport ROS_LOCALHOST_ONLY=1' : '');
    }
    $('.dds-drive', root).addEventListener('click', function () {
      L.forEach(function (l, i) {
        if (i === 0 || linked(L[0], l)) { l.off = 1; if (i) l.shock = 2.2; }
      });
    });
    $('.dds-chaos', root).addEventListener('click', function () { L.forEach(function (l) { l.dom = 0; l.lo = false; }); build(); });
    ticker(root, function (dt) {
      L.forEach(function (l) {
        if (l.off > 0) { l.off = Math.max(0, l.off - dt * 0.7); var dx = Math.sin((1 - l.off) * Math.PI) * 36; l.turtle.setAttribute('x', l.x + dx); }
        if (l.shock > 0) { l.shock -= dt; l.say.textContent = l.shock > 0 ? '😱 who moved my turtle?!' : ''; }
      });
    });
    build();

    var rmw = $('#rmw-lab'); if (!rmw) return;
    var sel = $('select', rmw), env = $('.rmw-env', rmw), bottom = $('.rmw-dds', rmw);
    var V = { rmw_fastrtps_cpp: ['eProsima Fast DDS', 'Default in Humble'], rmw_cyclonedds_cpp: ['Eclipse Cyclone DDS', 'popular on flaky Wi-Fi'], rmw_connextdds: ['RTI Connext DDS', 'commercial, used in industry'] };
    function upd() {
      var v = V[sel.value];
      bottom.innerHTML = '<b>' + esc(v[0]) + '</b><span>' + esc(v[1]) + '</span>';
      bottom.classList.remove('swap'); void bottom.offsetWidth; bottom.classList.add('swap');
      $$('.rmw-same', rmw).forEach(function (x) { x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); });
      env.textContent = sel.value === 'rmw_fastrtps_cpp' ? '# nothing to set — Fast DDS is the Humble default\n# (explicitly: export RMW_IMPLEMENTATION=rmw_fastrtps_cpp)' :
        '# install once, e.g.  sudo apt install ros-humble-' + sel.value.replace(/_/g, '-') + '\nexport RMW_IMPLEMENTATION=' + sel.value;
    }
    sel.addEventListener('change', upd); upd();
  }

  /* =================================================================
     11. TROUBLESHOOTING CLINIC  (#fix-lab)
     ================================================================= */
  function fixLab() {
    var root = $('#fix-lab'); if (!root) return;
    var D = [
      { s: 'ros2: command not found', steps: [
        ['ROS 2 is not sourced in this terminal. Source it:', 'source /opt/ros/humble/setup.bash'],
        ['Make it permanent so every new pane has it:', 'echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc && source ~/.bashrc'],
        ['Check ROS 2 is actually installed — this should print "humble":', 'ls /opt/ros/'],
        ['Still nothing? The install did not finish. Re-run the install steps from Lecture 1.', '']] },
      { s: "Package 'limo_gazebosim' not found", steps: [
        ['Your workspace overlay is not sourced (ROS itself is not enough):', 'source ~/limo_ws/install/setup.bash'],
        ['Check the package is visible:', 'ros2 pkg list | grep limo'],
        ['Not listed? Build the workspace first, then source again:', 'cd ~/limo_ws && colcon build --symlink-install && source install/setup.bash'],
        ['Build errors about missing dependencies? Let rosdep install them:', 'cd ~/limo_ws && rosdep install --from-paths src --ignore-src -r -y']] },
      { s: 'ros2 node list is empty, but I launched something', steps: [
        ['Is the node still running in its own pane? A closed pane means a dead node. Relaunch it and keep the pane open.', ''],
        ['Both panes must use the same domain. Compare this in each pane:', 'echo $ROS_DOMAIN_ID'],
        ['…and the same localhost setting:', 'echo $ROS_LOCALHOST_ONLY'],
        ['The ros2 CLI caches the graph in a background daemon, which can go stale. Restart it:', 'ros2 daemon stop; ros2 daemon start']] },
      { s: "The turtle / LIMO won't stop moving", steps: [
        ['A publisher is still running. Count them:', 'ros2 topic info /cmd_vel'],
        ['Publisher count > 1? Find the pane running "ros2 topic pub" without --once and press Ctrl+C there.', ''],
        ['Gazebo keeps the last command, so send an explicit zero Twist:', 'ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist "{}"']] },
      { s: 'I published to /cmd_vel but nothing moves', steps: [
        ['Is anyone subscribed? "Subscription count: 0" means a wrong name or namespace:', 'ros2 topic info /cmd_vel'],
        ['turtlesim listens on /turtle1/cmd_vel, not /cmd_vel. List what exists:', 'ros2 topic list -t'],
        ['Check the message type matches exactly:', 'ros2 topic type /cmd_vel'],
        ['In Gazebo: is the simulation paused? Press ▶ at the bottom-left of the Gazebo window.', '']] },
      { s: 'I can see nodes or turtles that are not mine', steps: [
        ['DDS discovery is reaching classmates on the same Wi-Fi. Keep traffic on your own machine:', 'export ROS_LOCALHOST_ONLY=1'],
        ['…or pick a domain ID nobody else uses (0–101 is safe):', 'export ROS_DOMAIN_ID=17'],
        ['Add the line to ~/.bashrc and open a new pane. Then restart the daemon:', 'ros2 daemon stop; ros2 daemon start']] },
      { s: 'Gazebo is black, frozen or crashes in the VM', steps: [
        ['A previous Gazebo may still be running in the background. Kill it:', 'killall -9 gzserver gzclient'],
        ['VMware: enable "Accelerate 3D graphics" in the VM display settings, then reboot the VM.', ''],
        ['Still broken? Force software rendering (slower, but works):', 'export LIBGL_ALWAYS_SOFTWARE=1'],
        ['Give the VM at least 8 GB RAM and 4 CPU cores — Gazebo is heavy.', '']] },
      { s: 'topic echo: "does not appear to be published yet"', steps: [
        ['Nothing publishes that topic — or the name is wrong. List the real names:', 'ros2 topic list'],
        ['Topic names are case-sensitive and need the leading "/" and namespace, e.g. /turtle1/pose.', ''],
        ['Start the publisher first, then echo again.', '']] }
    ];
    var menu = $('.fix-menu', root), panel = $('.fix-panel', root), cur = null, step = 0;
    D.forEach(function (d, i) {
      var b = document.createElement('button'); b.className = 'fix-sym'; b.textContent = d.s;
      b.addEventListener('click', function () { cur = i; step = 0; $$('.fix-sym', menu).forEach(function (x) { x.classList.toggle('on', x === b); }); render(); });
      menu.appendChild(b);
    });
    function render() {
      if (cur === null) { panel.innerHTML = '<p class="fix-empty">👈 Pick the symptom you are seeing.</p>'; return; }
      var d = D[cur], html = '<div class="fix-title">🩺 ' + esc(d.s) + '</div>';
      for (var i = 0; i <= step && i < d.steps.length; i++) {
        var s = d.steps[i];
        html += '<div class="fix-step' + (i < step ? ' past' : '') + '"><span class="fix-n">' + (i + 1) + '</span><div><div>' + esc(s[0]) + '</div>' + (s[1] ? '<div class="fix-cmd">' + esc(s[1]) + '</div>' : '') + '</div></div>';
      }
      if (step < d.steps.length) {
        html += '<div class="fix-btns"><button class="btn pri" data-a="ok">🎉 That fixed it</button>' + (step < d.steps.length - 1 ? '<button class="btn" data-a="next">Still broken → next check</button>' : '') + '</div>';
        if (step === d.steps.length - 1) html += '<p class="fix-last">Out of ideas? Post the exact error text, the command you ran and the output of <b>printenv | grep ROS</b> on the course forum.</p>';
      } else html += '<div class="fix-done">🎉 Fixed! Remember this one — it will come back in later lectures.</div>';
      panel.innerHTML = html;
      var ok = $('[data-a=ok]', panel), nx = $('[data-a=next]', panel);
      if (ok) ok.addEventListener('click', function () { step = d.steps.length; render(); });
      if (nx) nx.addEventListener('click', function () { step++; render(); });
    }
    render();
  }

  /* =================================================================
     12. QUIZ  (#quiz-lab)
     ================================================================= */
  function quizLab() {
    var root = $('#quiz-lab'); if (!root) return;
    var Q = [
      ['You stop one node in a running ROS 2 system. What happens?', ['The whole system crashes — the master loses track of it', 'Only that node\'s topics go quiet; every other node keeps running', 'All nodes pause until you restart it', 'DDS restarts every node automatically'], 1, 'ROS 2 has no master. Nodes are independent processes, so the rest of the graph keeps running.'],
      ['Which command shows the topics a node publishes and subscribes to?', ['ros2 topic list', 'ros2 node list', 'ros2 node info /node_name', 'rqt_console'], 2, 'ros2 node info lists a node\'s subscribers, publishers, services and actions.'],
      ['LIMO\'s wheel odometry is best exposed as a…', ['Service', 'Parameter', 'Action', 'Topic'], 3, 'Continuous, timestamped state that many nodes may want → Topic (/odom).'],
      ['You run ros2 service call on a service whose server is not running. What happens?', ['It returns an empty response', 'It prints "waiting for service to become available..." and waits', 'It crashes', 'It calls the nearest similar service'], 1, 'A service call waits for a server. That is the blocking, synchronous nature of Services.'],
      ['What three parts make up an Action?', ['Request, Response, Ack', 'Goal, Feedback, Result', 'Publish, Subscribe, Echo', 'Start, Stop, Reset'], 1, 'The client sends a Goal, gets Feedback while it runs, and one final Result. It can also cancel.'],
      ['You run ros2 topic pub /cmd_vel … without --once. What happens?', ['It publishes one message and exits', 'It publishes the message repeatedly (1 Hz by default) until Ctrl+C', 'It fails without --once', 'It waits for a reply'], 1, 'Without --once the CLI keeps publishing. That is the classic runaway robot.'],
      ['Which of these belongs in a Parameter rather than on a Topic?', ['The live LiDAR scan', 'The current battery voltage', 'The maximum allowed speed', 'Camera images'], 2, 'Configuration that rarely changes → Parameter. Streams of changing data → Topic.'],
      ['ros2 param set /turtlesim background_r 150.0 fails. Why?', ['150 is out of range', 'background_r is declared as an integer and 150.0 is a double', 'Parameters are read-only', 'turtlesim has no parameters'], 1, 'ROS 2 parameters are typed. Use 150, not 150.0.'],
      ['In a LaserScan, which angle does ranges[i] correspond to?', ['i degrees', 'angle_min + i × angle_increment', 'angle_max − i', 'i × range_max'], 1, 'Every reading\'s angle is angle_min + i·angle_increment, measured from the laser\'s forward x-axis (+ is to the left).'],
      ['A positive angular.z in a Twist makes LIMO…', ['turn right (clockwise)', 'turn left (counter-clockwise)', 'drive forward', 'drive sideways'], 1, 'ROS uses a right-handed frame: x forward, y left, z up. +z rotation is counter-clockwise, which is a left turn.'],
      ['A classmate\'s teleop is driving your turtle. The quickest fix is…', ['Reinstall ROS 2', 'Use a different ROS_DOMAIN_ID or set ROS_LOCALHOST_ONLY=1', 'Rename your turtle', 'Turn off the firewall'], 1, 'DDS discovery crosses the Wi-Fi by default. A separate domain or localhost-only mode isolates you.'],
      ['Which environment variable swaps the DDS vendor without touching your code?', ['ROS_DISTRO', 'RMW_IMPLEMENTATION', 'ROS_DOMAIN_ID', 'AMENT_PREFIX_PATH'], 1, 'The RMW layer abstracts DDS. RMW_IMPLEMENTATION picks the implementation at runtime.']
    ];
    var box = $('.quiz-q', root), res = $('.quiz-res', root), ans = {};
    function render() {
      box.innerHTML = '';
      Q.forEach(function (q, i) {
        var d = document.createElement('div'); d.className = 'quiz-item';
        d.innerHTML = '<div class="quiz-t"><span class="cls-n">' + (i + 1) + '</span>' + esc(q[0]) + '</div>';
        var opts = document.createElement('div'); opts.className = 'quiz-opts';
        q[1].forEach(function (o, k) {
          var b = document.createElement('button'); b.className = 'quiz-o'; b.textContent = o;
          if (i in ans) { b.disabled = true; if (k === q[2]) b.classList.add('right'); else if (k === ans[i]) b.classList.add('wrong'); }
          b.addEventListener('click', function () { ans[i] = k; render(); });
          opts.appendChild(b);
        });
        d.appendChild(opts);
        if (i in ans) { var fb = document.createElement('div'); fb.className = 'quiz-fb ' + (ans[i] === q[2] ? 'ok' : 'bad'); fb.textContent = (ans[i] === q[2] ? '✅ ' : '❌ ') + q[3]; d.appendChild(fb); }
        box.appendChild(d);
      });
      var n = Object.keys(ans).length, ok = Object.keys(ans).filter(function (i) { return ans[i] === Q[i][2]; }).length;
      var best = store('quiz-best') || 0;
      if (n === Q.length && ok > best) { best = ok; store('quiz-best', ok); }
      res.innerHTML = '<div class="quiz-score"><b>' + ok + '</b> / ' + Q.length + ' correct' + (n < Q.length ? ' <span>(' + (Q.length - n) + ' left)</span>' : '') + '</div>' +
        '<div class="tm-bar"><i style="width:' + (100 * ok / Q.length) + '%"></i></div>' +
        (n === Q.length ? '<div class="quiz-msg">' + (ok === Q.length ? '🏆 Perfect! You\'re ready for Lecture 3.' : ok >= 9 ? '💪 Great. Re-read the ❌ ones, then retry.' : '📚 Revisit sections 2.3–2.6 and try again.') + '</div>' : '') +
        (best ? '<div class="quiz-best">Best score in this browser: ' + best + ' / ' + Q.length + '</div>' : '');
    }
    $('.quiz-reset', root).addEventListener('click', function () { ans = {}; render(); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    render();
  }

  /* =================================================================
     13. PERSISTENT CHECKLISTS  (.checkpoint, .worksheet)
     ================================================================= */
  function checklists() {
    $$('.checkpoint, .worksheet').forEach(function (list, li) {
      var key = 'check:' + (list.id || li), saved = store(key) || {};
      var items = $$('li', list), bar = document.createElement('div');
      bar.className = 'ck-bar'; list.appendChild(bar);
      function upd() {
        var n = items.filter(function (x) { return x.classList.contains('done'); }).length;
        bar.innerHTML = '<div class="tm-bar"><i style="width:' + (100 * n / items.length) + '%"></i></div><span>' + n + ' / ' + items.length + ' done</span>';
      }
      items.forEach(function (it, i) {
        it.setAttribute('role', 'checkbox'); it.tabIndex = 0;
        if (saved[i]) it.classList.add('done');
        it.setAttribute('aria-checked', !!saved[i]);
        function tog(ev) {
          if (ev.target.closest('a,button,code')) return;
          it.classList.toggle('done'); saved[i] = it.classList.contains('done'); it.setAttribute('aria-checked', saved[i]); store(key, saved); upd();
        }
        it.addEventListener('click', tog);
        it.addEventListener('keydown', function (ev) { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); tog(ev); } });
      });
      upd();
    });
  }

  /* =================================================================
     14. SESSION LAYER — 2-hour journey bar, class timer, XP + ranks,
         quick checks (.qc) and the analogy flip cards (#analogy-lab)
     ================================================================= */
  var CLS_KEY = 'TAPSTSAPTAST';
  function sessionLayer() {
    var STOPS = [
      ['big-picture', '🧠', 'Big picture', 0, 10], ['nodes', '🐢', 'Nodes', 10, 15], ['topics', '📻', 'Topics', 25, 20],
      ['services', '📞', 'Services', 45, 10], ['actions', '🛵', 'Actions', 55, 10], ['parameters', '🎛️', 'Params', 65, 10],
      ['custom-messages', '📦', 'Messages', 75, 5], ['limo-gazebo', '🚗', 'LIMO', 80, 25], ['dds', '📡', 'DDS', 105, 7],
      ['self-test', '✅', 'Quiz', 112, 6], ['summary', '🏁', 'Wrap-up', 118, 2]
    ].filter(function (s) { return document.getElementById(s[0]); });
    if (!STOPS.length) return;

    /* toast */
    var toast = document.createElement('div'); toast.className = 'l2-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast);
    var toastT = null;
    function say(msg) { toast.textContent = msg; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('on'); }, 3200); }

    /* journey bar */
    var nav = $('.coursenav');
    var bar = document.createElement('div'); bar.className = 'journey'; bar.id = 'journey';
    bar.innerHTML = '<div class="j-in"><div class="j-stops">' + STOPS.map(function (s) {
      return '<a class="j-stop" href="#' + s[0] + '" data-id="' + s[0] + '" title="' + esc(s[2]) + ' · ' + s[4] + ' min (starts at ' + s[3] + '′)"><span class="j-e">' + s[1] + '</span><span class="j-l">' + esc(s[2]) + '</span><span class="j-m">' + s[4] + '′</span></a>';
    }).join('') + '</div><div class="j-side"><button class="j-timer" type="button" title="Instructor: start a 2-hour class timer. Click again to pause.">⏱ Start class</button>' +
      '<button class="j-reset" type="button" title="Reset the class timer" hidden>↺</button><span class="j-xp" tabindex="0"></span></div></div><div class="j-prog"><i></i></div>';
    if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav.nextSibling); else document.body.insertBefore(bar, document.body.firstChild);
    function place() {
      var h = nav ? nav.offsetHeight : 0;
      bar.style.top = h + 'px';
      document.documentElement.style.scrollPaddingTop = (h + bar.offsetHeight + 12) + 'px';
    }
    place(); window.addEventListener('resize', place);

    var seen = store('seen') || {}, cur = null;
    var stopEls = $$('.j-stop', bar), progI = $('.j-prog i', bar);
    function onScroll() {
      var line = window.innerHeight * 0.35, act = null;
      STOPS.forEach(function (s) { var e = document.getElementById(s[0]); if (e.getBoundingClientRect().top <= line) act = s[0]; });
      if (act && !seen[act]) { seen[act] = 1; store('seen', seen); }
      if (act !== cur) {
        cur = act;
        stopEls.forEach(function (a) {
          var id = a.getAttribute('data-id');
          a.classList.toggle('here', id === act); a.classList.toggle('seen', !!seen[id] && id !== act);
          if (id === act && a.scrollIntoView && bar.scrollWidth > bar.clientWidth) { var sc = $('.j-stops', bar); sc.scrollLeft = a.offsetLeft - sc.clientWidth / 2 + a.offsetWidth / 2; }
        });
      }
      var first = document.getElementById(STOPS[0][0]), last = document.getElementById(STOPS[STOPS.length - 1][0]);
      var top = first.getBoundingClientRect().top + window.scrollY, end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
      progI.style.width = clamp((window.scrollY - top) / Math.max(1, end - top), 0, 1) * 100 + '%';
    }
    var pend = false;
    window.addEventListener('scroll', function () { if (!pend) { pend = true; setTimeout(function () { pend = false; onScroll(); }, 80); } }, { passive: true });
    onScroll();

    /* class timer (persists across reloads) */
    var tBtn = $('.j-timer', bar), tReset = $('.j-reset', bar), T = store('timer') || null;
    function elapsed() { if (!T) return 0; return ((T.paused || Date.now()) - T.start) / 1000; }
    function fmt(s) { s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
    function planAt(min) { for (var i = STOPS.length - 1; i >= 0; i--) if (min >= STOPS[i][3]) return STOPS[i]; return STOPS[0]; }
    function drawTimer() {
      tReset.hidden = !T;
      if (!T) { tBtn.textContent = '⏱ Start class'; tBtn.className = 'j-timer'; return; }
      var e = elapsed(), min = e / 60, plan = planAt(min);
      var idx = STOPS.map(function (s) { return s[0]; }), behind = cur && idx.indexOf(cur) >= 0 && idx.indexOf(cur) < idx.indexOf(plan[0]) && min - plan[3] > 5;
      tBtn.textContent = (T.paused ? '⏸ ' : '⏱ ') + fmt(e) + (min >= 120 ? ' · overtime' : ' · plan: ' + plan[1] + ' ' + plan[2]);
      tBtn.className = 'j-timer on' + (behind ? ' behind' : '') + (T.paused ? ' paused' : '');
      tBtn.title = behind ? 'Behind the 2-hour plan: consider moving the current "Go deeper" parts to homework.' : 'Click to pause / resume.';
    }
    tBtn.addEventListener('click', function () {
      if (!T) T = { start: Date.now(), paused: null };
      else if (T.paused) { T.start += Date.now() - T.paused; T.paused = null; }
      else T.paused = Date.now();
      store('timer', T); drawTimer();
    });
    tReset.addEventListener('click', function () { T = null; store('timer', null); drawTimer(); });

    /* XP + ranks */
    var xpEl = $('.j-xp', bar), RANKS = [[0, '🐣 Rookie'], [40, '🎮 Operator'], [90, '🔧 Engineer'], [140, '🏆 ROS Master']], lastRank = null;
    function xp() {
      var parts = {}, qc = store('qc') || {}, cls = store('cls') || {};
      parts.missions = Object.keys(store('ts-missions') || {}).length * 5;
      parts.checks = Object.keys(qc).filter(function (k) { return qc[k] === 1; }).length * 5;
      parts.sorting = Object.keys(cls).filter(function (i) { return cls[i] === CLS_KEY[i]; }).length * 2;
      parts.quiz = (store('quiz-best') || 0) * 3;
      parts.analogy = store('analogy') ? 5 : 0;
      var total = 0; for (var k in parts) total += parts[k];
      return { total: total, parts: parts };
    }
    function drawXp() {
      var x = xp(), r = RANKS[0], next = null;
      RANKS.forEach(function (k, i) { if (x.total >= k[0]) { r = k; next = RANKS[i + 1] || null; } });
      xpEl.textContent = '⭐ ' + x.total + ' XP · ' + r[1];
      xpEl.title = 'XP from: lab missions ' + x.parts.missions + ', quick checks ' + x.parts.checks + ', sorting game ' + x.parts.sorting + ', quiz ' + x.parts.quiz + ', analogy cards ' + x.parts.analogy +
        (next ? '\nNext rank at ' + next[0] + ' XP: ' + next[1] : '\nTop rank reached!');
      if (lastRank && lastRank !== r[1]) say('🎉 Rank up! You are now ' + r[1]);
      lastRank = r[1];
    }
    setInterval(function () { drawXp(); drawTimer(); }, 1000);
    drawXp(); drawTimer();

    /* quick checks */
    var qcs = store('qc') || {};
    $$('.qc').forEach(function (q) {
      var id = q.getAttribute('data-id'), ans = +q.getAttribute('data-ans'), why = q.getAttribute('data-why') || '';
      var btns = $$('.qc-o button', q), fb = $('.qc-fb', q);
      function show(pick) {
        btns.forEach(function (b, i) { b.disabled = true; if (i === ans) b.classList.add('right'); else if (i === pick) b.classList.add('wrong'); });
        fb.textContent = (pick === ans ? '✅ Correct! ' : '❌ Not quite. ') + why;
        fb.className = 'qc-fb ' + (pick === ans ? 'ok' : 'bad');
        q.classList.add('done');
      }
      btns.forEach(function (b, i) {
        b.addEventListener('click', function () {
          if (!(id in qcs)) { qcs[id] = i === ans ? 1 : 0; store('qc', qcs); if (i === ans) say('⚡ +5 XP'); }
          show(i);
        });
      });
      if (id in qcs) show(qcs[id] === 1 ? ans : (ans + 1) % btns.length);
      var rb = $('.qc-retry', q);
      if (rb) rb.addEventListener('click', function () { btns.forEach(function (b) { b.disabled = false; b.className = ''; }); fb.textContent = ''; q.classList.remove('done'); });
    });

    /* analogy flip cards */
    var an = $('#analogy-lab');
    if (an) {
      var CARDS = [
        ['🧑‍🍳', 'Node', 'A staff member with <b>one job</b>: the chef, the cashier, the delivery rider.', '/lidar_driver, /motor_driver'],
        ['📺', 'Topic', 'The <b>order screen</b> on the kitchen wall. The cashier posts orders, every chef who cares reads them, and <b>nobody replies</b>.', '/scan, /cmd_vel, /odom'],
        ['🧾', 'Message', 'One <b>order ticket</b>. Every ticket has the same boxes to fill in: pizza, size, table.', 'geometry_msgs/msg/Twist'],
        ['📞', 'Service', '<b>Phoning the manager</b>: "Do we have mozzarella?" You wait on the line and get <b>one answer</b>.', 'save the map · /spawn a turtle'],
        ['🛵', 'Action', '<b>Delivery with live tracking</b>: you order (goal), watch "rider 2 km away" (feedback), get "delivered!" (result), or <b>cancel</b>.', 'NavigateToPose · rotate_absolute'],
        ['🎛️', 'Parameter', 'The <b>oven temperature dial</b>. Set it before service opens and change it rarely.', 'max speed · wheel radius'],
        ['📣', 'DDS', 'No receptionist: staff <b>find each other by announcing themselves</b>. ROS 1 needed a receptionist, roscore, who could not go home.', 'ROS_DOMAIN_ID = which room you are in']
      ];
      var grid = $('.an-cards', an), flipped = {};
      CARDS.forEach(function (c, i) {
        var d = document.createElement('button'); d.type = 'button'; d.className = 'an-card';
        d.setAttribute('aria-label', 'Flip card: ' + c[1]);
        d.innerHTML = '<span class="an-in"><span class="an-f"><span class="an-emo">' + c[0] + '</span><span class="an-term">' + c[1] + '</span><span class="an-hint">tap to flip</span></span>' +
          '<span class="an-b"><span class="an-txt">' + c[2] + '</span><span class="an-limo">🤖 ' + esc(c[3]) + '</span></span></span>';
        d.addEventListener('click', function () {
          d.classList.toggle('flip'); flipped[i] = 1;
          if (Object.keys(flipped).length === CARDS.length && !store('analogy')) { store('analogy', 1); say('🍕 All 7 cards flipped: +5 XP'); drawXp(); }
        });
        grid.appendChild(d);
      });
      $('.an-all', an).addEventListener('click', function () {
        var anyFront = $$('.an-card', an).some(function (c) { return !c.classList.contains('flip'); });
        $$('.an-card', an).forEach(function (c, i) { c.classList.toggle('flip', anyFront); flipped[i] = 1; });
        if (!store('analogy')) { store('analogy', 1); drawXp(); }
      });
    }

    /* reset all progress */
    $$('.l2-reset-all').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Reset all your Lecture 2 progress (XP, missions, quick checks, quiz, checklists) in this browser?')) return;
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('l02:') === 0) localStorage.removeItem(k); }); } catch (e) { /* storage blocked */ }
        location.reload();
      });
    });
  }

  /* ---------------------------------------------------------- boot */
  function boot() {
    [graphLab, turtleLab, pubsubLab, classifyLab, mixLab, msgLab, twistLab, scanLab, ddsLab, fixLab, quizLab, checklists, sessionLayer].forEach(function (f) {
      try { f(); } catch (e) { if (window.console) console.error('Lecture 2 widget failed:', f.name, e); }
    });
    $$('.pp-lab').forEach(function (r) { try { patternLab(r); } catch (e) { if (window.console) console.error(e); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
