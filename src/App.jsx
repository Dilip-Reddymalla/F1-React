import { Routes, Route } from "react-router-dom";
import { useState } from "react";
import Home from "./pages/home";
import Drivers from "./pages/drivers";
import Races from "./pages/races";
import { TeamDetails } from "./pages/teams"; 
import { Standings } from "./pages/standings";
import "./App.css";


function App() {
  const [year, setYear] = useState("2025");
  return (
    <>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/drivers' element={<Drivers year={year} setYear={setYear} />} />
        <Route path='/teams' element={<TeamDetails year={year} setYear={setYear} />} />
        <Route path='/races' element={<Races year={year} setYear={setYear} />} />
        <Route path='/standings' element={<Standings year={year} setYear={setYear} />} />
      </Routes>
      
    </>
  )
}

export default App
