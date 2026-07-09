import { Routes, Route } from 'react-router-dom';
import Configurator from './pages/Configurator';
import Widget from './pages/Widget';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Configurator />} />
      <Route path="/widget" element={<Widget />} />
    </Routes>
  );
}

export default App;
