import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ConfigBar from './components/ConfigBar';
import Header from './components/Header';
import RequireAuth from './components/RequireAuth';
import ScrollToTop from './components/ScrollToTop';
import AdminPage from './pages/AdminPage';
import CheckoutPage from './pages/CheckoutPage';
import HomePage from './pages/HomePage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import MoviePage from './pages/MoviePage';
import MyFilmsPage from './pages/MyFilmsPage';
import WatchPage from './pages/WatchPage';

export default function App() {
  const [query, setQuery] = useState('');
  const location = useLocation();
  const hideChrome =
    location.pathname.startsWith('/login') || location.pathname.startsWith('/admin');
  const onMovie = location.pathname.startsWith('/movie/');
  const showSearch = location.pathname.startsWith('/browse');

  return (
    <div className={`app-shell${onMovie ? ' has-buy-bar' : ''}`} id="top">
      <ScrollToTop />
      {!hideChrome ? (
        <Header query={query} onQueryChange={setQuery} showSearch={showSearch} />
      ) : null}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/browse"
          element={<HomePage query={query} setQuery={setQuery} />}
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/movie/:id" element={<MoviePage />} />
        <Route
          path="/my-films"
          element={
            <RequireAuth>
              <MyFilmsPage />
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
          <p>Yakwetu Sinema · hackathon prototype. Film data from TMDB / curated catalog.</p>
          <p>Pay per title in KES. No subscription. M-Pesa or card.</p>
        </footer>
      ) : null}
      {!hideChrome && !onMovie ? <ConfigBar /> : null}
    </div>
  );
}
