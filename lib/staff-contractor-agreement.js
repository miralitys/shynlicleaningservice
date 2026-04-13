"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const DEFAULT_DOCUMENTS_DIR = path.join(process.cwd(), "data", "staff-documents");
const DEFAULT_CONTENT_TYPE = "application/pdf";
const DEFAULT_TEMPLATE_NAME = "Independent_Contractor_Agreement_Template.docx";
const DEFAULT_COMPANY_NAME = "SHYNLI LLC";
const DEFAULT_COMPANY_ADDRESS = "P.O. Box 2492, Naperville, IL 60566";
const DEFAULT_COMPANY_SIGNER_NAME = "SHYNLI LLC";
const DEFAULT_COMPANY_SIGNER_TITLE = "Authorized Representative";
const DEFAULT_ARBITRATION_COUNTY = "DuPage County";
const DEFAULT_ARBITRATION_STATE = "Illinois";
const MAX_SIGNATURE_DATA_URL_LENGTH = 350 * 1024;
const LETTER_PAGE = Object.freeze({
  width: 612,
  height: 792,
  marginX: 54,
  topY: 736,
  bottomY: 56,
});
const BRAND_ACCENT = rgb(0.62, 0.26, 0.35);
const MUTED_TEXT = rgb(0.43, 0.43, 0.48);
const CYRILLIC_TO_LATIN_MAP = Object.freeze({
  А: "A",
  а: "a",
  Б: "B",
  б: "b",
  В: "V",
  в: "v",
  Г: "G",
  г: "g",
  Д: "D",
  д: "d",
  Е: "E",
  е: "e",
  Ё: "E",
  ё: "e",
  Ж: "Zh",
  ж: "zh",
  З: "Z",
  з: "z",
  И: "I",
  и: "i",
  Й: "I",
  й: "i",
  К: "K",
  к: "k",
  Л: "L",
  л: "l",
  М: "M",
  м: "m",
  Н: "N",
  н: "n",
  О: "O",
  о: "o",
  П: "P",
  п: "p",
  Р: "R",
  р: "r",
  С: "S",
  с: "s",
  Т: "T",
  т: "t",
  У: "U",
  у: "u",
  Ф: "F",
  ф: "f",
  Х: "Kh",
  х: "kh",
  Ц: "Ts",
  ц: "ts",
  Ч: "Ch",
  ч: "ch",
  Ш: "Sh",
  ш: "sh",
  Щ: "Shch",
  щ: "shch",
  Ъ: "",
  ъ: "",
  Ы: "Y",
  ы: "y",
  Ь: "",
  ь: "",
  Э: "E",
  э: "e",
  Ю: "Yu",
  ю: "yu",
  Я: "Ya",
  я: "ya",
  І: "I",
  і: "i",
  Ї: "Yi",
  ї: "yi",
  Є: "Ye",
  є: "ye",
  Ґ: "G",
  ґ: "g",
});

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMultilineString(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function sanitizePathSegment(value, maxLength = 80) {
  return normalizeString(value, maxLength)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "staff";
}

function sanitizeDownloadFileName(value) {
  const base = sanitizePathSegment(value || "staff-contract", 140).replace(/\.+$/, "") || "staff-contract";
  return `${base}.pdf`;
}

function normalizeSignatureDataUrl(value, maxLength = MAX_SIGNATURE_DATA_URL_LENGTH) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) return "";
  const match = normalized.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return "";
  const base64 = match[1].replace(/\s+/g, "");
  if (!base64) return "";
  return `data:image/png;base64,${base64}`;
}

