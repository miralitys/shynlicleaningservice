"use strict";

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "and",
  "an",
  "are",
  "at",
  "be",
  "before",
  "best",
  "between",
  "by",
  "can",
  "checklist",
  "clean",
  "cleaners",
  "cleaning",
  "cost",
  "deep",
  "difference",
  "do",
  "does",
  "for",
  "from",
  "guide",
  "hard",
  "help",
  "home",
  "homeowners",
  "house",
  "how",
  "hours",
  "in",
  "inside",
  "is",
  "it",
  "means",
  "more",
  "much",
  "new",
  "of",
  "on",
  "or",
  "regular",
  "remove",
  "service",
  "services",
  "should",
  "step",
  "the",
  "their",
  "time",
  "to",
  "what",
  "when",
  "why",
  "with",
  "without",
  "your",
]);

const EXCLUDED_SECTION_IDS = new Set([
  "quick-answer",
  "faq",
  "final-takeaway",
  "printable-checklist",
]);

const RELATED_CATEGORY_PREFERENCES = Object.freeze({
  "/blog/airbnb": ["/blog/checklists", "/blog/services", "/blog/whats-included"],
  "/blog/bathroom": ["/blog/checklists", "/blog/cleaning-hacks", "/blog/whats-included"],
  "/blog/checklists": ["/blog/whats-included", "/blog/services", "/blog/cleaning-hacks"],
  "/blog/cleaning-hacks": ["/blog/checklists", "/blog/whats-included", "/blog/services"],
  "/blog/dust": ["/blog/pet-hair", "/blog/checklists", "/blog/cleaning-hacks"],
  "/blog/floors": ["/blog/dust", "/blog/pet-hair", "/blog/checklists"],
  "/blog/kitchen": ["/blog/whats-included", "/blog/checklists", "/blog/services"],
  "/blog/move-in-move-out": ["/blog/services", "/blog/whats-included", "/blog/checklists"],
  "/blog/pet-hair": ["/blog/dust", "/blog/floors", "/blog/checklists"],
  "/blog/seasonal": ["/blog/checklists", "/blog/cleaning-hacks", "/blog/services"],
  "/blog/services": ["/blog/whats-included", "/blog/checklists", "/blog/move-in-move-out"],
  "/blog/whats-included": ["/blog/services", "/blog/checklists", "/blog/kitchen"],
});

const TAG_RULES = Object.freeze([
  { tag: "airbnb", pattern: /\bairbnb\b|\bturnover\b|\bco host/i },
  { tag: "allergies", pattern: /\ballerg(?:y|ies)\b|\bdust mites?\b|\bdander\b/i },
  { tag: "baseboards", pattern: /\bbaseboards?\b/i },
  { tag: "bathroom", pattern: /\bbath(room)?s?\b|\btoilet\b|\bshower\b|\btub\b|\bcaulk\b|\bgrout\b|\bfaucet\b|\bsink\b/i },
  { tag: "bed", pattern: /\bbed(room|ding)?\b|\bbed sheets?\b|\blinens?\b/i },
  { tag: "blinds", pattern: /\bblinds?\b|\bcurtains?\b/i },
  { tag: "cabinets", pattern: /\bcabinets?\b|\bdrawers?\b|\bpantry\b/i },
  { tag: "carpet", pattern: /\bcarpet\b|\brugs?\b|\bstairs carpet\b/i },
  { tag: "checklist", pattern: /\bchecklist\b|\bprintable\b/i },
  { tag: "chrome", pattern: /\bchrome\b|\bfixtures?\b/i },
  { tag: "construction", pattern: /\bconstruction\b|\brenovation\b|\bpost construction\b/i },
  { tag: "deep-cleaning", pattern: /\bdeep clean(?:ing)?\b/i },
  { tag: "deposit", pattern: /\bdeposit\b|\binspection\b|\blandlords?\b/i },
  { tag: "dishes", pattern: /\bdishes?\b|\bdishwasher\b/i },
  { tag: "dust", pattern: /\bdust\b|\bdusting\b|\bvents?\b|\bceiling fans?\b/i },
  { tag: "elderly", pattern: /\belderly\b|\bparents?\b/i },
  { tag: "family", pattern: /\bfamil(?:y|ies)\b|\bworking parents?\b|\btoddlers?\b|\bkids?\b/i },
  { tag: "floors", pattern: /\bfloors?\b|\bmop(?:ping)?\b|\bhardwood\b|\blaminate\b|\bvinyl\b|\btile\b|\bbaseboards?\b/i },
  { tag: "fridge", pattern: /\bfridge\b|\brefrigerator\b/i },
  { tag: "guests", pattern: /\bguests?\b|\bhosting\b|\bparty\b|\bopen house\b/i },
  { tag: "hard-water", pattern: /\bhard water\b|\bmineral\b|\bdescale\b/i },
  { tag: "kitchen", pattern: /\bkitchen\b|\boven\b|\bstove\b|\bmicrowave\b|\bbacksplash\b|\bgarbage disposal\b|\bcountertops?\b/i },
  { tag: "laundry", pattern: /\blaundry\b|\bwashable\b|\bwash\b/i },
  { tag: "move-in-out", pattern: /\bmove(?:-in|-out)?\b|\bmoving\b|\brenters?\b|\bunpacking\b/i },
  { tag: "odor", pattern: /\bodou?r\b|\bsmell\b|\burine\b|\bslobber\b/i },
  { tag: "office", pattern: /\boffice\b|\bdesk\b/i },
  { tag: "pets", pattern: /\bpet\b|\bdog\b|\bcat\b|\bpuppy\b|\blitter\b/i },
  { tag: "price", pattern: /\bprice\b|\bcost\b|\bquote\b|\bdiscount\b|\btip\b|\bsubscription\b/i },
  { tag: "regular-cleaning", pattern: /\bregular cleaning\b|\brecurring cleaning\b|\bweekly\b|\bbiweekly\b|\bmonthly\b/i },
  { tag: "seasonal", pattern: /\bspring\b|\bfall\b|\bwinter\b|\bsummer\b|\bholiday\b|\bthanksgiving\b|\bback to school\b/i },
  { tag: "stains", pattern: /\bstains?\b|\bscum\b|\bring\b|\bscuffs?\b|\bspots?\b/i },
  { tag: "supplies", pattern: /\bsupplies\b|\bvacuum\b|\btools?\b|\bproducts?\b/i },
  { tag: "time", pattern: /\bhow long\b|\bhow much time\b|\b2 hours?\b|\b3 hours?\b|\b1500 sq ft\b|\b2000 sq ft\b|\b2500 sq ft\b/i },
  { tag: "walls", pattern: /\bwalls?\b|\bfingerprints?\b|\bcrayon\b|\bscuffs?\b|\bnail holes?\b/i },
  { tag: "windows", pattern: /\bwindows?\b|\bglass\b|\bstreaks?\b/i },
]);

