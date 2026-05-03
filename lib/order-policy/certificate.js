"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const POLICY_ACCEPTANCE_CERTIFICATE_TEMPLATE_PATHS = [
  {
    kind: "png",
    absolutePath: path.join(
      __dirname,
      "..",
      "..",
      "assets",
      "forms",
      "policy-acceptance-certificate-template.png"
    ),
  },
  {
    kind: "jpg",
    absolutePath: path.join(
      __dirname,
      "..",
      "..",
      "assets",
      "forms",
      "policy-acceptance-certificate-template.jpg"
    ),
  },
];
const PDF_CONTENT_TYPE = "application/pdf";
const POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION = "2026-05-03-template-v5";
let cachedPolicyAcceptanceCertificateTemplateBytesPromise = null;

const PDF_SAFE_CHAR_REPLACEMENTS = Object.freeze({
  "\u00A0": " ",
  "\u2007": " ",
  "\u202F": " ",
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2015": "-",
  "\u2212": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u2032": "'",
  "\u201C": "\"",
  "\u201D": "\"",
  "\u201E": "\"",
  "\u201F": "\"",
  "\u2033": "\"",
  "\u2026": "...",
});

const CYRILLIC_TO_LATIN = Object.freeze({
  А: "A", а: "a",
  Б: "B", б: "b",
  В: "V", в: "v",
  Г: "G", г: "g",
  Д: "D", д: "d",
  Е: "E", е: "e",
  Ё: "E", ё: "e",
  Ж: "Zh", ж: "zh",
  З: "Z", з: "z",
  И: "I", и: "i",
  Й: "I", й: "i",
  К: "K", к: "k",
  Л: "L", л: "l",
  М: "M", м: "m",
  Н: "N", н: "n",
  О: "O", о: "o",
  П: "P", п: "p",
  Р: "R", р: "r",
  С: "S", с: "s",
  Т: "T", т: "t",
  У: "U", у: "u",
  Ф: "F", ф: "f",
  Х: "Kh", х: "kh",
  Ц: "Ts", ц: "ts",
  Ч: "Ch", ч: "ch",
  Ш: "Sh", ш: "sh",
  Щ: "Shch", щ: "shch",
  Ъ: "", ъ: "",
  Ы: "Y", ы: "y",
  Ь: "", ь: "",
  Э: "E", э: "e",
  Ю: "Yu", ю: "yu",
  Я: "Ya", я: "ya",
  І: "I", і: "i",
  Ї: "Yi", ї: "yi",
  Є: "Ye", є: "ye",
  Ґ: "G", ґ: "g",
});

function defaultNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function toPdfSafeText(value, maxLength = 500) {
  let text = defaultNormalizeString(value, maxLength);
  if (!text) return "";

  if (typeof text.normalize === "function") {
    text = text.normalize("NFKD");
  }
  text = text.replace(/[\u0300-\u036f]/g, "");

  const converted = [];
  for (const char of text) {
    if (Object.prototype.hasOwnProperty.call(PDF_SAFE_CHAR_REPLACEMENTS, char)) {
      converted.push(PDF_SAFE_CHAR_REPLACEMENTS[char]);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(CYRILLIC_TO_LATIN, char)) {
      converted.push(CYRILLIC_TO_LATIN[char]);
      continue;
    }
    const codePoint = char.codePointAt(0);
    if ((codePoint >= 32 && codePoint <= 126) || (codePoint >= 160 && codePoint <= 255)) {
      converted.push(char);
      continue;
    }
    converted.push("?");
  }

  return converted.join("").replace(/\s+/g, " ").trim();
}

