import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Generator from './pages/Generator';
import QRList from './pages/QRList';
import Settings from './pages/Settings';
import { useQRStore } from './stores/qrStore';

function App() {
  const { fetchSettings, fetchProducts } = useQRStore();

  useEffect(() => {
    fetchSettings();
    fetchProducts();
  }, [fetchSettings, fetchProducts]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="generator" element={<Generator />} />
          <Route path="generator/:id" element={<Generator />} />
          <Route path="list" element={<QRList />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
