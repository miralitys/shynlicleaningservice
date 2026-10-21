"use strict";

const { parse } = require("parse5");
const rules = require("./image-alt-rules.json");
const { SERVICE_AREA_ZIP_MAP } = require("../service-area-zips");

const ORIGIN = "https://shynlicleaningservice.com";
const cityByPath = new Map(Object.values(SERVICE_AREA_ZIP_MAP).flat().map(({ city, url }) => [url, city]));

function attribute(node, name) {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function imagePath(node) {
  const raw = attribute(node, "data-original") || attribute(node, "src");
  if (!raw) return "";
  try {
    const url = new URL(raw, ORIGIN);
    return url.origin === ORIGIN ? decodeURIComponent(url.pathname) : url.href;
  } catch {
    return raw;
  }
}

function textContent(node) {
  if (node.nodeName === "#text") return node.value;
  if (["script", "style", "svg", "template"].includes(node.tagName) || attribute(node, "aria-hidden") === "true") return "";
  return (node.childNodes || []).map(textContent).join(" ").replace(/\s+/g, " ").trim();
}

function imageLink(node) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    if (parent.tagName === "a" || parent.tagName === "button") return parent;
  }
  return null;
}

function linkAction(link) {
  if (!link || textContent(link) || attribute(link, "aria-label") || attribute(link, "aria-labelledby")) return null;
  const href = attribute(link, "href") || "";
  if (/^(?:https:\/\/shynlicleaningservice\.com)?\/quote(?:[/?#-]|$)/.test(href)) return "Get a free quote";
  if (/^tel:/i.test(href)) return "Call Shynli Cleaning Service";
  if (/^mailto:/i.test(href)) return "Email Shynli Cleaning Service";
  if (href === "/" || href === `${ORIGIN}/`) return "Shynli Cleaning Service";
  return null;
}

function alternativeFor(node, route) {
  const path = imagePath(node);
  const rule = rules[path];
  const link = imageLink(node);
  const action = linkAction(link);
  if (action && rule?.kind !== "logo") return { kind: "functional", alt: action, reason: "Image-only link needs its destination named" };
  if (!rule) return null;
  if (rule.kind === "decorative"
    || rule.kind === "logo" && link && /^shynli\s+cleaning(?:\s+service)?$/i.test(textContent(link))) {
    return { kind: "decorative", alt: "", reason: rule.description };
  }
  const currentAlt = attribute(node, "alt");
  const city = cityByPath.get(route);
  const alt = rule.keepExisting && currentAlt?.trim() ? currentAlt
    : rule.cityQuote && city ? `House with red porch chairs for a quote in ${city}` : rule.alt;
  return { kind: rule.kind, alt, reason: rule.description };
}

function inspectImages(html, route = "/") {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const images = [];
  function visit(node) {
    if (node.tagName === "img") images.push({ node, path: imagePath(node), alternative: alternativeFor(node, route) });
    for (const child of node.childNodes || []) visit(child);
  }
  visit(document);
  return images;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applyImageAlts(html, route = "/") {
  if (route === "/blog" || route.startsWith("/blog/")) return html;
  const patches = [];
  for (const { node, alternative } of inspectImages(html, route)) {
    const location = node.sourceCodeLocation;
    if (!alternative || !location) continue;
    const desired = { alt: alternative.alt };
    if (alternative.kind === "decorative") desired["aria-hidden"] = "true";
    const additions = [];
    for (const [name, value] of Object.entries(desired)) {
      if (attribute(node, name) === value) continue;
      const text = `${name}="${escapeAttribute(value)}"`;
      const position = location.attrs?.[name];
      if (position) patches.push({ start: position.startOffset, end: position.endOffset, text });
      else additions.push(text);
    }
    if (additions.length) {
      const tag = html.slice(location.startOffset, location.endOffset);
      const suffix = tag.match(/\s*\/?>$/);
      const start = location.startOffset + suffix.index;
      patches.push({ start, end: start, text: ` ${additions.join(" ")}` });
    }
  }
  let output = html;
  for (const { start, end, text } of patches.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, start) + text + output.slice(end);
  }
  return output;
}

module.exports = { applyImageAlts, inspectImages, imagePath, rules };
