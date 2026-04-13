"use strict";

const os = require("node:os");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const {
  buildContractPdfBytes,
  formatCompensationLabel,
  generateStaffContractDocument,
} = require("../lib/staff-contractor-agreement");

const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=";

test("formats compensation labels for fixed and percent rates", () => {
  assert.equal(formatCompensationLabel("fixed", "160"), "$160 fixed pay per assigned job");
  assert.equal(formatCompensationLabel("percent", "45"), "45% of the assigned job total");
});

test("builds a contractor agreement PDF with at least one page", async () => {
  const pdfBytes = await buildContractPdfBytes({
    staffId: "staff-contract-test",
    staffName: "Anna Petrova",
    contractorName: "Anna Petrova",
    contractorAddressLine1: "742 Cedar Avenue",
    contractorCityStateZip: "Aurora, IL 60506",
    contractorEmail: "anna@example.com",
    contractorPhone: "+1(630)555-0101",
    role: "Cleaner",
    compensationType: "percent",
    compensationValue: "45",
    signatureDataUrl: SIGNATURE_DATA_URL,
    generatedAt: "2026-04-13T13:00:00.000Z",
  });

  const pdfDoc = await PDFDocument.load(pdfBytes);
  assert.ok(pdfDoc.getPageCount() >= 1);
  assert.equal(Buffer.from(pdfBytes).toString("latin1").includes("/Subtype /Image"), true);
});

test("generates a stored contractor agreement document and returns metadata", async () => {
  const tempDocumentsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-contract-output-"));

  const result = await generateStaffContractDocument(
    {
      staffId: "staff-contract-output-1",
      staffName: "Nadia Stone",
      contractorName: "Nadia Stone",
      contractorAddressLine1: "1289 Pine St",
      contractorCityStateZip: "Aurora, IL 60505",
      contractorEmail: "nadia@example.com",
      contractorPhone: "+1(630)555-0101",
      role: "Independent Cleaner",
      compensationType: "fixed",
      compensationValue: "180",
      submittedByUserId: "user-1",
      submittedByEmail: "nadia@example.com",
      signatureDataUrl: SIGNATURE_DATA_URL,
      generatedAt: "2026-04-13T13:30:00.000Z",
    },
    {
      config: {
        documentsDir: tempDocumentsDir,
        templateName: "Independent_Contractor_Agreement_Template.docx",
        companyName: "SHYNLI LLC",
        companyAddress: "P.O. Box 2492, Naperville, IL 60566",
        companySignerName: "SHYNLI LLC",
        companySignerTitle: "Authorized Representative",
        arbitrationCounty: "DuPage County",
        arbitrationState: "Illinois",
      },
    }
  );

  assert.equal(result.record.contractorName, "Nadia Stone");
  assert.equal(result.record.compensationType, "fixed");
  assert.equal(result.record.compensationValue, "180");
  assert.equal(
    result.record.document.relativePath,
    path.join("staff-contract-output-1", "contract.pdf")
  );
  assert.ok(result.record.document.sizeBytes > 0);

  await fsp.rm(tempDocumentsDir, { recursive: true, force: true });
});
