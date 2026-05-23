"use strict";

const DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID = "GTM-5P88N7LD";
const DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC = "/js/shynli-tracking.js";
const GTM_IDLE_DELAY_MS = 12000;
const GTM_IDLE_TIMEOUT_MS = 2500;
const SHYNLI_TRACKING_IDLE_DELAY_MS = 4500;
const SHYNLI_TRACKING_IDLE_TIMEOUT_MS = 2500;

function normalizeGoogleTagManagerContainerId(value) {
  return String(value || "").trim();
}

function normalizeTrackingScriptSrc(value = DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC) {
  return String(value || "").trim();
}

function buildShynliTrackingHeadSnippet(scriptSrc = DEFAULT_SHYNLI_TRACKING_SCRIPT_SRC) {
  const normalizedScriptSrc = normalizeTrackingScriptSrc(scriptSrc);
  if (!normalizedScriptSrc) return "";
  return `<script id="shynli-tracking-bootstrap">(function(w,d,src){w.dataLayer=w.dataLayer||[];var ns=w.shynliTracking=w.shynliTracking||{};var loaded=false;var keys=['gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];var attrCookie='shynli_attribution';var landingCookie='shynli_landing_page';var ttl=31536e6;function qp(name){try{return new URLSearchParams(w.location.search).get(name)||'';}catch(e){return '';}}function setCookie(name,value){try{var expires=new Date(Date.now()+ttl).toUTCString();d.cookie=name+'='+encodeURIComponent(value)+'; expires='+expires+'; path=/; SameSite=Lax; Secure';}catch(e){}}function getCookie(name){try{var prefix=name+'=',parts=d.cookie?d.cookie.split(';'):[];for(var i=0;i<parts.length;i++){var c=parts[i].replace(/^\\s+/,'');if(c.indexOf(prefix)===0)return decodeURIComponent(c.slice(prefix.length));}}catch(e){}return '';}function getAttribution(){try{var raw=getCookie(attrCookie);if(raw){var parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}return {};}function captureAttribution(){var captured=getAttribution();var found=false;for(var i=0;i<keys.length;i++){var key=keys[i],value=qp(key);if(value){captured[key]=value;found=true;}}if(found){try{setCookie(attrCookie,JSON.stringify(captured));}catch(e){}}try{if(!getCookie(landingCookie))setCookie(landingCookie,w.location.origin+w.location.pathname);}catch(e){}return captured;}function eventId(){return'evt_'+Date.now().toString(36)+'_'+Math.floor(Math.random()*1e9).toString(36);}function buildPayload(eventObj){var payload={};if(eventObj&&typeof eventObj==='object'){for(var k in eventObj){if(Object.prototype.hasOwnProperty.call(eventObj,k))payload[k]=eventObj[k];}}if(!payload.event_id)payload.event_id=eventId();if(!payload.page_path)payload.page_path=w.location.pathname;if(!payload.page_url)payload.page_url=w.location.href;if(!payload.page_title)payload.page_title=d.title||'';var attr=getAttribution();for(var i=0;i<keys.length;i++){if(attr[keys[i]])payload[keys[i]]=attr[keys[i]];}var landing=getCookie(landingCookie);if(landing)payload.landing_page=landing;return payload;}function pushEvent(eventObj){var payload=buildPayload(eventObj);w.dataLayer.push(payload);return w.Promise?w.Promise.resolve(payload):payload;}function telClick(e){var node=e.target;while(node&&node!==d){if(node.tagName==='A'&&typeof node.href==='string'&&node.href.toLowerCase().indexOf('tel:')===0){pushEvent({event:'lead_call_click_website',value:25,currency:'USD',phone_clicked:node.href.replace(/^tel:/i,''),click_text:(node.textContent||'').trim().slice(0,100),click_location:w.location.pathname});return;}node=node.parentNode;}}function loadTracking(){if(loaded)return;loaded=true;var script=d.createElement('script');script.id='shynli-tracking-script';script.src=src;script.defer=true;(d.head||d.documentElement).appendChild(script);}function idleLoad(){if('requestIdleCallback'in w){w.requestIdleCallback(loadTracking,{timeout:${SHYNLI_TRACKING_IDLE_TIMEOUT_MS}});}else{loadTracking();}}function scheduleLoad(){w.setTimeout(idleLoad,${SHYNLI_TRACKING_IDLE_DELAY_MS});}ns.captureAttribution=ns.captureAttribution||captureAttribution;ns.getAttribution=ns.getAttribution||getAttribution;ns.getLandingPage=ns.getLandingPage||function(){return getCookie(landingCookie)||'';};ns.pushEvent=ns.pushEvent||pushEvent;ns.buildUserData=ns.buildUserData||function(){return w.Promise?w.Promise.resolve({}):{};};ns.generateEventId=ns.generateEventId||eventId;ns._bootstrapDetach=function(){d.removeEventListener('click',telClick,true);};captureAttribution();d.addEventListener('click',telClick,true);if(d.readyState==='complete'){scheduleLoad();}else{w.addEventListener('load',scheduleLoad,{once:true});}['pointerdown','keydown','touchstart'].forEach(function(eventName){w.addEventListener(eventName,loadTracking,{once:true,passive:true});});d.addEventListener('visibilitychange',function(){if(d.visibilityState==='hidden')loadTracking();},{once:true});})(window,document,${JSON.stringify(
    normalizedScriptSrc
  )});</script>`;
}

function buildGoogleTagManagerHeadSnippet(containerId = DEFAULT_GOOGLE_TAG_MANAGER_CONTAINER_ID) {
  const normalizedContainerId = normalizeGoogleTagManagerContainerId(containerId);
  if (!normalizedContainerId) return "";
  return `<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var loaded=false;function loadGtm(){if(loaded)return;loaded=true;var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}function idleLoad(){if('requestIdleCallback'in w){w.requestIdleCallback(loadGtm,{timeout:${GTM_IDLE_TIMEOUT_MS}});}else{loadGtm();}}function scheduleLoad(){w.setTimeout(idleLoad,${GTM_IDLE_DELAY_MS});}if(d.readyState==='complete'){scheduleLoad();}else{w.addEventListener('load',scheduleLoad,{once:true});}['pointerdown','keydown','touchstart'].forEach(function(eventName){w.addEventListener(eventName,loadGtm,{once:true,passive:true});});d.addEventListener('visibilitychange',function(){if(d.visibilityState==='hidden')loadGtm();},{once:true});})(window,document,'script','dataLayer',${JSON.stringify(
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
    .replace(/<script[^>]+id=["']shynli-tracking-bootstrap["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]+id=["']shynli-tracking-script["'][^>]*src=["']\/js\/shynli-tracking\.js["'][^>]*><\/script>/gi, "")
    .replace(/<script[^>]+src=["']\/js\/shynli-tracking\.js["'][^>]*><\/script>/gi, "")
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
  GTM_IDLE_DELAY_MS,
  GTM_IDLE_TIMEOUT_MS,
  SHYNLI_TRACKING_IDLE_DELAY_MS,
  SHYNLI_TRACKING_IDLE_TIMEOUT_MS,
  buildGoogleTagManagerBodySnippet,
  buildGoogleTagManagerHeadSnippet,
  buildShynliTrackingHeadSnippet,
  injectGoogleTagManager,
  normalizeGoogleTagManagerContainerId,
  normalizeTrackingScriptSrc,
};
