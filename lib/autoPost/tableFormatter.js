/**
 * Normalizes formula1.com results tables into clean, responsive HTML.
 * Strips broken responsive classes and acronym duplicates (e.g. "Max Verstappen VER" -> "Max Verstappen").
 */
export function cleanTableHtml(rawTableHtml) {
  if (!rawTableHtml || !rawTableHtml.includes("<table")) return rawTableHtml;

  const rowMatches = [...rawTableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  if (rowMatches.length === 0) return rawTableHtml;

  // Extract headers
  const headerCells = [...rowMatches[0][0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  );

  const cleanRows = [];

  for (let i = 1; i < rowMatches.length; i++) {
    const rowHtml = rowMatches[i][0];
    const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tdMatches.length === 0) continue;

    // Col 0: Pos
    const pos = tdMatches[0][1].replace(/<[^>]+>/g, "").trim();

    // Col 1: Driver + Image
    let driverImg = "";
    const imgMatch = tdMatches[1][1].match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) driverImg = imgMatch[1];

    const rawDriverText = tdMatches[1][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // Strip trailing 3-uppercase letter acronym (e.g., VER, RUS, HAM)
    const driverName = rawDriverText.replace(/\s+[A-Z]{3}$/, "").trim();

    // Col 2: Time / Gap
    const time = tdMatches[2] ? tdMatches[2][1].replace(/<[^>]+>/g, "").trim() : "";

    // Col 3: Points
    const points = tdMatches[3] ? tdMatches[3][1].replace(/<[^>]+>/g, "").trim() : "";

    if (pos && driverName) {
      cleanRows.push({ pos, driverName, driverImg, time, points });
    }
  }

  if (cleanRows.length === 0) return rawTableHtml;

  // Limit to top 10 for clean presentation
  const displayRows = cleanRows.slice(0, 10);
  const hasPoints = headerCells[3] || displayRows.some((r) => r.points && r.points !== "0");

  let html = `<div class="f1-table-responsive">\n<table class="f1-results-table">\n  <thead>\n    <tr>\n`;
  html += `      <th class="col-pos">POS</th>\n`;
  html += `      <th class="col-driver">DRIVER</th>\n`;
  html += `      <th class="col-time">${headerCells[2] ? headerCells[2].toUpperCase() : "TIME / GAP"}</th>\n`;
  if (hasPoints) {
    html += `      <th class="col-pts">PTS</th>\n`;
  }
  html += `    </tr>\n  </thead>\n  <tbody>\n`;

  for (const r of displayRows) {
    const posClass =
      r.pos === "1"
        ? "pos-1"
        : r.pos === "2"
        ? "pos-2"
        : r.pos === "3"
        ? "pos-3"
        : "pos-other";

    html += `    <tr>\n`;
    html += `      <td class="col-pos"><span class="pos-badge ${posClass}">${r.pos}</span></td>\n`;
    html += `      <td class="col-driver">\n`;
    html += `        <div class="driver-cell">\n`;
    if (r.driverImg) {
      html += `          <img src="${r.driverImg}" alt="${r.driverName}" class="driver-avatar" loading="lazy" />\n`;
    }
    html += `          <span class="driver-name">${r.driverName}</span>\n`;
    html += `        </div>\n`;
    html += `      </td>\n`;
    html += `      <td class="col-time">${r.time || "-"}</td>\n`;
    if (hasPoints) {
      html += `      <td class="col-pts">${r.points ? `<span class="pts-badge">${r.points}</span>` : "-"}</td>\n`;
    }
    html += `    </tr>\n`;
  }

  html += `  </tbody>\n</table>\n</div>`;
  return html;
}
