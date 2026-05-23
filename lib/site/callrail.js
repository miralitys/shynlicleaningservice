"use strict";

const CALLRAIL_SWAP_UPSTREAM_SCRIPT_SRC =
  "https://cdn.callrail.com/companies/562095680/7c306f50357be4c201eb/12/swap.js";
const CALLRAIL_SWAP_SCRIPT_SRC = "/js/vendor/callrail-swap.20260523.js";
const CALLRAIL_IDLE_DELAY_MS = 9000;
const CALLRAIL_IDLE_TIMEOUT_MS = 2500;

function buildCallRailSwapScript(src = CALLRAIL_SWAP_SCRIPT_SRC) {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) return "";
  return `<script id="shynli-callrail-loader">(function(w,d,src){var loaded=false;function loadCallRail(){if(loaded)return;loaded=true;var script=d.createElement('script');script.type='text/javascript';script.src=src;script.defer=true;(d.head||d.documentElement).appendChild(script);}function idleLoad(){if('requestIdleCallback'in w){w.requestIdleCallback(loadCallRail,{timeout:${CALLRAIL_IDLE_TIMEOUT_MS}});}else{loadCallRail();}}function scheduleLoad(){w.setTimeout(idleLoad,${CALLRAIL_IDLE_DELAY_MS});}if(d.readyState==='complete'){scheduleLoad();}else{w.addEventListener('load',scheduleLoad,{once:true});}['pointerdown','keydown','touchstart'].forEach(function(eventName){w.addEventListener(eventName,loadCallRail,{once:true,passive:true});});d.addEventListener('visibilitychange',function(){if(d.visibilityState==='hidden')loadCallRail();},{once:true});})(window,document,${JSON.stringify(
    normalizedSrc
  )});</script>`;
}

function stripCallRailSwapScript(html) {
  return String(html || "")
    .replace(/<script[^>]+id=["']shynli-callrail-loader["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(
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
  CALLRAIL_IDLE_DELAY_MS,
  CALLRAIL_IDLE_TIMEOUT_MS,
  CALLRAIL_SWAP_SCRIPT_SRC,
  CALLRAIL_SWAP_UPSTREAM_SCRIPT_SRC,
  buildCallRailSwapScript,
  injectCallRailSwapScript,
  stripCallRailSwapScript,
};
