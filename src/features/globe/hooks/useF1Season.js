import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import fallback from '../data/seasonFallback.json';

const CACHE_KEY = (year) => `f1-season:${year}`;
const STALE_MS = 10 * 60 * 1000;

function normalizeRace(r) {
  return {
    round: String(r.round),
    season: String(r.season),
    raceName: r.raceName,
    circuitId: r.Circuit?.circuitId || r.circuitId,
    circuitName: r.Circuit?.circuitName || r.circuitName,
    location: r.Circuit?.Location || r.location,
    date: r.date,
    time: r.time,
    sessions: {
      FirstPractice: r.FirstPractice || r.sessions?.FirstPractice || null,
      SecondPractice: r.SecondPractice || r.sessions?.SecondPractice || null,
      ThirdPractice: r.ThirdPractice || r.sessions?.ThirdPractice || null,
      Qualifying: r.Qualifying || r.sessions?.Qualifying || null,
      SprintQualifying: r.SprintQualifying || r.SprintShootout || r.sessions?.SprintQualifying || r.sessions?.SprintShootout || null,
      Sprint: r.Sprint || r.sessions?.Sprint || null,
    },
    url: r.url || null,
  };
}

function pickFallback(year) {
  return (fallback.races || []).map((r) => normalizeRace({ ...r, season: String(year) }));
}

function parseUTC(date, time) {
  if (!date) return null;
  const t = (time || '00:00:00').trim();
  const iso = t.endsWith('Z') ? `${date}T${t}` : `${date}T${t}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function nextRaceIndex(races) {
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  races.forEach((r, i) => {
    const d = parseUTC(r.date, r.time);
    if (!d) return;
    const diff = d.getTime() - now;
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  if (bestDiff === Infinity) return races.length - 1;
  return best;
}

export function useF1Season(year = '2026') {
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

  const fetchSeason = useCallback(async (opts = {}) => {
    const { force = false } = opts;
    setError(null);

    if (!force) {
      try {
        const raw = localStorage.getItem(CACHE_KEY(year));
        if (raw) {
          const cached = JSON.parse(raw);
          const age = Date.now() - (cached.ts || 0);
          if (cached.races?.length && age < STALE_MS) {
            setRaces(cached.races);
            setIsFallback(!!cached.isFallback);
            setLastUpdated(cached.ts);
            setLoading(false);
          }
        }
      } catch {
        // ignore cache parse errors
      }
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const needLoading = !force ? races.length === 0 : true;
    if (needLoading) setLoading(true);

    const endpoints = [
      `https://api.jolpi.ca/ergast/f1/${year}.json`,
      `https://ergast.com/api/f1/${year}.json`,
    ];

    let lastErr = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
        const json = await res.json();
        const list = json?.MRData?.RaceTable?.Races;
        if (!Array.isArray(list) || list.length === 0) throw new Error('Empty RaceTable');
        const normalized = list.map(normalizeRace);
        setRaces(normalized);
        setIsFallback(false);
        setLastUpdated(Date.now());
        try {
          localStorage.setItem(CACHE_KEY(year), JSON.stringify({ ts: Date.now(), races: normalized, isFallback: false }));
        } catch {
          // ignore
        }
        setLoading(false);
        return;
      } catch (e) {
        if (e?.name === 'AbortError') {
          setLoading(false);
          return;
        }
        lastErr = e;
      }
    }

    try {
      const raw = localStorage.getItem(CACHE_KEY(year));
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.races?.length) {
          setRaces(cached.races);
          setIsFallback(true);
          setLastUpdated(cached.ts);
          setError(lastErr);
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }

    const fb = pickFallback(year);
    setRaces(fb);
    setIsFallback(true);
    setError(lastErr || new Error('Using fallback calendar'));
    setLoading(false);
    try {
      localStorage.setItem(CACHE_KEY(year), JSON.stringify({ ts: Date.now(), races: fb, isFallback: true }));
    } catch {
      // ignore
    }
  }, [year]);

  useEffect(() => {
    fetchSeason();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchSeason]);

  const suggestedIndex = useMemo(() => (races.length ? nextRaceIndex(races) : 0), [races]);
  const refresh = useCallback(() => fetchSeason({ force: true }), [fetchSeason]);

  return { races, loading, error, isFallback, lastUpdated, suggestedIndex, refresh, year };
}
