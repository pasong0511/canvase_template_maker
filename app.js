(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // 설정값
  // ---------------------------------------------------------------------------

  const MAX_SIDE = 16384;            // 데스크톱 브라우저 공통 캔버스 한 변 한도
  const MOBILE_SAFE_AREA = 16777216; // iPhone·iPad Safari 캔버스 면적 한도 (4096²)
  const STORE_KEY = 'emoticon-canvas-template:v1';
  const DEFAULT_FILE_NAME = 'template';
  const SHARE_TITLE = '이모티콘 캔버스 템플릿';
  const MIN_ZOOM = 0.002;
  const MAX_ZOOM = 32;

  const BG_COLORS = { white: '#FFFFFF', indigo: '#3F51B5' };

  const DEFAULTS = {
    boxW: 360, boxH: 360,
    cols: 4, rows: 3,
    gapX: 20, gapY: 20, pad: 20,
    borderOn: true, borderW: 2, borderColor: '#222222', borderPos: 'inside',
    bg: 'white', bgCustom: '#FFF4E0',
    tomboOn: false, tomboLen: 16, tomboOffset: 0, tomboW: 1, tomboColor: '#000000',
    marginOn: true, margin: 20, marginW: 1, marginColor: '#5BC0F8', marginStyle: 'dashed',
    crossOn: false, crossDivX: 2, crossDivY: 2, crossW: 1, crossColor: '#FF6B9A', crossStyle: 'dashed',
    fileName: '', // 비어 있으면 DEFAULT_FILE_NAME으로 저장
  };

  const NUM_LIMITS = {
    boxW: [1, MAX_SIDE], boxH: [1, MAX_SIDE],
    cols: [1, 500], rows: [1, 500],
    gapX: [0, 4000], gapY: [0, 4000], pad: [0, 4000],
    borderW: [1, 500],
    tomboLen: [1, 2000], tomboOffset: [0, 2000], tomboW: [1, 200],
    margin: [0, 8000], marginW: [1, 200],
    crossDivX: [1, 20], crossDivY: [1, 20], crossW: [1, 200],
  };

  const ENUMS = {
    borderPos: ['inside', 'center', 'outside'],
    bg: ['white', 'transparent', 'indigo', 'custom'],
    marginStyle: ['solid', 'dashed'],
    crossStyle: ['solid', 'dashed'],
  };

  const COLOR_KEYS = ['borderColor', 'bgCustom', 'tomboColor', 'marginColor', 'crossColor'];

  // ---------------------------------------------------------------------------
  // 유틸
  // ---------------------------------------------------------------------------

  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (n) => n.toLocaleString('ko-KR');

  function parseNum(str, [lo, hi]) {
    if (String(str).trim() === '') return null;
    const n = Number(str);
    if (!Number.isFinite(n)) return null;
    return clamp(Math.round(n), lo, hi);
  }

  function parseHex(str) {
    let v = String(str).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
    return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toUpperCase() : null;
  }

  function cleanName(str) {
    return String(str)
      .replace(/\.png$/i, '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .trim();
  }

  // ---------------------------------------------------------------------------
  // 상태
  // ---------------------------------------------------------------------------

  function sanitize(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    for (const k of Object.keys(DEFAULTS)) {
      if (!(k in raw) || k === 'fileName') continue; // 파일 이름은 그때그때 정한다
      const v = raw[k];
      if (k in NUM_LIMITS) {
        const n = parseNum(v, NUM_LIMITS[k]);
        if (n !== null) s[k] = n;
      } else if (k in ENUMS) {
        if (ENUMS[k].includes(v)) s[k] = v;
      } else if (COLOR_KEYS.includes(k)) {
        const c = parseHex(v);
        if (c) s[k] = c;
      } else if (typeof v === typeof DEFAULTS[k]) {
        s[k] = v;
      }
    }
    return s;
  }

  function loadState() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORE_KEY)));
    } catch {
      return { ...DEFAULTS };
    }
  }

  let saveTimer = 0;
  function saveStateSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { fileName, ...settings } = state;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* 저장 불가 환경 */ }
    }, 300);
  }

  // 설정 링크: 기본값과 다른 항목만 주소 # 뒤에 담는다 (예: #v=1&boxW=1080&crossDivX=3)
  function encodeSettings(s) {
    const p = new URLSearchParams({ v: '1' });
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'fileName' || s[k] === DEFAULTS[k]) continue;
      const v = s[k];
      p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : COLOR_KEYS.includes(k) ? v.slice(1) : String(v));
    }
    return p.toString();
  }

  function decodeSettings(hash) {
    const p = new URLSearchParams(String(hash).replace(/^#/, ''));
    if (p.get('v') !== '1') return null;
    const raw = {};
    for (const [k, v] of p) {
      if (!(k in DEFAULTS)) continue;
      raw[k] = typeof DEFAULTS[k] === 'boolean' ? v === '1' : v;
    }
    return sanitize(raw);
  }

  function shareUrl() {
    return location.origin + location.pathname + '#' + encodeSettings(state);
  }

  let state = loadState();
  let openedFromLink = false;
  {
    const shared = decodeSettings(location.hash);
    if (shared) {
      state = shared;
      openedFromLink = true;
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  // ---------------------------------------------------------------------------
  // 그리기
  // ---------------------------------------------------------------------------

  function measure(s) {
    return {
      W: s.pad * 2 + s.cols * s.boxW + (s.cols - 1) * s.gapX,
      H: s.pad * 2 + s.rows * s.boxH + (s.rows - 1) * s.gapY,
    };
  }

  function bgColor(s) {
    if (s.bg === 'transparent') return null;
    if (s.bg === 'custom') return s.bgCustom;
    return BG_COLORS[s.bg];
  }

  const dashFor = (w) => [Math.max(6, w * 4), Math.max(4, w * 3)];

  function strokePath(ctx, color, width, dash, dashOffset = 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.lineDashOffset = dashOffset;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * 템플릿을 캔버스 좌표(1 = 1px)로 그린다.
   * view    그릴 영역(캔버스 좌표). null이면 전체.
   * minLine 미리보기에서 선이 사라지지 않게 할 최소 굵기(캔버스 좌표). 저장할 때는 0.
   */
  function drawTemplate(ctx, s, view, minLine) {
    const { W, H } = measure(s);
    const stepX = s.boxW + s.gapX;
    const stepY = s.boxH + s.gapY;
    const line = (w) => Math.max(w, minLine);

    const bg = bgColor(s);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }

    // 화면에 걸치는 박스만 그린다 (테두리·톰보가 박스 밖으로 뻗는 만큼 여유를 둔다)
    let c0 = 0, c1 = s.cols - 1, r0 = 0, r1 = s.rows - 1;
    if (view) {
      const reach = Math.max(
        s.borderOn ? s.borderW : 0,
        s.tomboOn ? s.tomboOffset + s.tomboLen + s.tomboW : 0,
      ) + 1;
      c0 = Math.max(c0, Math.floor((view.x0 - reach - s.pad - s.boxW) / stepX));
      c1 = Math.min(c1, Math.floor((view.x1 + reach - s.pad) / stepX));
      r0 = Math.max(r0, Math.floor((view.y0 - reach - s.pad - s.boxH) / stepY));
      r1 = Math.min(r1, Math.floor((view.y1 + reach - s.pad) / stepY));
      if (c0 > c1 || r0 > r1) return;
    }

    const each = (fn) => {
      for (let r = r0; r <= r1; r++) {
        const y = s.pad + r * stepY;
        for (let c = c0; c <= c1; c++) fn(s.pad + c * stepX, y);
      }
    };

    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    // 안쪽 여백선: 박스 가장자리에서 margin만큼 들어간 곳부터 선이 시작된다
    if (s.marginOn) {
      const inset = s.margin + s.marginW / 2;
      const w = s.boxW - inset * 2;
      const h = s.boxH - inset * 2;
      if (w > 0 && h > 0) {
        ctx.beginPath();
        each((x, y) => ctx.rect(x + inset, y + inset, w, h));
        strokePath(ctx, s.marginColor, line(s.marginW), s.marginStyle === 'dashed' ? dashFor(s.marginW) : null);
      }
    }

    // 십자·등분 기준선: 박스를 가로 crossDivX, 세로 crossDivY 등분하는 선(2등분 = 십자).
    // 선은 픽셀 경계에 맞추고, 점선이 박스 중심에서 대칭이 되도록 중심에서 바깥으로 그린다
    if (s.crossOn) {
      const t = s.crossW;
      const snap = (pos) => Math.round(pos - t / 2) + t / 2;
      const xs = [];
      const ys = [];
      for (let i = 1; i < s.crossDivX; i++) xs.push(snap(s.boxW * i / s.crossDivX));
      for (let i = 1; i < s.crossDivY; i++) ys.push(snap(s.boxH * i / s.crossDivY));
      const midX = s.boxW / 2;
      const midY = s.boxH / 2;
      ctx.beginPath();
      each((x, y) => {
        for (const lx of xs) {
          ctx.moveTo(x + lx, y + midY); ctx.lineTo(x + lx, y);
          ctx.moveTo(x + lx, y + midY); ctx.lineTo(x + lx, y + s.boxH);
        }
        for (const ly of ys) {
          ctx.moveTo(x + midX, y + ly); ctx.lineTo(x, y + ly);
          ctx.moveTo(x + midX, y + ly); ctx.lineTo(x + s.boxW, y + ly);
        }
      });
      const dash = s.crossStyle === 'dashed' ? dashFor(t) : null;
      strokePath(ctx, s.crossColor, line(t), dash, dash ? dash[0] / 2 : 0);
    }

    // 테두리
    if (s.borderOn) {
      const t = s.borderW;
      const off = s.borderPos === 'inside' ? t / 2 : s.borderPos === 'outside' ? -t / 2 : 0;
      const w = s.boxW - off * 2;
      const h = s.boxH - off * 2;
      ctx.beginPath();
      if (w > 0 && h > 0) {
        each((x, y) => ctx.rect(x + off, y + off, w, h));
        strokePath(ctx, s.borderColor, line(t), null);
      } else {
        // 안쪽 테두리가 박스보다 두꺼우면 박스를 채운다
        each((x, y) => ctx.rect(x, y, s.boxW, s.boxH));
        ctx.fillStyle = s.borderColor;
        ctx.fill();
      }
    }

    // 톰보: 각 박스 모서리에서 변의 연장선을 바깥으로 짧게 긋는다.
    // 선의 안쪽 면이 재단선(박스 경계)에 붙고, 어떤 박스 안에도 그려지지 않는다.
    if (s.tomboOn) {
      const t = line(s.tomboW);
      const L = s.tomboLen;
      const o = s.tomboOffset;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      each((x, y) => ctx.rect(x, y, s.boxW, s.boxH));
      ctx.clip('evenodd');
      ctx.beginPath();
      each((x, y) => {
        const r = x + s.boxW;
        const b = y + s.boxH;
        ctx.rect(x - o - L, y - t, L, t);
        ctx.rect(r + o, y - t, L, t);
        ctx.rect(x - o - L, b, L, t);
        ctx.rect(r + o, b, L, t);
        ctx.rect(x - t, y - o - L, t, L);
        ctx.rect(r, y - o - L, t, L);
        ctx.rect(x - t, b + o, t, L);
        ctx.rect(r, b + o, t, L);
      });
      ctx.fillStyle = s.tomboColor;
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // 미리보기
  // ---------------------------------------------------------------------------

  const previewEl = $('#preview');
  const viewCanvas = $('#view');
  const vctx = viewCanvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, fit: true };
  let cssW = 0, cssH = 0, dpr = 1;
  let rafId = 0;
  let checker = null, checkerDpr = 0;

  function resizeViewCanvas() {
    const rect = previewEl.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cssW = rect.width;
    cssH = rect.height;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (viewCanvas.width !== w || viewCanvas.height !== h) {
      viewCanvas.width = w;
      viewCanvas.height = h;
    }
  }

  function fitView() {
    const { W, H } = measure(state);
    const narrow = cssW < 600;
    const side = narrow ? 16 : 40;
    const top = narrow ? 48 : 60;
    const bottom = narrow ? 56 : 72;
    const availW = Math.max(1, cssW - side * 2);
    const availH = Math.max(1, cssH - top - bottom);
    view.scale = clamp(Math.min(availW / W, availH / H), MIN_ZOOM, 8);
    view.x = side + (availW - W * view.scale) / 2;
    view.y = top + (availH - H * view.scale) / 2;
    view.fit = true;
    updateZoomLabel();
  }

  // 캔버스가 화면 밖으로 완전히 사라지지 않게 붙잡아 둔다
  function clampView() {
    const { W, H } = measure(state);
    const m = 40;
    view.x = clamp(view.x, m - W * view.scale, cssW - m);
    view.y = clamp(view.y, m - H * view.scale, cssH - m);
  }

  function zoomAt(factor, px, py) {
    const next = clamp(view.scale * factor, MIN_ZOOM, MAX_ZOOM);
    const f = next / view.scale;
    view.x = px - (px - view.x) * f;
    view.y = py - (py - view.y) * f;
    view.scale = next;
    view.fit = false;
    clampView();
    updateZoomLabel();
    requestRender();
  }

  function updateZoomLabel() {
    const pct = view.scale * 100;
    $('#zoomLabel').textContent = (pct >= 10 ? Math.round(pct) : pct.toFixed(1)) + '%';
  }

  function getChecker() {
    if (checker && checkerDpr === dpr) return checker;
    const size = Math.max(4, Math.round(8 * dpr));
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size * 2, size * 2);
    g.fillStyle = '#d9dbe1';
    g.fillRect(0, 0, size, size);
    g.fillRect(size, size, size, size);
    checker = vctx.createPattern(c, 'repeat');
    checkerDpr = dpr;
    return checker;
  }

  function requestRender() {
    if (!rafId) rafId = requestAnimationFrame(render);
  }

  function render() {
    rafId = 0;
    const ctx = vctx;
    const cw = viewCanvas.width;
    const ch = viewCanvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!cssW || !cssH) return;

    const { W, H } = measure(state);
    const k = view.scale * dpr;
    const ox = Math.round(view.x * dpr);
    const oy = Math.round(view.y * dpr);
    const dw = W * k;
    const dh = H * k;

    // 그림자와 바탕 (화면 밖은 잘라서 그린다)
    const m = 64 * dpr;
    const sx0 = Math.max(ox, -m), sy0 = Math.max(oy, -m);
    const sx1 = Math.min(ox + dw, cw + m), sy1 = Math.min(oy + dh, ch + m);
    if (sx1 > sx0 && sy1 > sy0) {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 18, 30, 0.2)';
      ctx.shadowBlur = 18 * dpr;
      ctx.shadowOffsetY = 3 * dpr;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
      ctx.restore();
      if (state.bg === 'transparent') {
        const pat = getChecker();
        if (pat.setTransform) pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
        ctx.fillStyle = pat;
        ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, dw, dh);
    ctx.clip();
    ctx.setTransform(k, 0, 0, k, ox, oy);
    drawTemplate(ctx, state, {
      x0: -ox / k, y0: -oy / k,
      x1: (cw - ox) / k, y1: (ch - oy) / k,
    }, 1 / k);
    ctx.restore();
  }

  function onPreviewResize() {
    resizeViewCanvas();
    if (view.fit) fitView(); else clampView();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    render(); // 캔버스 크기를 바꾸면 내용이 지워지므로 바로 다시 그린다
  }

  // 드래그 이동 + 두 손가락 확대
  const pointers = new Map();
  let pinch = null;

  const localPoint = (e) => {
    const r = viewCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  viewCanvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    viewCanvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPoint(e));
    pinch = pointers.size === 2 ? pinchInfo() : null;
    viewCanvas.classList.add('is-dragging');
  });

  viewCanvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = localPoint(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      view.x += cur.x - prev.x;
      view.y += cur.y - prev.y;
      view.fit = false;
      clampView();
      requestRender();
    } else if (pointers.size === 2 && pinch) {
      const p = pinchInfo();
      view.x += p.x - pinch.x;
      view.y += p.y - pinch.y;
      zoomAt(p.dist / pinch.dist, p.x, p.y);
      pinch = p;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    pinch = pointers.size === 2 ? pinchInfo() : null;
    if (!pointers.size) viewCanvas.classList.remove('is-dragging');
  };
  viewCanvas.addEventListener('pointerup', endPointer);
  viewCanvas.addEventListener('pointercancel', endPointer);

  viewCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= cssH;
    dy = clamp(dy, -300, 300);
    const speed = e.ctrlKey ? 0.01 : 0.0015; // ctrlKey = 트랙패드 핀치
    const p = localPoint(e);
    zoomAt(Math.exp(-dy * speed), p.x, p.y);
  }, { passive: false });

  viewCanvas.addEventListener('dblclick', () => { fitView(); requestRender(); });

  $('#zoomIn').addEventListener('click', () => zoomAt(1.25, cssW / 2, cssH / 2));
  $('#zoomOut').addEventListener('click', () => zoomAt(0.8, cssW / 2, cssH / 2));
  $('#zoomFit').addEventListener('click', () => { fitView(); requestRender(); });
  $('#zoom100').addEventListener('click', () => zoomAt(1 / view.scale, cssW / 2, cssH / 2));

  new ResizeObserver(onPreviewResize).observe(previewEl);
  window.addEventListener('resize', onPreviewResize);

  // ---------------------------------------------------------------------------
  // 설정 패널
  // ---------------------------------------------------------------------------

  const form = $('#settings');
  const hexInput = (key) => form.querySelector(`[data-hex-for="${key}"]`);

  function writeForm() {
    for (const el of form.elements) {
      if (el.dataset.hexFor) { el.value = state[el.dataset.hexFor]; continue; }
      const k = el.name;
      if (!k || !(k in state)) continue;
      if (el.type === 'checkbox') el.checked = state[k];
      else if (el.type === 'radio') el.checked = el.value === state[k];
      else if (el.type === 'color') el.value = state[k].toLowerCase();
      else el.value = String(state[k]);
    }
  }

  function setHint(id, text, warn = false) {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle('is-warn', warn);
  }

  function sizeStatus(W, H) {
    if (W > MAX_SIDE || H > MAX_SIDE) {
      return {
        level: 'error',
        text: `캔버스 한 변은 최대 ${fmt(MAX_SIDE)}px까지 만들 수 있어요. 박스 크기·개수·간격을 줄여 주세요.`,
      };
    }
    if (W * H > MOBILE_SAFE_AREA) {
      return {
        level: 'warn',
        text: `큰 캔버스(${(W * H / 1e6).toFixed(1)}MP)예요. 저장에 몇 초 걸릴 수 있고, iPhone·iPad Safari에서는 저장되지 않을 수 있어요.`,
      };
    }
    return null;
  }

  function updateUI() {
    const s = state;
    const { W, H } = measure(s);
    const status = sizeStatus(W, H);
    const isError = status?.level === 'error';

    $('#totalSize').textContent = `${fmt(W)} × ${fmt(H)}`;
    $('.total').classList.toggle('is-error', isError);
    const notice = $('#notice');
    notice.hidden = !status;
    notice.textContent = status ? status.text : '';
    notice.classList.toggle('is-error', isError);
    $('#saveBtn').disabled = isError || busy;
    $('#shareBtn').disabled = busy;

    const name = cleanName(s.fileName);
    $('#nameHint').textContent = name ? `${name}.png로 저장돼요` : `비워 두면 ${DEFAULT_FILE_NAME}.png`;
    $('#clearName').hidden = !s.fileName;

    const count = s.cols * s.rows;
    $('#countMeta').textContent = `총 ${fmt(count)}칸`;
    $('#sizeBadge').innerHTML = `<b>${fmt(W)} × ${fmt(H)}</b> px · ${fmt(count)}칸`;

    for (const g of form.querySelectorAll('[data-toggle]')) {
      g.classList.toggle('is-off', !s[g.dataset.toggle]);
    }

    $('#customRow').hidden = s.bg !== 'custom';
    $('#customSwatch').style.background = s.bgCustom;

    for (const chip of form.querySelectorAll('[data-box]')) {
      const [w, h] = chip.dataset.box.split('x').map(Number);
      chip.classList.toggle('is-active', s.boxW === w && s.boxH === h);
    }
    for (const chip of form.querySelectorAll('[data-div]')) {
      const n = Number(chip.dataset.div);
      chip.classList.toggle('is-active', s.crossDivX === n && s.crossDivY === n);
    }

    // 테두리 안내
    const need = s.borderPos === 'outside' ? s.borderW : s.borderPos === 'center' ? s.borderW / 2 : 0;
    if (s.borderOn && need > s.pad) {
      setHint('#borderHint', `바깥 여백(${s.pad}px)이 박스 밖으로 나가는 테두리(${need}px)보다 작아 캔버스 가장자리에서 테두리가 잘려요.`, true);
    } else if (s.borderPos === 'inside') {
      setHint('#borderHint', '테두리가 박스 안쪽에 그려져 박스 크기가 그대로 유지돼요.');
    } else if (s.borderPos === 'center') {
      setHint('#borderHint', '테두리의 가운데가 박스 경계 위에 놓여요.');
    } else {
      setHint('#borderHint', '테두리가 박스 바깥에 그려져 박스 안쪽 전체를 그림에 쓸 수 있어요.');
    }

    // 톰보 안내
    if (s.gapX === 0 && s.gapY === 0 && s.pad === 0) {
      setHint('#tomboHint', '간격과 바깥 여백이 모두 0이라 톰보가 그려질 자리가 없어요.', true);
    } else if (s.pad < s.tomboOffset + Math.min(s.tomboLen, 4)) {
      setHint('#tomboHint', '바깥 여백이 좁아 캔버스 가장자리 쪽 톰보가 잘려요.', true);
    } else {
      setHint('#tomboHint', '박스 모서리 바깥, 간격과 바깥 여백에만 그려져 박스 안을 침범하지 않아요.');
    }

    // 여백선 안내
    const innerW = s.boxW - s.margin * 2;
    const innerH = s.boxH - s.margin * 2;
    if (innerW <= s.marginW * 2 || innerH <= s.marginW * 2) {
      setHint('#marginHint', '여백이 박스에 비해 너무 커서 여백선을 그릴 수 없어요.', true);
    } else {
      setHint('#marginHint', `여백을 뺀 그리기 영역 ${fmt(innerW)} × ${fmt(innerH)} px`);
    }

    // 등분선 안내
    if (s.crossDivX === 1 && s.crossDivY === 1) {
      setHint('#crossHint', '가로·세로 모두 1등분이라 그려지는 선이 없어요.', true);
    } else {
      const w = s.boxW / s.crossDivX;
      const h = s.boxH / s.crossDivY;
      const exact = Number.isInteger(w) && Number.isInteger(h);
      const f = (v) => (Number.isInteger(v) ? fmt(v) : v.toFixed(1));
      setHint('#crossHint', `한 칸 크기 ${exact ? '' : '약 '}${f(w)} × ${f(h)} px`);
    }
  }

  function changed() {
    updateUI();
    if (view.fit) fitView(); else clampView();
    requestRender();
    saveStateSoon();
  }

  form.addEventListener('input', (e) => {
    const el = e.target;
    const hexKey = el.dataset.hexFor;
    if (hexKey) {
      const v = parseHex(el.value);
      if (!v) return;
      state[hexKey] = v;
      form.elements[hexKey].value = v.toLowerCase();
      if (hexKey === 'bgCustom') state.bg = 'custom';
    } else {
      const k = el.name;
      if (!k || !(k in state)) return;
      if (el.type === 'checkbox') {
        state[k] = el.checked;
      } else if (el.type === 'radio') {
        if (!el.checked) return;
        state[k] = el.value;
      } else if (el.type === 'number') {
        const v = parseNum(el.value, NUM_LIMITS[k]);
        if (v === null) return;
        state[k] = v;
      } else if (el.type === 'color') {
        state[k] = el.value.toUpperCase();
        hexInput(k).value = state[k];
        if (k === 'bgCustom') state.bg = 'custom';
      } else {
        state[k] = el.value;
        if (k === 'fileName') { updateUI(); return; } // 그림에는 영향 없음
      }
    }
    if (state.bg === 'custom') form.querySelector('input[name="bg"][value="custom"]').checked = true;
    changed();
  });

  // 입력을 마치면 범위 밖 값이나 잘못된 값을 실제 적용된 값으로 정리한다
  function normalizeField(el) {
    if (el.dataset.hexFor) el.value = state[el.dataset.hexFor];
    else if (el.type === 'number' && el.name in state) el.value = String(state[el.name]);
    else if (el.name === 'fileName') {
      state.fileName = cleanName(el.value);
      el.value = state.fileName;
      updateUI();
    }
  }
  form.addEventListener('change', (e) => normalizeField(e.target));

  // Enter: 숫자 칸에서는 값만 정리하고, 파일 이름 칸에서는 저장한다
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const el = document.activeElement;
    if (el && form.contains(el)) normalizeField(el);
    if (el && el.name === 'fileName') savePNG();
  });

  for (const chip of form.querySelectorAll('[data-box]')) {
    chip.addEventListener('click', () => {
      const [w, h] = chip.dataset.box.split('x').map(Number);
      state.boxW = w;
      state.boxH = h;
      writeForm();
      changed();
    });
  }

  for (const chip of form.querySelectorAll('[data-div]')) {
    chip.addEventListener('click', () => {
      const n = Number(chip.dataset.div);
      state.crossDivX = n;
      state.crossDivY = n;
      state.crossOn = true;
      writeForm();
      changed();
    });
  }

  $('#swapBox').addEventListener('click', () => {
    [state.boxW, state.boxH] = [state.boxH, state.boxW];
    writeForm();
    changed();
  });

  $('#resetBtn').addEventListener('click', () => {
    state = { ...DEFAULTS };
    writeForm();
    view.fit = true;
    changed();
    showToast('기본값으로 되돌렸어요');
  });

  $('#clearName').addEventListener('click', () => {
    state.fileName = '';
    const input = form.elements.fileName;
    input.value = '';
    input.focus();
    updateUI();
  });

  // 다른 설정 링크를 같은 탭 주소창에 붙여 넣은 경우
  window.addEventListener('hashchange', () => {
    const shared = decodeSettings(location.hash);
    if (!shared) return;
    shared.fileName = state.fileName;
    state = shared;
    history.replaceState(null, '', location.pathname + location.search);
    writeForm();
    view.fit = true;
    changed();
    showToast('링크의 설정을 불러왔어요');
  });

  // ---------------------------------------------------------------------------
  // PNG 저장
  // ---------------------------------------------------------------------------

  let busy = false;

  // what: 'save' | 'share' — 어느 버튼에 진행 표시를 할지
  function setBusy(on, what) {
    busy = on;
    const btn = $('#saveBtn');
    btn.classList.toggle('is-busy', on && what === 'save');
    btn.querySelector('span').textContent = on && what === 'save' ? '만드는 중…' : 'PNG 저장';
    $('#shareBtn').classList.toggle('is-busy', on && what === 'share');
    updateUI();
  }

  const outputName = () => (cleanName(state.fileName) || DEFAULT_FILE_NAME) + '.png';

  // 원본 크기 PNG를 만든다. 실패하면 예외를 던진다
  async function renderPNG() {
    const { W, H } = measure(state);
    const canvas = document.createElement('canvas');
    try {
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없음');
      drawTemplate(ctx, state, null, 0);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG를 만들 수 없음');
      return blob;
    } finally {
      canvas.width = 0; // 큰 캔버스 메모리를 바로 돌려준다
      canvas.height = 0;
    }
  }

  const TOO_BIG_TEXT = '이 브라우저에서는 이 크기의 이미지를 만들 수 없어요. 크기를 줄이거나 PC의 Chrome·Edge·Firefox에서 시도해 주세요.';

  // 크기 한도를 넘었으면 안내하고 false
  function checkExportable() {
    const { W, H } = measure(state);
    const status = sizeStatus(W, H);
    if (status?.level === 'error') {
      showToast(status.text, true);
      return false;
    }
    return true;
  }

  // 버튼 상태가 화면에 먼저 반영되도록 한 프레임 쉰다 (탭이 가려져 프레임이 멈춰도 넘어가게 시간 제한을 둔다)
  const nextFrame = () => new Promise((r) => {
    requestAnimationFrame(() => setTimeout(r, 0));
    setTimeout(r, 100);
  });

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function savePNG() {
    if (busy || !checkExportable()) return;
    setBusy(true, 'save');
    await nextFrame();
    try {
      const blob = await renderPNG();
      const name = outputName();
      const { W, H } = measure(state);
      download(blob, name);
      showToast(`${name} 저장 완료 · ${fmt(W)} × ${fmt(H)} px`);
    } catch (err) {
      console.error(err);
      showToast(TOO_BIG_TEXT, true);
    } finally {
      setBusy(false);
    }
  }

  $('#saveBtn').addEventListener('click', savePNG);

  // ---------------------------------------------------------------------------
  // 공유 (서버 없이 기기 공유창·클립보드·메일 앱을 쓴다)
  // ---------------------------------------------------------------------------

  const shareBtn = $('#shareBtn');
  const shareMenu = $('#shareMenu');

  const canShareFiles = (() => {
    try {
      return !!navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
    } catch {
      return false;
    }
  })();
  $('#shareImageItem').hidden = !canShareFiles;
  $('#shareLinkItem').hidden = !navigator.share;

  function summaryText() {
    const s = state;
    const { W, H } = measure(s);
    return `${fmt(W)} × ${fmt(H)} px 템플릿 (박스 ${s.boxW}×${s.boxH}, ${s.cols}×${s.rows}칸)`;
  }

  function openShareMenu(open) {
    shareMenu.hidden = !open;
    shareBtn.setAttribute('aria-expanded', String(open));
    if (open) shareMenu.querySelector('button:not([hidden])')?.focus();
  }

  shareBtn.addEventListener('click', () => openShareMenu(shareMenu.hidden));

  document.addEventListener('pointerdown', (e) => {
    if (!shareMenu.hidden && !shareMenu.contains(e.target) && !shareBtn.contains(e.target)) openShareMenu(false);
  });

  shareMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      openShareMenu(false);
      shareBtn.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...shareMenu.querySelectorAll('button:not([hidden])')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });

  shareMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-share]');
    if (!item) return;
    openShareMenu(false);
    ({ image: shareImage, link: shareLink, copy: copyLink, mail: mailLink })[item.dataset.share]();
  });

  // 공유창은 클릭 직후에만 열 수 있어서, 큰 이미지를 만드느라 늦어지면 한 번 더 눌러야 한다.
  // 그때 다시 만들지 않도록 마지막 결과를 설정과 함께 기억해 둔다
  let prepared = null; // { key, file }

  async function shareImage() {
    if (busy) return;
    const key = JSON.stringify(state);
    let file = prepared?.key === key ? prepared.file : null;
    if (!file) {
      if (!checkExportable()) return;
      setBusy(true, 'share');
      await nextFrame();
      try {
        file = new File([await renderPNG()], outputName(), { type: 'image/png' });
        prepared = { key, file };
      } catch (err) {
        console.error(err);
        showToast(TOO_BIG_TEXT, true);
        return;
      } finally {
        setBusy(false);
      }
    }
    try {
      await navigator.share({ files: [file], title: SHARE_TITLE });
    } catch (err) {
      if (err.name === 'AbortError') return; // 사용자가 공유창을 닫음
      if (err.name === 'NotAllowedError') {
        showToast('이미지가 준비됐어요. 공유 → 이미지 공유를 한 번 더 눌러 주세요.');
        return;
      }
      console.error(err);
      showToast('공유하지 못했어요. PNG로 저장한 뒤 직접 보내 주세요.', true);
    }
  }

  async function shareLink() {
    try {
      await navigator.share({ title: SHARE_TITLE, text: summaryText(), url: shareUrl() });
    } catch (err) {
      if (err.name === 'AbortError') return;
      copyLink();
    }
  }

  async function copyLink() {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 클립보드 API를 못 쓰는 환경용
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) {
        window.prompt('아래 링크를 복사해 주세요', url);
        return;
      }
    }
    showToast('설정 링크를 복사했어요. 원하는 곳에 붙여 넣어 보내세요.');
  }

  function mailLink() {
    const body = `${summaryText()}\n아래 링크를 열면 같은 설정의 템플릿을 만들 수 있어요.\n\n${shareUrl()}`;
    location.href = `mailto:?subject=${encodeURIComponent(SHARE_TITLE)}&body=${encodeURIComponent(body)}`;
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const el = document.activeElement;
      if (el && form.contains(el)) normalizeField(el);
      savePNG();
    }
  });

  // ---------------------------------------------------------------------------
  // 토스트
  // ---------------------------------------------------------------------------

  let toastTimer = 0;
  function showToast(text, isError = false) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.toggle('is-error', isError);
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), isError ? 5000 : 2600);
  }

  // ---------------------------------------------------------------------------
  // 시작
  // ---------------------------------------------------------------------------

  writeForm();
  updateUI();
  onPreviewResize();
  if (openedFromLink) {
    saveStateSoon();
    showToast('공유받은 설정을 불러왔어요');
  }

  // 테스트·디버깅용 훅
  window.__template = { drawTemplate, measure, get state() { return state; } };
})();
