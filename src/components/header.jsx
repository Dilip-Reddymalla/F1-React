import { useEffect } from "react";
import { Link } from "react-router-dom";
import "./header.css";
import f1 from "../assets/f1.png";

export function Header() {
  useEffect(() => {
    window.onscroll = function () {
      scrollFunction();
    };

    function scrollFunction() {
      var navbar = document.querySelector(".navbar");
      if (navbar) {
        if (window.pageYOffset > 50) {
          navbar.classList.add("solid");
        } else {
          navbar.classList.remove("solid");
        }
      }
    }
  }, []);

  return (
    <header className="navbar">
      <nav>
        <Link to="/">Home</Link>
        <Link to="/drivers">Drivers</Link>
        <Link to="/teams">Teams</Link>
        <Link to="/races" id="pending">
          Races
        </Link>
        <Link to="/standings">Standings</Link>
      </nav>
      <div className="logo">
        <img src={f1} alt="F1 logo" />
      </div>
    </header>
  );
}
