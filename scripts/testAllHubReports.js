const HUB_MAP = {
  "miami gardens": "miami",
  "montréal": "canada",
  "monte carlo": "monaco",
  "barcelona": "barcelona-catalunya",
  "spielberg": "austria",
  "silverstone": "great-britain",
  "spa-francorchamps": "belgium",
  "budapest": "hungary",
  "zandvoort": "netherlands",
  "monza": "italy",
  "madrid": "spain",
  "baku": "azerbaijan",
  "kuala lumpur": "bahrain",
  "marina bay": "singapore"
};

async function testAllHubReports() {
  for (const [loc, hub] of Object.entries(HUB_MAP)) {
    const res = await fetch(`https://www.formula1.com/en/racing/2026/${hub}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();
    // Grab all article links with text or nearby headline
    const linkMatches = [...html.matchAll(/href=["'](\/en\/latest\/article\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const articles = linkMatches.map(m => {
      const url = m[1];
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      // Extract slug from URL for fallback title
      const slugTitle = url.split("/")[4]?.split(".")[0]?.replace(/-/g, " ") || "";
      return { url, text, slugTitle };
    });

    console.log(`\n=============================================`);
    console.log(`Hub: ${hub} (${loc}) — Total links: ${articles.length}`);

    // Print all articles that look like quali, sprint, or race
    const sessionArticles = articles.filter(a => {
      const s = (a.text + " " + a.slugTitle).toLowerCase();
      return (
        s.includes("pole") ||
        s.includes("qualifying") ||
        s.includes("wins") ||
        s.includes("victory") ||
        s.includes("report") ||
        s.includes("sprint")
      );
    });

    for (const a of sessionArticles) {
      console.log(`  • [${a.text || "NO_TEXT"}] -> ${a.slugTitle}`);
    }
  }
}

testAllHubReports();
