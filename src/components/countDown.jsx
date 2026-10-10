import { useEffect, useRef, useState } from "react";
import "./countDown.css";

const SESSION_DURATIONS_MS = {
  "First Practice": 60 * 60 * 1000,
  "Second Practice": 60 * 60 * 1000,
  "Third Practice": 60 * 60 * 1000,
  "Sprint Qualifying": 44 * 60 * 1000,
  "Sprint Shootout": 44 * 60 * 1000,
  "Sprint": 60 * 60 * 1000,
  "Qualifying": 60 * 60 * 1000,
  "Race": 120 * 60 * 1000,
};

function matchOpenF1Session(sessions, locality, country, eventNameLabel) {
  if (!sessions || sessions.length === 0) return null;
  const locA = (locality || "").toLowerCase();
  const locB = (country || "").toLowerCase();

  const matchingLoc = sessions.filter((s) => {
    const sLoc = (s.location || s.meeting_name || s.country_name || "").toLowerCase();
    return (
      (locA && sLoc.includes(locA)) ||
      (locB && sLoc.includes(locB)) ||
      (locA && locA.includes(sLoc))
    );
  });

  const candidates = matchingLoc.length > 0 ? matchingLoc : sessions;
  const target = eventNameLabel.toLowerCase();

  return candidates.find((s) => {
    const sName = (s.session_name || s.session_type || "").toLowerCase();
    if (target.includes("first practice") || target === "fp1") {
      return sName.includes("practice 1") || sName === "fp1";
    }
    if (target.includes("second practice") || target === "fp2") {
      return sName.includes("practice 2") || sName === "fp2";
    }
    if (target.includes("third practice") || target === "fp3") {
      return sName.includes("practice 3") || sName === "fp3";
    }
    if (target.includes("sprint qualifying") || target.includes("sprint shootout")) {
      return sName.includes("sprint qualifying") || sName.includes("shootout");
    }
    if (target === "sprint") {
      return sName === "sprint" || (sName.includes("sprint") && !sName.includes("qualifying"));
    }
    if (target.includes("qualifying")) {
      return sName === "qualifying" || (sName.includes("qualifying") && !sName.includes("sprint"));
    }
    if (target.includes("race")) {
      return sName === "race";
    }
    return false;
  });
}