function formatChicagoDateTime(value) {
  const timestamp = Date.parse(defaultNormalizeString(value, 80));
  if (!Number.isFinite(timestamp)) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function wrapTextLines(font, text, fontSize, maxWidth) {
  const words = toPdfSafeText(text, 4000).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let currentLine = words.shift() || "";

  for (const word of words) {
    const candidate = `${currentLine} ${word}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }

  lines.push(currentLine);
  return lines;
}

async function loadPolicyAcceptanceCertificateTemplateBytes() {
  if (!cachedPolicyAcceptanceCertificateTemplateBytesPromise) {
    cachedPolicyAcceptanceCertificateTemplateBytesPromise = (async () => {
      let lastError = null;
      for (const candidate of POLICY_ACCEPTANCE_CERTIFICATE_TEMPLATE_PATHS) {
        try {
          return {
            kind: candidate.kind,
            bytes: await fsp.readFile(candidate.absolutePath),
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Policy certificate template was not found.");
    })().catch((error) => {
      cachedPolicyAcceptanceCertificateTemplateBytesPromise = null;
      throw error;
    });
  }
  return cachedPolicyAcceptanceCertificateTemplateBytesPromise;
}

function fitPdfText(font, text, maxWidth, preferredSize, minSize = 6) {
  let safeText = toPdfSafeText(text, 4000) || "Not set";
  let size = preferredSize;

  while (size > minSize && font.widthOfTextAtSize(safeText, size) > maxWidth) {
    size -= 0.25;
  }

  if (font.widthOfTextAtSize(safeText, size) > maxWidth) {
    while (safeText.length > 1 && font.widthOfTextAtSize(`${safeText}...`, size) > maxWidth) {
      safeText = safeText.slice(0, -1);
    }
    safeText = safeText.length > 0 ? `${safeText}...` : "...";
  }

  return {
    text: safeText,
    size,
  };
}

function formatCertificateDisplayId(value) {
  const normalized = defaultNormalizeString(value, 120)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (normalized) return normalized.slice(0, 12);
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}

function drawWrappedText(page, font, text, x, y, maxWidth, fontSize, options = {}) {
  const lines = wrapTextLines(font, text, fontSize, maxWidth);
  const lineHeight = Number(options.lineHeight) || fontSize * 1.3;
  const color = options.color || rgb(0.15, 0.15, 0.17);
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size: fontSize,
      font,
      color,
    });
    cursorY -= lineHeight;
  }
  return cursorY;
}

async function generatePolicyAcceptanceCertificate(record, helpers = {}) {
  const sanitizePolicyAcceptanceRecord = helpers.sanitizePolicyAcceptanceRecord;
  const normalizeString =
    typeof helpers.normalizeString === "function" ? helpers.normalizeString : defaultNormalizeString;
  const buildAcceptanceStatement =
    typeof helpers.buildAcceptanceStatement === "function"
      ? helpers.buildAcceptanceStatement
      : null;

  if (typeof sanitizePolicyAcceptanceRecord !== "function") {
    throw new TypeError("sanitizePolicyAcceptanceRecord helper is required.");
  }
  if (typeof buildAcceptanceStatement !== "function") {
    throw new TypeError("buildAcceptanceStatement helper is required.");
  }

  const sanitized = sanitizePolicyAcceptanceRecord(record);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.1, 0.11, 0.12);
  const muted = rgb(0.36, 0.37, 0.4);
  const slate = rgb(0.55, 0.57, 0.61);
  const border = rgb(0.77, 0.83, 0.83);
  const borderSoft = rgb(0.86, 0.89, 0.9);
  const teal = rgb(0.73, 0.83, 0.82);
  const wave = rgb(0.84, 0.9, 0.89);
  const fill = rgb(0.985, 0.986, 0.988);
  const white = rgb(1, 1, 1);
  const certificateId = sanitized.acceptanceId || crypto.randomUUID();
  const certificateDisplayId = formatCertificateDisplayId(certificateId);
  const bookingDisplayId =
    normalizeString(sanitized.requestId, 120) ||
    normalizeString(sanitized.bookingId, 120) ||
    "Not set";
  const completedAt = sanitized.signedAt || sanitized.updatedAt || new Date().toISOString();

  let templateBytes = null;
  try {
    templateBytes = await loadPolicyAcceptanceCertificateTemplateBytes();
  } catch {
    templateBytes = null;
  }

  if (templateBytes) {
    const templateCanvasWidth = 1856;
    const templateCanvasHeight = 2296;
    const scaleX = 612 / templateCanvasWidth;
    const scaleY = 792 / templateCanvasHeight;
    const templateImage =
      templateBytes.kind === "jpg"
        ? await pdfDoc.embedJpg(templateBytes.bytes)
        : await pdfDoc.embedPng(templateBytes.bytes);
    page.drawImage(templateImage, {
      x: 0,
      y: 0,
      width: 612,
      height: 792,
    });

    function toPdfX(px) {
      return px * scaleX;
    }

    function toPdfY(py) {
      return 792 - py * scaleY;
    }

    function toPdfWidth(px) {
      return px * scaleX;
    }

    function toPdfHeight(px) {
      return px * scaleY;
    }

    function clearTemplateRect(xPx, yPx, widthPx, heightPx, opacity = 1) {
      page.drawRectangle({
        x: toPdfX(xPx),
        y: 792 - (yPx + heightPx) * scaleY,
        width: toPdfWidth(widthPx),
        height: toPdfHeight(heightPx),
        color: white,
        opacity,
      });
    }

    function drawTemplateText(value, xPx, baselinePx, widthPx, options = {}) {
      const font = options.font || fontRegular;
      const color = options.color || dark;
      const align = options.align || "left";
      const preferredSize = options.size || 8.7;
      const minSize = options.minSize || 6;
      const safeValue =
        normalizeString(value, options.maxLength || 500) || options.fallback || "Not set";
      const fitted = fitPdfText(font, safeValue, toPdfWidth(widthPx), preferredSize, minSize);
      const textWidth = font.widthOfTextAtSize(fitted.text, fitted.size);
      let textX = toPdfX(xPx);
      if (align === "center") {
        textX += Math.max(0, (toPdfWidth(widthPx) - textWidth) / 2);
      } else if (align === "right") {
        textX += Math.max(0, toPdfWidth(widthPx) - textWidth);
      }
      page.drawText(fitted.text, {
        x: textX,
        y: toPdfY(baselinePx),
        size: fitted.size,
        font,
        color,
      });
    }

    function drawTemplateWrappedText(value, xPx, baselinePx, widthPx, options = {}) {
      const font = options.font || fontRegular;
      const color = options.color || dark;
      const fontSize = options.size || 8.3;
      const lineHeight = options.lineHeight || fontSize * 1.18;
      const maxLines = options.maxLines || 6;
      const safeValue = normalizeString(value, options.maxLength || 4000) || options.fallback || "Not set";
      const lines = wrapTextLines(font, safeValue, fontSize, toPdfWidth(widthPx)).slice(0, maxLines);
      let cursorY = toPdfY(baselinePx);
      for (const line of lines) {
        page.drawText(line, {
          x: toPdfX(xPx),
          y: cursorY,
          size: fontSize,
          font,
          color,
        });
        cursorY -= lineHeight;
      }
    }

    function drawTemplateLabeledValue(label, value, labelXPx, valueXPx, baselinePx, valueWidthPx, options = {}) {
      const labelText = normalizeString(label, 120);
      const labelFont = options.labelFont || fontBold;
      const labelSize = options.labelSize || 8.4;
      page.drawText(labelText, {
        x: toPdfX(labelXPx),
        y: toPdfY(baselinePx),
        size: labelSize,
        font: labelFont,
        color: options.labelColor || dark,
      });
      drawTemplateText(value, valueXPx, baselinePx, valueWidthPx, {
        size: options.size || 7.8,
        minSize: options.minSize || 6,
        maxLength: options.maxLength || 260,
        color: options.color || dark,
      });
    }

    function drawTemplateLine(x1Px, y1Px, x2Px, y2Px, thickness = 1) {
      page.drawLine({
        start: { x: toPdfX(x1Px), y: toPdfY(y1Px) },
        end: { x: toPdfX(x2Px), y: toPdfY(y2Px) },
        color: dark,
        thickness,
      });
    }

    function drawTemplateCross(xPx, yPx, sizePx = 28) {
      page.drawLine({
        start: { x: toPdfX(xPx), y: toPdfY(yPx) },
        end: { x: toPdfX(xPx + sizePx), y: toPdfY(yPx + sizePx) },
        color: dark,
        thickness: 1,
      });
      page.drawLine({
        start: { x: toPdfX(xPx), y: toPdfY(yPx + sizePx) },
        end: { x: toPdfX(xPx + sizePx), y: toPdfY(yPx) },
        color: dark,
        thickness: 1,
      });
    }

    drawTemplateText(`DOC-${certificateDisplayId}`, 560, 340, 380, {
      size: 8.9,
      minSize: 6.6,
    });
    drawTemplateText(formatChicagoDateTime(completedAt), 1332, 340, 264, {
      size: 8.9,
      minSize: 6.8,
      align: "left",
    });
    drawTemplateText(bookingDisplayId, 560, 413, 1028, {
      size: 8.7,
      minSize: 6.2,
      maxLength: 320,
    });

    drawTemplateText(sanitized.customerFullName || "Not set", 252, 658, 690, {
      size: 8.6,
      minSize: 6.4,
    });
    drawTemplateText(sanitized.customerEmail || "Not set", 252, 774, 690, {
      size: 8.6,
      minSize: 6.2,
    });
    drawTemplateText(sanitized.customerPhone || "Not set", 252, 890, 690, {
      size: 8.6,
      minSize: 6.2,
    });
    drawTemplateWrappedText(sanitized.serviceAddress || "Not set", 252, 1002, 1328, {
      size: 8.5,
      lineHeight: 10,
      maxLines: 2,
    });

    drawTemplateText(formatChicagoDateTime(sanitized.sentAt), 985, 678, 610, {
      size: 8.5,
      minSize: 6.2,
    });
    drawTemplateText(
      formatChicagoDateTime(sanitized.firstViewedAt || sanitized.lastViewedAt),
      985,
      794,
      610,
      {
        size: 8.5,
        minSize: 6.2,
      }
    );
    drawTemplateText(formatChicagoDateTime(sanitized.signedAt), 985, 910, 610, {
      size: 8.5,
      minSize: 6.2,
    });

    const acceptedDocuments = [sanitized.termsDocument, sanitized.paymentPolicyDocument];
    const documentBaselines = [
      [1156, 1218, 1291],
      [1383, 1446, 1510],
    ];
    acceptedDocuments.forEach((document, index) => {
      const [nameY, urlY, versionY] = documentBaselines[index];
      drawTemplateText(document.title || "Policy document", 692, nameY, 900, {
        size: 8.4,
        minSize: 6.2,
        maxLength: 220,
      });
      drawTemplateText(document.publicUrl || "Not set", 692, urlY, 900, {
        size: 8.1,
        minSize: 5.7,
        maxLength: 2000,
      });
      drawTemplateText(
        `${document.version || "Not set"} / ${document.effectiveDate || "Not set"}`,
        692,
        versionY,
        900,
        {
          size: 8.1,
          minSize: 5.7,
          maxLength: 220,
        }
      );
    });

    clearTemplateRect(238, 1670, 1384, 206);
    drawTemplateWrappedText(buildAcceptanceStatement(sanitized), 252, 1768, 1342, {
      size: 8,
      lineHeight: 9.2,
      maxLines: 7,
      maxLength: 2000,
    });

    if (sanitized.acceptedTerms) {
      drawTemplateCross(258, 1944, 28);
    }
    if (sanitized.acceptedPaymentCancellation) {
      drawTemplateCross(258, 2000, 28);
    }

    clearTemplateRect(242, 2049, 760, 52);
    clearTemplateRect(1008, 2049, 608, 52);
    drawTemplateLabeledValue(
      "Typed Electronic Signature:",
      sanitized.typedSignature || "Not set",
      250,
      682,
      2087,
      298,
      {
        size: 7.8,
        minSize: 6,
        maxLength: 220,
      }
    );
    drawTemplateLabeledValue(
      "IP:",
      `${sanitized.ipAddress || "Unknown"}${sanitized.locationText ? ` - ${sanitized.locationText}` : ""}`,
      1018,
      1065,
      2087,
      530,
      {
        size: 7.8,
        minSize: 6,
        maxLength: 260,
      }
    );

    return Buffer.from(await pdfDoc.save());
  }

  function drawRule(x1, x2, y, color = borderSoft, thickness = 0.8) {
    page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      color,
      thickness,
    });
  }

  function drawCenteredText(text, y, size, font = fontBold, color = dark) {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (612 - width) / 2,
      y,
      size,
      font,
      color,
    });
  }

  function drawAcceptanceCheckbox(label, x, y, checked = true) {
    page.drawRectangle({
      x,
      y: y - 1,
      width: 11,
      height: 11,
      borderColor: dark,
      borderWidth: 0.9,
    });
    if (checked) {
      page.drawLine({
        start: { x: x + 2, y: y + 8 },
        end: { x: x + 9, y: y + 1 },
        color: dark,
        thickness: 1,
      });
      page.drawLine({
        start: { x: x + 2, y: y + 1 },
        end: { x: x + 9, y: y + 8 },
        color: dark,
        thickness: 1,
      });
    }
    page.drawText(label, {
      x: x + 18,
      y,
      size: 10,
      font: fontRegular,
      color: dark,
    });
  }

  function drawLabeledValue(label, value, x, y, width, options = {}) {
    const labelSize = options.labelSize || 10;
    const valueSize = options.valueSize || 10;
    const maxLines = options.maxLines || 1;
    const valueFont = options.valueFont || fontRegular;
    const valueColor = options.valueColor || dark;
    const drawUnderline = options.drawUnderline !== false;
    const labelText = String(label || "").toUpperCase();
    const safeValue = normalizeString(value, 500) || "";
    const labelWidth = fontBold.widthOfTextAtSize(labelText, labelSize);
    page.drawText(labelText, {
      x,
      y,
      size: labelSize,
      font: fontBold,
      color: dark,
    });

    const valueX = x;
    const valueY = y - 16;
    const wrapped = wrapTextLines(valueFont, safeValue || "—", valueSize, width).slice(0, maxLines);
    let cursorY = valueY;
    for (const line of wrapped) {
      page.drawText(line, {
        x: valueX,
        y: cursorY,
        size: valueSize,
        font: valueFont,
        color: valueColor,
      });
      cursorY -= valueSize + 2;
    }

    if (drawUnderline) {
      const underlineY = valueY - (wrapped.length - 1) * (valueSize + 2) - 3;
      drawRule(x, x + width, underlineY, border, 0.7);
    }

    return cursorY - 8;
  }

  function drawHeaderMeta(label, value, x, y, width, align = "left") {
    const safeValue = normalizeString(value, 240) || "";
    const labelText = `${label}:`;
    const labelWidth = fontBold.widthOfTextAtSize(labelText, 9.5);
    const fittedValue = fitPdfText(fontRegular, safeValue, width, 9, 6.3);
    if (align === "right") {
      const blockRight = x + width;
      page.drawText(labelText, {
        x: blockRight - labelWidth,
        y,
        size: 9.5,
        font: fontBold,
        color: dark,
      });
      drawRule(x + 98, blockRight, y - 6, slate, 0.8);
      const valueWidth = fontRegular.widthOfTextAtSize(fittedValue.text, fittedValue.size);
      page.drawText(fittedValue.text, {
        x: blockRight - valueWidth,
        y: y - 18,
        size: fittedValue.size,
        font: fontRegular,
        color: dark,
      });
    } else {
      page.drawText(labelText, {
        x,
        y,
        size: 9.5,
        font: fontBold,
        color: dark,
      });
      drawRule(x + labelWidth + 6, x + width, y - 6, slate, 0.8);
      page.drawText(fittedValue.text, {
        x,
        y: y - 18,
        size: fittedValue.size,
        font: fontRegular,
        color: dark,
      });
    }
  }

  page.drawRectangle({
    x: 18,
    y: 18,
    width: 576,
    height: 756,
    borderColor: teal,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 28,
    y: 28,
    width: 556,
    height: 736,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 38,
    y: 38,
    width: 536,
    height: 716,
    borderColor: borderSoft,
    borderWidth: 1,
  });

  for (let y = 52; y <= 742; y += 14) {
    page.drawSvgPath(
      `M 48 ${y} C 112 ${y + 5}, 176 ${y - 5}, 240 ${y} S 368 ${y + 5}, 432 ${y} S 496 ${y - 5}, 560 ${y}`,
      {
        borderColor: wave,
        borderWidth: 0.45,
        opacity: 0.22,
      }
    );
  }

  drawHeaderMeta("CERTIFICATE ID", `DOC-${certificateDisplayId}`, 56, 730, 214);
  drawHeaderMeta("BOOKING ID", bookingDisplayId, 56, 702, 214);
  drawHeaderMeta("DOCUMENT COMPLETED ON", formatChicagoDateTime(completedAt), 346, 730, 190, "right");

  drawCenteredText("CERTIFICATE OF", 655, 18, fontRegular);
  drawCenteredText("POLICY ACCEPTANCE", 626, 23, fontBold);

  const customerBox = { x: 60, y: 430, width: 470, height: 158 };
  page.drawRectangle({
    x: customerBox.x,
    y: customerBox.y,
    width: customerBox.width,
    height: customerBox.height,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });
  page.drawRectangle({
    x: customerBox.x,
    y: customerBox.y + customerBox.height - 30,
    width: customerBox.width,
    height: 30,
    borderColor: border,
    borderWidth: 1,
    color: rgb(0.96, 0.97, 0.98),
  });
  page.drawLine({
    start: { x: 318, y: customerBox.y },
    end: { x: 318, y: customerBox.y + customerBox.height },
    color: border,
    thickness: 1,
  });
  page.drawText("CUSTOMER", {
    x: 68,
    y: customerBox.y + customerBox.height - 20,
    size: 10.5,
    font: fontBold,
    color: dark,
  });
  page.drawText("TIMESTAMP", {
    x: 328,
    y: customerBox.y + customerBox.height - 20,
    size: 10.5,
    font: fontBold,
    color: dark,
  });

  let customerCursorY = customerBox.y + customerBox.height - 48;
  customerCursorY = drawLabeledValue("NAME", sanitized.customerFullName || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
  });
  customerCursorY = drawLabeledValue("EMAIL", sanitized.customerEmail || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
  });
  customerCursorY = drawLabeledValue("PHONE", sanitized.customerPhone || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
  });
  drawLabeledValue("SERVICE ADDRESS", sanitized.serviceAddress || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
    maxLines: 2,
  });

  let timestampCursorY = customerBox.y + customerBox.height - 48;
  timestampCursorY = drawLabeledValue("SENT", formatChicagoDateTime(sanitized.sentAt), 328, timestampCursorY, 190, {
    valueSize: 9.5,
  });
  timestampCursorY = drawLabeledValue(
    "VIEWED",
    formatChicagoDateTime(sanitized.firstViewedAt || sanitized.lastViewedAt),
    328,
    timestampCursorY,
    190,
    {
      valueSize: 9.5,
    }
  );
  drawLabeledValue("ACCEPTED", formatChicagoDateTime(sanitized.signedAt), 328, timestampCursorY, 190, {
    valueSize: 9.5,
  });

  const documentsBox = { x: 60, y: 268, width: 470, height: 118 };
  page.drawText("ACCEPTED DOCUMENTS", {
    x: documentsBox.x,
    y: documentsBox.y + documentsBox.height + 14,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawRectangle({
    x: documentsBox.x,
    y: documentsBox.y,
    width: documentsBox.width,
    height: documentsBox.height,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });
  drawRule(documentsBox.x, documentsBox.x + documentsBox.width, documentsBox.y + 58, border, 0.8);

  let documentsCursorY = documentsBox.y + documentsBox.height - 18;
  const documents = [sanitized.termsDocument, sanitized.paymentPolicyDocument];
  documents.forEach((document, index) => {
    page.drawText(toPdfSafeText(document.title || "Policy document", 180) || "Policy document", {
      x: 68,
      y: documentsCursorY,
      size: 10,
      font: fontBold,
      color: dark,
    });
    documentsCursorY = drawWrappedText(
      page,
      fontRegular,
      `URL: ${document.publicUrl}`,
      68,
      documentsCursorY - 14,
      450,
      9,
      { lineHeight: 11, color: dark }
    ) - 2;
    documentsCursorY = drawWrappedText(
      page,
      fontRegular,
      `Version / Effective Date: ${document.version} / ${document.effectiveDate}`,
      68,
      documentsCursorY - 2,
      450,
      9,
      { lineHeight: 11, color: dark }
    ) - 10;
    if (index === 0) {
      documentsCursorY -= 8;
    }
  });

  page.drawText("CUSTOMER ACCEPTANCE STATEMENT", {
    x: 60,
    y: 226,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawRectangle({
    x: 60,
    y: 58,
    width: 470,
    height: 150,
    borderColor: border,
    borderWidth: 1,
    color: rgb(0.995, 0.996, 0.997),
  });
  drawWrappedText(page, fontRegular, buildAcceptanceStatement(sanitized), 68, 188, 454, 10, {
    lineHeight: 12,
    color: dark,
  });

  drawAcceptanceCheckbox(
    "I have read and agree to the Terms of Service",
    68,
    102,
    sanitized.acceptedTerms
  );
  drawAcceptanceCheckbox(
    "I agree to the Payment and Cancellation Policy",
    68,
    84,
    sanitized.acceptedPaymentCancellation
  );
  page.drawText(
    toPdfSafeText(
      `Typed electronic signature: ${sanitized.typedSignature || "Not set"}`,
      300
    ) || "Typed electronic signature: Not set",
    {
      x: 68,
      y: 66,
      size: 8.5,
      font: fontRegular,
      color: muted,
    }
  );
  page.drawText(
    toPdfSafeText(
      `IP: ${sanitized.ipAddress || "Unknown"}${sanitized.locationText ? ` - ${sanitized.locationText}` : ""}`,
      300
    ) || "IP: Unknown",
    {
      x: 68,
      y: 52,
      size: 8.5,
      font: fontRegular,
      color: muted,
    }
  );
  page.drawText("PAGE 1 OF 1", {
    x: 278,
    y: 40,
    size: 10,
    font: fontBold,
    color: dark,
  });

  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  PDF_CONTENT_TYPE,
  POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION,
  generatePolicyAcceptanceCertificate,
};
