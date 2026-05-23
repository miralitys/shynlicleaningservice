"use strict";

const CALLRAIL_SWAP_UPSTREAM_SCRIPT_SRC =
  "https://cdn.callrail.com/companies/562095680/7c306f50357be4c201eb/12/swap.js";
const CALLRAIL_SWAP_SCRIPT_SRC = "/js/vendor/callrail-swap.20260523.js";

function buildCallRailSwapScript(src = CALLRAIL_SWAP_SCRIPT_SRC) {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) return "";
  return `<script type="text/javascript" src="${normalizedSrc}" defer></script>`;
}

function stripCallRailSwapScript(html) {
  return String(html || "").replace(
    /<script\b[^>]*\bsrc=["']?(?:(?:https?:)?\/\/cdn\.callrail\.com\/companies\/562095680\/7c306f50357be4c201eb\/12\/swap\.js|\/js\/vendor\/callrail-swap\.[a-z0-9-]{8,}\.js)["']?[^>]*>\s*<\/script>/gi,
    ""
  );
}

function injectCallRailSwapScript(html, src = CALLRAIL_SWAP_SCRIPT_SRC) {
  const cleaned = stripCallRailSwapScript(html);
  const script = buildCallRailSwapScript(src);
  if (!script) return cleaned;
  if (/<\/body>/i.test(cleaned)) {
    return cleaned.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${cleaned}${script}`;
}

module.exports = {
  CALLRAIL_SWAP_SCRIPT_SRC,
  CALLRAIL_SWAP_UPSTREAM_SCRIPT_SRC,
  buildCallRailSwapScript,
  injectCallRailSwapScript,
  stripCallRailSwapScript,
};
