import { useEffect, useState } from "react";
import f1 from "../assets/f1.png";

function getTeamsFromWikiUrl(url) {
  if (!url || typeof url !== "string") return null;

  const lastPart = url.split("/wiki/")[1];
  if (!lastPart) return null;

  return decodeURIComponent(lastPart.split("#")[0].split("?")[0]);
}

const teamImageCache = new Map();

export function ConstructorImage({ teamName, url }) {
  const [src, setSrc] = useState(f1);

  useEffect(() => {
    let cancelled = false;

    async function fetchImage() {
      const wikiTitle = url
        ? getTeamsFromWikiUrl(url)
        : teamName?.replace(/\s+/g, "_");

      if (!wikiTitle) return;

      if (teamImageCache.has(wikiTitle)) {
        setSrc(teamImageCache.get(wikiTitle));
        return;
      }

      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`
        );
        const data = await res.json();

        const image =
          data.originalimage?.source ||
          data.thumbnail?.source;
        
        if (image) {
            teamImageCache.set(wikiTitle, image);
        }

        if (!cancelled && image) {
          setSrc(image);
        } else if (!cancelled) {
          setSrc(f1);
        }
      } catch {
        if (!cancelled) setSrc(f1);
      }
    }

    fetchImage();

    return () => {
      cancelled = true;
    };
  }, [teamName, url]);

  return (
    <img
      src={src}
      alt={teamName || "Constructor"}
      className="standings-photo"
      onError={(e) => {
        e.currentTarget.src = f1;
      }}
    />
  );
}

export default ConstructorImage;
