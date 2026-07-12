import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Configurator from './pages/Configurator';
import Widget from './pages/Widget';

// Last line of defense for a stream overlay: if anything unexpected
// crashes the React tree, render nothing (transparent — no white box on
// stream) and reload the page a few seconds later to self-heal.
class RecoveryBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    console.error('Widget crashed:', error, info);
    // Guard against a crash→reload loop: if we've already reloaded several
    // times in the last minute, stop reloading and stay quietly transparent
    // (better a frozen-but-invisible overlay than a page that flashes forever).
    try {
      const KEY = 'rs-crash-reloads';
      const now = Date.now();
      const recent = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(t => now - t < 60000);
      if (recent.length >= 3) return; // give up: render null, no more reloads
      recent.push(now);
      sessionStorage.setItem(KEY, JSON.stringify(recent));
    } catch { /* ignore */ }
    setTimeout(() => window.location.reload(), 4000);
  }

  render() {
    if (this.state.crashed) return null;
    return this.props.children;
  }
}

function App() {
  return (
    <RecoveryBoundary>
      <Routes>
        <Route path="/" element={<Configurator />} />
        <Route path="/widget" element={<Widget />} />
      </Routes>
    </RecoveryBoundary>
  );
}

export default App;
