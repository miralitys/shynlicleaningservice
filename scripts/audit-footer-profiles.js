"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { parse } = require("parse5");

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
function nodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => nodes(child, predicate))];
}
function sourceNodes(html, predicate) {
  return nodes(parse(html, { sourceCodeLocationInfo: true }), predicate).filter(node => node.sourceCodeLocation).map(node => ({ node, ...node.sourceCodeLocation }));
}
function removeNodes(html, predicate) {
  return sourceNodes(html, predicate).sort((a, b) => b.startOffset - a.startOffset).reduce((result, node) => result.slice(0, node.startOffset) + result.slice(node.endOffset), html);
}
function markup(html, predicate) {
  return sourceNodes(html, predicate).map(node => html.slice(node.startOffset, node.endOffset));
}
const footer = node => node.tagName === "footer" && attr(node, "id") === "shynli-site-footer";
const footerStyle = node => node.tagName === "style" && attr(node, "id") === "shynli-site-footer-style";
const profileRow = node => cls(node, "shynli-site-footer__profiles");
const withoutFooter = html => removeNodes(html, node => footer(node) || footerStyle(node));
const withoutProfiles = html => removeNodes(html, profileRow);
const originalFooterStyles = html => markup(html, footerStyle).map(style => style.split("\n").filter(line => !line.startsWith(".shynli-site-footer__profiles")).join("\n"));
const profileUrls = route => [
  ["Google", route === "/aurora" ? "https://www.google.com/maps?cid=5408416184318024401" : "https://www.google.com/maps?cid=9307087877612204108"],
  ["Yelp", "https://www.yelp.com/biz/shynli-cleaning-naperville-2"],
  ["BBB", "https://www.bbb.org/us/il/naperville/profile/cleaning-services/shynli-cleaning-service-0654-1000144666"],
  ["Thumbtack", "https://www.thumbtack.com/il/naperville/house-cleaning/shynli-cleaning-service/service/572036872380112901"],
  ["Nextdoor", "https://nextdoor.com/pages/shynli-cleaning/"],
];
function inspectProfiles(html) {
  const document = parse(html);
  const footers = nodes(document, footer);
  const rows = footers.flatMap(node => nodes(node, profileRow));
  return {
    footers: footers.length, rows: rows.length,
    links: rows.flatMap(row => nodes(row, node => node.tagName === "a")).map(node => ({ href: attr(node, "href"), label: attr(node, "aria-label"), target: attr(node, "target"), rel: attr(node, "rel"), text: (node.childNodes || []).map(child => child.value || "").join("") })),
  };
}
async function audit(base, baseline, output) {
  const manifest = JSON.parse(fs.readFileSync(path.join(baseline, "manifest.json"), "utf8"));
  const read = async route => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(30000) });
    if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
    return response.text();
  };
  const version = "footer-profiles-" + createHash("sha256").update(fs.readFileSync(path.join(__dirname, "../lib/site/sanitize.js"))).digest("hex").slice(0, 8);
  const result = { version, baseCommit: execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim(), checkedAt: new Date().toISOString(), base, deployed: new URL(base).hostname === "shynlicleaningservice.com", pages: {}, footerOnlyPages: 0, originalFooterPreservedPages: 0, originalStylesPreservedPages: 0, sitemapUnchanged: false, robotsUnchanged: false, failures: [] };
  for (const item of manifest) {
    const original = fs.readFileSync(path.join(baseline, item.file), "utf8");
    const current = await read(item.route);
    const profile = inspectProfiles(current);
    const expected = profileUrls(item.route).map(([name, href]) => ({ href, label: `Shynli Cleaning on ${name}`, target: "_blank", rel: "noopener", text: name }));
    const page = result.pages[item.route] = {
      ...profile, correctLinks: JSON.stringify(profile.links) === JSON.stringify(expected),
      outsideFooterUnchanged: withoutFooter(current) === withoutFooter(original),
      originalFooterUnchanged: JSON.stringify(markup(withoutProfiles(current), footer)) === JSON.stringify(markup(original, footer)),
      originalFooterStylesUnchanged: JSON.stringify(originalFooterStyles(current)) === JSON.stringify(markup(original, footerStyle)),
      jsonLdUnchanged: JSON.stringify(markup(current, node => node.tagName === "script" && attr(node, "type") === "application/ld+json")) === JSON.stringify(markup(original, node => node.tagName === "script" && attr(node, "type") === "application/ld+json")),
    };
    if (page.outsideFooterUnchanged) result.footerOnlyPages++;
    if (page.originalFooterUnchanged) result.originalFooterPreservedPages++;
    if (page.originalFooterStylesUnchanged) result.originalStylesPreservedPages++;
    if (profile.footers !== 1 || profile.rows !== 1 || !page.correctLinks || !page.outsideFooterUnchanged || !page.originalFooterUnchanged || !page.originalFooterStylesUnchanged || !page.jsonLdUnchanged) result.failures.push(item.route);
  }
  result.sitemapUnchanged = await read("/sitemap.xml") === fs.readFileSync(path.join(baseline, "sitemap.xml"), "utf8");
  result.robotsUnchanged = await read("/robots.txt") === fs.readFileSync(path.join(baseline, "robots.txt"), "utf8");
  if (!result.sitemapUnchanged || !result.robotsUnchanged) result.failures.push("Sitemap or robots changed");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(result, null, 2) + "\n");
  const lines = ["# Footer Business Profiles: Verification", "", `Edition: ${version}. Base commit: ${result.baseCommit}. Checked: ${result.checkedAt}. ${result.deployed ? "Production" : "Local preview, not deployed"}.`, "", `Pages checked: ${manifest.length}. Outside footer unchanged: ${result.footerOnlyPages}. Original footer preserved after removing only the new row: ${result.originalFooterPreservedPages}. Original footer CSS preserved: ${result.originalStylesPreservedPages}.`, "", `Sitemap byte-identical: ${result.sitemapUnchanged}. Robots byte-identical: ${result.robotsUnchanged}. Failures: ${JSON.stringify(result.failures)}.`, "", "## Requested Comparison Pages", "", "| Page | Footer Only | Existing Footer Preserved | JSON-LD Unchanged | Correct Five Links |", "| --- | --- | --- | --- | --- |", ...["/", "/naperville", "/pricing", "/aurora"].map(route => { const page = result.pages[route]; return `| ${route} | ${page.outsideFooterUnchanged} | ${page.originalFooterUnchanged} | ${page.jsonLdUnchanged} | ${page.correctLinks} |`; }), "", "## Links", "", ...profileUrls("/").map(([name, href]) => `- ${name}: ${href}`), `- Aurora Google only on /aurora: ${profileUrls("/aurora")[0][1]}`, "", "All profile anchors have visible platform text, a company-specific aria-label, target=_blank and rel=noopener, with no nofollow. Browser/platform checks and changed files are documented in README.md."];
  fs.writeFileSync(path.join(output, "report.md"), lines.join("\n") + "\n");
  console.log(JSON.stringify({ version, pages: manifest.length, footerOnlyPages: result.footerOnlyPages, originalFooterPreservedPages: result.originalFooterPreservedPages, originalStylesPreservedPages: result.originalStylesPreservedPages, sitemapUnchanged: result.sitemapUnchanged, robotsUnchanged: result.robotsUnchanged, failures: result.failures }, null, 2));
  return result;
}
if (require.main === module) audit(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, inspectProfiles, profileUrls, withoutFooter, withoutProfiles, originalFooterStyles };