const SLOT_SUPPORT_SENTENCES = Object.freeze([
  "It is most useful when you are trying to solve the immediate mess and the nearby source at the same time, instead of treating the visible symptom as the whole job.",
  "That usually gives you the companion process, scope, or routine that sits right next to this task in real homes, which is exactly where people tend to get stuck.",
  "Using both pages together makes the maintenance plan easier to repeat later without missing the detail work that quietly brings the same problem back.",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function getCategorySupportCopy(categoryPath) {
  switch (categoryPath) {
    case "/blog/checklists":
      return {
        before: "If you want a repeatable version of this work, keep that open with ",
        after: ", then use it as the practical routine to follow the next time this comes up.",
      };
    case "/blog/whats-included":
      return {
        before: "If you also want the service-scope side explained clearly, read ",
        after: " so you know where this task usually fits before you book a visit.",
      };
    case "/blog/services":
      return {
        before: "If you need the pricing or quote side next, read ",
        after: " for a clearer view of how this issue affects labor, scope, and cost.",
      };
    case "/blog/cleaning-hacks":
      return {
        before: "If you want the faster maintenance version of this, read ",
        after: " for the shortcut version that helps between fuller cleanings.",
      };
    case "/blog/bathroom":
      return {
        before: "If this is part of a bigger bathroom reset, keep going with ",
        after: " so the room feels consistently cleaner instead of temporarily improved.",
      };
    case "/blog/kitchen":
      return {
        before: "If this is part of a bigger kitchen reset, keep going with ",
        after: " so the surrounding buildup does not keep undoing the result.",
      };
    case "/blog/floors":
      return {
        before: "If the problem continues on nearby floors and edges, read ",
        after: " so you can fix the wider floor-care pattern instead of only one spot.",
      };
    case "/blog/dust":
      return {
        before: "If dust buildup around this area is part of the same problem, read ",
        after: " for the nearby surfaces and routines that usually keep reloading it.",
      };
    case "/blog/pet-hair":
      return {
        before: "If pets are making this mess reload faster, read ",
        after: " for the pet-specific source points that usually keep the cycle going.",
      };
    case "/blog/move-in-move-out":
      return {
        before: "If this is part of a move-related reset, read ",
        after: " so you can line it up with the inspection, deposit, or key-handoff pressure.",
      };
    case "/blog/airbnb":
      return {
        before: "If you are solving this for a turnover or guest-ready setup, read ",
        after: " for the version that is built around fast resets and presentation.",
      };
    case "/blog/seasonal":
      return {
        before: "If this shows up during a bigger seasonal reset, read ",
        after: " to connect it to the wider seasonal work happening around the home.",
      };
    default:
      return {
        before: "A closely related next step is ",
        after: ", especially if you want to keep this problem from returning so quickly.",
      };
  }
}

function buildArticleProfiles(articles) {
  return articles.map((article, index) => {
    const sourceText = [article.title, article.excerpt, article.description, article.path].join(" ");
    const tokenSet = new Set(tokenize(sourceText));
    const tags = new Set();

    for (const rule of TAG_RULES) {
      if (rule.pattern.test(sourceText)) tags.add(rule.tag);
    }

    if (!tags.size) tags.add(article.categoryPath.replace("/blog/", ""));

    return {
      article,
      index,
      tokenSet,
      tags,
    };
  });
}

function getSharedCount(left, right) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function getCategoryAffinity(sourceCategory, targetCategory) {
  if (sourceCategory === targetCategory) return 60;
  const preferred = RELATED_CATEGORY_PREFERENCES[sourceCategory] || [];
  const idx = preferred.indexOf(targetCategory);
  if (idx === -1) return 0;
  return Math.max(26 - idx * 4, 14);
}

function scoreCandidate(sourceProfile, targetProfile) {
  const sameCategory = sourceProfile.article.categoryPath === targetProfile.article.categoryPath;
  const sharedTags = getSharedCount(sourceProfile.tags, targetProfile.tags);
  const sharedTokens = getSharedCount(sourceProfile.tokenSet, targetProfile.tokenSet);

  let score = getCategoryAffinity(
    sourceProfile.article.categoryPath,
    targetProfile.article.categoryPath
  );

  score += sharedTags * 18;
  score += Math.min(sharedTokens, 6) * 5;

  if (sameCategory && sharedTags === 0 && sharedTokens === 0) {
    score += 6;
  }

  if (
    sourceProfile.tags.has("price") &&
    targetProfile.article.categoryPath === "/blog/whats-included"
  ) {
    score += 10;
  }

  if (
    sourceProfile.tags.has("checklist") &&
    targetProfile.article.categoryPath === "/blog/cleaning-hacks"
  ) {
    score += 8;
  }

  if (
    sourceProfile.tags.has("move-in-out") &&
    targetProfile.article.categoryPath === "/blog/services"
  ) {
    score += 10;
  }

  if (
    sourceProfile.tags.has("airbnb") &&
    targetProfile.article.categoryPath === "/blog/checklists"
  ) {
    score += 8;
  }

  if (
    sourceProfile.tags.has("pets") &&
    (targetProfile.article.categoryPath === "/blog/dust" ||
      targetProfile.article.categoryPath === "/blog/floors")
  ) {
    score += 10;
  }

  if (
    sourceProfile.tags.has("bathroom") &&
    targetProfile.article.categoryPath === "/blog/whats-included"
  ) {
    score += 6;
  }

  if (
    sourceProfile.tags.has("kitchen") &&
    targetProfile.article.categoryPath === "/blog/whats-included"
  ) {
    score += 6;
  }

  return score;
}

function pickRelatedTargets(sourceProfile, allProfiles) {
  const scored = allProfiles
    .filter((targetProfile) => targetProfile.article.path !== sourceProfile.article.path)
    .map((targetProfile) => ({
      profile: targetProfile,
      score: scoreCandidate(sourceProfile, targetProfile),
    }))
    .sort((left, right) => right.score - left.score || left.profile.index - right.profile.index);

  const selected = [];
  const usedPaths = new Set();

  function take(predicate) {
    const match = scored.find(
      (item) =>
        !usedPaths.has(item.profile.article.path) &&
        item.score >= 12 &&
        predicate(item.profile, item.score)
    );
    if (!match) return;
    usedPaths.add(match.profile.article.path);
    selected.push(match.profile.article);
  }

  take((target) => target.article.categoryPath === sourceProfile.article.categoryPath);

  const preferredCategories =
    RELATED_CATEGORY_PREFERENCES[sourceProfile.article.categoryPath] || [];
  for (const categoryPath of preferredCategories) {
    if (selected.length >= 2) break;
    take((target) => target.article.categoryPath === categoryPath);
  }

  while (selected.length < 3) {
    take(() => true);
    if (selected.length === usedPaths.size && selected.length < 3) {
      const fallback = scored.find((item) => !usedPaths.has(item.profile.article.path));
      if (!fallback) break;
      usedPaths.add(fallback.profile.article.path);
      selected.push(fallback.profile.article);
    }
  }

  return selected.slice(0, 3);
}

function buildLinkParagraph(targetArticle, slot) {
  const supportCopy = getCategorySupportCopy(targetArticle.categoryPath);
  const slotSupport =
    SLOT_SUPPORT_SENTENCES[(Math.max(Number(slot) || 1, 1) - 1) % SLOT_SUPPORT_SENTENCES.length];
  return `<p class="shynli-blog-article__soft-link" data-soft-link-slot="${slot}" data-soft-link-target="${escapeAttribute(
    targetArticle.path
  )}">${supportCopy.before}<a href="${escapeAttribute(targetArticle.path)}">${escapeHtml(
    targetArticle.title
  )}</a>${supportCopy.after} ${slotSupport} That is usually true in the same home for most households.</p>`;
}

function splitSections(bodyHtml) {
  const html = String(bodyHtml || "");
  const sectionMarker = '<section class="shynli-blog-article__section"';
  const sections = [];

  let start = html.indexOf(sectionMarker);
  if (start === -1) return null;

  const prefix = html.slice(0, start);
  let cursor = start;

  while (start !== -1) {
    let depth = 0;
    let position = start;
    let end = -1;

    while (position < html.length) {
      const nextOpen = html.indexOf("<section", position);
      const nextClose = html.indexOf("</section>", position);

      if (nextClose === -1) return null;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        position = nextOpen + "<section".length;
        continue;
      }

      depth -= 1;
      position = nextClose + "</section>".length;
      if (depth === 0) {
        end = position;
        break;
      }
    }

    if (end === -1) return null;

    sections.push(html.slice(start, end));
    cursor = end;
    start = html.indexOf(sectionMarker, cursor);
  }

  const suffix = html.slice(cursor);
  return { prefix, sections, suffix };
}

function isEligibleSection(sectionHtml) {
  const idMatch = sectionHtml.match(/\sid="([^"]+)"/i);
  const sectionId = idMatch ? idMatch[1] : "";
  if (sectionId && EXCLUDED_SECTION_IDS.has(sectionId)) return false;
  if (/shynli-blog-article__faq/i.test(sectionHtml)) return false;
  if (/shynli-blog-article__footer-note/i.test(sectionHtml)) return false;
  if (/data-blog-print/i.test(sectionHtml)) return false;
  if (/>Final takeaway</i.test(sectionHtml)) return false;
  return true;
}

