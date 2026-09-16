/* ============================================================
   annotate.js — lecture annotation / pen tool + board mode
   Drop-in: <script src="annotate.js" defer></script> before </body>

   Bottom-left:
     ✏️  small button — opens the pen panel (colours, widths,
         highlighter, eraser, undo, clear)
     🖥️  small button — opens a full-screen blackboard /
         whiteboard you can draw on (Scrble-Ink style)

   Keys:  P = panel   B = blackboard   W = whiteboard
          H = highlighter   E = eraser
          Z = undo   X = clear   [ / ] = thinner / thicker
   ============================================================ */
(function () {
  "use strict";
  if (window.__annotateLoaded) return;
  window.__annotateLoaded = true;

  var COLORS = [
    { name: "auto",   light: "#211f1a", dark: "#f2f2f7" },
    { name: "red",    light: "#e5484d", dark: "#ff6369" },
    { name: "orange", light: "#f76b15", dark: "#ff8b3d" },
    { name: "yellow", light: "#eab308", dark: "#ffe629" },
    { name: "green",  light: "#30a46c", dark: "#3dd68c" },
    { name: "blue",   light: "#3d63dd", dark: "#7c86ff" },
    { name: "violet", light: "#8e4ec6", dark: "#b57edc" }
  ];
  var WIDTHS = [2, 4, 7, 12];

  var PATH = location.pathname;
  var K_PAGE = "annot:" + PATH;
  var K_BOARD = "annot-board:" + PATH;
  var K_BTYPE = "annot-btype:" + PATH;

  var state = {
    open: false,
    board: false,
    boardType: "black",     // black | white
    mode: "pen",            // pen | highlighter | eraser
    colorIndex: 0,
    widthIndex: 1,
    drawing: false,
    cur: null,
    pageStrokes: [],
    boardStrokes: []
  };

  var dpr = Math.max(1, window.devicePixelRatio || 1);

  // ---------- styles ----------
  var css = document.createElement("style");
  css.textContent = [
    "#annot-page{position:absolute;left:0;top:0;z-index:850;pointer-events:none;}",
    "#annot-page.live{pointer-events:auto;cursor:crosshair;touch-action:none;}",
    "body.annot-drawing{-webkit-user-select:none;user-select:none;}",

    "#annot-board{position:fixed;inset:0;z-index:970;display:none;}",
    "#annot-board.on{display:block;}",
    "#annot-board-canvas{position:fixed;inset:0;z-index:975;display:none;cursor:crosshair;touch-action:none;}",
    "#annot-board-canvas.on{display:block;}",
    "body.annot-board .coursenav{display:none!important;}",
    "body.annot-board #theme-toggle{display:none!important;}",

    "#annot-fab,#annot-fab-board{position:fixed;left:14px;z-index:981;width:44px;height:44px;",
      "border-radius:50%;border:1px solid var(--border,#e6e1d6);background:var(--panel,#fffefb);",
      "color:var(--text,#211f1a);font-size:19px;cursor:pointer;display:flex;align-items:center;",
      "justify-content:center;box-shadow:0 8px 22px -8px rgba(0,0,0,.4);transition:transform .14s,background .14s;}",
    "#annot-fab{bottom:14px;} #annot-fab-board{bottom:64px;}",
    "#annot-fab:hover,#annot-fab-board:hover{transform:scale(1.09);}",
    "#annot-fab.active,#annot-fab-board.active{background:var(--accent,#3d4bf5);color:#fff;border-color:transparent;}",

    "#annot-panel{position:fixed;left:14px;bottom:114px;z-index:980;width:216px;",
      "max-height:calc(100vh - 128px);overflow:auto;",
      "display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:16px;",
      "background:var(--panel,#fffefb);border:1px solid var(--border,#e6e1d6);",
      "box-shadow:0 20px 48px -14px rgba(0,0,0,.5);font-family:'Inter',-apple-system,sans-serif;",
      "transform-origin:bottom left;transition:opacity .13s ease,transform .13s ease;}",
    "#annot-panel.collapsed{opacity:0;transform:scale(.9);pointer-events:none;}",
    "#annot-panel .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}",
    "#annot-panel .lbl{font-size:9.5px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;",
      "color:var(--muted,#7a7568);width:100%;margin-bottom:-3px;}",
    "#annot-panel button{border:1px solid transparent;background:transparent;border-radius:9px;",
      "width:32px;height:32px;font-size:15px;cursor:pointer;display:flex;align-items:center;",
      "justify-content:center;color:var(--text,#211f1a);transition:background .12s,border-color .12s;}",
    "#annot-panel button:hover{background:rgba(125,125,160,.16);}",
    "#annot-panel button.active{background:var(--accent,#3d4bf5);color:#fff;}",
    "#annot-panel button:disabled{opacity:.35;cursor:default;}",
    "#annot-panel .sw{width:20px;height:20px;border-radius:50%;padding:0;",
      "border:2px solid rgba(125,125,150,.35);cursor:pointer;}",
    "#annot-panel .sw.active{border-color:var(--accent,#3d4bf5);transform:scale(1.18);}",
    "#annot-panel .sep{width:100%;height:1px;background:var(--border,#e6e1d6);}",

    "#annot-board-x{position:fixed;right:14px;top:14px;z-index:982;display:none;width:38px;height:38px;",
      "border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;",
      "font-size:17px;cursor:pointer;align-items:center;justify-content:center;}",
    "#annot-board-x.on{display:flex;}",

    "@media print{#annot-panel,#annot-fab,#annot-fab-board,#annot-board,#annot-board-canvas,#annot-board-x{display:none!important;}}"
  ].join("");
  document.head.appendChild(css);

  // ---------- surfaces ----------
  var pageCanvas = document.createElement("canvas");
  pageCanvas.id = "annot-page";
  var pageCtx = pageCanvas.getContext("2d");

  var board = document.createElement("div");
  board.id = "annot-board";

  var boardCanvas = document.createElement("canvas");
  boardCanvas.id = "annot-board-canvas";
  var boardCtx = boardCanvas.getContext("2d");

  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  function resolveColor(idx) {
    var c = COLORS[idx] || COLORS[0];
    if (idx === 0) {
      if (state.board) return state.boardType === "black" ? "#f4f4ec" : "#1b1b1b";
      return isDark() ? c.dark : c.light;
    }
    return (isDark() && !state.board) ? c.dark : c.light;
  }

  function docSize() {
    var d = document.documentElement, b = document.body;
    return {
      w: Math.max(d.scrollWidth, b ? b.scrollWidth : 0, d.clientWidth),
      h: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.clientHeight)
    };
  }
  // Browsers cap a <canvas> backing store at ~16384px per axis. Some lectures
  // are far taller than that (Lecture 13 runs past 80000px). An over-sized page
  // canvas fails to allocate and its absolutely-positioned layer then paints
  // over the whole document, leaving only the nav bar visible. Clamp so the
  // page always renders; pen annotations past the cap are unsupported on
  // extreme-length pages (the full-screen board is unaffected).
  var MAX_CANVAS_PX = 16384;
  function sizePage() {
    var s = docSize();
    var maxLogical = Math.floor(MAX_CANVAS_PX / dpr);
    var w = Math.min(s.w, maxLogical);
    var h = Math.min(s.h, maxLogical);
    pageCanvas.style.width = w + "px";
    pageCanvas.style.height = h + "px";
    pageCanvas.width = Math.floor(w * dpr);
    pageCanvas.height = Math.floor(h * dpr);
    renderPage();
  }
  function sizeBoard() {
    var w = window.innerWidth, h = window.innerHeight;
    boardCanvas.style.width = w + "px";
    boardCanvas.style.height = h + "px";
    boardCanvas.width = Math.floor(w * dpr);
    boardCanvas.height = Math.floor(h * dpr);
    renderBoard();
  }

  function applyStyle(ctx, s) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (s.mode === "highlighter") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = resolveColor(s.colorIndex);
      ctx.lineWidth = WIDTHS[s.widthIndex] * 3.4;
    } else if (s.mode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = WIDTHS[s.widthIndex] * 5;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = resolveColor(s.colorIndex);
      ctx.lineWidth = WIDTHS[s.widthIndex];
    }
  }

  function drawStroke(ctx, s) {
    var p = s.points;
    if (!p.length) return;
    applyStyle(ctx, s);
    ctx.beginPath();
    if (p.length === 1) {
      ctx.arc(p[0].x, p[0].y, Math.max(0.8, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      return;
    }
    if (p.length === 2) {
      ctx.moveTo(p[0].x, p[0].y);
      ctx.lineTo(p[1].x, p[1].y);
      ctx.stroke();
      return;
    }
    ctx.moveTo(p[0].x, p[0].y);
    for (var i = 1; i < p.length - 1; i++) {
      var mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }

  function render(ctx, strokes) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (var i = 0; i < strokes.length; i++) drawStroke(ctx, strokes[i]);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  function renderPage() { render(pageCtx, state.pageStrokes); }
  function renderBoard() { render(boardCtx, state.boardStrokes); }

  // ---------- persistence ----------
  function save() {
    try {
      state.pageStrokes.length ? localStorage.setItem(K_PAGE, JSON.stringify(state.pageStrokes))
                               : localStorage.removeItem(K_PAGE);
      state.boardStrokes.length ? localStorage.setItem(K_BOARD, JSON.stringify(state.boardStrokes))
                                : localStorage.removeItem(K_BOARD);
      localStorage.setItem(K_BTYPE, state.boardType);
    } catch (e) {}
  }
  function load() {
    try {
      var a = localStorage.getItem(K_PAGE); if (a) state.pageStrokes = JSON.parse(a) || [];
      var b = localStorage.getItem(K_BOARD); if (b) state.boardStrokes = JSON.parse(b) || [];
      var t = localStorage.getItem(K_BTYPE); if (t === "black" || t === "white") state.boardType = t;
    } catch (e) {}
  }

  // ---------- drawing ----------
  function activeStrokes() { return state.board ? state.boardStrokes : state.pageStrokes; }
  function activeCtx() { return state.board ? boardCtx : pageCtx; }
  function activeRender() { return state.board ? renderBoard() : renderPage(); }

  function bind(canvas, pointFn, guardFn) {
    canvas.addEventListener("pointerdown", function (ev) {
      if (!guardFn()) return;
      ev.preventDefault();
      state.drawing = true;
      state.cur = {
        mode: state.mode,
        colorIndex: state.colorIndex,
        widthIndex: state.widthIndex,
        points: [pointFn(ev)]
      };
      activeStrokes().push(state.cur);
      if (canvas.setPointerCapture && ev.pointerId != null) {
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      }
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!state.drawing || !state.cur) return;
      ev.preventDefault();
      var evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null;
      if (evs && evs.length) { for (var i = 0; i < evs.length; i++) state.cur.points.push(pointFn(evs[i])); }
      else state.cur.points.push(pointFn(ev));
      activeRender();
    });
    function end() {
      if (!state.drawing) return;
      state.drawing = false;
      state.cur = null;
      save();
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    window.addEventListener("pointerup", end);
  }
  bind(pageCanvas, function (e) { return { x: e.pageX, y: e.pageY }; },
       function () { return state.open && !state.board; });
  bind(boardCanvas, function (e) { return { x: e.clientX, y: e.clientY }; },
       function () { return state.board; });

  // ---------- controls ----------
  var fab = document.createElement("button");
  fab.id = "annot-fab"; fab.type = "button"; fab.title = "Pen & colours (P)";
  fab.setAttribute("aria-label", "Toggle pen panel"); fab.textContent = "✏️";

  var fabBoard = document.createElement("button");
  fabBoard.id = "annot-fab-board"; fabBoard.type = "button"; fabBoard.title = "Blackboard / whiteboard (B / W)";
  fabBoard.setAttribute("aria-label", "Toggle board"); fabBoard.textContent = "🖥️";

  var boardX = document.createElement("button");
  boardX.id = "annot-board-x"; boardX.type = "button"; boardX.title = "Close board (Esc)"; boardX.textContent = "✕";

  var panel = document.createElement("div");
  panel.id = "annot-panel"; panel.className = "collapsed";

  function mkBtn(txt, title, fn) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = txt; b.title = title;
    b.addEventListener("click", fn);
    return b;
  }

  var penBtn = mkBtn("✏️", "Pen (P)", function () { setMode("pen"); });
  var hlBtn = mkBtn("🖍️", "Highlighter (H)", function () { setMode("highlighter"); });
  var erBtn = mkBtn("🧽", "Eraser (E)", function () { setMode("eraser"); });
  var rowMode = document.createElement("div");
  rowMode.className = "row";
  rowMode.append(labelled("Tool"), penBtn, hlBtn, erBtn);

  var rowColor = document.createElement("div");
  rowColor.className = "row";
  rowColor.appendChild(labelled("Colour"));
  var swatches = COLORS.map(function (c, i) {
    var s = document.createElement("button");
    s.type = "button"; s.className = "sw"; s.title = c.name;
    s.style.background = resolveColor(i);
    s.addEventListener("click", function () { setColor(i); });
    rowColor.appendChild(s);
    return s;
  });

  var thinBtn = mkBtn("➖", "Thinner ([)", function () { setWidth(state.widthIndex - 1); });
  var thickBtn = mkBtn("➕", "Thicker (])", function () { setWidth(state.widthIndex + 1); });
  var undoBtn = mkBtn("↶", "Undo (Z)", undo);
  var clearBtn = mkBtn("🗑️", "Clear this surface (X)", clearActive);
  var rowAct = document.createElement("div");
  rowAct.className = "row";
  rowAct.append(labelled("Size / edit"), thinBtn, thickBtn, undoBtn, clearBtn);

  var blackBtn = mkBtn("🖥️", "Blackboard (B)", function () { setBoard(true, "black"); });
  var whiteBtn = mkBtn("⬜", "Whiteboard (W)", function () { setBoard(true, "white"); });
  var exitBtn = mkBtn("✕", "Close board", function () { setBoard(false); });
  var rowBoard = document.createElement("div");
  rowBoard.className = "row";
  rowBoard.append(labelled("Board"), blackBtn, whiteBtn, exitBtn);

  panel.append(rowMode, rowColor, sep(), rowAct, sep(), rowBoard);

  function labelled(t) { var s = document.createElement("span"); s.className = "lbl"; s.textContent = t; return s; }
  function sep() { var s = document.createElement("div"); s.className = "sep"; return s; }

  // ---------- state transitions ----------
  function setOpen(v) {
    state.open = v;
    panel.classList.toggle("collapsed", !v);
    fab.classList.toggle("active", v);
    pageCanvas.classList.toggle("live", v && !state.board);
    document.body.classList.toggle("annot-drawing", v || state.board);
    if (!v && state.board) setBoard(false);
  }
  function setBoard(on, type) {
    state.board = on;
    if (on && type) state.boardType = type;
    if (on) { state.open = true; panel.classList.remove("collapsed"); fab.classList.add("active"); }
    board.classList.toggle("on", on);
    boardCanvas.classList.toggle("on", on);
    boardX.classList.toggle("on", on);
    fabBoard.classList.toggle("active", on);
    document.body.classList.toggle("annot-board", on);
    document.body.classList.toggle("annot-drawing", on || state.open);
    pageCanvas.classList.toggle("live", state.open && !on);
    blackBtn.classList.toggle("active", on && state.boardType === "black");
    whiteBtn.classList.toggle("active", on && state.boardType === "white");
    exitBtn.disabled = !on;
    if (on) styleBoard();
    swatches.forEach(function (s, i) { s.style.background = resolveColor(i); });
    if (on) { sizeBoard(); }
    renderBoard();
    save();
  }
  function styleBoard() {
    if (state.boardType === "black") {
      board.style.background = "#12352b";
      board.style.backgroundImage = "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)";
    } else {
      board.style.background = "#fbfbf9";
      board.style.backgroundImage = "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)";
    }
    board.style.backgroundSize = "24px 24px";
  }
  function setMode(m) {
    state.mode = m;
    penBtn.classList.toggle("active", m === "pen");
    hlBtn.classList.toggle("active", m === "highlighter");
    erBtn.classList.toggle("active", m === "eraser");
    if (!state.open) setOpen(true);
  }
  function setColor(i) {
    state.colorIndex = i;
    swatches.forEach(function (s, k) { s.classList.toggle("active", k === i); });
    if (state.mode === "eraser") setMode("pen");
  }
  function setWidth(i) {
    state.widthIndex = Math.max(0, Math.min(WIDTHS.length - 1, i));
    thinBtn.disabled = state.widthIndex === 0;
    thickBtn.disabled = state.widthIndex === WIDTHS.length - 1;
  }
  function undo() { activeStrokes().pop(); activeRender(); save(); }
  function clearActive() {
    var arr = activeStrokes();
    if (!arr.length) return;
    arr.length = 0;
    activeRender();
    save();
  }

  fab.addEventListener("click", function () { setOpen(!state.open); if (state.open) setMode("pen"); });
  fabBoard.addEventListener("click", function () { setBoard(!state.board, state.boardType); });
  boardX.addEventListener("click", function () { setBoard(false); });

  // ---------- keyboard ----------
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && (state.open || state.board)) { e.preventDefault(); undo(); }
      return;
    }
    switch (e.key.toLowerCase()) {
      case "p": setOpen(!state.open); if (state.open) setMode("pen"); break;
      case "b": setBoard(!(state.board && state.boardType === "black"), "black"); break;
      case "w": setBoard(!(state.board && state.boardType === "white"), "white"); break;
      case "h": setMode("highlighter"); break;
      case "e": setMode("eraser"); break;
      case "z": if (state.open || state.board) undo(); break;
      case "x": if (state.open || state.board) clearActive(); break;
      case "[": if (state.open || state.board) setWidth(state.widthIndex - 1); break;
      case "]": if (state.open || state.board) setWidth(state.widthIndex + 1); break;
      case "escape": if (state.board) setBoard(false); break;
    }
  });

  // ---------- react to theme / resize ----------
  new MutationObserver(function () {
    swatches.forEach(function (s, i) { s.style.background = resolveColor(i); });
    renderPage(); renderBoard();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { sizePage(); if (state.board) sizeBoard(); }, 120);
  });
  window.addEventListener("load", function () { setTimeout(sizePage, 200); });

  // ---------- boot ----------
  function boot() {
    document.body.appendChild(pageCanvas);
    document.body.appendChild(board);
    document.body.appendChild(boardCanvas);
    document.body.appendChild(panel);
    document.body.appendChild(fab);
    document.body.appendChild(fabBoard);
    document.body.appendChild(boardX);
    load();
    styleBoard();
    setMode("pen");
    setColor(state.colorIndex);
    setWidth(state.widthIndex);
    setOpen(false);
    sizePage();
    sizeBoard();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
