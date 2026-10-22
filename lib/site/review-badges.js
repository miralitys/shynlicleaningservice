"use strict";

const { parse } = require("parse5");

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasClass = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join(" ");
const badge = '<span class="sg-review-stack shynli-review-badge" aria-label="58 Google reviews"><span class="sg-review-stack__number">58</span> <span class="sg-review-stack__label">Google reviews</span></span>';
const style = `<style id="shynli-review-badge-style">
.shynli-review-badge.sg-review-stack{display:inline-flex!important;align-items:center;gap:6px;white-space:nowrap;letter-spacing:0;transform:none;line-height:1.25;vertical-align:middle}
.shynli-review-badge .sg-review-stack__number{font-family:Georgia,"Times New Roman",serif!important;font-size:28px!important;font-style:italic;font-weight:400!important;line-height:1!important;color:#313131;display:inline!important}
.shynli-review-badge .sg-review-stack__label{font-family:Montserrat,sans-serif!important;font-size:12px!important;font-weight:400!important;line-height:1.25!important;color:#4f4d4a;display:inline!important}
[data-review-badge-anchor]{width:132px!important;height:auto!important;overflow:visible!important}
[data-review-badge-anchor]>div{width:132px!important;height:auto!important;overflow:visible!important}
</style>`;

function applyReviewBadges(html) {
  if (!html.includes("Customer Reviews")) return html;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const nodes = [];
  function walk(node) {
    if (["script", "style", "template"].includes(node.tagName)) return;
    nodes.push(node);
    for (const child of node.childNodes || []) walk(child);
  }
  walk(document);
  const patches = [];
  function replaceInner(node, content) {
    const location = node.sourceCodeLocation;
    patches.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, content });
  }
  for (const className of ["services-stats__reviews", "dc-hero__reviews", "hero-stat--reviews", "review-cluster"]) {
    for (const node of nodes.filter(node => hasClass(node, className))) {
      const content = (node.childNodes || []).find(child => child.tagName && /300\+/.test(text(child)) && /Customer Reviews/.test(text(child)));
      if (content) replaceInner(content, badge);
    }
  }
  // Exported hero layouts position the old label and count independently.
  const legacyId = (node, suffix) => attr(node, "data-clean-id") === suffix || attr(node, "data-elem-id") === suffix || hasClass(node, `clean-elem--${suffix}`);
  for (const label of nodes.filter(node => legacyId(node, "1768045586274000010") && /Customer Reviews/.test(text(node)))) {
    const count = (label.parentNode.childNodes || []).find(node => legacyId(node, "1768045586274000011") && /300\+/.test(text(node)));
    if (!count) continue;
    const atom = (count.childNodes || []).find(child => child.tagName === "div");
    if (!atom) continue;
    replaceInner(label, "");
    replaceInner(atom, badge);
    const end = count.sourceCodeLocation.startTag.endOffset - 1;
    patches.push({ start: end, end, content: ' data-review-badge-anchor="true"' });
  }
  if (!patches.length) return html;
  const output = patches.sort((a, b) => b.start - a.start).reduce((value, patch) => value.slice(0, patch.start) + patch.content + value.slice(patch.end), html);
  return output.replace(/<\/head>/i, style + "</head>");
}

module.exports = { applyReviewBadges };