function pickEligibleSectionIndices(sections, count) {
  const eligibleIndices = sections
    .map((section, index) => (isEligibleSection(section) ? index : -1))
    .filter((index) => index >= 0);

  if (!eligibleIndices.length) return [];
  if (eligibleIndices.length <= count) return eligibleIndices.slice(0, count);

  const picked = [];
  for (let slot = 0; slot < count; slot += 1) {
    let position = Math.round(((slot + 1) * (eligibleIndices.length + 1)) / (count + 1)) - 1;
    if (position < 0) position = 0;
    if (position >= eligibleIndices.length) position = eligibleIndices.length - 1;
    while (picked.includes(eligibleIndices[position]) && position < eligibleIndices.length - 1) {
      position += 1;
    }
    while (picked.includes(eligibleIndices[position]) && position > 0) {
      position -= 1;
    }
    picked.push(eligibleIndices[position]);
  }

  return picked.sort((left, right) => left - right);
}

function injectSoftLinks(bodyHtml, relatedTargets) {
  if (!relatedTargets.length || String(bodyHtml).includes("data-soft-link-slot=")) {
    return bodyHtml;
  }

  const split = splitSections(bodyHtml);
  if (!split) return bodyHtml;

  const sectionIndices = pickEligibleSectionIndices(split.sections, relatedTargets.length);
  if (!sectionIndices.length) return bodyHtml;

  const updatedSections = split.sections.slice();
  for (let slot = 0; slot < Math.min(sectionIndices.length, relatedTargets.length); slot += 1) {
    const index = sectionIndices[slot];
    const section = updatedSections[index];
    const insertAt = section.lastIndexOf("</section>");
    if (insertAt === -1) continue;
    updatedSections[index] =
      section.slice(0, insertAt) +
      buildLinkParagraph(relatedTargets[slot], slot + 1) +
      section.slice(insertAt);
  }

  return `${split.prefix}${updatedSections.join("")}${split.suffix}`;
}

function applySoftInternalLinks(articles) {
  const profiles = buildArticleProfiles(articles);

  return profiles.map((profile) => {
    const relatedTargets = pickRelatedTargets(profile, profiles);
    return {
      ...profile.article,
      bodyHtml: injectSoftLinks(profile.article.bodyHtml, relatedTargets),
    };
  });
}

module.exports = {
  applySoftInternalLinks,
};
