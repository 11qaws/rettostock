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
    console.error('Widget crashed, reloading in 4s:', error, info);
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
