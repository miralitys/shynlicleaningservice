"use strict";

const os = require("node:os");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const {
  buildW9PdfBytes,
  generateStaffW9Document,
  maskTinValue,
} = require("../lib/staff-w9");

test("masks TIN values without exposing the full identifier", () => {
  assert.equal(maskTinValue("123-45-6789", "ssn"), "***-**-6789");
  assert.equal(maskTinValue("12-3456789", "ein"), "**-***6789");
});

test("fills the W-9 template fields before flattening", async () => {
  const templatePath = path.join(__dirname, "..", "assets", "forms", "w9-template.pdf");
  const tempDocumentsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-w9-fields-"));
  const pdfBytes = await buildW9PdfBytes(
    {
      staffId: "staff-w9-test",
      legalName: "Olga Martinez",
      businessName: "Olga Cleaning LLC",
      federalTaxClassification: "llc",
      llcTaxClassification: "C",
      otherClassification: "",
      exemptPayeeCode: "1",
      fatcaCode: "A",
      addressLine1: "742 Cedar Avenue",
      cityStateZip: "Aurora, IL 60506",
      accountNumbers: "Vendor-44",
      line3bApplies: true,
      tinType: "ein",
      tinValue: "12-3456789",
      certificationConfirmed: true,
      signatureName: "Olga Martinez",
      generatedAt: "2026-04-12T21:15:00.000Z",
    },
    {
      templatePath,
      documentsDir: tempDocumentsDir,
      requesterNameAddress: "SHYNLI Cleaning",
    },
    { flatten: false }
  );

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  assert.equal(
    form.getTextField("topmostSubform[0].Page1[0].f1_01[0]").getText(),
    "Olga Martinez"
  );
  assert.equal(
    form.getTextField("topmostSubform[0].Page1[0].f1_02[0]").getText(),
    "Olga Cleaning LLC"
  );
  assert.equal(
    form.getCheckBox("topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]").isChecked(),
    true
  );
  assert.equal(
    form.getTextField("topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]").getText(),
    "C"
  );
  assert.equal(
    form.getCheckBox("topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_2[0]").isChecked(),
    true
  );
  assert.equal(
    form.getTextField("topmostSubform[0].Page1[0].f1_14[0]").getText(),
    "12"
  );
  assert.equal(
    form.getTextField("topmostSubform[0].Page1[0].f1_15[0]").getText(),
    "3456789"
  );

  await fsp.rm(tempDocumentsDir, { recursive: true, force: true });
});

test("generates a stored W-9 document and returns masked metadata", async () => {
  const tempDocumentsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-w9-output-"));
  const templatePath = path.join(__dirname, "..", "assets", "forms", "w9-template.pdf");
  const result = await generateStaffW9Document(
    {
      staffId: "staff-output-1",
      staffName: "Nadia Stone",
      legalName: "Nadia Stone",
      businessName: "",
      federalTaxClassification: "individual",
      llcTaxClassification: "",
      otherClassification: "",
      exemptPayeeCode: "",
      fatcaCode: "",
      addressLine1: "1289 Pine St",
      cityStateZip: "Aurora, IL 60505",
      accountNumbers: "",
      line3bApplies: false,
      tinType: "ssn",
      tinValue: "123-45-6789",
      certificationConfirmed: true,
      submittedByUserId: "user-1",
      submittedByEmail: "nadia@example.com",
      signatureName: "Nadia Stone",
      generatedAt: "2026-04-12T21:30:00.000Z",
    },
    {
      config: {
        templatePath,
        documentsDir: tempDocumentsDir,
        requesterNameAddress: "",
      },
    }
  );

  assert.equal(result.record.legalName, "Nadia Stone");
  assert.equal(result.record.maskedTin, "***-**-6789");
  assert.equal(result.record.document.relativePath, path.join("staff-output-1", "w9.pdf"));
  assert.ok(result.record.document.sizeBytes > 0);

  await fsp.rm(tempDocumentsDir, { recursive: true, force: true });
});
