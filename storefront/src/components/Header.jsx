import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Wordmark from './Wordmark';

export default function Header({ query, onQueryChange, showSearch = false }) {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = () => {
    logout();
    setOpen(false);
    navigate('/');
  };

  const brandTo = isLoggedIn ? '/browse' : '/';

  return (
    <>
      <header className="site-header">
        <div className="header-left">
          <Wordmark to={brandTo} />
          <nav className="header-nav" aria-label="Main">
            {isLoggedIn ? (
              <>
                <NavLink to="/browse">Browse</NavLink>
                <NavLink to="/my-films">My films</NavLink>
                <a href="/demo-lab.html">Demo Lab</a>
                <NavLink to="/admin">Admin</NavLink>
              </>
            ) : (
              <>
                <a href="/#trending">Trending</a>
                <NavLink to="/browse">Browse</NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="header-actions">
          {showSearch ? (
            <div className="search">
              <input
                type="search"
                placeholder="Search titles…"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                aria-label="Search movies"
              />
            </div>
          ) : null}
          {isLoggedIn ? (
            <nav className="header-nav" aria-label="Account">
              <button type="button" className="linkish" onClick={doLogout}>
                Log out
              </button>
            </nav>
          ) : (
            <div className="header-nav" style={{ display: 'flex', gap: 8 }}>
              <NavLink to="/login" className="btn btn-ghost btn-sm">
                Sign in
              </NavLink>
              <NavLink to="/login" className="btn btn-buy btn-sm">
                Join free
              </NavLink>
            </div>
          )}
          <button
            type="button"
            className="menu-btn"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </header>

      <div className={`mobile-drawer${open ? ' open' : ''}`}>
        {isLoggedIn ? (
          <>
            <NavLink to="/browse" onClick={() => setOpen(false)}>
              Browse
            </NavLink>
            <NavLink to="/my-films" onClick={() => setOpen(false)}>
              My films
            </NavLink>
            <a href="/demo-lab.html" onClick={() => setOpen(false)}>
              Demo Lab
            </a>
            <NavLink to="/admin" onClick={() => setOpen(false)}>
              Admin
            </NavLink>
            <span className="muted">{user?.name}</span>
            <button type="button" onClick={doLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <a href="/#trending" onClick={() => setOpen(false)}>
              Trending
            </a>
            <NavLink to="/browse" onClick={() => setOpen(false)}>
              Browse
            </NavLink>
            <NavLink to="/login" onClick={() => setOpen(false)}>
              Sign in
            </NavLink>
            <NavLink to="/login" onClick={() => setOpen(false)}>
              Join free
            </NavLink>
          </>
        )}
      </div>
    </>
  );
}
