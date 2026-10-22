"use strict";

const { parseFragment } = require("parse5");
const { createHash } = require("node:crypto");
const history = require("./blog-content-history.json");
const plans = require("./blog-service-links.json");
const release = require("./blog-editorial-release.json");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const textContent = (node) => node.nodeName === "#text" ? node.value
  : (node.childNodes || []).map(textContent).join("");

function articleParagraphs(html) {
  const result = [];
  function visit(node) {
    if (node.tagName === "p") result.push(node);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }));
  return result;
}

function applyServiceLinks(article) {
  const plan = plans[article.path];
  if (!plan?.links.length || article.bodyHtml.includes("data-service-link=")) return article;
  const paragraphs = articleParagraphs(article.bodyHtml);
  const patches = [];
  for (const link of plan.links) {
    const paragraph = paragraphs[link.paragraphIndex];
    const location = paragraph?.sourceCodeLocation;
    if (!location?.endTag || hash(textContent(paragraph).trim()) !== link.paragraphHash) return article;
    if (link.appendHtml) {
      patches.push({ start: location.endTag.startOffset, end: location.endTag.startOffset, html: ` ${link.appendHtml}` });
    } else {
      const children = [];
      function visit(node) {
        if (node.nodeName === "#text") children.push(node);
        for (const child of node.childNodes || []) visit(child);
      }
      visit(paragraph);
      const child = children.find((item) => item.value.includes(link.anchor));
      if (!child?.sourceCodeLocation) return article;
      const source = article.bodyHtml.slice(child.sourceCodeLocation.startOffset, child.sourceCodeLocation.endOffset);
      const index = source.indexOf(link.anchor);
      if (index === -1) return article;
      const start = child.sourceCodeLocation.startOffset + index;
      patches.push({ start, end: start + link.anchor.length, html: `<a href="${link.href}" data-service-link="contextual">${link.anchor}</a>` });
    }
  }
  let bodyHtml = article.bodyHtml;
  for (const patch of patches.sort((a, b) => b.start - a.start)) bodyHtml = bodyHtml.slice(0, patch.start) + patch.html + bodyHtml.slice(patch.end);
  return { ...article, bodyHtml, editorialLinkCount: patches.length, editorialBodyHash: hash(bodyHtml) };
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function articleDates(article, deployment = release) {
  const evidence = history[article.path];
  const publishedAt = evidence?.publishedAt || article.publishedAt;
  const previousModifiedAt = evidence?.modifiedAt || publishedAt;
  const released = article.editorialLinkCount > 0 && validDate(deployment.deployedAt)
    && deployment.deployedAt >= previousModifiedAt
    && deployment.articleBodyHashes?.[article.path] === article.editorialBodyHash;
  const modifiedAt = released ? deployment.deployedAt : previousModifiedAt;
  const date = new Date(`${modifiedAt}T12:00:00Z`);
  const updatedLabel = modifiedAt !== publishedAt
    ? `Updated ${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(date)}` : "";
  return { ...article, publishedAt, modifiedAt, updatedLabel, pendingContentUpdate: article.editorialLinkCount > 0 && !released };
}

function applyBlogEditorial(articles) {
  return articles.map((article) => articleDates(applyServiceLinks(article)));
}

module.exports = { applyBlogEditorial, applyServiceLinks, articleDates, articleParagraphs, textContent, validDate };
