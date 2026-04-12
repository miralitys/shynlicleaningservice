"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const W9_FEDERAL_TAX_CLASSIFICATIONS = Object.freeze([
  "individual",
  "c_corporation",
  "s_corporation",
  "partnership",
  "trust_estate",
  "llc",
  "other",
]);
const W9_FEDERAL_TAX_CLASSIFICATION_SET = new Set(W9_FEDERAL_TAX_CLASSIFICATIONS);
const W9_LLC_TAX_CLASSIFICATIONS = Object.freeze(["C", "S", "P"]);
const W9_LLC_TAX_CLASSIFICATION_SET = new Set(W9_LLC_TAX_CLASSIFICATIONS);
const W9_TIN_TYPES = Object.freeze(["ssn", "ein"]);
const W9_TIN_TYPE_SET = new Set(W9_TIN_TYPES);
const DEFAULT_TEMPLATE_PATH = path.join(process.cwd(), "assets", "forms", "w9-template.pdf");
const DEFAULT_DOCUMENTS_DIR = path.join(process.cwd(), "data", "staff-documents");
const DEFAULT_CONTENT_TYPE = "application/pdf";
const MAX_SIGNATURE_DATA_URL_LENGTH = 350 * 1024;

const FIELD_NAMES = Object.freeze({
  legalName: "topmostSubform[0].Page1[0].f1_01[0]",
  businessName: "topmostSubform[0].Page1[0].f1_02[0]",
  classifications: [
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]",
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[1]",
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]",
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[3]",
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[4]",
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]",
    "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[6]",
  ],
  llcTaxClassification: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]",
  otherClassification: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]",
  line3bApplies: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_2[0]",
  exemptPayeeCode: "topmostSubform[0].Page1[0].f1_05[0]",
  fatcaCode: "topmostSubform[0].Page1[0].f1_06[0]",
  addressLine1: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]",
  cityStateZip: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]",
  requesterNameAddress: "topmostSubform[0].Page1[0].f1_09[0]",
  accountNumbers: "topmostSubform[0].Page1[0].f1_10[0]",
  ssn1: "topmostSubform[0].Page1[0].f1_11[0]",
  ssn2: "topmostSubform[0].Page1[0].f1_12[0]",
  ssn3: "topmostSubform[0].Page1[0].f1_13[0]",
  ein1: "topmostSubform[0].Page1[0].f1_14[0]",
  ein2: "topmostSubform[0].Page1[0].f1_15[0]",
});

const SIGNATURE_LAYOUT = Object.freeze({
  signatureX: 125,
  signatureImageY: 194,
  signatureMaxWidth: 250,
  signatureMaxHeight: 34,
  dateX: 408,
  dateY: 206,
  fontSize: 11,
});

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMultilineString(value, maxLength = 500) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = normalizeString(value, 20).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function sanitizePathSegment(value, maxLength = 80) {
  return normalizeString(value, maxLength)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "staff";
}

function sanitizeDownloadFileName(value) {
  const base = sanitizePathSegment(value || "staff-w9", 80).replace(/\.+$/, "") || "staff-w9";
  return `${base}.pdf`;
}

function normalizeTinType(value) {
  const normalized = normalizeString(value, 16).toLowerCase();
  return W9_TIN_TYPE_SET.has(normalized) ? normalized : "ssn";
}

function normalizeFederalTaxClassification(value) {
  const normalized = normalizeString(value, 40).toLowerCase();
  return W9_FEDERAL_TAX_CLASSIFICATION_SET.has(normalized) ? normalized : "";
}

function normalizeLlcTaxClassification(value) {
  const normalized = normalizeString(value, 2).toUpperCase();
  return W9_LLC_TAX_CLASSIFICATION_SET.has(normalized) ? normalized : "";
}

