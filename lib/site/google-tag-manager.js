"use strict";

const DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID = "GTM-5P88N7LD";
const DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC = "/js/shynli-tracking.js";

function normalizeGoogleTagManagerContainerId(value) {
  return String(value || "").trim();
}

function normalizeTrackingScriptSrc(value = DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC) {
  return String(value || "").trim();
}

function buildShynliTrackingHeadSnippet(scriptSrc = DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC) {
  const normalizedScriptSrc = normalizeTrackingScriptSrc(scriptSrc);
  if (!normalizedScriptSrc) return "";
  return `<script id="shynli-tracking-script" src="${normalizedScriptSrc}"></script>`;
}

function buildGoogleTagManagerHeadSnippet(containerId = DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID) {
  const normalizedContainerId = normalizeGoogleTagManagerContainerId(containerId);
  if (!normalizedContainerId) return "";
  return `<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(
    normalizedContainerId
  )});</script><!-- End Google Tag Manager -->`;
}

function buildGoogleTagManagerBodySnippet(containerId = DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID) {
  const normalizedContainerId = normalizeGoogleTagManagerContainerId(containerId);
  if (!normalizedContainerId) return "";
  return `<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(
    normalizedContainerId
  )}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript><!-- End Google Tag Manager (noscript) -->`;
}

function insertAfterOpeningTag(html, tagName, snippet) {
  const normalizedHtml = String(html || "");
  const normalizedSnippet = String(snippet || "");
  if (!normalizedSnippet) return normalizedHtml;
  const openingTagPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "i");
  if (!openingTagPattern.test(normalizedHtml)) {
    return tagName.toLowerCase() === "head"
      ? `${normalizedSnippet}${normalizedHtml}`
      : `${normalizedHtml}${normalizedSnippet}`;
  }
  return normalizedHtml.replace(openingTagPattern, (match) => `${match}${normalizedSnippet}`);
}

function stripGoogleTagManager(html) {
  return String(html || "")
    .replace(/<script[^>]+id="shynli-tracking-script"[^>]*src="\/js\/shynli-tracking\.js"[^>]*><\/script>/gi, "")
    .replace(/<script[^>]+src="\/js\/shynli-tracking\.js"[^>]*><\/script>/gi, "")
    .replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/gi, "")
    .replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/gi, "")
    .replace(/<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=[^"]+"[^>]*><\/script>/gi, "")
    .replace(
      /<noscript>\s*<iframe[^>]+src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=[^"]+"[^>]*><\/iframe>\s*<\/noscript>/gi,
      ""
    );
}

function injectGoogleTagManager(html, containerId = DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID) {
  const normalizedContainerId = normalizeGoogleTagManagerContainerId(containerId);
  if (!normalizedContainerId) return String(html || "");

  const headSnippet = `${buildShynliTrackingHeadSnippet()}${buildGoogleTagManagerHeadSnippet(normalizedContainerId)}`;
  const bodySnippet = buildGoogleTagManagerBodySnippet(normalizedContainerId);
  let output = stripGoogleTagManager(html);

  output = insertAfterOpeningTag(output, "head", headSnippet);
  output = insertAfterOpeningTag(output, "body", bodySnippet);

  return output;
}

module.exports = {
  DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID,
  DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC,
  buildGoogleTagManagerBodySnippet,
  buildGoogleTagManagerHeadSnippet,
  buildShynliTrackingHeadSnippet,
  injectGoogleTagManager,
  normalizeGoogleTagManagerContainerId,
  normalizeTrackingScriptSrc,
};