const CountDown = ({ year }) => {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [countDownStarted, setCountDownStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [countDownStopTime, setCountDownStopTime] = useState("");
  const [raceEndAt, setRaceEndAt] = useState(0);
  const [localTimeZone, setLocalTimeZone] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [otherRaceDayEventsData, setOtherRaceDayEventsData] = useState([]);
  const currentEventRef = useRef(null);
  const timelineRef = useRef(null);
  const triggeredSyncRef = useRef(new Set());
  const lastSyncRequestTimeRef = useRef(0);

  const triggerSessionAutoSync = (sessionName, sessionDate, sessionEndAt) => {
    if (!sessionEndAt) return;

    const key = `${sessionName}-${sessionDate}`;
    const storageKey = `f1_auto_synced_${sessionName}_${sessionDate}`;

    // 1. In-memory deduplication (same session lifecycle)
    if (triggeredSyncRef.current.has(key)) return;

    // 2. Persistent storage deduplication (across page refreshes & tabs)
    try {
      if (typeof window !== "undefined" && localStorage.getItem(storageKey)) {
        triggeredSyncRef.current.add(key);
        return;
      }
    } catch (_) {}

    // 3. Narrow Auto-Trigger Window:
    // Only auto-trigger when the session has passed endAt + 20min and is within 2 hours of completion.
    // If a session ended hours or days ago, do NOT auto-trigger on page load/refresh!
    const currentTime = Date.now();
    const bufferMs = 20 * 60 * 1000; // 20 min buffer
    const windowDurationMs = 120 * 60 * 1000; // 2 hours window
    const elapsedSinceEnd = currentTime - sessionEndAt;

    if (elapsedSinceEnd < bufferMs || elapsedSinceEnd > bufferMs + windowDurationMs) {
      return;
    }

    // 4. Rate-limiting: prevent spamming /api/cron/auto-post if multiple sessions qualify (max 1 call per 30s)
    if (currentTime - lastSyncRequestTimeRef.current < 30 * 1000) {
      return;
    }

    triggeredSyncRef.current.add(key);
    lastSyncRequestTimeRef.current = currentTime;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, String(currentTime));
      }
    } catch (_) {}

    console.log(
      `[Auto-Sync] Session countdown + 20m reached for ${sessionName}. Triggering auto-post sync...`
    );
    fetch("/api/cron/auto-post", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        console.log(`[Auto-Sync] Result for ${sessionName}:`, data);
        window.dispatchEvent(
          new CustomEvent("f1:post-auto-synced", {
            detail: { session: sessionName, data },
          })
        );
      })
      .catch((err) =>
        console.warn(`[Auto-Sync] Error syncing ${sessionName}:`, err.message)
      );
  };

  const buildEventData = (race, eventKey, eventNameLabel, openF1Match) => {
    const eventDate = race?.[eventKey]?.date;
    const eventTime = race?.[eventKey]?.time || "00:00:00Z";

    if (!eventDate) return null;

    const eventDateTime = new Date(`${eventDate}T${eventTime}`);
    const startAt = openF1Match?.date_start
      ? new Date(openF1Match.date_start).getTime()
      : eventDateTime.getTime();

    const duration = SESSION_DURATIONS_MS[eventNameLabel] || 60 * 60 * 1000;
    const endAt = openF1Match?.date_end
      ? new Date(openF1Match.date_end).getTime()
      : startAt + duration;

    const now = Date.now();
    const isLive = now >= startAt && now < endAt;
    const isComplete = now >= endAt;
    const targetTime = isLive ? endAt : startAt;
    const timeRemainingMs = Math.max(0, targetTime - now);

    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: userTz,
    });
    const endTimeFormatter = new Intl.DateTimeFormat(undefined, {
      timeStyle: "short",
      timeZone: userTz,
    });

    return {
      name: eventNameLabel,
      date: eventDate,
      time: eventTime,
      startAt,
      endAt,
      isLive,
      isComplete,
      localTime: timeFormatter.format(new Date(startAt)),
      localEndTime: endTimeFormatter.format(new Date(endAt)),
      totalRemainingMs: timeRemainingMs,
      timeRemaining: {
        days: Math.floor(timeRemainingMs / (1000 * 60 * 60 * 24)),
        hours: Math.floor(
          (timeRemainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
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
        const raceStartTime = countDownStopTime
          ? new Date(`${eventDate}T${countDownStopTime}`).getTime()
          : new Date(eventDate).getTime();

        const raceIsLive = currentTime >= raceStartTime && currentTime < raceEndAt;
        const raceTarget = raceIsLive ? raceEndAt : raceStartTime;
        let remainingTime = Math.max(0, raceTarget - currentTime);

        if (raceEndAt && currentTime >= raceEndAt + 20 * 60 * 1000) {
          triggerSessionAutoSync(eventName, eventDate, raceEndAt);
        }

        setOtherRaceDayEventsData((currentEvents) => {
          currentEvents.forEach((ev) => {
            if (ev.endAt && currentTime >= ev.endAt + 20 * 60 * 1000) {
              triggerSessionAutoSync(ev.name, ev.date, ev.endAt);
            }
          });

          return currentEvents.map((event) => {
            const isLive = currentTime >= event.startAt && currentTime < event.endAt;
            const isComplete = currentTime >= event.endAt;
            const targetTime = isLive ? event.endAt : event.startAt;
            const timeUntilEvent = Math.max(0, targetTime - currentTime);

            return {
              ...event,
              isLive,
              isComplete,
              totalRemainingMs: timeUntilEvent,
              timeRemaining: {
                days: Math.floor(timeUntilEvent / (1000 * 60 * 60 * 24)),
                hours: Math.floor(
                  (timeUntilEvent % (1000 * 60 * 60 * 24)) /
                    (1000 * 60 * 60)
                ),
                minutes: Math.floor(
                  (timeUntilEvent % (1000 * 60 * 60)) / (1000 * 60)
                ),
                seconds: Math.floor((timeUntilEvent % (1000 * 60)) / 1000),
              },
            };
          });
        });

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
          countDownStopTime ? `${eventDate}T${countDownStopTime}` : eventDate
        )
      );

      setLocalTimeZone(userTimeZoneFormatted);
      setLocalTime(localTimeformatted);

      updateRemainingTime();
      countDownInterval = setInterval(updateRemainingTime, 1000);
    }
    return () => clearInterval(countDownInterval);
  }, [eventDate, countDownStarted, eventName, countDownStopTime, raceEndAt]);

  useEffect(() => {
    async function fetchEventData() {
      const url = `https://api.jolpi.ca/ergast/f1/${year}/races.json`;

      try {
        const [resJolpica, resOpenF1] = await Promise.all([
          fetch(url),
          fetch(`https://api.openf1.org/v1/sessions?year=${year}`).catch(() => null),
        ]);

        if (!resJolpica.ok) throw new Error("Failed to fetch event data");

        const data = await resJolpica.json();
        const allRaces = data?.MRData?.RaceTable?.Races || [];
        const openF1Sessions = resOpenF1?.ok ? await resOpenF1.json() : [];

        const now = Date.now();
        // A race is relevant if its completion window (start + 2h) is in the future
        const nextRace = allRaces.find((race) => {
          const start = new Date(`${race.date}T${race.time || "00:00:00Z"}`).getTime();
          return start + 2 * 3600 * 1000 >= now;
        }) || allRaces[allRaces.length - 1];

        const raceWeekendData = [];
        const locality = nextRace?.Circuit?.Location?.locality || "";
        const country = nextRace?.Circuit?.Location?.country || "";

        const sessionConfigs = [
          { key: "FirstPractice", label: "First Practice" },
          { key: "SecondPractice", label: "Second Practice" },
          { key: "ThirdPractice", label: "Third Practice" },
          { key: "SprintQualifying", label: "Sprint Qualifying" },
          { key: "Sprint", label: "Sprint" },
          { key: "Qualifying", label: "Qualifying" },
        ];

        for (const cfg of sessionConfigs) {
          const openF1Match = matchOpenF1Session(openF1Sessions, locality, country, cfg.label);
          const evData = buildEventData(nextRace, cfg.key, cfg.label, openF1Match);
          if (evData) raceWeekendData.push(evData);
        }

        const uniqueWeekendData = raceWeekendData.filter(
          (event, index, events) =>
            index ===
            events.findIndex(
              (current) =>
                current.name === event.name && current.date === event.date
            )
        );

        setOtherRaceDayEventsData(uniqueWeekendData);

        if (nextRace) {
          const raceOpenF1 = matchOpenF1Session(openF1Sessions, locality, country, "Race");
          const rStart = raceOpenF1?.date_start
            ? new Date(raceOpenF1.date_start).getTime()
            : new Date(`${nextRace.date}T${nextRace.time || "00:00:00Z"}`).getTime();
          const rEnd = raceOpenF1?.date_end
            ? new Date(raceOpenF1.date_end).getTime()
            : rStart + 2 * 3600 * 1000;

          setEventName(nextRace.raceName || "");
          setEventDate(nextRace.date || "");
          setCountDownStopTime(nextRace.time || "");
          setRaceEndAt(rEnd);
          setCountDownStarted(true);
        }
      } catch (err) {
        console.error("Error fetching event data:", err);
      }
    }

    fetchEventData();
  }, [year]);

  const now = Date.now();
  const raceStartAt = eventDate
    ? new Date(`${eventDate}T${countDownStopTime || "00:00:00Z"}`).getTime()
    : 0;
  const raceIsLive = now >= raceStartAt && now < raceEndAt;
  const raceIsComplete = now >= raceEndAt;

  const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  const upcomingEvents = [...otherRaceDayEventsData].sort(
    (a, b) => (a.startAt || 0) - (b.startAt || 0)
  );

  const currentRaceEvent = eventDate
    ? {
        name: eventName,
        date: eventDate,
        time: countDownStopTime,
        startAt: raceStartAt,
        endAt: raceEndAt,
        localTime,
        isCurrentRace: true,
        isLive: raceIsLive,
        isComplete: raceIsComplete,
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
  ].sort((a, b) => (a.startAt || 0) - (b.startAt || 0));

  // Determine which event is active/current for centering
  const liveEvent = timelineEvents.find((e) => e.isLive);
  const nextUpcomingEvent = timelineEvents.find((e) => !e.isComplete);
  const focusedEvent = liveEvent || nextUpcomingEvent || timelineEvents[timelineEvents.length - 1];

  useEffect(() => {
    const el = currentEventRef.current;
    if (!el) return;
    const timeline = el.closest(".countdown-timeline");
    if (!timeline) return;

    if (timeline.scrollWidth <= timeline.clientWidth) return;

    let rafId = 0;
    let timeoutId = 0;
    const doScroll = () => {
      const targetLeft =
        el.offsetLeft + el.offsetWidth / 2 - timeline.clientWidth / 2;
      timeline.scrollTo({ left: targetLeft, behavior: "smooth" });
    };

    rafId = requestAnimationFrame(() => {
      timeoutId = window.setTimeout(doScroll, 60);
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [eventDate, countDownStarted, upcomingEvents.length, liveEvent?.name]);

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
        if (
          card.classList.contains("countdown-timeline-card--current") ||
          card.classList.contains("countdown-timeline-card--live")
        ) {
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
          <span
            className={`countdown-kicker ${
              liveEvent ? "countdown-kicker--live" : ""
            }`}
          >
            {liveEvent ? (
              <>
                <span className="live-dot" /> LIVE NOW • {liveEvent.name}
              </>
            ) : (
              "Next Grand Prix"
            )}
          </span>
          <h2 className="countdown-name">
            {countDownStarted ? eventName : "Countdown Timer"}
          </h2>
          <p className="countdown-subtitle">
            {liveEvent
              ? `Session in progress — Ends at ${liveEvent.localEndTime || "soon"}`
              : countDownStarted
              ? `Lights out on ${eventDate}${
                  countDownStopTime ? ` at ${localTime} ${localTimeZone}` : ""
                }`
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
              const isLive = event.isLive;
              const isComplete = event.isComplete;
              const isFocused = event === focusedEvent;

              return (
                <article
                  key={`${event.name}-${event.date}-${event.time}`}
                  ref={isFocused ? currentEventRef : null}
                  className={`countdown-timer-container countdown-timeline-card${
                    isCurrentRace ? " countdown-timeline-card--current" : ""
                  }${isLive ? " countdown-timeline-card--live" : ""}${
                    isComplete ? " countdown-timeline-card--completed" : ""
                  }`}
                >
                  <div className="countdown-header">
                    <span
                      className={`countdown-kicker ${
                        isLive
                          ? "countdown-kicker--live"
                          : isComplete
                          ? "countdown-kicker--completed"
                          : ""
                      }`}
                    >
                      {isLive ? (
                        <>
                          <span className="live-dot" /> LIVE NOW
                        </>
                      ) : isComplete ? (
                        "Completed"
                      ) : isCurrentRace ? (
                        "Next Grand Prix"
                      ) : (
                        "Upcoming Event"
                      )}
                    </span>
                    <h2 className="countdown-name">{event.name}</h2>
                    <p className="countdown-subtitle">
                      {isLive
                        ? `Session in progress • Ends ${event.localEndTime}`
                        : isComplete
                        ? `Session ended • ${event.localEndTime || event.date}`
                        : event.localTime
                        ? `Starts ${event.localTime}`
                        : event.date}
                    </p>
                  </div>

                  {isComplete ? (
                    <div className="countdown-status-box countdown-status-box--completed">
                      <span className="status-check">✓</span>
                      <span>Session Completed</span>
                    </div>
                  ) : isLive ? (
                    <div
                      className="countdown-display countdown-display--live"
                      aria-label="Live event in progress"
                    >
                      <div className="live-pulse-banner">
                        <span className="live-radar-ping" />
                        <span className="live-pulse-text">SESSION IN PROGRESS</span>
                      </div>
                      <div className="countdown-grid">
                        <div className="countdown-card countdown-card--live">
                          <span className="countdown-value">
                            {event.timeRemaining.hours}
                          </span>
                          <span className="countdown-label">Hours</span>
                        </div>
                        <div className="countdown-card countdown-card--live">
                          <span className="countdown-value">
                            {event.timeRemaining.minutes}
                          </span>
                          <span className="countdown-label">Mins</span>
                        </div>
                        <div className="countdown-card countdown-card--live countdown-card--accent">
                          <span className="countdown-value">
                            {event.timeRemaining.seconds}
                          </span>
                          <span className="countdown-label">Secs</span>
                        </div>
                      </div>
                      <p className="countdown-footnote live-footnote">
                        Time remaining until session finish
                      </p>
                    </div>
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