function toPdfSafeText(value) {
  const source = String(value || "");
  if (!source) return "";
  return source
    .replace(/[А-яЁёІіЇїЄєҐґ]/g, (character) => CYRILLIC_TO_LATIN_MAP[character] || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/•/g, " | ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeCompensationType(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return normalized === "percent" ? "percent" : "fixed";
}

function normalizeCompensationValue(value) {
  const normalized = normalizeString(value, 32).replace(/,/g, ".");
  if (!normalized) return "";
  const cleaned = normalized.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [wholePart, ...fractionParts] = cleaned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionParts.join("").slice(0, 2);
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatMoney(value) {
  const numeric = Number.parseFloat(String(value || "").trim());
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatCompensationLabel(type, value) {
  const normalizedType = normalizeCompensationType(type);
  const normalizedValue = normalizeCompensationValue(value);
  if (!normalizedValue) {
    return normalizedType === "percent"
      ? "Percentage compensation per assigned job, as recorded by SHYNLI."
      : "Fixed compensation per assigned job, as recorded by SHYNLI.";
  }
  return normalizedType === "percent"
    ? `${normalizedValue}% of the assigned job total`
    : `${formatMoney(normalizedValue) || `$${normalizedValue}`} fixed pay per assigned job`;
}

function formatContractDateLabel(value) {
  const candidate = value ? new Date(value) : new Date();
  if (Number.isNaN(candidate.getTime())) return "";
  return candidate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function loadStaffContractConfig(env = process.env) {
  return {
    documentsDir: path.resolve(
      normalizeString(env.STAFF_CONTRACT_DOCUMENTS_DIR, 1000) || DEFAULT_DOCUMENTS_DIR
    ),
    templateName:
      normalizeString(env.STAFF_CONTRACT_TEMPLATE_NAME, 240) || DEFAULT_TEMPLATE_NAME,
    companyName:
      normalizeString(env.STAFF_CONTRACT_COMPANY_NAME, 200) || DEFAULT_COMPANY_NAME,
    companyAddress:
      normalizeMultilineString(env.STAFF_CONTRACT_COMPANY_ADDRESS, 400) ||
      DEFAULT_COMPANY_ADDRESS,
    companySignerName:
      normalizeString(env.STAFF_CONTRACT_COMPANY_SIGNER_NAME, 160) ||
      DEFAULT_COMPANY_SIGNER_NAME,
    companySignerTitle:
      normalizeString(env.STAFF_CONTRACT_COMPANY_SIGNER_TITLE, 160) ||
      DEFAULT_COMPANY_SIGNER_TITLE,
    arbitrationCounty:
      normalizeString(env.STAFF_CONTRACT_ARBITRATION_COUNTY, 160) ||
      DEFAULT_ARBITRATION_COUNTY,
    arbitrationState:
      normalizeString(env.STAFF_CONTRACT_ARBITRATION_STATE, 80) ||
      DEFAULT_ARBITRATION_STATE,
  };
}

function sanitizeStaffContractRecord(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const document = source && typeof source.document === "object" ? source.document : {};
  const relativePath = normalizeString(document.relativePath, 240).replace(/^\/+/, "");
  const fileName = sanitizeDownloadFileName(
    normalizeString(document.fileName, 160).replace(/\.pdf$/i, "") ||
      normalizeString(source.contractorName || source.staffName, 120) ||
      "staff-contract"
  );
  const generatedAt =
    normalizeString(source.generatedAt, 80) ||
    normalizeString(document.generatedAt, 80) ||
    normalizeString(source.updatedAt, 80);
  const sanitized = {
    status: relativePath ? "completed" : "",
    contractorName: normalizeString(source.contractorName, 160),
    contractorAddressLine1: normalizeString(source.contractorAddressLine1, 180),
    contractorCityStateZip: normalizeString(source.contractorCityStateZip, 180),
    contractorEmail: normalizeString(source.contractorEmail, 200).toLowerCase(),
    contractorPhone: normalizeString(source.contractorPhone, 80),
    role: normalizeString(source.role, 120),
    compensationType: normalizeCompensationType(source.compensationType),
    compensationValue: normalizeCompensationValue(source.compensationValue),
    companyName: normalizeString(source.companyName, 200),
    companyAddress: normalizeMultilineString(source.companyAddress, 400),
    companySignerName: normalizeString(source.companySignerName, 160),
    companySignerTitle: normalizeString(source.companySignerTitle, 160),
    arbitrationCounty: normalizeString(source.arbitrationCounty, 160),
    arbitrationState: normalizeString(source.arbitrationState, 80),
    submittedByUserId: normalizeString(source.submittedByUserId, 120),
    submittedByEmail: normalizeString(source.submittedByEmail, 200).toLowerCase(),
    generatedAt,
    updatedAt: normalizeString(source.updatedAt, 80) || generatedAt,
    document: {
      relativePath,
      fileName,
      contentType:
        normalizeString(document.contentType, 80) || (relativePath ? DEFAULT_CONTENT_TYPE : ""),
      sizeBytes: Number.isFinite(Number(document.sizeBytes))
        ? Math.max(0, Number(document.sizeBytes))
        : 0,
      generatedAt: normalizeString(document.generatedAt, 80) || generatedAt,
      templateName: normalizeString(document.templateName, 120),
    },
  };

  if (!sanitized.document.relativePath || !sanitized.generatedAt) {
    return null;
  }

  sanitized.status = "completed";
  return sanitized;
}

function sanitizeContractSubmission(input = {}, config = loadStaffContractConfig()) {
  return {
    staffId: normalizeString(input.staffId, 120),
    staffName: normalizeString(input.staffName, 120),
    contractorName: normalizeString(
      input.contractorName || input.legalName || input.staffName,
      160
    ),
    contractorAddressLine1: normalizeString(
      input.contractorAddressLine1 || input.addressLine1,
      180
    ),
    contractorCityStateZip: normalizeString(
      input.contractorCityStateZip || input.cityStateZip,
      180
    ),
    contractorEmail: normalizeString(input.contractorEmail || input.submittedByEmail, 200).toLowerCase(),
    contractorPhone: normalizeString(input.contractorPhone, 80),
    role: normalizeString(input.role, 120),
    compensationType: normalizeCompensationType(input.compensationType),
    compensationValue: normalizeCompensationValue(input.compensationValue),
    companyName: normalizeString(input.companyName, 200) || config.companyName,
    companyAddress:
      normalizeMultilineString(input.companyAddress, 400) || config.companyAddress,
    companySignerName:
      normalizeString(input.companySignerName, 160) || config.companySignerName,
    companySignerTitle:
      normalizeString(input.companySignerTitle, 160) || config.companySignerTitle,
    arbitrationCounty:
      normalizeString(input.arbitrationCounty, 160) || config.arbitrationCounty,
    arbitrationState:
      normalizeString(input.arbitrationState, 80) || config.arbitrationState,
    submittedByUserId: normalizeString(input.submittedByUserId, 120),
    submittedByEmail: normalizeString(input.submittedByEmail, 200).toLowerCase(),
    signatureDataUrl: normalizeSignatureDataUrl(input.signatureDataUrl),
    generatedAt: normalizeString(input.generatedAt, 80) || new Date().toISOString(),
  };
}

function validateContractSubmission(submission = {}) {
  if (!submission.staffId) throw new Error("CONTRACT_STAFF_REQUIRED");
  if (!submission.contractorName) throw new Error("CONTRACT_NAME_REQUIRED");
  if (!submission.contractorAddressLine1) throw new Error("CONTRACT_ADDRESS_REQUIRED");
  if (!submission.contractorCityStateZip) {
    throw new Error("CONTRACT_CITY_STATE_ZIP_REQUIRED");
  }
  if (!submission.signatureDataUrl) throw new Error("CONTRACT_SIGNATURE_REQUIRED");
}

function buildStoredDocumentRelativePath(staffId) {
  return path.join(sanitizePathSegment(staffId, 120), "contract.pdf");
}

function resolveStaffContractDocumentAbsolutePath(
  relativePath,
  config = loadStaffContractConfig()
) {
  const safeRelativePath = normalizeString(relativePath, 240).replace(/^\/+/, "");
  const baseDir = path.resolve(config.documentsDir);
  const absolutePath = path.resolve(baseDir, safeRelativePath);
  const relativeToBase = path.relative(baseDir, absolutePath);
  if (!safeRelativePath || relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
    throw new Error("CONTRACT_DOCUMENT_PATH_INVALID");
  }
  return absolutePath;
}

function splitWrappedLines(text, font, fontSize, maxWidth) {
  const paragraphs = toPdfSafeText(text).split("\n");
  const lines = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = "";
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !currentLine) {
        currentLine = candidate;
        continue;
      }
      lines.push(currentLine);
      currentLine = word;
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

function createLayout(pdfDoc, fonts) {
  const layout = {
    pdfDoc,
    fonts,
    page: pdfDoc.addPage([LETTER_PAGE.width, LETTER_PAGE.height]),
    y: LETTER_PAGE.topY,
  };

  layout.ensureSpace = function ensureSpace(heightNeeded = 40) {
    if (layout.y - heightNeeded >= LETTER_PAGE.bottomY) return;
    layout.page = pdfDoc.addPage([LETTER_PAGE.width, LETTER_PAGE.height]);
    layout.y = LETTER_PAGE.topY;
  };

  layout.drawWrappedText = function drawWrappedText(text, options = {}) {
    const font = options.font || fonts.regular;
    const fontSize = options.fontSize || 11;
    const lineHeight = options.lineHeight || Math.round(fontSize * 1.45);
    const x = Number.isFinite(options.x) ? options.x : LETTER_PAGE.marginX;
    const width =
      Number.isFinite(options.width) && options.width > 0
        ? options.width
        : LETTER_PAGE.width - LETTER_PAGE.marginX * 2;
    const color = options.color || rgb(0.1, 0.1, 0.12);
    const after = Number.isFinite(options.after) ? options.after : 10;
    const lines = splitWrappedLines(text, font, fontSize, width);

    if (!lines.length) {
      layout.y -= after;
      return;
    }

    for (const line of lines) {
      layout.ensureSpace(lineHeight + 4);
      if (line) {
        layout.page.drawText(line, {
          x,
          y: layout.y,
          size: fontSize,
          font,
          color,
        });
      }
      layout.y -= lineHeight;
    }

    layout.y -= after;
  };

  layout.drawSectionTitle = function drawSectionTitle(title) {
    layout.ensureSpace(34);
    layout.page.drawText(toPdfSafeText(title), {
      x: LETTER_PAGE.marginX,
      y: layout.y,
      size: 13,
      font: fonts.bold,
      color: BRAND_ACCENT,
    });
    layout.y -= 24;
  };

  return layout;
}

async function buildContractPdfBytes(input = {}, config = loadStaffContractConfig()) {
  const submission = sanitizeContractSubmission(input, config);
  validateContractSubmission(submission);

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const layout = createLayout(pdfDoc, { regular: regularFont, bold: boldFont });
  const effectiveDate = formatContractDateLabel(submission.generatedAt);
  const contractorAddress = [
    submission.contractorAddressLine1,
    submission.contractorCityStateZip,
  ]
    .filter(Boolean)
    .join(", ");
  const compensationLabel = formatCompensationLabel(
    submission.compensationType,
    submission.compensationValue
  );

  layout.page.drawText("SHYNLI CLEANING", {
    x: LETTER_PAGE.marginX,
    y: layout.y,
    size: 11,
    font: boldFont,
    color: BRAND_ACCENT,
  });
  layout.y -= 28;
  layout.page.drawText("Independent Contractor Agreement", {
    x: LETTER_PAGE.marginX,
    y: layout.y,
    size: 24,
    font: boldFont,
    color: rgb(0.08, 0.08, 0.1),
  });
  layout.y -= 28;
  layout.drawWrappedText(
    `This Independent Contractor Agreement ("Agreement") is entered as of ${effectiveDate} by and between ${toPdfSafeText(
      submission.companyName
    )}, located at ${toPdfSafeText(submission.companyAddress)} ("Company"), and ${toPdfSafeText(
      submission.contractorName
    )}, located at ${toPdfSafeText(contractorAddress)} ("Contractor").`,
    { fontSize: 11, after: 16 }
  );

  layout.ensureSpace(112);
  layout.page.drawRectangle({
    x: LETTER_PAGE.marginX,
    y: layout.y - 98,
    width: LETTER_PAGE.width - LETTER_PAGE.marginX * 2,
    height: 98,
    borderColor: rgb(0.89, 0.89, 0.92),
    borderWidth: 1,
    color: rgb(0.985, 0.985, 0.99),
  });
  layout.page.drawText("Onboarding summary", {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 18,
    size: 11,
    font: boldFont,
    color: MUTED_TEXT,
  });
  const summaryRows = [
    `Contractor: ${toPdfSafeText(submission.contractorName)}`,
    `Role / service profile: ${toPdfSafeText(submission.role || "Independent Cleaner")}`,
    `Compensation: ${compensationLabel}`,
    `Email / phone: ${toPdfSafeText(submission.contractorEmail || "Not provided")}${submission.contractorPhone ? ` | ${toPdfSafeText(submission.contractorPhone)}` : ""}`,
  ];
  let summaryY = layout.y - 40;
  for (const row of summaryRows) {
    layout.page.drawText(toPdfSafeText(row), {
      x: LETTER_PAGE.marginX + 16,
      y: summaryY,
      size: 11,
      font: regularFont,
      color: rgb(0.12, 0.12, 0.14),
    });
    summaryY -= 17;
  }
  layout.y -= 122;

  const sections = [
    {
      title: "1. Services",
      body:
        `Contractor will provide residential and related cleaning services assigned by Company on a project basis. Contractor remains responsible for the day-to-day manner, method, and sequence of the work, provided that service quality, arrival windows, safety rules, and client instructions communicated by Company are followed.`,
    },
    {
      title: "2. Compensation",
      body:
        `For the current staff profile, Company will compensate Contractor as follows: ${compensationLabel}. Company may issue schedules, work orders, scope notes, and client-specific instructions in SHYNLI systems, but nothing in this Agreement guarantees a minimum number of assignments. Contractor is solely responsible for all taxes, withholdings, filings, licenses, and registrations connected with these payments.`,
    },
    {
      title: "3. Independent contractor relationship",
      body:
        `The parties intend an independent contractor relationship only. Contractor is not an employee of Company and is not eligible for employee benefits, unemployment insurance, workers' compensation through Company, paid leave, retirement plans, or other employee programs unless required by law and separately agreed in writing.`,
    },
    {
      title: "4. Equipment, expenses, and compliance",
      body:
        `Contractor will supply and maintain the tools, transportation, communication devices, and ordinary business expenses needed to perform the services unless Company expressly provides something for a specific assignment. Contractor agrees to comply with applicable law, privacy obligations, client property rules, and Company safety or quality standards communicated for assigned work.`,
    },
    {
      title: "5. Confidentiality and client information",
      body:
        `Contractor may receive confidential client information, access instructions, schedules, pricing, and internal operating details. Contractor must use this information only for assigned SHYNLI work, protect it from unauthorized disclosure, and return or delete Company materials when requested or when the relationship ends.`,
    },
    {
      title: "6. Term and termination",
      body:
        `This Agreement begins on ${effectiveDate} and continues until terminated by either party. Either party may terminate the relationship at any time, with or without cause, subject to payment for services properly completed before termination and subject to any client-specific obligations already accepted.`,
    },
    {
      title: "7. Dispute resolution",
      body:
        `Any dispute arising out of this Agreement that the parties cannot resolve informally will be handled in ${submission.arbitrationCounty}, ${submission.arbitrationState}, unless applicable law requires a different forum. This Agreement is governed by the laws of the State of ${submission.arbitrationState}.`,
    },
    {
      title: "8. Entire agreement",
      body:
        `This Agreement, together with assignment details, platform notices, and written updates issued by Company for contractor onboarding, represents the complete understanding between the parties regarding the services described here and supersedes earlier verbal or written discussions about the same subject.`,
    },
  ];

  for (const section of sections) {
    layout.drawSectionTitle(section.title);
    layout.drawWrappedText(section.body, { fontSize: 11, after: 12 });
  }

  layout.drawSectionTitle("Signatures");
  layout.drawWrappedText(
    "The parties acknowledge that the contractor signature below was captured electronically as part of SHYNLI onboarding.",
    { fontSize: 10, color: MUTED_TEXT, after: 16 }
  );

  const companyBlockHeight = 96;
  layout.ensureSpace(companyBlockHeight + 170);
  layout.page.drawRectangle({
    x: LETTER_PAGE.marginX,
    y: layout.y - companyBlockHeight,
    width: LETTER_PAGE.width - LETTER_PAGE.marginX * 2,
    height: companyBlockHeight,
    borderColor: rgb(0.89, 0.89, 0.92),
    borderWidth: 1,
  });
  layout.page.drawText("Company", {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 18,
    size: 12,
    font: boldFont,
    color: rgb(0.12, 0.12, 0.14),
  });
  layout.page.drawText(toPdfSafeText(submission.companyName), {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 42,
    size: 11,
    font: boldFont,
  });
  layout.page.drawText(toPdfSafeText(submission.companySignerName), {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 60,
    size: 11,
    font: regularFont,
  });
  layout.page.drawText(toPdfSafeText(submission.companySignerTitle), {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 76,
    size: 10,
    font: regularFont,
    color: MUTED_TEXT,
  });
  layout.page.drawText(`Date: ${effectiveDate}`, {
    x: LETTER_PAGE.width - LETTER_PAGE.marginX - 160,
    y: layout.y - 42,
    size: 11,
    font: regularFont,
  });
  layout.y -= companyBlockHeight + 20;

  const contractorBlockHeight = 152;
  layout.ensureSpace(contractorBlockHeight + 24);
  layout.page.drawRectangle({
    x: LETTER_PAGE.marginX,
    y: layout.y - contractorBlockHeight,
    width: LETTER_PAGE.width - LETTER_PAGE.marginX * 2,
    height: contractorBlockHeight,
    borderColor: rgb(0.89, 0.89, 0.92),
    borderWidth: 1,
  });
  layout.page.drawText("Contractor", {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 18,
    size: 12,
    font: boldFont,
    color: rgb(0.12, 0.12, 0.14),
  });
  layout.page.drawText(toPdfSafeText(submission.contractorName), {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 42,
    size: 11,
    font: boldFont,
  });
  layout.page.drawText(toPdfSafeText(contractorAddress), {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 60,
    size: 11,
    font: regularFont,
  });
  if (submission.contractorEmail || submission.contractorPhone) {
    layout.page.drawText(
      toPdfSafeText(
        `${submission.contractorEmail || "No email"}${submission.contractorPhone ? ` | ${submission.contractorPhone}` : ""}`
      ),
      {
        x: LETTER_PAGE.marginX + 16,
        y: layout.y - 76,
        size: 10,
        font: regularFont,
        color: MUTED_TEXT,
      }
    );
  }

  const signatureBase64 = submission.signatureDataUrl.replace(/^data:image\/png;base64,/i, "");
  const signatureBytes = Buffer.from(signatureBase64, "base64");
  if (!signatureBytes.length) {
    throw new Error("CONTRACT_SIGNATURE_REQUIRED");
  }
  const signatureImage = await pdfDoc.embedPng(signatureBytes);
  const maxSignatureWidth = 230;
  const maxSignatureHeight = 54;
  const signatureScale = Math.min(
    maxSignatureWidth / signatureImage.width,
    maxSignatureHeight / signatureImage.height
  );
  const signatureWidth = Math.max(1, signatureImage.width * signatureScale);
  const signatureHeight = Math.max(1, signatureImage.height * signatureScale);
  layout.page.drawText("Electronic signature", {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 100,
    size: 10,
    font: regularFont,
    color: MUTED_TEXT,
  });
  layout.page.drawImage(signatureImage, {
    x: LETTER_PAGE.marginX + 16,
    y: layout.y - 100 - signatureHeight - 4,
    width: signatureWidth,
    height: signatureHeight,
  });
  layout.page.drawText(`Date: ${effectiveDate}`, {
    x: LETTER_PAGE.width - LETTER_PAGE.marginX - 160,
    y: layout.y - 42,
    size: 11,
    font: regularFont,
  });

  return pdfDoc.save();
}

async function generateStaffContractDocument(input = {}, options = {}) {
  const config = options.config || loadStaffContractConfig(options.env || process.env);
  const submission = sanitizeContractSubmission(input, config);
  validateContractSubmission(submission);

  const pdfBytes = await buildContractPdfBytes(submission, config);
  const relativePath = buildStoredDocumentRelativePath(submission.staffId);
  const absolutePath = resolveStaffContractDocumentAbsolutePath(relativePath, config);
  const generatedAt = submission.generatedAt || new Date().toISOString();

  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, pdfBytes);
  const stats = await fsp.stat(absolutePath);

  const record = sanitizeStaffContractRecord({
    ...submission,
    generatedAt,
    updatedAt: generatedAt,
    document: {
      relativePath,
      fileName: sanitizeDownloadFileName(
        normalizeString(
          `${submission.contractorName || submission.staffName || submission.staffId}-contract`,
          140
        )
      ),
      contentType: DEFAULT_CONTENT_TYPE,
      sizeBytes: stats.size,
      generatedAt,
      templateName: config.templateName,
    },
  });

  return {
    record,
    relativePath,
    absolutePath,
    pdfBytes,
  };
}

module.exports = {
  buildContractPdfBytes,
  buildStoredDocumentRelativePath,
  formatCompensationLabel,
  formatContractDateLabel,
  generateStaffContractDocument,
  loadStaffContractConfig,
  resolveStaffContractDocumentAbsolutePath,
  sanitizeStaffContractRecord,
  sanitizeContractSubmission,
};
