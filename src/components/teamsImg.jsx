import { useEffect, useState } from "react";
import f1 from "../assets/f1.png";

function getWikiTitleFromUrl(url) {
  if (!url) return null;
  return decodeURIComponent(new URL(url).pathname.replace("/wiki/", ""));
}

const teamImagesCache = new Map();

export function TeamImage({ team, url, year }) {
  const [src, setSrc] = useState(f1);

  useEffect(() => {
    let cancelled = false;
    const WIKI_API = "https://en.wikipedia.org/api/rest_v1/page/summary/";

    async function fetchImage() {
      const cacheKey = `${team.name}-${year}`;
     if (teamImagesCache.has(cacheKey)) {
        console.log("Using cached image for", team.name, year);
        setSrc(teamImagesCache.get(cacheKey));
        return;
      }
      const wikiTitle = getWikiTitleFromUrl(team.url);
      if (!wikiTitle) return;

      try {
        const res = await fetch(WIKI_API + wikiTitle);
        const data = await res.json();

        const image = data.thumbnail?.source || data.originalimage?.source;

        if (!cancelled && image) {
          console.log("Fetched image for", team.name, year);
          teamImagesCache.set(cacheKey, image);
          setSrc(image);
        }
      } catch (err) {
        console.error("Error fetching image:", err);
      }
    }

    fetchImage();

    return () => {
      cancelled = true;
    };
  }, [team, url]);

  return (
    <img
      src={src}
      alt={team.name}
      className="team-photo"
      onError={(e) => {
        e.currentTarget.src = f1;
      }}
    />
  );
}
