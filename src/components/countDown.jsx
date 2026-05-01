import { useEffect, useState } from "react";
import "./countDown.css";

const CountDown = ({ year }) => {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [countDownStarted, setCountDownStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [countDownStopTime, setCountDownStopTime] = useState("");
  const [localTimeZone, setLocalTimeZone] = useState("");
  const [localTime, setLocalTime] = useState("");

  useEffect(() => {
    let countDownInterval;
    if (countDownStarted && eventDate) {
      const updateRemainingTime = () => {
        const currentTime = Date.now();
        const eventTime = countDownStopTime
          ? new Date(`${eventDate}T${countDownStopTime}`).getTime()
          : new Date(eventDate).getTime();

        let remainingTime = eventTime - currentTime;

        if (remainingTime <= 0) {
          remainingTime = 0;
          clearInterval(countDownInterval);
          alert(`${eventName} count down completed!`);
          setCountDownStarted(false);
        }

        setTimeRemaining(remainingTime);
      };
      const userTimeZoneFormatted =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localTimeformatted = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: userTimeZoneFormatted,
      }).format(
        new Date(
          countDownStopTime ? `${eventDate}T${countDownStopTime}` : eventDate,
        ),
      );
      setLocalTimeZone(userTimeZoneFormatted);
      setLocalTime(localTimeformatted);

      updateRemainingTime();
      countDownInterval = setInterval(() => {
        updateRemainingTime();
      }, 1000);
    }
    return () => clearInterval(countDownInterval);
  }, [eventDate, countDownStarted, eventName, countDownStopTime]);

  useEffect(() => {
    async function fetchEventData() {
      const url = `https://api.jolpi.ca/ergast/f1/${year}/races.json`;

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch event data");

        const data = await res.json();
        const allRaces = data?.MRData?.RaceTable?.Races || [];
        const nextRace = allRaces.find(
          (race) => new Date(race.date) > new Date(),
        );

        if (nextRace) {
          setEventName(nextRace.raceName || "");
          setEventDate(nextRace.date || "");
          setCountDownStarted(true);
          setCountDownStopTime(nextRace.time || "");
        }
      } catch (err) {
        console.error("Error fetching event data:", err);
      }
    }

    fetchEventData();
  }, [year]);

  const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
  );
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  return (
    <div className="countdown-timer-container">
      <div className="countdown-header">
        <span className="countdown-kicker">Next Grand Prix</span>
        <h2 className="countdown-name">
          {countDownStarted ? eventName : "Countdown Timer"}
        </h2>
        <p className="countdown-subtitle">
          {countDownStarted
            ? `Lights out on ${eventDate}${countDownStopTime ? ` at ${localTime} ${localTimeZone}` : ""}`
            : "Waiting for next race schedule"}
        </p>
      </div>

      {countDownStarted ? (
        <div className="countdown-display" aria-label="Race countdown timer">
          <div className="countdown-grid">
            <div className="countdown-card">
              <span className="countdown-value">{days}</span>
              <span className="countdown-label">Days</span>
            </div>
            <div className="countdown-card">
              <span className="countdown-value">{hours}</span>
              <span className="countdown-label">Hours</span>
            </div>
            <div className="countdown-card">
              <span className="countdown-value">{minutes}</span>
              <span className="countdown-label">Mins</span>
            </div>
            <div className="countdown-card countdown-card--accent">
              <span className="countdown-value">{seconds}</span>
              <span className="countdown-label">Secs</span>
            </div>
          </div>
          <p className="countdown-footnote">Time remaining until race start</p>
        </div>
      ) : (
        <div className="countdown-empty">No race is scheduled</div>
      )}
    </div>
  );
};

export default CountDown;
