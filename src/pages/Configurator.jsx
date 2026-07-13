import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Copy, Check, AlertCircle, ImagePlus } from 'lucide-react';
import { getOrCreateRoom, publishSync, getOrCreateSigningKeys } from '../hooks/useRemoteSync';
import { version as APP_VERSION } from '../../package.json';

// Analyze a screenshot of the broadcast scene and pick a matching theme
const analyzeSceneImage = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let rSum = 0, gSum = 0, bSum = 0, lumSum = 0, satSum = 0;
    const hueBuckets = new Array(12).fill(0);
    const n = size * size;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      rSum += r; gSum += g; bSum += b;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lum = (max + min) / 510;
      lumSum += lum;
      const sat = max === 0 ? 0 : (max - min) / max;
      satSum += sat;
      if (sat > 0.15 && max - min > 10) {
        let h;
        if (max === r) h = ((g - b) / (max - min)) % 6;
        else if (max === g) h = (b - r) / (max - min) + 2;
        else h = (r - g) / (max - min) + 4;
        h = (h * 60 + 360) % 360;
        hueBuckets[Math.floor(h / 30)] += sat; // weight by saturation
      }
    }
    const lum = lumSum / n;
    const sat = satSum / n;
    const domBucket = hueBuckets.indexOf(Math.max(...hueBuckets));
    const domHue = domBucket * 30 + 15;
    const avg = `rgb(${Math.round(rSum / n)}, ${Math.round(gSum / n)}, ${Math.round(bSum / n)})`;
    URL.revokeObjectURL(img.src);
    resolve({ lum, sat, domHue, avg, width: img.naturalWidth, height: img.naturalHeight });
  };
  img.onerror = reject;
  img.src = URL.createObjectURL(file);
});

const pickThemeForScene = ({ lum, sat, domHue }) => {
  const pinkish = (domHue >= 300 || domHue < 20);
  const purple = domHue >= 240 && domHue < 300;
  const blue = domHue >= 190 && domHue < 240;
  if (lum > 0.62) return { theme: pinkish ? 'theme-amore-cute' : 'theme-pastel-light', reason: '밝은 화면' };
  if (lum > 0.42 && pinkish) return { theme: 'theme-amore-cute', reason: '화사한 핑크 톤' };
  if (sat > 0.28 && (pinkish || purple)) return { theme: 'theme-cyber-neon', reason: '네온 핑크·보라 톤' };
  if (purple || blue) return { theme: 'theme-eureka', reason: '어두운 남색·별밤 톤' };
  if (lum < 0.18) return { theme: 'theme-led-board', reason: '아주 어두운 화면' };
  return { theme: 'default', reason: '무난한 어두운 화면' };
};

const THEMES = [
  { value: 'theme-amore-cute', label: '아모레 핑크', bg: '#fff0f3', border: '2px dashed #ffb6c1', text: '#4e342e', up: '#e91e63' },
  { value: 'theme-pastel-light', label: '파스텔 라이트', bg: '#ffffff', border: '2px solid #e3d5e2', text: '#2b1a2e', up: '#d6336c' },
  { value: 'theme-eureka', label: '오로라 별밤', bg: '#0d162e', border: '1px solid #34e0a8', text: '#ffe9a8', up: '#ffd166' },
  { value: 'theme-cyber-neon', label: '네온 바', bg: '#14001f', border: '2px solid #ff2a85', text: '#ffffff', up: '#39ff14' },
  { value: 'theme-led-board', label: 'LED 전광판', bg: '#06090c', border: '1px solid #2a3947', text: '#ffb300', up: '#ff5252' },
  { value: 'default', label: '다크 글래스', bg: 'rgba(25,25,38,0.9)', border: '1px solid rgba(255,255,255,0.35)', text: '#f0f0f0', up: '#4ade80' },
];

const MODES = [
  { value: 'list', label: '리스트', desc: '전체 목록을 세로로' },
  { value: 'rotate', label: '로테이트', desc: '하나씩 돌아가며' },
  { value: 'scroll', label: '마퀴', desc: '전광판처럼 흘러요' },
];

const COLOR_STYLES = [
  { value: 'theme', label: '테마 기본' },
  { value: 'colors-red-blue', label: '빨강↑ 파랑↓' },
  { value: 'colors-green-red', label: '초록↑ 빨강↓' },
];

const FX_LEVELS = [
  { value: 'full', label: '전체' },
  { value: 'card', label: '약한 연출' },
  { value: 'off', label: '끄기' },
];

// Theme detail is deliberately separate from event effects. It changes only
// static card ornament, never price movement, particles, or widget dimensions.
const THEME_DETAILS = [
  { value: 'basic', label: '기본' },
  { value: 'rich', label: '디테일' },
];

// This controls card geometry only. It deliberately leaves Marquee alone:
// a one-line ticker has its own compact, fixed broadcast-safe proportions.
const CARD_SHAPES = [
  { value: 'box', label: '상자형' },
  { value: 'card', label: '카드형' },
];

const PREVIEW_BGS = [
  { value: 'dark', label: '어두운 방송', style: { background: 'linear-gradient(135deg, #1a1033 0%, #34175c 45%, #542b7a 100%)' } },
  { value: 'light', label: '밝은 화면', style: { background: 'linear-gradient(135deg, #fdf6fa 0%, #e8e0f5 100%)' } },
  {
    value: 'checker', label: '투명', style: {
      background: 'repeating-conic-gradient(#d7d7d7 0% 25%, #f4f4f4 0% 50%) 0 0 / 24px 24px',
    }
  },
];

const CONFIG_KEY = 'obs-widget-config-v2';
const PRESETS_KEY = 'obs-widget-presets';

// Raise this only when every browser's old configurator choices must be
// retired in favour of the current defaults. This deliberately affects only
// visual/configuration preferences — never quote recovery or remote-control
// identity data.
const SETTINGS_GENERATION = 1;

const defaultConfig = {
  symbolsInput: 'KORU, MUU, SNXX, SOXL',
  theme: 'theme-amore-cute',
  // New copied OBS URLs explicitly carry this. Parameter-less legacy URLs
  // remain basic, so an already-running broadcast cannot change unexpectedly.
  themeDetail: 'rich',
  // New copied URLs use the slightly wider card treatment. Existing URLs that
  // have no shape parameter retain the original, roomier box treatment.
  cardShape: 'card',
  displayMode: 'list',
  colorStyle: 'theme',

  interval: 10,
  opacity: 1,
  // Broadcast-safe default: retain large-move card colours, while keeping
  // routine ticks quiet. URLs without an fx parameter remain legacy Full.
  fx: 'card',
  eventFocus: true,
  speed: 1,
  demo: false,
  demoTrans: false,
  demoCross: false,
  demoTarget: false,
  demoSurge: false,
  remote: false, // cross-device relay is opt-in (currently disabled in UI)
  useTargets: false,
  targets: {},   // per-symbol target prices (empty = off)
  settingsGeneration: SETTINGS_GENERATION,
};

const loadConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));

    // A generation change is an intentional, one-time global settings reset.
    // Do not reset quote caches, room codes, or signing keys: they are runtime
    // continuity/security data rather than configurator preferences.
    if (saved?.settingsGeneration !== SETTINGS_GENERATION) {
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(PRESETS_KEY);
      return { ...defaultConfig, v: 3 };
    }

    const merged = { ...defaultConfig, ...saved };
    // Opacity default history: 1 → 0.95 (v2) → 1 (v3). Now that each dark theme's
    // base --bg-a is raised for readability, 100% is the sensible default. v2
    // force-stamped 0.95 on everyone, so move those holdovers back to 1 — but keep
    // any value the user picked themselves (≠ the stamped 0.95). New users get 1
    // straight from defaultConfig.
    if (saved && saved.v === 2 && saved.opacity === 0.95) merged.opacity = 1;
    // v1.0.22 folds the former Strong option into Weak. Preserve the closest
    // visual intent for all older saved configurations.
    if (merged.fx === 'calm') merged.fx = 'card';
    if (merged.fx === 'soft' || merged.fx === 'event') merged.fx = 'card';
    if (!['basic', 'rich'].includes(merged.themeDetail)) merged.themeDetail = 'rich';
    if (!['box', 'card'].includes(merged.cardShape)) merged.cardShape = 'card';
    merged.v = 3;
    merged.settingsGeneration = SETTINGS_GENERATION;
    merged.demo = false; // Always force demo off on initial load
    
    // 목표가는 방송(세션)마다 초기화되어야 하는 데이터이므로 부팅 시 삭제
    if (merged.targets && Object.keys(merged.targets).length > 0) {
      merged.targets = {};
      merged._targetsWiped = true; // 알림용 플래그
    }
    
    return merged;
  } catch {
    return { ...defaultConfig, v: 3, demo: false };
  }
};

const recommendedDims = (mode, count) => {
  // Marquee: full canvas width so OBS never has to upscale it
  // (upscaling magnifies per-frame movement and looks choppy)
  if (mode === 'scroll') return { w: 1920, h: 100 };
  if (mode === 'rotate') return { w: 300, h: 200 };
  return { w: 300, h: Math.max(1, count) * 165 };
};

const recommendedSize = (mode, count) => {
  const { w, h } = recommendedDims(mode, count);
  return `너비 ${w} × 높이 ${h}`;
};

