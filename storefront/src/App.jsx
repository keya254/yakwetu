import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ConfigBar from './components/ConfigBar';
import Header from './components/Header';
import RequireAuth from './components/RequireAuth';
import CheckoutPage from './pages/CheckoutPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import MoviePage from './pages/MoviePage';
import WatchPage from './pages/WatchPage';

export default function App() {
  const [query, setQuery] = useState('');
  const location = useLocation();
  const hideChrome = location.pathname.startsWith('/login');

  return (
    <div className="app-shell">
      {!hideChrome ? <Header query={query} onQueryChange={setQuery} /> : null}
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage query={query} setQuery={setQuery} />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/movie/:id"
          element={
            <RequireAuth>
              <MoviePage />
            </RequireAuth>
          }
        />
        <Route
          path="/checkout/:id"
          element={
            <RequireAuth>
              <CheckoutPage />
            </RequireAuth>
          }
        />
        <Route
          path="/watch/:id"
          element={
            <RequireAuth>
              <WatchPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideChrome ? (
        <footer className="site-footer">
          <div>
            <div className="logo">YAKWETU</div>
            <p style={{ marginTop: 6 }}>Kenyan stories · demo pricing from KES 5</p>
          </div>
          <a href="#top" style={{ color: 'var(--gold)' }}>
            ↑ Top
          </a>
        </footer>
      ) : null}
      {!hideChrome ? <ConfigBar /> : null}
    </div>
  );
}
