import React, { useState, useEffect } from 'react';
import { Copy, Check, Tv2, AlertCircle, Heart } from 'lucide-react';

const Configurator = () => {
  const [symbolsInput, setSymbolsInput] = useState('KORU, MUU, SNXX, SOXL');
  const [theme, setTheme] = useState('theme-cyber-neon');
  const [displayMode, setDisplayMode] = useState('list');
  const [copied, setCopied] = useState(false);
  const [widgetUrl, setWidgetUrl] = useState('');

  useEffect(() => {
    // Generate URL based on current origin and symbols
    const cleanSymbols = symbolsInput.split(',').map(s => s.trim()).filter(s => s).join(',');
    const baseUrl = window.location.href.split('#')[0];
    let newUrl = `${baseUrl}#/widget?symbols=${cleanSymbols}`;
    if (theme !== 'default') {
      newUrl += `&theme=${theme}`;
    }
    if (displayMode !== 'list') {
      newUrl += `&mode=${displayMode}`;
    }
    setWidgetUrl(newUrl);

    const syncPayload = { url: newUrl, timestamp: Date.now() };

    // 1. Try BroadcastChannel (works perfectly on GitHub Pages)
    try {
      const channel = new BroadcastChannel('obs-widget-sync');
      channel.postMessage(syncPayload);
      channel.close();
    } catch (e) {}

    // 2. Try localStorage (works perfectly on GitHub Pages)
    try {
      localStorage.setItem('obs-widget-sync-data', JSON.stringify(syncPayload));
    } catch (e) {}

    // 3. Try Local Vite API (Fallback for local dev cross-origin issues)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      fetch('http://localhost:5173/api/sync', {
        method: 'POST',
        body: JSON.stringify(syncPayload)
      }).catch(e => {});
    }
  }, [symbolsInput, theme, displayMode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="config-bg" style={{ display: 'flex', minHeight: '100vh', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
      
      <div className="jirai-container" style={{ display: 'flex', maxWidth: '1000px', width: '100%', gap: '40px', background: '#fffcfc' }}>
        
        {/* Left Sidebar: Controls */}
        <div style={{ flex: 1, paddingRight: '20px' }}>
          
          <div className="ribbon-container">
            <div className="ribbon-title">
              <Heart size={18} fill="#fff" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}/>
              아모레또 위젯 리모컨
              <Heart size={18} fill="#fff" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px' }}/>
            </div>
          </div>
          
          <div className="jirai-card" style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#4e342e' }}>🎀 등록할 종목 심볼</label>
            <p style={{ fontSize: '14px', color: '#8d6e63', marginBottom: '12px' }}>
              쉼표(,)로 구분해서 입력해 주세요. (예: AAPL, TSLA, BTC)
            </p>
            <input 
              type="text" 
              className="jirai-input"
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {symbolsInput.split(',').map((s, i) => s.trim() && (
                <div key={i} className="jirai-tag">
                  {s.trim()}
                </div>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
            <div className="jirai-card" style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>💖 테마 설정</label>
              <select 
                className="jirai-input"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <option value="theme-cyber-neon">네온 바 (Neon Bar)</option>
                <option value="default">기본 (Dark Glass)</option>
              </select>
            </div>

            <div className="jirai-card" style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>✨ 디스플레이 모드</label>
              <select 
                className="jirai-input"
                value={displayMode}
                onChange={(e) => setDisplayMode(e.target.value)}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <option value="list">리스트 (전체 목록)</option>
                <option value="rotate">로테이트 (하나씩 회전)</option>
              </select>
            </div>
          </div>
          
          <div className="jirai-card" style={{ background: '#fff', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#ffb6c1' }}>
              <AlertCircle size={18} />
              <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#4e342e' }}>OBS 사용 방법 ♡</span>
            </div>
            <ol style={{ fontSize: '14px', color: '#6d4c41', margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>아래의 <b>위젯 URL</b>을 복사해 주세요.</li>
              <li>OBS에서 <b>브라우저(Browser) 소스</b>를 추가합니다.</li>
              <li>복사한 주소를 URL 칸에 붙여넣기 합니다.</li>
              <li>너비 300, 높이 600 정도로 조절해서 배치하면 끝!</li>
            </ol>
          </div>

          <div className="jirai-card">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>OBS 위젯 주소</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                readOnly 
                className="jirai-input"
                value={widgetUrl}
                style={{ flex: 1 }}
              />
              <button 
                onClick={handleCopy}
                className="jirai-button"
                style={{ minWidth: '100px' }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
          </div>

        </div>

        {/* Right Side: Preview */}
        <div style={{ width: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ribbon-container">
            <div className="ribbon-title" style={{ background: '#4e342e', color: '#fff', fontSize: '18px' }}>
              미리보기 화면
            </div>
          </div>
          
          {/* Fake OBS bounds */}
          <div style={{ 
            width: '100%', 
            height: '600px', 
            border: '4px solid #ffb6c1',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            background: '#000',
            boxShadow: '0 8px 16px rgba(255,182,193,0.3)'
          }}>
            <iframe 
              src={widgetUrl} 
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Widget Preview"
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Configurator;
