import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Check, AlertCircle, ImagePlus } from 'lucide-react';
import { getOrCreateRoom, publishSync, getOrCreateSigningKeys } from '../hooks/useRemoteSync';

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
  if (purple || blue) return { theme: 'theme-retto-pixel', reason: '어두운 보라·남색 톤' };
  if (lum < 0.18) return { theme: 'theme-led-board', reason: '아주 어두운 화면' };
  return { theme: 'default', reason: '무난한 어두운 화면' };
};

const THEMES = [
  { value: 'theme-amore-cute', label: '아모레 핑크', bg: '#fff0f3', border: '2px dashed #ffb6c1', text: '#4e342e', up: '#e91e63' },
  { value: 'theme-pastel-light', label: '파스텔 라이트', bg: '#ffffff', border: '2px solid #e3d5e2', text: '#2b1a2e', up: '#d6336c' },
  { value: 'theme-retto-pixel', label: '픽셀 레트로', bg: '#221d5e', border: '3px solid #331c36', text: '#f8d6ef', up: '#ed76ac', radius: '0' },
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
  { value: 'full', label: '전부' },
  { value: 'soft', label: '약하게' },
  { value: 'off', label: '끄기' },
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

const defaultConfig = {
  symbolsInput: 'KORU, MUU, SNXX, SOXL',
  theme: 'theme-amore-cute',
  displayMode: 'list',
  colorStyle: 'theme',

  interval: 10,
  opacity: 0.95,
  fx: 'full',
  speed: 1,
  demo: false,
  remote: false, // cross-device relay is opt-in (currently disabled in UI)
  useTargets: false,
  targets: {},   // per-symbol target prices (empty = off)
};

const loadConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
    const merged = { ...defaultConfig, ...saved };
    // One-time migration: opacity default changed 1 -> 0.95
    if (!saved || saved.v !== 2) merged.opacity = 0.95;
    merged.v = 2;
    merged.demo = false; // Always force demo off on initial load
    return merged;
  } catch {
    return { ...defaultConfig, v: 2, demo: false };
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

  // Key pair exists only in this browser; created lazily when remote is on
  useEffect(() => {
    if (config.remote && !signingKeys) {
      getOrCreateSigningKeys().then(setSigningKeys).catch(() => {});
    }
  }, [config.remote, signingKeys]);
  const [copied, setCopied] = useState(false);
  const [previewBg, setPreviewBg] = useState('dark');
  const [justApplied, setJustApplied] = useState(false);
  const [matchResult, setMatchResult] = useState(null);

  const [sceneImage, setSceneImage] = useState(null);
  const [sceneDims, setSceneDims] = useState(null);
  const [customDims, setCustomDims] = useState(null);
  const [widgetPos, setWidgetPos] = useState({ x: 0.02, y: 0.03 }); // preview-only, never in the URL
  const [sceneBoxW, setSceneBoxW] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [matchedTheme, setMatchedTheme] = useState(null); // ping the auto-picked swatch
  const [placeHint, setPlaceHint] = useState(false);      // one-time "you can drag me" pulse
  const [sceneZoom, setSceneZoom] = useState('fit');      // 'fit' | 'full' (1:1 pixels)
  const [guides, setGuides] = useState({ v: false, h: false });
  const fileInputRef = useRef(null);
  const sceneBoxRef = useRef(null);
  const sceneScrollRef = useRef(null);

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
      setSceneZoom('fit');
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
  }, [sceneMode, sceneZoom]);

  // Entering 1:1 view: scroll so the widget is in the middle of the viewport
  useEffect(() => {
    if (sceneZoom !== 'full' || !sceneDims) return;
    const el = sceneScrollRef.current;
    if (!el) return;
    el.scrollLeft = widgetPos.x * sceneDims.w - el.clientWidth / 2 + 100;
    el.scrollTop = widgetPos.y * sceneDims.h - el.clientHeight / 2 + 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneZoom]);

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

  const symbolList = useMemo(
    () => config.symbolsInput.split(',').map(s => s.trim()).filter(s => s),
    [config.symbolsInput]
  );

  const widgetUrl = useMemo(() => {
    const baseUrl = window.location.href.split('#')[0];
    const params = new URLSearchParams();
    params.set('symbols', symbolList.join(','));
    if (config.theme !== 'default') params.set('theme', config.theme);
    if (config.displayMode !== 'list') params.set('mode', config.displayMode);
    if (config.colorStyle !== 'theme') params.set('colors', config.colorStyle);

    if (config.displayMode === 'rotate' && config.interval !== 10) params.set('interval', config.interval);
    if (config.displayMode === 'scroll' && config.speed !== 1) params.set('speed', config.speed);
    if (config.opacity !== 1) params.set('opacity', config.opacity);
    if (config.fx !== 'full') params.set('fx', config.fx);
    if (config.demo) params.set('demo', '1');
    const targetPairs = symbolList
      .map(s => [s.toUpperCase(), parseFloat(config.targets?.[s.toUpperCase()])])
      .filter(([, v]) => Number.isFinite(v) && v > 0);
    if (targetPairs.length) params.set('targets', targetPairs.map(([s, v]) => `${s}:${v}`).join(','));
    // Relay params only when opted in: room = channel, k = this browser's
    // public key. The widget only accepts changes signed by the matching
    // private key, which never leaves this browser.
    if (config.remote && signingKeys) {
      params.set('room', room);
      params.set('k', signingKeys.publicKeyB64);
    }
    return `${baseUrl}#/widget?${params.toString()}`;
  }, [config, symbolList, room, signingKeys]);

  // Persist settings + push to widget (same-browser channels + ntfy relay)
  useEffect(() => {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* ignore */ }
    publishSync({ url: widgetUrl, timestamp: Date.now() }, config.remote && signingKeys ? room : null, signingKeys?.privateKey);
    setJustApplied(true);
    setCustomDims(null); // Reset custom dims when config changes significantly
    const t = setTimeout(() => setJustApplied(false), 1500);
    return () => clearTimeout(t);
  }, [widgetUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for 'TARGET_REACHED' feedback from the preview iframe so we can auto-clear the input
  useEffect(() => {
    const onMessage = (e) => {
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
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };



  const removeSymbol = (target) => {
    set('symbolsInput', symbolList.filter(s => s !== target).join(', '));
  };

  // Presets: save the whole current config under a name, switch with one click
  const PRESETS_KEY = 'obs-widget-presets';
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || []; } catch { return []; }
  });
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activeTargetSymbol, setActiveTargetSymbol] = useState(null);

  const persistPresets = (next) => {
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const savePreset = () => {
    const name = presetName.trim() || `프리셋 ${presets.length + 1}`;
    persistPresets([...presets.filter(p => p.name !== name), { name, config }]);
    setNamingPreset(false);
    setPresetName('');
  };
  const applyPreset = (p) => setConfig({ ...defaultConfig, ...p.config, v: 2 });
  const deletePreset = (name) => persistPresets(presets.filter(p => p.name !== name));

  return (
    <div className="config-bg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' }}>
      <div className={`jirai-container config-layout ${sceneMode ? 'scene-expanded' : ''}`}>

        {/* Full-width app header */}
        <div className="app-header">
          <span className="app-title">
            🍸 💝
            아모레또 위젯 리모컨
          </span>
          <span className={`header-status ${justApplied ? 'active' : ''}`}>
            {justApplied ? '✓ 위젯에 적용됐어요' : '● 위젯 연결됨'}
          </span>
        </div>

        <div className="config-columns">

        {/* Left Sidebar: Controls */}
        <div className="config-sidebar">

          {/* 1. Symbols */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#4e342e' }}>🎀 등록할 종목 심볼</label>
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
                              e.target.blur();
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (e.target.value === '0') {
                                set('targets', { ...(config.targets || {}), [s]: '' });
                              }
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
                  onClick={() => set('displayMode', m.value)}
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
              {justApplied ? '✓ 위젯에 적용됐어요' : '● 설정을 바꾸면 OBS 위젯에 바로 반영돼요'}
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
              <label>🎨 상승/하락 색상</label>
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
              <label>💥 이벤트 이펙트</label>
              <div className="segmented small">
                {FX_LEVELS.map(f => (
                  <button
                    key={f.value}
                    className={`segment ${config.fx === f.value ? 'selected' : ''}`}
                    onClick={() => set('fx', f.value)}
                  >{f.label}</button>
                ))}
              </div>
            </div>



            {config.displayMode === 'rotate' && (
              <div className="advanced-row">
                <label>⏱️ 종목 전환 간격 <b>{config.interval}초</b></label>
                <input type="range" min="3" max="60" step="1" value={config.interval}
                  onChange={e => set('interval', parseInt(e.target.value, 10))} />
              </div>
            )}

            {config.displayMode === 'scroll' && (
              <div className="advanced-row">
                <label>🎢 마퀴 속도 <b>{Number(config.speed).toFixed(2)}×</b> <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#8d6e63' }}>(느릴수록 부드러워요)</span></label>
                <input type="range" min="0.5" max="2" step="0.05" value={config.speed}
                  onChange={e => set('speed', parseFloat(e.target.value))} />
              </div>
            )}

            <div className="advanced-row">
              <label>🫧 카드 불투명도 <b>{Math.round(config.opacity * 100)}%</b></label>
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
              {config.demo && (
                <p style={{ fontSize: '13px', color: '#d84315', margin: '8px 0 0 24px', lineHeight: 1.6, fontWeight: 'bold' }}>
                  ⚠️ 경고: 현재 가짜 데이터가 흐르고 있습니다. 실시간 연결 중이라면 OBS 방송에도 가짜 시세가 송출되니 주의하세요!
                </p>
              )}
            </div>
          </details>

        </div>

        {/* Right Side: Preview */}
        <div className="config-preview-wrapper">
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
            // Placement preview: the whole screenshot with the widget at
            // true relative scale. '화면 맞춤' fits the scene to the panel
            // (position work); '실제 크기' renders 1:1 pixels with scrolling
            // so the widget is inspectable at its real size. Preview only —
            // the widget URL never changes.
            const rec = recommendedDims(config.displayMode, symbolList.length);
            const actualDims = customDims || rec;
            const isFull = sceneZoom === 'full';
            const k = isFull ? 1 : (sceneBoxW ? sceneBoxW / sceneDims.w : 0);
            const frac = { w: actualDims.w / sceneDims.w, h: actualDims.h / sceneDims.h };
            return (
              <>
                <div className="segmented small" style={{ width: '100%', marginBottom: '8px' }}>
                  <button className={`segment ${!isFull ? 'selected' : ''}`} onClick={() => setSceneZoom('fit')}>
                    화면 맞춤
                  </button>
                  <button className={`segment ${isFull ? 'selected' : ''}`} onClick={() => setSceneZoom('full')}>
                    실제 크기 (100%)
                  </button>
                </div>
                <div
                  ref={sceneScrollRef}
                  style={{
                    width: '100%',
                    border: '4px solid #ffb6c1',
                    borderRadius: '12px',
                    boxSizing: 'content-box',
                    boxShadow: '0 8px 16px rgba(255,182,193,0.3)',
                    overflow: isFull ? 'auto' : 'hidden',
                    maxHeight: isFull ? '460px' : undefined,
                  }}
                >
                  <div
                    ref={sceneBoxRef}
                    style={{
                      position: 'relative',
                      ...(isFull
                        ? { width: `${sceneDims.w}px`, height: `${sceneDims.h}px`, background: `url(${sceneImage}) 0 0 / 100% 100%` }
                        : { width: '100%', aspectRatio: `${sceneDims.w} / ${sceneDims.h}`, background: `url(${sceneImage}) center / cover` }),
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
                          src={widgetUrl}
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
                  {isFull
                    ? '실제 크기 보기 — 스크롤로 이동하며 위젯을 100% 크기로 확인하세요'
                    : '위젯을 드래그해서 배치하거나 우측 하단 핸들로 크기를 조절해 보세요'}<br />
                  OBS 배치 참고: X {Math.round(widgetPos.x * sceneDims.w)}, Y {Math.round(widgetPos.y * sceneDims.h)} · 크기 {Math.round(actualDims.w)}×{Math.round(actualDims.h)}
                </p>
              </>
            );
          })() : (() => {
            // Render the widget at the exact recommended OBS size,
            // then scale it down to fit the preview panel
            const PREVIEW_W = 332; // wrapper 340 - 4px border each side
            const rec = recommendedDims(config.displayMode, symbolList.length);
            const frameW = config.displayMode === 'scroll' ? PREVIEW_W : rec.w;
            const frameH = rec.h;
            const scale = Math.min(1, PREVIEW_W / frameW, 640 / frameH);
            return (
              <>
                <div style={{
                  width: `${PREVIEW_W}px`,
                  maxWidth: '100%',
                  margin: '0 auto',
                  height: `${Math.round(frameH * scale)}px`,
                  border: '4px solid #ffb6c1',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  position: 'relative',
                  boxSizing: 'content-box',
                  boxShadow: '0 8px 16px rgba(255,182,193,0.3)',
                  ...(previewBg === 'scene' && sceneImage
                    ? { background: `url(${sceneImage}) center / cover` }
                    : (PREVIEW_BGS.find(b => b.value === previewBg) || PREVIEW_BGS[0]).style),
                }}>
                  <iframe
                    src={widgetUrl}
                    style={{
                      width: `${frameW}px`,
                      height: `${frameH}px`,
                      border: 'none',
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      marginLeft: `${Math.max(0, Math.round((PREVIEW_W - frameW * scale) / 2))}px`,
                    }}
                    title="Widget Preview"
                  />
                </div>
                <p style={{ fontSize: '13px', color: '#b5a39c', margin: '10px 0 0', textAlign: 'center' }}>
                  권장 크기 {rec.w}×{rec.h} 기준 미리보기예요
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