function normalizeTinDigits(value, tinType = "ssn") {
  const digits = normalizeString(value, 32).replace(/\D+/g, "");
  return tinType === "ein" ? digits.slice(0, 9) : digits.slice(0, 9);
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

function maskTinValue(value, tinType = "ssn") {
  const digits = normalizeTinDigits(value, tinType);
  if (digits.length < 4) return "";
  const lastFour = digits.slice(-4);
  return tinType === "ein" ? `**-***${lastFour}` : `***-**-${lastFour}`;
}

function formatW9FederalTaxClassificationLabel(value) {
  if (value === "individual") return "Individual / sole proprietor";
  if (value === "c_corporation") return "C corporation";
  if (value === "s_corporation") return "S corporation";
  if (value === "partnership") return "Partnership";
  if (value === "trust_estate") return "Trust / estate";
  if (value === "llc") return "LLC";
  if (value === "other") return "Other";
  return "Not set";
}

function formatW9TinTypeLabel(value) {
  return normalizeTinType(value) === "ein" ? "EIN" : "SSN";
}

function loadStaffW9Config(env = process.env) {
  return {
    templatePath: path.resolve(
      normalizeString(env.STAFF_W9_TEMPLATE_PATH, 1000) || DEFAULT_TEMPLATE_PATH
    ),
    documentsDir: path.resolve(
      normalizeString(env.STAFF_W9_DOCUMENTS_DIR, 1000) || DEFAULT_DOCUMENTS_DIR
    ),
    requesterNameAddress: normalizeMultilineString(
      env.STAFF_W9_REQUESTER_NAME_ADDRESS || "",
      240
    ),
  };
}

function sanitizeStaffW9Record(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const document = source && typeof source.document === "object" ? source.document : {};
  const relativePath = normalizeString(document.relativePath, 240).replace(/^\/+/, "");
  const fileName = sanitizeDownloadFileName(
    normalizeString(document.fileName, 160).replace(/\.pdf$/i, "") ||
      normalizeString(source.legalName, 120) ||
      "staff-w9"
  );
  const generatedAt =
    normalizeString(source.generatedAt, 80) ||
    normalizeString(document.generatedAt, 80) ||
    normalizeString(source.updatedAt, 80);
  const sanitized = {
    status: relativePath ? "completed" : "",
    legalName: normalizeString(source.legalName, 120),
    businessName: normalizeString(source.businessName, 120),
    federalTaxClassification: normalizeFederalTaxClassification(
      source.federalTaxClassification
    ),
    llcTaxClassification: normalizeLlcTaxClassification(source.llcTaxClassification),
    otherClassification: normalizeString(source.otherClassification, 120),
    exemptPayeeCode: normalizeString(source.exemptPayeeCode, 32),
    fatcaCode: normalizeString(source.fatcaCode, 32),
    addressLine1: normalizeString(source.addressLine1, 180),
    cityStateZip: normalizeString(source.cityStateZip, 180),
    line3bApplies: normalizeBoolean(source.line3bApplies),
    tinType: normalizeTinType(source.tinType),
    maskedTin:
      normalizeString(source.maskedTin, 24) ||
      maskTinValue(source.tinValue, source.tinType),
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

function sanitizeW9Submission(input = {}) {
  const tinType = normalizeTinType(input.tinType);
  const tinValue = normalizeTinDigits(input.tinValue, tinType);
  const classification = normalizeFederalTaxClassification(input.federalTaxClassification);
  return {
    staffId: normalizeString(input.staffId, 120),
    staffName: normalizeString(input.staffName, 120),
    legalName: normalizeString(input.legalName, 120),
    businessName: normalizeString(input.businessName, 120),
    federalTaxClassification: classification,
    llcTaxClassification:
      classification === "llc" ? normalizeLlcTaxClassification(input.llcTaxClassification) : "",
    otherClassification:
      classification === "other" ? normalizeString(input.otherClassification, 120) : "",
    exemptPayeeCode: normalizeString(input.exemptPayeeCode, 32),
    fatcaCode: normalizeString(input.fatcaCode, 32),
    addressLine1: normalizeString(input.addressLine1, 180),
    cityStateZip: normalizeString(input.cityStateZip, 180),
    accountNumbers: normalizeString(input.accountNumbers, 120),
    line3bApplies: normalizeBoolean(input.line3bApplies),
    tinType,
    tinValue,
    maskedTin: maskTinValue(tinValue, tinType),
    certificationConfirmed: normalizeBoolean(input.certificationConfirmed),
    submittedByUserId: normalizeString(input.submittedByUserId, 120),
    submittedByEmail: normalizeString(input.submittedByEmail, 200).toLowerCase(),
    signatureName: normalizeString(input.signatureName || input.legalName, 120),
    signatureDataUrl: normalizeSignatureDataUrl(input.signatureDataUrl),
    generatedAt: normalizeString(input.generatedAt, 80) || new Date().toISOString(),
  };
}

function validateW9Submission(submission = {}) {
  if (!submission.staffId) throw new Error("W9_STAFF_REQUIRED");
  if (!submission.legalName) throw new Error("W9_LEGAL_NAME_REQUIRED");
  if (!submission.federalTaxClassification) throw new Error("W9_TAX_CLASSIFICATION_REQUIRED");
  if (
    submission.federalTaxClassification === "llc" &&
    !submission.llcTaxClassification
  ) {
    throw new Error("W9_LLC_TAX_CLASSIFICATION_REQUIRED");
  }
  if (
    submission.federalTaxClassification === "other" &&
    !submission.otherClassification
  ) {
    throw new Error("W9_OTHER_CLASSIFICATION_REQUIRED");
  }
  if (!submission.addressLine1) throw new Error("W9_ADDRESS_REQUIRED");
  if (!submission.cityStateZip) throw new Error("W9_CITY_STATE_ZIP_REQUIRED");
  if (!submission.tinValue || submission.tinValue.length !== 9) {
    throw new Error("W9_TIN_REQUIRED");
  }
  if (!submission.signatureDataUrl) {
    throw new Error("W9_SIGNATURE_REQUIRED");
  }
  if (!submission.certificationConfirmed) {
    throw new Error("W9_CERTIFICATION_REQUIRED");
  }
}

function splitTinDigits(tinValue = "", tinType = "ssn") {
  const digits = normalizeTinDigits(tinValue, tinType);
  if (tinType === "ein") {
    return {
      ssn1: "",
      ssn2: "",
      ssn3: "",
      ein1: digits.slice(0, 2),
      ein2: digits.slice(2, 9),
    };
  }
  return {
    ssn1: digits.slice(0, 3),
    ssn2: digits.slice(3, 5),
    ssn3: digits.slice(5, 9),
    ein1: "",
    ein2: "",
  };
}

function buildStoredDocumentRelativePath(staffId) {
  return path.join(sanitizePathSegment(staffId, 120), "w9.pdf");
}

function resolveStaffW9DocumentAbsolutePath(relativePath, config = loadStaffW9Config()) {
  const safeRelativePath = normalizeString(relativePath, 240).replace(/^\/+/, "");
  const baseDir = path.resolve(config.documentsDir);
  const absolutePath = path.resolve(baseDir, safeRelativePath);
  const relativeToBase = path.relative(baseDir, absolutePath);
  if (!safeRelativePath || relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
    throw new Error("W9_DOCUMENT_PATH_INVALID");
  }
  return absolutePath;
}

async function buildW9PdfBytes(submission, config = loadStaffW9Config(), options = {}) {
  const templateBytes = await fsp.readFile(config.templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const tinParts = splitTinDigits(submission.tinValue, submission.tinType);
  const classificationIndexByValue = {
    individual: 0,
    c_corporation: 1,
    s_corporation: 2,
    partnership: 3,
    trust_estate: 4,
    llc: 5,
    other: 6,
  };

  for (const fieldName of FIELD_NAMES.classifications) {
    form.getCheckBox(fieldName).uncheck();
  }
  const selectedClassificationIndex = classificationIndexByValue[submission.federalTaxClassification];
  if (Number.isInteger(selectedClassificationIndex)) {
    form.getCheckBox(FIELD_NAMES.classifications[selectedClassificationIndex]).check();
  }

  const textValues = {
    [FIELD_NAMES.legalName]: submission.legalName,
    [FIELD_NAMES.businessName]: submission.businessName,
    [FIELD_NAMES.llcTaxClassification]: submission.llcTaxClassification,
    [FIELD_NAMES.otherClassification]: submission.otherClassification,
    [FIELD_NAMES.exemptPayeeCode]: submission.exemptPayeeCode,
    [FIELD_NAMES.fatcaCode]: submission.fatcaCode,
    [FIELD_NAMES.addressLine1]: submission.addressLine1,
    [FIELD_NAMES.cityStateZip]: submission.cityStateZip,
    [FIELD_NAMES.requesterNameAddress]: config.requesterNameAddress,
    [FIELD_NAMES.accountNumbers]: submission.accountNumbers,
    [FIELD_NAMES.ssn1]: tinParts.ssn1,
    [FIELD_NAMES.ssn2]: tinParts.ssn2,
    [FIELD_NAMES.ssn3]: tinParts.ssn3,
    [FIELD_NAMES.ein1]: tinParts.ein1,
    [FIELD_NAMES.ein2]: tinParts.ein2,
  };

  for (const [fieldName, value] of Object.entries(textValues)) {
    form.getTextField(fieldName).setText(value || "");
  }

  const line3bField = form.getCheckBox(FIELD_NAMES.line3bApplies);
  if (submission.line3bApplies) {
    line3bField.check();
  } else {
    line3bField.uncheck();
  }

  form.updateFieldAppearances(font);
  if (options.flatten !== false) {
    form.flatten();
  }

  const page = pdfDoc.getPage(0);
  const signatureDate = new Date(submission.generatedAt);
  const formattedDate = Number.isNaN(signatureDate.getTime())
    ? ""
    : signatureDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });

  const signatureBase64 = submission.signatureDataUrl.replace(/^data:image\/png;base64,/i, "");
  const signatureBytes = Buffer.from(signatureBase64, "base64");
  if (!signatureBytes.length) {
    throw new Error("W9_SIGNATURE_REQUIRED");
  }
  const signatureImage = await pdfDoc.embedPng(signatureBytes);
  const signatureScale = Math.min(
    SIGNATURE_LAYOUT.signatureMaxWidth / signatureImage.width,
    SIGNATURE_LAYOUT.signatureMaxHeight / signatureImage.height
  );
  const signatureWidth = Math.max(1, signatureImage.width * signatureScale);
  const signatureHeight = Math.max(1, signatureImage.height * signatureScale);

  page.drawImage(signatureImage, {
    x: SIGNATURE_LAYOUT.signatureX,
    y: SIGNATURE_LAYOUT.signatureImageY,
    width: signatureWidth,
    height: signatureHeight,
  });
  page.drawText(formattedDate, {
    x: SIGNATURE_LAYOUT.dateX,
    y: SIGNATURE_LAYOUT.dateY,
    size: SIGNATURE_LAYOUT.fontSize,
    font,
  });

  return pdfDoc.save();
}

async function generateStaffW9Document(input = {}, options = {}) {
  const config = options.config || loadStaffW9Config(options.env || process.env);
  const submission = sanitizeW9Submission(input);
  validateW9Submission(submission);

  const pdfBytes = await buildW9PdfBytes(submission, config, options);
  const relativePath = buildStoredDocumentRelativePath(submission.staffId);
  const absolutePath = resolveStaffW9DocumentAbsolutePath(relativePath, config);
  const generatedAt = submission.generatedAt || new Date().toISOString();

  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, pdfBytes);
  const stats = await fsp.stat(absolutePath);

  const record = sanitizeStaffW9Record({
    ...submission,
    generatedAt,
    updatedAt: generatedAt,
    document: {
      relativePath,
      fileName: sanitizeDownloadFileName(
        normalizeString(submission.legalName || submission.staffName || submission.staffId, 120)
      ),
      contentType: DEFAULT_CONTENT_TYPE,
      sizeBytes: stats.size,
      generatedAt,
      templateName: path.basename(config.templatePath),
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
  W9_FEDERAL_TAX_CLASSIFICATIONS,
  W9_LLC_TAX_CLASSIFICATIONS,
  W9_TIN_TYPES,
  buildStoredDocumentRelativePath,
  buildW9PdfBytes,
  formatW9FederalTaxClassificationLabel,
  formatW9TinTypeLabel,
  generateStaffW9Document,
  loadStaffW9Config,
  maskTinValue,
  resolveStaffW9DocumentAbsolutePath,
  sanitizeStaffW9Record,
  sanitizeW9Submission,
};
