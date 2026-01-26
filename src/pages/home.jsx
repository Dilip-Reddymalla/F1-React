import { Header } from "../components/header";
import Lineup from "../assets/F1-2025-driver-line-up.webp";
import papaya from "../assets/papaya.jpg";
import lando from "../assets/lando.avif";
import "./home.css";

export function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="intro">
          <h1>Welcome to the F1 Information Hub</h1>
          <p>
            Your ultimate source for all things Formula 1. Explore the latest
            news, driver profiles, team statistics, race results, and
            championship standings.
          </p>
          <img
            src={Lineup}
            alt="all drivers 2025"
          />
        </section>
        <section className="constructorChamp">
          <h2>2025 constructor championship winner</h2>
          <p>
            McLearn Racing has clinched the 2025 Constructor's Championship with
            a stellar performance throughout the season. Their innovative
            strategies and exceptional teamwork have set them apart in the
            highly competitive world of Formula 1.
          </p>
          <img src={papaya} alt="Papaya mcLearn F1 car" />
        </section>
        <section className="driversChamp">
          <h2>2025 Driver's Championship Winner</h2>
          <p>
            Lando Norris has emerged as the 2025 Driver's Champion, showcasing
            remarkable skill and consistency on the track. His dedication and
            talent have earned him a well-deserved place at the top of the
            standings.
          </p>
          <img src={lando} alt="Lando Norris" />
        </section>
      </main>
    </>
  );
}

export default Home;