const Configurator = () => {
  const [config, setConfig] = useState(loadConfig);
  const [room] = useState(() => getOrCreateRoom());
  const [signingKeys, setSigningKeys] = useState(null);
  const previewThemeAccent = (THEMES.find(t => t.value === config.theme) || {}).up || '#ffb6c1';

  // Key pair exists only in this browser; created lazily
  useEffect(() => {
    if (!signingKeys) {
      getOrCreateSigningKeys().then(setSigningKeys).catch(() => {});
    }
  }, [signingKeys]);
  const [copied, setCopied] = useState(false);
  const [previewBg, setPreviewBg] = useState('dark');
  const [justApplied, setJustApplied] = useState(false);
  const [fxPreviewNonce, setFxPreviewNonce] = useState(0);
  const [matchResult, setMatchResult] = useState(null);

  const [sceneImage, setSceneImage] = useState(null);
  const [sceneDims, setSceneDims] = useState(null);
  const [customDims, setCustomDims] = useState(null);
  const [widgetPos, setWidgetPos] = useState({ x: 0.02, y: 0.03 }); // preview-only, never in the URL
  const [sceneBoxW, setSceneBoxW] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [matchedTheme, setMatchedTheme] = useState(null); // ping the auto-picked swatch
  const [placeHint, setPlaceHint] = useState(false);      // one-time "you can drag me" pulse
  const [guides, setGuides] = useState({ v: false, h: false });
  const fileInputRef = useRef(null);
  const sceneBoxRef = useRef(null);
  const previewFrameRef = useRef(null);
  const previewWrapperRef = useRef(null);
  const previewBoxRef = useRef(null);
  const [previewAvailableHeight, setPreviewAvailableHeight] = useState(0);
  const [previewContentWidth, setPreviewContentWidth] = useState(332);
  // The iframe applies a mode after it receives the preview message. Keep its
  // parent viewport on the last rendered mode until that commit is confirmed,
  // otherwise a List can briefly overflow a newly-small Rotate/Marquee frame.
  const [previewViewportMode, setPreviewViewportMode] = useState(() => config.displayMode);
  const pendingPreviewModeRef = useRef(null);

  const [showWipeToast, setShowWipeToast] = useState(false);

  // A preset can change the display mode without using the selector below.
  // Run before normal effects so the next postMessage acknowledgement is
  // always checked against the most recently requested viewport mode.
  useLayoutEffect(() => {
    if (config.displayMode === previewViewportMode) {
      pendingPreviewModeRef.current = null;
      return;
    }
    pendingPreviewModeRef.current = config.displayMode;
  }, [config.displayMode, previewViewportMode]);

  // 목표가 초기화 알림 표시
  useEffect(() => {
    if (config._targetsWiped) {
      setShowWipeToast(true);
      setTimeout(() => setShowWipeToast(false), 4000);
      setConfig(c => {
        const newC = { ...c };
        delete newC._targetsWiped;
        return newC;
      });
    }
  }, [config._targetsWiped]);

  const handleSceneImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setAnalyzing(true);
    try {
      const stats = await analyzeSceneImage(file);
      const pick = pickThemeForScene(stats);
      setConfig(prev => ({ ...prev, theme: pick.theme }));
      setMatchResult({ ...pick, avg: stats.avg, label: THEMES.find(t => t.value === pick.theme)?.label });
      // Ping the swatch that was auto-picked so the cause is visible
      setMatchedTheme(pick.theme);
      setTimeout(() => setMatchedTheme(null), 2600);
      // Use the screenshot itself as the preview backdrop
      const url = URL.createObjectURL(file);
      setSceneImage(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setSceneDims({ w: stats.width, h: stats.height });
      setPreviewBg('scene');
      setPlaceHint(true);
      setTimeout(() => setPlaceHint(false), 2600);
    } catch {
      setMatchResult({ error: true });
    } finally {
      setAnalyzing(false);
    }
  };

  const clearScene = () => {
    if (sceneImage) URL.revokeObjectURL(sceneImage);
    setSceneImage(null);
    setSceneDims(null);
    setMatchResult(null);
    setCustomDims(null);
    if (previewBg === 'scene') setPreviewBg('dark');
  };

  const sceneMode = previewBg === 'scene' && sceneImage && sceneDims;

  // Keep the placement math in sync with the rendered scene box width
  useEffect(() => {
    const measure = () => setSceneBoxW(sceneBoxRef.current?.offsetWidth || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [sceneMode]);

  const startWidgetDrag = (e, frac) => {
    e.preventDefault();
    const box = sceneBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const start = { px: e.clientX, py: e.clientY, x: widgetPos.x, y: widgetPos.y };
    const move = (ev) => {
      let nx = start.x + (ev.clientX - start.px) / box.width;
      let ny = start.y + (ev.clientY - start.py) / box.height;
      // Soft snap to the scene center with visible guide lines
      const v = Math.abs(nx + frac.w / 2 - 0.5) < 0.015;
      const h = Math.abs(ny + frac.h / 2 - 0.5) < 0.015;
      if (v) nx = 0.5 - frac.w / 2;
      if (h) ny = 0.5 - frac.h / 2;
      setGuides({ v, h });
      setWidgetPos({
        x: Math.min(Math.max(nx, -frac.w + 0.05), 0.95),
        y: Math.min(Math.max(ny, -frac.h + 0.05), 0.95),
      });
    };
    const up = () => {
      setGuides({ v: false, h: false });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startWidgetResize = (e, baseW, baseH, k) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { px: e.clientX, py: e.clientY, w: baseW, h: baseH };
    const move = (ev) => {
      const dw = (ev.clientX - start.px) / k;
      const dh = (ev.clientY - start.py) / k;
      setCustomDims({
        w: Math.max(100, start.w + dw),
        h: Math.max(50, start.h + dh),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Paste a screenshot anywhere on the page (Ctrl+V)
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        handleSceneImage(item.getAsFile());
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const set = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));
  const setFx = (fx) => {
    set('fx', fx);
    setFxPreviewNonce(fx === 'off' ? 0 : Date.now());
  };

  // Widget caps symbols at 10 (Finnhub free-tier rate limit); mirror that here.
  const MAX_SYMBOLS = 10;
  // The configurator is a quick visual check, not a second OBS canvas. Keep
  // it compact even when the real widget carries more registered symbols.
  const MAX_PREVIEW_SYMBOLS = 5;
  const symbolList = useMemo(
    () => config.symbolsInput.split(',').map(s => s.trim()).filter(s => s).slice(0, MAX_SYMBOLS),
    [config.symbolsInput]
  );
  const symbolOverflow = useMemo(
    () => config.symbolsInput.split(',').map(s => s.trim()).filter(s => s).length > MAX_SYMBOLS,
    [config.symbolsInput]
  );

  // The frame measures its usable inner width, not its nominal CSS width.
  // This leaves room for a classic (non-overlay) vertical scrollbar and keeps
  // the embedded card from ever creating a horizontal scrollbar.
  useEffect(() => {
    const measure = () => {
      const wrapper = previewWrapperRef.current;
      const box = previewBoxRef.current;
      const width = box?.clientWidth || Math.max(0, (wrapper?.clientWidth || 340) - 8);
      setPreviewContentWidth(prev => prev === width ? prev : width);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (previewWrapperRef.current) observer.observe(previewWrapperRef.current);
    if (previewBoxRef.current) observer.observe(previewBoxRef.current);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sceneMode, previewViewportMode, symbolList.length]);

  // The compact five-card preview is a normal list size, not an overflow case.
  // Fit it only in the desktop sticky layout. In the narrow stacked layout,
  // measuring against the scroll position makes the preview grow while the
  // user scrolls down to it, pushing its own bottom away like a treadmill.
  // The copied OBS size stays exact in either layout.
  useEffect(() => {
    if (sceneMode || previewViewportMode !== 'list') {
      setPreviewAvailableHeight(0);
      return undefined;
    }
    const measure = () => {
      if (window.matchMedia('(max-width: 800px)').matches) {
        setPreviewAvailableHeight(prev => prev === 0 ? prev : 0);
        return;
      }
      const wrapper = previewWrapperRef.current;
      const box = previewBoxRef.current;
      if (!wrapper || !box) return;
      // The sticky preview reserves a 20px gutter at the bottom
      // (top: 20px + max-height: 100vh - 40px). Include that same gutter in
      // the fit calculation; otherwise a five-card preview can overrun the
      // panel by a few pixels and create a needless vertical scrollbar.
      // getBoundingClientRect is deliberate: the sticky preview can move as
      // the settings panel scrolls, while offsetTop cannot describe its
      // visible position.
      const available = Math.max(0, window.innerHeight - 20 - box.getBoundingClientRect().top - 42);
      setPreviewAvailableHeight(prev => prev === available ? prev : available);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (previewWrapperRef.current) observer.observe(previewWrapperRef.current);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sceneMode, previewViewportMode, symbolList.length, previewContentWidth, previewBg, sceneImage, matchResult]);

  // Only the free-text symbols field is debounced (for URL/preview): typing
  // "AAPL" one letter at a time must not make the preview widget subscribe to
  // garbage tickers each keystroke. Discrete controls (theme, mode, opacity,
  // fx) are NOT debounced — they flow into widgetUrl and the iframe instantly.
  const [dbSymbolsInput, setDbSymbolsInput] = useState(config.symbolsInput);
  useEffect(() => {
    const t = setTimeout(() => setDbSymbolsInput(config.symbolsInput), 400);
    return () => clearTimeout(t);
  }, [config.symbolsInput]);
  const urlSymbolList = useMemo(
    () => dbSymbolsInput.split(',').map(s => s.trim()).filter(s => s).slice(0, MAX_SYMBOLS),
    [dbSymbolsInput]
  );
  const previewSymbolList = useMemo(
    () => urlSymbolList.slice(0, MAX_PREVIEW_SYMBOLS),
    [urlSymbolList]
  );
  const previewSymbolCount = Math.min(symbolList.length, MAX_PREVIEW_SYMBOLS);

  const widgetUrl = useMemo(() => {
    // GitHub Pages caches index.html for up to ten minutes. Put the build
    // version before the hash so every newly copied OBS URL fetches the
    // matching asset manifest instead of a previous deployment's bundle.
    const baseUrl = window.location.href.split('#')[0];
    const params = new URLSearchParams();
    params.set('symbols', urlSymbolList.join(','));
    if (config.theme !== 'default') params.set('theme', config.theme);
    if (config.themeDetail === 'rich') params.set('detail', 'rich');
    if (config.cardShape === 'card') params.set('shape', 'card');
    if (config.displayMode !== 'list') params.set('mode', config.displayMode);
    if (config.colorStyle !== 'theme') params.set('colors', config.colorStyle);

    if (config.displayMode === 'rotate' && config.interval !== 10) params.set('interval', config.interval);
    if (config.displayMode === 'rotate' && config.eventFocus === false) params.set('event_focus', '0');
    if (config.displayMode === 'scroll' && config.speed !== 1) params.set('speed', config.speed);
    if (config.opacity !== 1) params.set('opacity', config.opacity);
    // Preserve the old no-param URL as Full for existing OBS sources. New
    // non-Full configurations explicitly carry their selected `fx` value.
    if (config.fx !== 'full') params.set('fx', config.fx);
    if (config.demo) params.set('demo', '1');
    if (config.demoTrans) params.set('demo_transition', '1');
    if (config.demoCross) params.set('demo_cross', '1');
    if (config.demoTarget) params.set('demo_target', '1');
    if (config.demoSurge) params.set('demo_surge', '1');
    const targetPairs = urlSymbolList
      .map(s => [s.toUpperCase(), parseFloat(config.targets?.[s])])
      .filter(([, v]) => Number.isFinite(v) && v > 0);
    if (targetPairs.length) params.set('targets', targetPairs.map(([s, v]) => `${s}:${v}`).join(','));
    // Relay params always included: room = channel, k = this browser's
    // public key. The widget only accepts changes signed by the matching
    // private key, which never leaves this browser.
    if (signingKeys) {
      params.set('room', room);
      params.set('k', signingKeys.publicKeyB64);
    }
    return `${baseUrl}#/widget?${params.toString()}`;
  }, [config, urlSymbolList, room, signingKeys]);

  // The preview URL carries only data-source inputs. Every visual setting is
  // delivered below as a same-origin message, so a theme/effect/layout change
  // never tears down the iframe's current quote state or WebSocket.
  const previewWidgetUrl = useMemo(() => {
    const [baseUrl, hash = ''] = widgetUrl.split('#');
    const [route, query = ''] = hash.split('?');
    const source = new URLSearchParams(query);
    const params = new URLSearchParams();
    // A configurator preview stays intentionally compact. The copied OBS URL
    // above still contains every registered symbol (up to MAX_SYMBOLS).
    params.set('symbols', previewSymbolList.join(','));
    params.set('preview', '1');
    for (const key of ['demo', 'demo_transition', 'demo_cross', 'demo_target', 'demo_surge']) {
      if (source.has(key)) params.set(key, source.get(key));
    }
    const dataSourceQuery = params.toString();
    return `${baseUrl}#${route}${dataSourceQuery ? `?${dataSourceQuery}` : ''}`;
  }, [widgetUrl, previewSymbolList]);

  const previewControl = useMemo(() => {
    const targets = {};
    for (const [symbol, value] of Object.entries(config.targets || {})) {
      const price = parseFloat(value);
      if (Number.isFinite(price) && price > 0) targets[symbol.toUpperCase()] = price;
    }
    return {
      theme: config.theme !== 'default' ? config.theme : '',
      detail: config.themeDetail === 'rich' ? 'rich' : 'basic',
      shape: config.cardShape === 'card' ? 'card' : 'box',
      colors: config.colorStyle !== 'theme' ? config.colorStyle : '',
      mode: config.displayMode,
      interval: config.interval,
      eventFocus: config.eventFocus !== false,
      speed: config.speed,
      opacity: config.opacity,
      fx: config.fx,
      targets,
      previewToken: fxPreviewNonce ? String(fxPreviewNonce) : '',
    };
  }, [config, fxPreviewNonce]);

  const postPreviewControl = (targetWindow = previewFrameRef.current?.contentWindow) => {
    if (!targetWindow) return;
    targetWindow.postMessage({
      type: 'RETTOSTOCK_PREVIEW_CONFIG',
      ...previewControl,
    }, window.location.origin);
  };

  // Any visual control updates in place. The only preview reload is a real
  // data-source change (symbols or demo mode), which uses a different URL.
  useEffect(() => {
    postPreviewControl();
  }, [previewControl]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastTargetsRef = useRef(null);

  // Persist settings + push to widget (same-browser channels + ntfy relay)
  useEffect(() => {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* ignore */ }

    // Only publish if the 'targets' query parameter actually changed.
    // The widget ONLY syncs targets dynamically; syncing themes/styles
    // wastes ntfy.sh rate limits and is disabled by design.
    const urlObj = new URL(widgetUrl);
    const params = new URLSearchParams(urlObj.hash.split('?')[1] || '');
    const currentTargets = params.get('targets') || '';

    if (currentTargets !== lastTargetsRef.current) {
      publishSync({ url: widgetUrl, timestamp: Date.now() }, room, signingKeys?.privateKey);
      lastTargetsRef.current = currentTargets;
    }

    setJustApplied(true);
    setCustomDims(null); // Reset custom dims when config changes significantly
    const t = setTimeout(() => setJustApplied(false), 1500);

    return () => clearTimeout(t);
  }, [widgetUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for 'TARGET_REACHED' feedback from the preview iframe so we can auto-clear the input
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'RETTOSTOCK_PREVIEW_READY') {
        postPreviewControl(e.source);
        return;
      }
      if (e.data?.type === 'RETTOSTOCK_PREVIEW_APPLIED') {
        const mode = e.data.mode;
        // Ignore acknowledgements for an earlier rapid click. The visible
        // frame changes only once the current iframe has committed that mode.
        if (mode === pendingPreviewModeRef.current) {
          setPreviewViewportMode(mode);
        }
        return;
      }
      if (e.data?.type === 'TARGET_REACHED' && e.data?.symbol) {
        setConfig(prev => {
          if (!prev.targets || !prev.targets[e.data.symbol]) return prev;
          const newTargets = { ...prev.targets };
          delete newTargets[e.data.symbol];
          return { ...prev, targets: newTargets };
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [previewControl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };



  const removeSymbol = (target) => {
    set('symbolsInput', symbolList.filter(s => s !== target).join(', '));
  };

  const setDisplayMode = (mode) => {
    if (mode === config.displayMode) return;
    pendingPreviewModeRef.current = mode;
    set('displayMode', mode);
  };

  // Presets: save the whole current config under a name, switch with one click
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || []; } catch { return []; }
  });
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activeTargetSymbol, setActiveTargetSymbol] = useState(null);

  // Click outside or press ESC to deselect active target symbol
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.jirai-tag')) {
        setActiveTargetSymbol(null);
      }
    };
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveTargetSymbol(null);
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const persistPresets = (next) => {
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const savePreset = () => {
    const name = presetName.trim() || `프리셋 ${presets.length + 1}`;
    // 프리셋 저장 시 목표가(targets)·초기화 플래그는 제외 (의도적 폐기)
    const { targets: _targets, _targetsWiped, ...configToSave } = config;
    persistPresets([...presets.filter(p => p.name !== name), { name, config: configToSave }]);
    setNamingPreset(false);
    setPresetName('');
  };
  const applyPreset = (p) => setConfig({
    ...defaultConfig,
    ...p.config,
    v: 3,
    settingsGeneration: SETTINGS_GENERATION,
  });
  const deletePreset = (name) => persistPresets(presets.filter(p => p.name !== name));

  return (
    <div className="config-bg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' }}>
      <div className={`jirai-container config-layout ${sceneMode ? 'scene-expanded' : ''}`}>

        {/* Full-width app header */}
        <div className="app-header">
          <span className="app-title">
            🍸 💝
            레또스톡 위젯 리모컨
          </span>
          <span className={`header-status ${justApplied ? 'active' : ''}`}>
            {justApplied ? '✓ 주소 갱신됨 · 다시 복사해 붙여넣기' : '● OBS에 붙여넣을 준비 완료'}
          </span>
        </div>

        {showWipeToast && (
          <div className="wipe-toast" role="status">
            🎯 목표가는 방송마다 초기화돼요 — 이번에 저장돼 있던 목표가를 비웠어요.
          </div>
        )}

        <div className="config-columns">

        {/* Left Sidebar: Controls */}
        <div className="config-sidebar">

          {/* 1. Symbols */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#4e342e' }}>🎀 등록할 종목 티커</label>
            <p style={{ fontSize: '14px', color: '#8d6e63', marginBottom: '12px' }}>
              쉼표(,)로 구분해서 입력해 주세요. (예: AAPL, TSLA, NVDA)
            </p>
            <input
              type="text"
              className="jirai-input"
              value={config.symbolsInput}
              onChange={(e) => set('symbolsInput', e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {symbolOverflow && (
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#e0797f' }}>
                ⚠️ 종목은 최대 {MAX_SYMBOLS}개까지만 표시돼요 (안정적인 실시간 갱신을 위해).
              </p>
            )}
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {symbolList.map((s) => {
                const hasTarget = config.targets?.[s] !== undefined && config.targets?.[s] !== '';
                const isExpanded = config.useTargets && (activeTargetSymbol === s || hasTarget);
                return (
                  <div 
                    key={s} 
                    className="jirai-tag" 
                    style={{ 
                      paddingRight: isExpanded ? '6px' : undefined,
                      cursor: config.useTargets ? 'pointer' : 'default',
                      border: (config.useTargets && activeTargetSymbol === s) ? '2px solid rgba(255,105,180,0.5)' : undefined 
                    }}
                    onClick={() => {
                      if (config.useTargets) {
                        setActiveTargetSymbol((activeTargetSymbol === s) ? null : s);
                      }
                    }}
                  >
                    {s}
                    {isExpanded && (
                      <span 
                        style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', background: 'rgba(255,255,255,0.3)', padding: '4px 6px', borderRadius: '6px' }}
                        onClick={e => e.stopPropagation()} // Prevent toggling when clicking input
                      >
                        🎯
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="no-spin-button"
                          style={{ width: '75px', background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', color: '#333', fontSize: '14px', marginLeft: '4px', outline: 'none', padding: '2px 6px', fontFamily: 'inherit' }}
                          placeholder="목표가"
                          value={config.targets?.[s] ?? ''}
                          onChange={e => set('targets', { ...(config.targets || {}), [s]: e.target.value })}
                          onFocus={e => { e.target.dataset.initialValue = config.targets?.[s] ?? ''; }}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              set('targets', { ...(config.targets || {}), [s]: e.target.dataset.initialValue });
                              setActiveTargetSymbol(null);
                              e.target.blur();
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (e.target.value === '0') {
                                set('targets', { ...(config.targets || {}), [s]: '' });
                              }
                              setActiveTargetSymbol(null);
                              e.target.blur();
                            }
                          }}
                        />
                      </span>
                    )}
                    {isExpanded && <span style={{ borderLeft: '1px solid rgba(0,0,0,0.1)', height: '16px', marginLeft: '6px' }} />}
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeSymbol(s); }} 
                      title={`${s} 종목 삭제`}
                      aria-label={`${s} 제거`} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1, marginLeft: isExpanded ? '6px' : '8px', marginRight: isExpanded ? '4px' : '0' }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Theme swatches */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>💖 테마</label>
            <div className="theme-grid">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  className={`theme-swatch ${config.theme === t.value ? 'selected' : ''} ${matchedTheme === t.value ? 'matched' : ''}`}
                  onClick={() => set('theme', t.value)}
                >
                  <span
                    className="swatch-preview"
                    style={{ background: t.bg, border: t.border, borderRadius: t.radius ?? '10px' }}
                  >
                    <span style={{ color: t.text }}>$123</span>
                    <span style={{ color: t.up }}>+4.5%</span>
                  </span>
                  <span className="swatch-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Display mode */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>✨ 디스플레이 모드</label>
            <div className="segmented">
              {MODES.map(m => (
                <button
                  key={m.value}
                  className={`segment ${config.displayMode === m.value ? 'selected' : ''}`}
                  onClick={() => setDisplayMode(m.value)}
                >
                  <span>{m.label}</span>
                  <small>{m.desc}</small>
                </button>
              ))}
            </div>
          </div>

          {/* 4. OBS guide — keep it to 4 copy-paste steps */}
          <div className="jirai-card" style={{ background: '#fff', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#ffb6c1' }}>
              <AlertCircle size={18} />
              <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#4e342e' }}>OBS 사용 방법 ♡</span>
            </div>
            <ol style={{ fontSize: '14px', color: '#6d4c41', margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>아래의 <b>위젯 URL</b>을 복사해 주세요.</li>
              <li>OBS에서 <b>브라우저(Browser) 소스</b>를 추가합니다.</li>
              <li>복사한 주소를 URL 칸에 붙여넣기 합니다.</li>
              <li>크기는 <b>{recommendedSize(config.displayMode, symbolList.length)}</b>로 맞추면 끝!</li>
            </ol>
            {config.displayMode === 'scroll' ? (
              <p style={{ fontSize: '13px', color: '#8d6e63', margin: '10px 0 0', lineHeight: 1.6 }}>
                💡 흐름이 뚝뚝 끊겨 보이면: 소스를 늘려서 키우지 말고 처음부터 위 크기로 만들어 주세요.
                그래도 끊기면 브라우저 소스 속성에서 <b>사용자 지정 프레임 속도</b>를 체크하고 <b>60</b>으로 설정하면 부드러워져요.
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: '#8d6e63', margin: '10px 0 0', lineHeight: 1.6 }}>
                💡 더 크게 쓰고 싶으면 소스를 마우스로 잡아 늘리지 말고, 위 크기의 <b>가로·세로 값을 같은 배율로 키워서</b> 만드세요
                (예: 1.5배 = 450×{Math.round(recommendedDims(config.displayMode, symbolList.length).h * 1.5)}). 어떤 크기든 또렷하게 나옵니다.
              </p>
            )}
          </div>

          {/* 5. Widget URL */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>OBS 위젯 주소</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                className="jirai-input"
                value={widgetUrl.replace(/room=[^&]+/, 'room=●●●●')}
                title="복사 버튼을 누르면 실제 주소가 복사돼요"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button onClick={handleCopy} className="jirai-button" style={{ minWidth: '100px' }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
            <p className={`sync-status ${justApplied ? 'active' : ''}`}>
              {justApplied
                ? '✓ 설정이 반영된 주소예요 — 다시 복사해 OBS에 붙여넣으세요'
                : '● 설정을 바꾸면 위젯 주소를 다시 복사해 OBS에 붙여넣으세요'}
            </p>
          </div>

          {/* 6. Presets: one-click switching between saved setups */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>📁 프리셋</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {presets.map(p => (
                <div key={p.name} className="jirai-tag">
                  <button
                    onClick={() => applyPreset(p)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
                  >{p.name}</button>
                  <button
                    onClick={() => deletePreset(p.name)}
                    aria-label={`${p.name} 삭제`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}
                  >✕</button>
                </div>
              ))}
              {!namingPreset ? (
                <button
                  className="jirai-button jirai-button-outline"
                  style={{ padding: '6px 12px', fontSize: '13px' }}
                  onClick={() => setNamingPreset(true)}
                >+ 현재 구성 저장</button>
              ) : (
                <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    className="jirai-input"
                    style={{ padding: '6px 10px', width: '140px', fontSize: '13px' }}
                    autoFocus
                    placeholder={`프리셋 ${presets.length + 1}`}
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') savePreset();
                      if (e.key === 'Escape') { setNamingPreset(false); setPresetName(''); }
                    }}
                  />
                  <button className="jirai-button" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={savePreset}>저장</button>
                </span>
              )}
            </div>
            {presets.length === 0 && !namingPreset && (
              <p style={{ fontSize: '13px', color: '#b5a39c', margin: '8px 0 0' }}>
                지금 구성(종목·테마·모드·옵션)을 통째로 저장해두고, 방송 중 딸깍 한 번으로 갈아탈 수 있어요.
              </p>
            )}
          </div>

          {/* 7. Advanced settings, collapsed by default */}
          <details className="jirai-card advanced-panel">
            <summary>⚙️ 고급 설정</summary>

            <div className="advanced-row">
              <label>🎨 상승/하락 색상 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(색 조합)</span></label>
              <div className="segmented small">
                {COLOR_STYLES.map(c => (
                  <button
                    key={c.value}
                    className={`segment ${config.colorStyle === c.value ? 'selected' : ''}`}
                    onClick={() => set('colorStyle', c.value)}
                  >{c.label}</button>
                ))}
              </div>
            </div>

            <div className="advanced-row">
              <label>✨ 테마 디테일 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(테마별 카드 배경 장식)</span></label>
              <div className="segmented small">
                {THEME_DETAILS.map(detail => (
                  <button
                    key={detail.value}
                    className={`segment ${config.themeDetail === detail.value ? 'selected' : ''}`}
                    onClick={() => set('themeDetail', detail.value)}
                    aria-pressed={config.themeDetail === detail.value}
                  >{detail.label}</button>
                ))}
              </div>
            </div>

            {config.displayMode !== 'scroll' && (
              <div className="advanced-row">
                <label>▭ 카드 비율</label>
                <div className="segmented small">
                  {CARD_SHAPES.map(shape => (
                    <button
                      key={shape.value}
                      className={`segment ${config.cardShape === shape.value ? 'selected' : ''}`}
                      onClick={() => set('cardShape', shape.value)}
                      aria-pressed={config.cardShape === shape.value}
                    >{shape.label}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="advanced-row">
              <label>💥 이벤트 이펙트 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(선택 시 미리보기에서 3초 자동 재생)</span></label>
              <div className="segmented small">
                {FX_LEVELS.map(f => (
                  <button
                    key={f.value}
                    className={`segment ${config.fx === f.value ? 'selected' : ''}`}
                    onClick={() => setFx(f.value)}
                    aria-pressed={config.fx === f.value}
                  >{f.label}</button>
                ))}
              </div>
            </div>



            {config.displayMode === 'rotate' && (
              <>
                <div className="advanced-row">
                  <label>⏱️ 종목 전환 간격 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(한 카드가 머무는 시간)</span> <b>{config.interval}초</b></label>
                  <input type="range" min="3" max="60" step="1" value={config.interval}
                    onChange={e => set('interval', parseInt(e.target.value, 10))} />
                </div>
                <div className="advanced-row">
                  <label className="demo-toggle">
                    <input type="checkbox" checked={config.eventFocus !== false} onChange={e => set('eventFocus', e.target.checked)} />
                    ⚡ 이벤트 포커스 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(로테이트에서 이벤트 발생 시 즉시 카드 전환)</span>
                  </label>
                </div>
              </>
            )}

            {config.displayMode === 'scroll' && (
              <div className="advanced-row">
                <label>🎢 마퀴 속도 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(한 바퀴 이동 속도)</span> <b>{Number(config.speed).toFixed(2)}×</b></label>
                <input type="range" min="0.5" max="2" step="0.05" value={config.speed}
                  onChange={e => set('speed', parseFloat(e.target.value))} />
              </div>
            )}

            <div className="advanced-row">
              <label>🫧 카드 불투명도 <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(배경 비침 정도)</span> <b>{Math.round(config.opacity * 100)}%</b></label>
              <input type="range" min="0.2" max="1" step="0.05" value={config.opacity}
                onChange={e => set('opacity', parseFloat(e.target.value))} />
            </div>

            <div className="advanced-row">
              <label className="demo-toggle">
                <input type="checkbox" checked={config.useTargets} onChange={e => {
                  set('useTargets', e.target.checked);
                  if (!e.target.checked) setActiveTargetSymbol(null);
                }} />
                🎯 목표가 알림 사용하기 (체크 후 맨 위 1번 항목에서 종목 태그를 클릭하세요)
              </label>
              {config.useTargets && (
                <ul style={{ fontSize: '13px', color: '#8d6e63', margin: '8px 0 0 24px', paddingLeft: '16px', lineHeight: 1.6 }}>
                  <li><b>Enter</b>: 입력 완료</li>
                  <li><b>ESC</b>: 입력 취소 (원래 숫자로 복구)</li>
                  <li><b>0 입력 후 Enter</b>: 목표가 해제</li>
                </ul>
              )}
            </div>

            <div className="advanced-row">
              <label className="demo-toggle" style={{ color: '#9e9e9e' }}>
                <input type="checkbox" checked={config.demo} onChange={e => set('demo', e.target.checked)} />
                🛠️ 개발자 전용 데모 모드 (가짜 시세 주입)
              </label>
              <p style={{ fontSize: '12px', color: '#e57373', margin: '2px 0 0 24px', fontWeight: 'bold' }}>
                ⛔ 라이브 방송 중에는 누르지 마세요
              </p>
              {config.demo && (
                <div style={{ paddingLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p style={{ fontSize: '13px', color: '#d84315', margin: '0 0 4px 0', lineHeight: 1.6, fontWeight: 'bold' }}>
                    ⚠️ 경고: 현재 가짜 데이터가 흐르고 있습니다. 실시간 연결 중이라면 OBS 방송에도 가짜 시세가 송출되니 주의하세요!
                  </p>
                  <label className="demo-toggle" style={{ fontSize: '0.9em', color: '#ddd' }}>
                    <input type="checkbox" checked={config.demoTrans || false} onChange={e => set('demoTrans', e.target.checked)} />
                    장 전환 테스트 (프리 &gt;&gt; 장중 반복)
                  </label>
                  <label className="demo-toggle" style={{ fontSize: '0.9em', color: '#ddd' }}>
                    <input type="checkbox" checked={config.demoCross || false} onChange={e => set('demoCross', e.target.checked)} />
                    제로 크로스 테스트 (양전/음전 진동)
                  </label>
                  <label className="demo-toggle" style={{ fontSize: '0.9em', color: '#ddd' }}>
                    <input type="checkbox" checked={config.demoTarget || false} onChange={e => set('demoTarget', e.target.checked)} />
                    목표가 도달 테스트 (15초 주기 급등)
                  </label>
                  <label className="demo-toggle" style={{ fontSize: '0.9em', color: '#ddd' }}>
                    <input type="checkbox" checked={config.demoSurge || false} onChange={e => set('demoSurge', e.target.checked)} />
                    급등/급락 테스트 (±5·10·15% 글로우 동시)
                  </label>
                </div>
              )}
            </div>

            <p style={{ fontSize: '12px', color: '#9e9e9e', textAlign: 'right', margin: '10px 0 0 0' }}>
              v{APP_VERSION}
            </p>
          </details>

        </div>

        {/* Right Side: Preview */}
        <div
          ref={previewWrapperRef}
          className="config-preview-wrapper preview-static"
          style={{ '--sb-color': previewThemeAccent }}
        >
          <label className="preview-label">🖥️ 미리보기</label>

          {/* Scene screenshot: auto-match theme + use as preview backdrop.
              Before upload: a drop zone that says what you get.
              After upload: a compact bar (thumbnail + 교체/제거). */}
          {!sceneImage ? (
            <div
              className="scene-drop"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: '12px' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleSceneImage(e.dataTransfer.files[0]); }}
            >
              <ImagePlus size={18} />
              <span>
                {analyzing ? '분석 중…' : '방송 화면 스크린샷을 붙여넣기(Ctrl+V)하거나 드롭해 보세요'}
                {!analyzing && <small>어울리는 테마 추천 + 내 화면 위에 실제 배치 미리보기</small>}
              </span>
            </div>
          ) : (
            <div
              className="scene-bar"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleSceneImage(e.dataTransfer.files[0]); }}
            >
              <img src={sceneImage} alt="" className="scene-thumb" />
              <span className="scene-bar-label">{analyzing ? '분석 중…' : '방송 화면 적용됨'}</span>
              <button className="jirai-button jirai-button-outline scene-bar-btn" onClick={() => fileInputRef.current?.click()}>교체</button>
              <button className="jirai-button jirai-button-outline scene-bar-btn" onClick={clearScene}>제거</button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { handleSceneImage(e.target.files[0]); e.target.value = ''; }}
          />
          {matchResult && !matchResult.error && (
            <p className="match-result" style={{ margin: '0 0 12px' }}>
              <span className="match-chip" style={{ background: matchResult.avg }} />
              {matchResult.reason}이라 <b>{matchResult.label}</b> 테마를 골랐어요. 아래에서 적용된 모습을 확인하세요.
            </p>
          )}
          {matchResult?.error && (
            <p className="match-result" style={{ margin: '0 0 12px' }}>이미지를 읽지 못했어요. 다른 파일로 시도해 주세요.</p>
          )}

          <div className="segmented small" style={{ marginBottom: '12px', width: '100%' }}>
            {PREVIEW_BGS.map(bg => (
              <button
                key={bg.value}
                className={`segment ${previewBg === bg.value ? 'selected' : ''}`}
                onClick={() => setPreviewBg(bg.value)}
              >{bg.label}</button>
            ))}
            {sceneImage && (
              <button
                className={`segment ${previewBg === 'scene' ? 'selected' : ''}`}
                onClick={() => setPreviewBg('scene')}
              >내 화면</button>
            )}
          </div>

          {sceneMode ? (() => {
            const rec = recommendedDims(previewViewportMode, previewSymbolCount);
            const actualDims = customDims || rec;
            const k = sceneBoxW ? sceneBoxW / sceneDims.w : 0;
            const frac = { w: actualDims.w / sceneDims.w, h: actualDims.h / sceneDims.h };
            return (
              <>
                {symbolList.length > MAX_PREVIEW_SYMBOLS && (
                  <p style={{ fontSize: '13px', color: '#8d6e63', margin: '0 0 8px', textAlign: 'center' }}>
                    미리보기에는 처음 {MAX_PREVIEW_SYMBOLS}개 카드만 표시해요
                  </p>
                )}
                <div
                  style={{
                    width: '100%',
                    border: '4px solid #ffb6c1',
                    borderRadius: '12px',
                    boxSizing: 'content-box',
                    boxShadow: '0 8px 16px rgba(255,182,193,0.3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    ref={sceneBoxRef}
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: `${sceneDims.w} / ${sceneDims.h}`,
                      background: `url(${sceneImage}) center / cover`,
                    }}
                  >
                    {guides.v && <span className="snap-guide guide-v" />}
                    {guides.h && <span className="snap-guide guide-h" />}
                    {k > 0 && (
                      <div
                        className={placeHint ? 'place-hint' : ''}
                        onPointerDown={(e) => startWidgetDrag(e, frac)}
                        style={{
                          position: 'absolute',
                          left: `${widgetPos.x * 100}%`,
                          top: `${widgetPos.y * 100}%`,
                          width: `${actualDims.w * k}px`,
                          height: `${actualDims.h * k}px`,
                          cursor: 'move',
                          touchAction: 'none',
                          outline: '1.5px dashed rgba(255, 182, 193, 0.9)',
                          outlineOffset: '2px',
                        }}
                      >
                        <iframe
                          key={previewWidgetUrl}
                          ref={previewFrameRef}
                          src={previewWidgetUrl}
                          // The URL change intentionally remounts this frame. Suppress the
                          // browser-default scrollbar in its brief about:blank handoff before
                          // the widget's own overflow:hidden CSS has loaded.
                          scrolling="no"
                          onLoad={(event) => postPreviewControl(event.currentTarget.contentWindow)}
                          style={{
                            width: `${actualDims.w}px`,
                            height: `${actualDims.h}px`,
                            border: 'none',
                            transform: `scale(${k})`,
                            transformOrigin: 'top left',
                            pointerEvents: 'none',
                          }}
                          title="Widget Placement Preview"
                        />
                        {/* Resize handle — big enough to actually find */}
                        <div
                          onPointerDown={(e) => startWidgetResize(e, actualDims.w, actualDims.h, k)}
                          className="place-resize-handle"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#b5a39c', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
                  위젯을 드래그해서 배치하거나 우측 하단 핸들로 크기를 조절해 보세요<br />
                  OBS 배치 참고: X {Math.round(widgetPos.x * sceneDims.w)}, Y {Math.round(widgetPos.y * sceneDims.h)} · 크기 {Math.round(actualDims.w)}×{Math.round(actualDims.h)}
                </p>
              </>
            );
          })() : (() => {
            // Render the widget at the exact recommended OBS size,
            // then scale it down to fit the preview panel
            const PREVIEW_W = previewContentWidth;
            const rec = recommendedDims(previewViewportMode, previewSymbolCount);
            const frameW = previewViewportMode === 'scroll' ? PREVIEW_W : rec.w;
            const frameH = rec.h;
            // The first five cards are fitted uniformly to the visible settings
            // panel. This never changes the OBS source dimensions; it only
            // prevents a normal five-card preview from becoming a scrollbar.
            const fitHeightScale = previewViewportMode === 'list' && previewAvailableHeight > 0
              ? previewAvailableHeight / frameH
              : 1;
            const scale = Math.min(1, PREVIEW_W / frameW, fitHeightScale);
            return (
              <>
                <div ref={previewBoxRef} className="preview-frame-box" style={{
                  // The border accounts for 8px, so the outside of the frame
                  // always fits within the preview column.
                  width: 'calc(100% - 8px)',
                  maxWidth: 'calc(100% - 8px)',
                  margin: '0 auto',
                  height: `${Math.round(frameH * scale)}px`,
                  flexShrink: 0, // keep real height; cards never get squished
                  border: '4px solid #ffb6c1',
                  borderRadius: '16px',
                  overflowX: 'hidden',
                  overflowY: 'hidden',
                  '--sb-color': previewThemeAccent,
                  position: 'relative',
                  boxSizing: 'content-box',
                  boxShadow: '0 8px 16px rgba(255,182,193,0.3)',
                  ...(previewBg === 'scene' && sceneImage
                    ? { background: `url(${sceneImage}) center / cover` }
                    : (PREVIEW_BGS.find(b => b.value === previewBg) || PREVIEW_BGS[0]).style),
                }}>
                  <div style={{
                    // A transformed iframe keeps its unscaled layout width.
                    // This viewport reports the scaled dimensions instead, so
                    // the card frame cannot acquire even a 1px horizontal
                    // overflow while preserving the widget's real viewport.
                    width: `${Math.round(frameW * scale)}px`,
                    height: `${Math.round(frameH * scale)}px`,
                    marginLeft: `${Math.max(0, Math.round((PREVIEW_W - frameW * scale) / 2))}px`,
                    overflow: 'hidden',
                    position: 'relative',
                  }}>
                    <iframe
                      key={previewWidgetUrl}
                      ref={previewFrameRef}
                      src={previewWidgetUrl}
                      // A new source starts as a browser-default blank document for one paint.
                      // Keep that handoff from showing a transient inner scrollbar.
                      scrolling="no"
                      onLoad={(event) => postPreviewControl(event.currentTarget.contentWindow)}
                      style={{
                        width: `${frameW}px`,
                        height: `${frameH}px`,
                        border: 'none',
                        display: 'block',
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        pointerEvents: 'none', // let wheel scroll the sticky preview panel, not the widget
                      }}
                      title="Widget Preview"
                    />
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#b5a39c', margin: '10px 0 0', textAlign: 'center' }}>
                  {symbolList.length > MAX_PREVIEW_SYMBOLS && <>미리보기는 처음 {MAX_PREVIEW_SYMBOLS}개 카드만 표시해요 · </>}
                  OBS 권장 크기 {recommendedDims(config.displayMode, symbolList.length).w}×{recommendedDims(config.displayMode, symbolList.length).h} (등록 종목 전체 기준)
                </p>
              </>
            );
          })()}
        </div>

        </div>{/* /config-columns */}

      </div>
    </div>
  );
};

export default Configurator;
