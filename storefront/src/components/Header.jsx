import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header({ query, onQueryChange }) {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = () => {
    logout();
    setOpen(false);
    navigate('/login');
  };

  return (
    <>
      <header className="site-header">
        <Link className="logo" to="/">
          YAKWETU
        </Link>
        <div className="search">
          <input
            type="search"
            placeholder="Search titles, actors…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search movies"
          />
        </div>
        <nav className="header-nav" aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          <a href="/#movies">Movies</a>
          <a href="/#because">My List</a>
          <a href="/demo-lab.html">Demo Lab</a>
          <a href="/admin.html">Admin</a>
          {isLoggedIn ? (
            <button type="button" className="linkish" onClick={doLogout}>
              Log out
            </button>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
        <button
          type="button"
          className="menu-btn"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
      </header>
      <div className={`mobile-drawer${open ? ' open' : ''}`}>
        <NavLink to="/" end onClick={() => setOpen(false)}>
          Home
        </NavLink>
        <a href="/#movies" onClick={() => setOpen(false)}>
          Movies
        </a>
        <a href="/#because" onClick={() => setOpen(false)}>
          My List
        </a>
        <a href="/demo-lab.html" onClick={() => setOpen(false)}>
          Demo Lab
        </a>
        <a href="/admin.html" onClick={() => setOpen(false)}>
          Admin
        </a>
        {isLoggedIn ? (
          <>
            <span className="muted">{user?.name}</span>
            <button type="button" onClick={doLogout}>
              Log out
            </button>
          </>
        ) : (
          <NavLink to="/login" onClick={() => setOpen(false)}>
            Sign in
          </NavLink>
        )}
      </div>
    </>
  );
}
