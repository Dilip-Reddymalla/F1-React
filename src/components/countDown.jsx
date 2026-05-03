import { useEffect, useRef, useState } from "react";
import "./countDown.css";

const CountDown = ({ year }) => {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [countDownStarted, setCountDownStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [countDownStopTime, setCountDownStopTime] = useState("");
  const [localTimeZone, setLocalTimeZone] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [otherRaceDayEventsData, setOtherRaceDayEventsData] = useState([]);
  const currentEventRef = useRef(null);
  const timelineRef = useRef(null);

  const buildEventData = (race, eventKey, eventNameLabel) => {
    const eventDate = race?.[eventKey]?.date;
    const eventTime = race?.[eventKey]?.time || "00:00:00Z";

    if (!eventDate) return null;

    const eventDateTime = new Date(`${eventDate}T${eventTime}`);
    const timeRemainingMs = Math.max(0, eventDateTime.getTime() - Date.now());

    return {
      name: eventNameLabel,
      date: eventDate,
      time: eventTime,
      startAt: eventDateTime.getTime(),
      localTime: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).format(eventDateTime),
      totalRemainingMs: timeRemainingMs,
      timeRemaining: {
        days: Math.floor(timeRemainingMs / (1000 * 60 * 60 * 24)),
        hours: Math.floor(
          (timeRemainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        ),
        minutes: Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((timeRemainingMs % (1000 * 60)) / 1000),
      },
    };
  };

  useEffect(() => {
    let countDownInterval;
    if (countDownStarted && eventDate) {
      const updateRemainingTime = () => {
        const currentTime = Date.now();
        const eventTime = countDownStopTime
          ? new Date(`${eventDate}T${countDownStopTime}`).getTime()
          : new Date(eventDate).getTime();

        let remainingTime = eventTime - currentTime;

        setOtherRaceDayEventsData((currentEvents) =>
          currentEvents.map((event) => {
            const eventStartTime = event.startAt;
            const timeUntilEvent = Math.max(0, eventStartTime - currentTime);

            return {
              ...event,
              totalRemainingMs: timeUntilEvent,
              timeRemaining: {
                days: Math.floor(timeUntilEvent / (1000 * 60 * 60 * 24)),
                hours: Math.floor(
                  (timeUntilEvent % (1000 * 60 * 60 * 24)) /
                    (1000 * 60 * 60),
                ),
                minutes: Math.floor(
                  (timeUntilEvent % (1000 * 60 * 60)) / (1000 * 60),
                ),
                seconds: Math.floor((timeUntilEvent % (1000 * 60)) / 1000),
              },
            };
          }),
        );

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

      const getRaceStartTime = (race) => {
        if (!race?.date) return 0;

        return new Date(`${race.date}T${race.time || "00:00:00Z"}`).getTime();
      };

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch event data");

        const data = await res.json();
        const allRaces = data?.MRData?.RaceTable?.Races || [];

        const now = Date.now();
        const nextRace = allRaces.find((race) => getRaceStartTime(race) >= now);
        const raceWeekendData = [];
        const currentRace = nextRace;
        const findRaceEvent = () => currentRace;

        const firstPractice = findRaceEvent("FirstPractice");

        const firstPracticeData = buildEventData(
          firstPractice,
          "FirstPractice",
          "First Practice",
        );
        if (firstPracticeData) raceWeekendData.push(firstPracticeData);
        const secondPractice = findRaceEvent("SecondPractice");
        const secondPracticeData = buildEventData(
          secondPractice,
          "SecondPractice",
          "Second Practice",
        );
        if (secondPracticeData) raceWeekendData.push(secondPracticeData);
        const thirdPractice = findRaceEvent("ThirdPractice");
        const thirdPracticeData = buildEventData(
          thirdPractice,
          "ThirdPractice",
          "Third Practice",
        );
        if (thirdPracticeData) raceWeekendData.push(thirdPracticeData);

        const sprintQualifying = findRaceEvent("SprintQualifying");
        const sprintQualifyingData = buildEventData(
          sprintQualifying,
          "SprintQualifying",
          "Sprint Qualifying",
        );
        if (sprintQualifyingData) raceWeekendData.push(sprintQualifyingData);

        const sprint = findRaceEvent("Sprint");
        const sprintData = buildEventData(sprint, "Sprint", "Sprint");
        if (sprintData) raceWeekendData.push(sprintData);

        const qualifying = findRaceEvent("Qualifying");
        const qualifyingData = buildEventData(
          qualifying,
          "Qualifying",
          "Qualifying",
        );
        if (qualifyingData) raceWeekendData.push(qualifyingData);

        const uniqueWeekendData = raceWeekendData.filter(
          (event, index, events) =>
            index ===
            events.findIndex(
              (current) =>
                current.name === event.name && current.date === event.date,
            ),
        );

        setOtherRaceDayEventsData(uniqueWeekendData);

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

  const upcomingEvents = [...otherRaceDayEventsData].sort(
    (firstEvent, secondEvent) => {
      const firstTime = firstEvent.startAt || 0;
      const secondTime = secondEvent.startAt || 0;
      return firstTime - secondTime;
    },
  );

  const currentRaceEvent = eventDate
    ? {
        name: eventName,
        date: eventDate,
        time: countDownStopTime,
        startAt: new Date(
          `${eventDate}T${countDownStopTime || "00:00:00Z"}`,
        ).getTime(),
        localTime,
        isCurrentRace: true,
        timeRemaining: {
          days,
          hours,
          minutes,
          seconds,
        },
      }
    : null;

  const timelineEvents = [
    ...upcomingEvents,
    ...(currentRaceEvent ? [currentRaceEvent] : []),
  ].sort((firstEvent, secondEvent) => {
    const firstTime = firstEvent.startAt || 0;
    const secondTime = secondEvent.startAt || 0;
    return firstTime - secondTime;
  });

  useEffect(() => {
    const el = currentEventRef.current;
    if (!el) return;
    const timeline = el.closest(".countdown-timeline");
    if (!timeline) return;

    // Only scroll when timeline actually scrollable
    if (timeline.scrollWidth <= timeline.clientWidth) return;

    let rafId = 0;
    let timeoutId = 0;
    const doScroll = () => {
      // compute center position and smooth scroll timeline
      const targetLeft =
        el.offsetLeft + el.offsetWidth / 2 - timeline.clientWidth / 2;
      timeline.scrollTo({ left: targetLeft, behavior: "smooth" });
    };

    // Wait for layout to settle: next frame + small timeout
    rafId = requestAnimationFrame(() => {
      timeoutId = window.setTimeout(doScroll, 60);
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [eventDate, countDownStarted, upcomingEvents.length]);

  // JS parallax / rolling effect for timeline cards
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;

    let rafId = 0;

    const updateTransforms = () => {
      const rect = timeline.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const cards = timeline.querySelectorAll(".countdown-timeline-card");

      cards.forEach((card) => {
        // skip heavy transform for current card
        if (card.classList.contains("countdown-timeline-card--current")) {
          card.style.transform = "";
          card.style.opacity = "1";
          card.style.filter = "none";
          return;
        }

        const r = card.getBoundingClientRect();
        const cardCenter = r.left + r.width / 2;
        const distance = cardCenter - centerX;
        const norm = Math.max(-1, Math.min(1, distance / (rect.width / 2)));

        const distanceFactor = Math.abs(norm);
        const scale = 1 - distanceFactor * 0.025;
        const opacity = 1 - distanceFactor * 0.28;

          // keep cards separate; let edge cards fade instead of overlap
          card.style.transform = `scale(${scale})`;
          card.style.opacity = `${opacity}`;
          card.style.filter = "none";
      });
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateTransforms();
        rafId = 0;
      });
    };

    // initial
    updateTransforms();

    timeline.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      timeline.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [timelineEvents.length]);

  return (
    <>
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

        {timelineEvents.length > 0 ? (
          <div
            className="countdown-timeline"
            aria-label="Race weekend timeline"
            ref={timelineRef}
          >
            {timelineEvents.map((event) => {
              const isCurrentRace = event.isCurrentRace;
              const isComplete = !isCurrentRace && event.startAt <= Date.now();

              return (
                <article
                  key={`${event.name}-${event.date}-${event.time}`}
                  ref={isCurrentRace ? currentEventRef : null}
                  className={`countdown-timer-container countdown-timeline-card${isCurrentRace ? " countdown-timeline-card--current" : ""}`}
                >
                  <div className="countdown-header">
                    <span className="countdown-kicker">
                      {isCurrentRace ? "Next Grand Prix" : "Upcoming Event"}
                    </span>
                    <h2 className="countdown-name">{event.name}</h2>
                    <p className="countdown-subtitle">
                      {event.localTime
                        ? `Starts ${event.localTime}`
                        : event.date}
                    </p>
                  </div>

                  {isComplete ? (
                    <div className="countdown-empty">Completed</div>
                  ) : event.timeRemaining ? (
                    <div
                      className="countdown-display"
                      aria-label="Race countdown timer"
                    >
                      <div className="countdown-grid">
                        <div className="countdown-card">
                          <span className="countdown-value">
                            {event.timeRemaining.days}
                          </span>
                          <span className="countdown-label">Days</span>
                        </div>
                        <div className="countdown-card">
                          <span className="countdown-value">
                            {event.timeRemaining.hours}
                          </span>
                          <span className="countdown-label">Hours</span>
                        </div>
                        <div className="countdown-card">
                          <span className="countdown-value">
                            {event.timeRemaining.minutes}
                          </span>
                          <span className="countdown-label">Mins</span>
                        </div>
                        <div className="countdown-card countdown-card--accent">
                          <span className="countdown-value">
                            {event.timeRemaining.seconds}
                          </span>
                          <span className="countdown-label">Secs</span>
                        </div>
                      </div>
                      <p className="countdown-footnote">
                        {isCurrentRace
                          ? "Time remaining until race start"
                          : "Time remaining until event start"}
                      </p>
                    </div>
                  ) : (
                    <div className="countdown-empty">No event countdown</div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="countdown-empty">No race is scheduled</div>
        )}
      </div>
    </>
  );
};

export default CountDown;
