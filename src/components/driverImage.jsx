import { useEffect, useState } from "react";
import f1 from "../assets/f1.png";

function getDriverFromWikiUrl(url) {
  if (!url || typeof url !== "string") return null;

  const lastPart = url.split("/wiki/")[1];
  if (!lastPart) return null;

  return decodeURIComponent(lastPart.split("#")[0].split("?")[0]);
}

const imageCache = new Map();

export function DriverImage({ givenName, familyName, url }) {
  const [src, setSrc] = useState(f1);

  useEffect(() => {
    let cancelled = false;

    async function fetchImage() {
      let wikiTitle =
        url
          ? getDriverFromWikiUrl(url)
          : `${givenName}_${familyName}`;

      if (!wikiTitle) return;

      if (imageCache.has(wikiTitle)) {
        setSrc(imageCache.get(wikiTitle));
        return;
      }

      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`
        );
        const data = await res.json();

        const image =
          data.thumbnail?.source ||
          data.originalimage?.source;

        if (image) {
           imageCache.set(wikiTitle, image);
        }

        if (!cancelled && image) {
          setSrc(image);
        }
      } catch {
        // Handle errors 
      }
    }

    fetchImage();

    return () => {
      cancelled = true;
    };
  }, [givenName, familyName, url]);

  return (
    <img
      src={src}
      alt={`${givenName} ${familyName}`}
      className="driver-photo"
      onError={(e) => {
        e.currentTarget.src = f1;
      }}
    />
  );
}

export default DriverImage;
