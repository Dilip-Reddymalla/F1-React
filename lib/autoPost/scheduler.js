/**
 * Scheduler module — fetches session data from OpenF1 API.
 *
 * Determines which sessions have completed in the recent window
 * (last 24 hours) and are eligible for auto-posting.
 */

import {
  OPENF1_BASE,
  TRACKED_SESSION_TYPES,
  SESSION_BUFFERS,
  POST_SESSION_BUFFER_MINUTES,
} from "./config.js";

/**
 * Fetch all sessions for the current year from the OpenF1 API.
 * @returns {Promise<Array>} Array of session objects.
 */
async function fetchSessions(year) {
  const url = `${OPENF1_BASE}/sessions?year=${year}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`OpenF1 API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Find sessions that have completed within the given lookback window.
 *
 * A session is considered "completed" if:
 *   now >= session.date_start + SESSION_BUFFER[type]
 *   AND session.date_start is within the lookback window
 *
 * @param {number} lookbackHours - How many hours to look back (default 26).
 * @returns {Promise<Array<{sessionType: string, sessionName: string, dateStart: Date, location: string, country: string, circuitShortName: string}>>}
 */
export async function getRecentlyCompletedSessions(lookbackHours = 26) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  let sessions;
  try {
    sessions = await fetchSessions(currentYear);
  } catch (err) {
    console.error("[scheduler] Failed to fetch OpenF1 sessions:", err.message);
    return [];
  }

  if (!Array.isArray(sessions) || sessions.length === 0) {
    console.log("[scheduler] No sessions returned from OpenF1.");
    return [];
  }

  const lookbackMs = lookbackHours * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - lookbackMs);

  const completed = [];

  for (const session of sessions) {
    const type = session.session_type;
    if (!TRACKED_SESSION_TYPES.includes(type)) continue;

    const dateStart = new Date(session.date_start);
    if (isNaN(dateStart.getTime())) continue;

    // Session must have started within our lookback window
    if (dateStart < cutoff) continue;

    // Session must have reached end time + 20 minute buffer
    let triggerTime;
    if (session.date_end) {
      triggerTime = new Date(
        new Date(session.date_end).getTime() + POST_SESSION_BUFFER_MINUTES * 60 * 1000
      );
    } else {
      const bufferMin = SESSION_BUFFERS[type] ?? 80;
      triggerTime = new Date(dateStart.getTime() + bufferMin * 60 * 1000);
    }

    if (now < triggerTime) {
      console.log(
        `[scheduler] ${type} at ${session.location} is not ready yet (ready at: ${triggerTime.toISOString()}).`
      );
      continue;
    }

    completed.push({
      sessionType: type,
      sessionName: session.session_name || type,
      dateStart,
      dateEnd: session.date_end ? new Date(session.date_end) : expectedEnd,
      location: session.location || "",
      country: session.country_name || "",
      circuitShortName: session.circuit_short_name || "",
      meetingName: session.meeting_name || "",
    });
  }

  console.log(
    `[scheduler] Found ${completed.length} completed session(s) in the last ${lookbackHours} hours.`
  );
  return completed;
}
