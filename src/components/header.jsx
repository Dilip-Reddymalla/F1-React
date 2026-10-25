import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./header.css";
import f1 from "../assets/f1.png";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Scroll effect for solid navbar background
  useEffect(() => {
    const handleScroll = () => {
      const navbar = document.querySelector(".navbar");
      if (navbar) {
        if (window.pageYOffset > 40) {
          navbar.classList.add("solid");
        } else {
          navbar.classList.remove("solid");
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Handle escape key and lock body scroll
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.body.classList.add("nav-open-lock");
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.classList.remove("nav-open-lock");
    }

    return () => {
      document.body.classList.remove("nav-open-lock");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const toggleMenu = () => setIsMenuOpen((prev) => !prev);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className={`navbar ${isMenuOpen ? "menu-open" : ""}`}>
      <div className="navbar-container">
        <Link to="/" className="logo" onClick={closeMenu} aria-label="Formula 1 Home">
          <img src={f1} alt="F1 logo" />
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="desktop-nav" aria-label="Desktop Navigation">
          <Link
            to="/"
            className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
          >
            Home
          </Link>
          <Link
            to="/globe"
            className={`nav-link nav-globe-link ${location.pathname === "/globe" ? "active" : ""}`}
          >
            <span className="nav-globe-icon">🌐</span>
            <span>World Tour</span>
            <span className="nav-3d-badge">3D</span>
          </Link>
          <Link
            to="/drivers"
            className={`nav-link ${location.pathname === "/drivers" ? "active" : ""}`}
          >
            Drivers
          </Link>
          <Link
            to="/teams"
            className={`nav-link ${location.pathname === "/teams" ? "active" : ""}`}
          >
            Teams
          </Link>
          <Link
            to="/races"
            id="pending"
            className={`nav-link ${location.pathname === "/races" ? "active" : ""}`}
          >
            Races
          </Link>
          <Link
            to="/standings"
            className={`nav-link ${location.pathname === "/standings" ? "active" : ""}`}
          >
            Standings
          </Link>
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          className={`hamburger-btn ${isMenuOpen ? "active" : ""}`}
          onClick={toggleMenu}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMenuOpen}
        >
          <span className="hamburger-bar"></span>
          <span className="hamburger-bar"></span>
          <span className="hamburger-bar"></span>
        </button>
      </div>

      {/* Mobile Navigation Drawer Overlay */}
      <div className={`mobile-nav-overlay ${isMenuOpen ? "open" : ""}`} aria-hidden={!isMenuOpen}>
        <div
          className="mobile-nav-backdrop"
          onClick={closeMenu}
          role="button"
          tabIndex={isMenuOpen ? 0 : -1}
          aria-label="Close menu backdrop"
        />
        <nav className="mobile-nav-drawer" aria-label="Mobile Navigation Drawer">
          <div className="mobile-nav-header">
            <div className="mobile-nav-brand">
              <img src={f1} alt="F1" className="mobile-drawer-logo" />
              <span className="mobile-nav-title">Menu</span>
            </div>
            <button
              type="button"
              className="mobile-nav-close-btn"
              onClick={closeMenu}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className="mobile-nav-links">
            <Link
              to="/"
              onClick={closeMenu}
              className={`mobile-nav-link ${location.pathname === "/" ? "active" : ""}`}
            >
              <span className="nav-item-icon">🏠</span>
              <span>Home</span>
            </Link>
            <Link
              to="/globe"
              onClick={closeMenu}
              className={`mobile-nav-link nav-globe-link ${location.pathname === "/globe" ? "active" : ""}`}
            >
              <span className="nav-globe-icon">🌐</span>
              <span>World Tour</span>
              <span className="nav-3d-badge">3D</span>
            </Link>
            <Link
              to="/drivers"
              onClick={closeMenu}
              className={`mobile-nav-link ${location.pathname === "/drivers" ? "active" : ""}`}
            >
              <span className="nav-item-icon">🏎️</span>
              <span>Drivers</span>
            </Link>
            <Link
              to="/teams"
              onClick={closeMenu}
              className={`mobile-nav-link ${location.pathname === "/teams" ? "active" : ""}`}
            >
              <span className="nav-item-icon">🏁</span>
              <span>Teams</span>
            </Link>
            <Link
              to="/races"
              onClick={closeMenu}
              className={`mobile-nav-link ${location.pathname === "/races" ? "active" : ""}`}
            >
              <span className="nav-item-icon">📅</span>
              <span>Races</span>
            </Link>
            <Link
              to="/standings"
              onClick={closeMenu}
              className={`mobile-nav-link ${location.pathname === "/standings" ? "active" : ""}`}
            >
              <span className="nav-item-icon">🏆</span>
              <span>Standings</span>
            </Link>
          </div>

          <div className="mobile-nav-footer">
            <button type="button" className="mobile-nav-dismiss-btn" onClick={closeMenu}>
              Close Menu
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
