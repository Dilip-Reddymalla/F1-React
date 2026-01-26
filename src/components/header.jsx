import {Link} from "react-router-dom";
import "./header.css";
import f1 from "../assets/f1.png";


export function Header(){
    return (
        <header className="navbar">
        <nav>
            <Link to="/">Home</Link>
            <Link to="/drivers">Drivers</Link>
            <Link to="/teams">Teams</Link>
            <Link to="/races" id="pending">Races</Link>
            <Link to="/standings">Standings</Link>
        </nav>
        <div className="logo">
            <img src={f1} alt="F1 logo"/>
        </div>
    </header>
    );
}