import { fetchNewsIndex } from "../lib/autoPost/scraper.js";

const articles = await fetchNewsIndex(20);
console.log(`indexed ${articles.length}`);

const kw = /qualifying|pole|grid|wins|victory|report|grand prix/i;
const hits = articles.filter((a) => kw.test(a.title));
console.log(`titles containing keywords: ${hits.length}\n`);
for (const a of hits) {
  console.log(`  ${a.title}`);
}
