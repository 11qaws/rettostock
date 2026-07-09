import React, { useState, useEffect } from 'react';
import { Copy, Check, Tv2, AlertCircle } from 'lucide-react';

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
    <div className="config-bg" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left Sidebar: Controls */}
      <div style={{ flex: 1, padding: '40px', borderRight: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <Tv2 size={32} color="var(--color-primary)" />
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>OBS Ticker Widget</h1>
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Stock / Crypto Symbols</label>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Enter comma-separated symbols. Example: AAPL, TSLA, NVDA, BTC
          </p>
          <input 
            type="text" 
            value={symbolsInput}
            onChange={(e) => setSymbolsInput(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '12px', 
              borderRadius: '8px', 
              border: '1px solid var(--border-glass)',
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Theme</label>
          <select 
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '12px', 
              borderRadius: '8px', 
              border: '1px solid var(--border-glass)',
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '16px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="theme-cyber-neon">Cyber Neon (Bar Vibe)</option>
            <option value="default">Default (Dark Glass)</option>
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Display Mode</label>
          <select 
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '12px', 
              borderRadius: '8px', 
              border: '1px solid var(--border-glass)',
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '16px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="list">List (All Cards Visible)</option>
            <option value="rotate">Rotate (One Card, 10s Timer)</option>
          </select>
        </div>
        
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#fbbf24' }}>
            <AlertCircle size={16} />
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>How to use in OBS</span>
          </div>
          <ol style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, paddingLeft: '20px' }}>
            <li style={{ marginBottom: '8px' }}>Copy the URL below</li>
            <li style={{ marginBottom: '8px' }}>In OBS, add a new "Browser" Source</li>
            <li style={{ marginBottom: '8px' }}>Paste the URL into the URL field</li>
            <li>Set Width to 300, Height to 600 (adjust as needed)</li>
          </ol>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Your Widget URL</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              readOnly 
              value={widgetUrl}
              style={{ 
                flex: 1, 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-glass)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text-muted)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button 
              onClick={handleCopy}
              style={{
                padding: '0 20px',
                borderRadius: '8px',
                border: 'none',
                background: copied ? 'var(--color-up)' : 'var(--color-primary)',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background 0.3s'
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Right Side: Preview */}
      <div className={theme === 'default' ? '' : theme} style={{ flex: 1, padding: '40px', background: 'url("https://www.transparenttextures.com/patterns/cubes.png") rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '18px', color: 'var(--text-muted)' }}>Widget Preview</h2>
        
        {/* Fake OBS bounds */}
        <div style={{ 
          width: '320px', 
          height: '600px', 
          border: '2px dashed var(--border-glass)',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <iframe 
            src={widgetUrl} 
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Widget Preview"
          />
        </div>
      </div>
    </div>
  );
};

export default Configurator;
