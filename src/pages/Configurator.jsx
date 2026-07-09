import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Check, AlertCircle, Heart, RefreshCw, ImagePlus } from 'lucide-react';
import { getOrCreateRoom, createRoom, saveRoom, publishSync } from '../hooks/useRemoteSync';

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
    resolve({ lum, sat, domHue, avg });
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
  scale: 1,
  interval: 10,
  opacity: 1,
  fx: 'full',
  demo: false,
};

const loadConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
    return { ...defaultConfig, ...saved };
  } catch {
    return defaultConfig;
  }
};

const recommendedDims = (mode, count) => {
  if (mode === 'scroll') return { w: 1280, h: 90 };
  if (mode === 'rotate') return { w: 300, h: 200 };
  return { w: 300, h: Math.max(1, count) * 160 };
};

const recommendedSize = (mode, count) => {
  const { w, h } = recommendedDims(mode, count);
  return `너비 ${w} × 높이 ${h}`;
};

const Configurator = () => {
  const [config, setConfig] = useState(loadConfig);
  const [room, setRoom] = useState(() => getOrCreateRoom());
  const [copied, setCopied] = useState(false);
  const [previewBg, setPreviewBg] = useState('dark');
  const [justApplied, setJustApplied] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [sceneImage, setSceneImage] = useState(null);
  const fileInputRef = useRef(null);

  const handleSceneImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const stats = await analyzeSceneImage(file);
      const pick = pickThemeForScene(stats);
      setConfig(prev => ({ ...prev, theme: pick.theme }));
      setMatchResult({ ...pick, avg: stats.avg, label: THEMES.find(t => t.value === pick.theme)?.label });
      // Use the screenshot itself as the preview backdrop
      const url = URL.createObjectURL(file);
      setSceneImage(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPreviewBg('scene');
    } catch {
      setMatchResult({ error: true });
    }
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
    if (config.scale !== 1) params.set('scale', config.scale);
    if (config.displayMode === 'rotate' && config.interval !== 10) params.set('interval', config.interval);
    if (config.opacity !== 1) params.set('opacity', config.opacity);
    if (config.fx !== 'full') params.set('fx', config.fx);
    if (config.demo) params.set('demo', '1');
    params.set('room', room);
    return `${baseUrl}#/widget?${params.toString()}`;
  }, [config, symbolList, room]);

  // Persist settings + push to widget (same-browser channels + ntfy relay)
  useEffect(() => {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* ignore */ }
    publishSync({ url: widgetUrl, timestamp: Date.now() }, room);
    setJustApplied(true);
    const t = setTimeout(() => setJustApplied(false), 1500);
    return () => clearTimeout(t);
  }, [widgetUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewRoom = () => {
    const newRoom = createRoom();
    saveRoom(newRoom);
    setRoom(newRoom);
  };

  const removeSymbol = (target) => {
    set('symbolsInput', symbolList.filter(s => s !== target).join(', '));
  };

  return (
    <div className="config-bg" style={{ display: 'flex', minHeight: '100vh', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
      <div className="jirai-container config-layout">

        {/* Left Sidebar: Controls */}
        <div className="config-sidebar">

          <div className="ribbon-container">
            <div className="ribbon-title">
              <Heart size={18} fill="#fff" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }} />
              아모레또 위젯 리모컨
              <Heart size={18} fill="#fff" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px' }} />
            </div>
          </div>

          {/* 1. Symbols */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#4e342e' }}>🎀 등록할 종목 심볼</label>
            <p style={{ fontSize: '14px', color: '#8d6e63', marginBottom: '12px' }}>
              쉼표(,)로 구분해서 입력해 주세요. (예: AAPL, TSLA, BTC)
            </p>
            <input
              type="text"
              className="jirai-input"
              value={config.symbolsInput}
              onChange={(e) => set('symbolsInput', e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {symbolList.map((s) => (
                <div key={s} className="jirai-tag">
                  {s}
                  <button onClick={() => removeSymbol(s)} aria-label={`${s} 제거`} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Theme swatches */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>💖 테마</label>
            <div className="theme-grid">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  className={`theme-swatch ${config.theme === t.value ? 'selected' : ''}`}
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
          </div>

          {/* 5. Widget URL */}
          <div className="jirai-card" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>OBS 위젯 주소</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                className="jirai-input"
                value={widgetUrl}
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

          {/* 6. Advanced settings, collapsed by default */}
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

            <div className="advanced-row">
              <label>🔍 크기 배율 <b>{Number(config.scale).toFixed(2)}×</b></label>
              <input type="range" min="0.5" max="2" step="0.05" value={config.scale}
                onChange={e => set('scale', parseFloat(e.target.value))} />
            </div>

            {config.displayMode === 'rotate' && (
              <div className="advanced-row">
                <label>⏱️ 종목 전환 간격 <b>{config.interval}초</b></label>
                <input type="range" min="3" max="60" step="1" value={config.interval}
                  onChange={e => set('interval', parseInt(e.target.value, 10))} />
              </div>
            )}

            <div className="advanced-row">
              <label>🫧 카드 불투명도 <b>{Math.round(config.opacity * 100)}%</b></label>
              <input type="range" min="0.2" max="1" step="0.05" value={config.opacity}
                onChange={e => set('opacity', parseFloat(e.target.value))} />
            </div>

            <div className="advanced-row">
              <label className="demo-toggle">
                <input type="checkbox" checked={config.demo} onChange={e => set('demo', e.target.checked)} />
                🧪 데모 모드 — 가짜 시세가 움직여요 (장 마감에도 테마·이펙트 확인용)
              </label>
            </div>

            <div className="advanced-row">
              <label>📡 원격 연결 코드</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code className="room-code">{room}</code>
                <button className="jirai-button jirai-button-outline" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleNewRoom}>
                  <RefreshCw size={14} /> 새 코드
                </button>
              </div>
              <p style={{ fontSize: '13px', color: '#8d6e63', margin: '8px 0 0', lineHeight: 1.5 }}>
                위젯 URL에 이 코드가 들어 있어요. 폰이나 다른 PC에서 이 페이지를 열고 조작해도 OBS에 바로 반영됩니다.
                코드를 바꾸면 OBS의 위젯 URL도 다시 복사해 넣어야 해요.
              </p>
            </div>
          </details>

        </div>

        {/* Right Side: Preview */}
        <div className="config-preview-wrapper">
          <div className="ribbon-container">
            <div className="ribbon-title" style={{ background: '#4e342e', color: '#fff', fontSize: '18px' }}>
              미리보기 화면
            </div>
          </div>

          {/* Scene screenshot: auto-match theme + use as preview backdrop */}
          <div
            className="scene-drop"
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: '12px' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleSceneImage(e.dataTransfer.files[0]); }}
          >
            <ImagePlus size={18} />
            방송 화면 스크린샷을 붙여넣기(Ctrl+V)하거나 드롭해 보세요
          </div>
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

          {(() => {
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
                  width: '100%',
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

      </div>
    </div>
  );
};

export default Configurator;
