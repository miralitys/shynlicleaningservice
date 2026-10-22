"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("parse5");
const { mainText, markup, similarity } = require("./audit-naperville-pilot");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const ROUTES = ["/naperville", "/plainfield", "/aurora", "/bolingbrook", "/", "/pricing", "/quote", "/faq", "/services/deep-cleaning", "/services/regular-cleaning", "/services/move-in-move-out-cleaning", "/blog/whats-included/what-to-do-before-a-cleaning-service-arrives"];
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
function phraseCounts(html) {
  const outsideFaq = markup(html, node => node.tagName === "main")[0].replace(/<section\b[^>]*\bid="faq"[\s\S]*?<\/section>/, "");
  const counts = content => {
    const text = mainText(content).toLowerCase();
    return {
      bookingRank: (text.match(/most (?:frequently )?booked|books deep cleaning most often|comes next in naperville's booking order|third most booked/g) || []).length,
      counties: (text.match(/dupage and will counties/g) || []).length,
      supplies: (text.match(/(?:all )?cleaning supplies and equipment/g) || []).length,
      parking: (text.match(/(?:ask where (?:our |the )?cleaners can park|parking discussed before your first visit)/g) || []).length,
      homeTypes: (text.match(/(?:condos?[^.]*?apartments?|apartments?[^.]*?condos?)/g) || []).length,
      typicalHome: (text.match(/(?:typical home[^.]*?(?:2\.5 bathrooms|3 bedrooms)|three bedrooms and 2\.5 bathrooms)/g) || []).length,
    };
  };
  return { body: counts(html), outsideFaq: counts(outsideFaq) };
}
function info(html) {
  const text = mainText(html);
  let collapsed = html;
  for (const answer of markup(html, node => cls(node, "sg-faq__answer"))) collapsed = collapsed.replace(answer, "");
  return { words: text.split(/\s+/).length, wordsWithFaqClosed: mainText(collapsed).split(/\s+/).length, phrases: phraseCounts(html) };
}
async function run(mode, base, directory, reportPath) {
  const read = async route => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(30000) });
    if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
    return response.text();
  };
  if (mode === "before") {
    if (fs.existsSync(directory)) throw new Error("Do not overwrite an existing baseline");
    fs.mkdirSync(directory, { recursive: true });
    for (const [index, route] of ROUTES.entries()) fs.writeFileSync(path.join(directory, `${index}.html`), await read(route));
    for (const route of ["/robots.txt", "/sitemap.xml"]) fs.writeFileSync(path.join(directory, path.basename(route)), await read(route));
    fs.writeFileSync(path.join(directory, "routes.json"), JSON.stringify(ROUTES));
    console.log(JSON.stringify(info(fs.readFileSync(path.join(directory, "0.html"), "utf8")), null, 2));
    return;
  }
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : ROUTES.map((route, index) => ({ route, file: `${index}.html` }));
  const before = fs.readFileSync(path.join(directory, manifest.find(item => item.route === "/naperville").file), "utf8");
  const after = await read("/naperville");
  const result = { before: info(before), after: info(after), otherDifferences: [], protectedDifferences: [], similarity: {}, services: [], preparation: "" };
  const protectedNodes = {
    title: node => node.tagName === "title",
    description: node => node.tagName === "meta" && attr(node, "name") === "description",
    h1: node => node.tagName === "h1",
    canonical: node => node.tagName === "link" && attr(node, "rel") === "canonical",
    robots: node => node.tagName === "meta" && attr(node, "name") === "robots",
    header: node => node.tagName === "header", footer: node => node.tagName === "footer",
    faq: node => cls(node, "sg-faq"), quote: node => cls(node, "sg-quote"), nearbyLinks: node => cls(node, "sg-area-links"),
    styles: node => node.tagName === "style" || node.tagName === "link" && attr(node, "rel") === "stylesheet",
    scripts: node => node.tagName === "script",
  };
  for (const [name, predicate] of Object.entries(protectedNodes)) if (JSON.stringify(markup(before, predicate)) !== JSON.stringify(markup(after, predicate))) result.protectedDifferences.push(name);
  for (const { route, file } of manifest) {
    if (route === "/naperville") continue;
    const current = await read(route);
    if (current !== fs.readFileSync(path.join(directory, file), "utf8")) result.otherDifferences.push(route);
    if (["/plainfield", "/aurora", "/bolingbrook"].includes(route)) result.similarity[route] = Number(similarity(after, current).toFixed(2));
  }
  result.comparedOutsideNaperville = manifest.length - 1;
  if (await read("/robots.txt") !== fs.readFileSync(path.join(directory, "robots.txt"), "utf8")) result.otherDifferences.push("/robots.txt");
  const sitemapRows = xml => markup(xml, node => node.tagName === "url").map(source => ({
    url: visibleText(parse(markup(source, node => node.tagName === "loc")[0])),
    lastmod: visibleText(parse(markup(source, node => node.tagName === "lastmod")[0] || "")),
  }));
  const oldRows = sitemapRows(fs.readFileSync(path.join(directory, "sitemap.xml"), "utf8"));
  const newRows = sitemapRows(await read("/sitemap.xml"));
  result.sitemapUrlsUnchanged = JSON.stringify(oldRows.map(row => row.url)) === JSON.stringify(newRows.map(row => row.url));
  result.sitemapDateChanges = newRows.filter(row => row.lastmod !== oldRows.find(old => old.url === row.url)?.lastmod);
  if (!result.sitemapUrlsUnchanged || result.sitemapDateChanges.some(row => new URL(row.url).pathname !== "/naperville")) result.otherDifferences.push("/sitemap.xml");
  const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join(" ");
  result.services = markup(after, node => node.tagName === "p" && cls(node.parentNode, "sg-service-card")).map(source => text(parse(source)).trim());
  result.preparation = markup(after, node => cls(node, "sg-note") && cls(node.parentNode?.parentNode, "sg-team")).map(source => text(parse(source)).trim()).join(" ");
  result.jsonLdParses = inspectHtml(after).scripts.every(node => { JSON.parse((node.childNodes || []).map(child => child.value || "").join("")); return true; });
  const out = reportPath || path.join(__dirname, "../docs/naperville-second-pass/verification.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (result.after.words < Math.max(1150, result.before.words) || result.otherDifferences.length || result.protectedDifferences.length || Object.values(result.after.phrases.outsideFaq).some(count => count > 1)) process.exitCode = 1;
}
if (require.main === module) run(...process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { phraseCounts, info };
