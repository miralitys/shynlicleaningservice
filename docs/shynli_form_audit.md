# Shynli Form Audit

Date: 2026-05-16

## Summary

Shynli is Site C from the Web Leads guide: exported Tilda pages served by a custom Node.js backend. Public form submissions are handled by backend endpoints, then sent to Go High Level / LeadConnector CRM.

## Current Submission Flow

- Quote calculator and callback requests submit JSON to `/api/quote/submit`.
- Legacy quote alias `/api/quote/request` is wired to the same backend flow.
- Ads popup callback submits JSON to `/api/quote/submit`.
- Cleaner application forms submit JSON to `/api/cleaner-application/submit`.
- Blog inline quote forms prefill or route users into the quote flow rather than acting as an independent CRM endpoint.
- The backend uses `lib/leadconnector.js` to upsert contacts and optionally create notes/opportunities in Go High Level.

## GCLID / UTM Capture

- The site loads `js/shynli-tracking.js` globally.
- Existing tracking already captures `gclid`, `gbraid`, `wbraid`, and UTM values into the `shynli_attribution` first-party cookie.
- This implementation preserves existing attribution values when a later URL contains only a partial set of parameters.
- The first landing page is stored in `shynli_landing_page`.
- Runtime form instrumentation injects hidden fields for `page_version`, `gclid`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `landing_page`.
- JSON form flows also include attribution fields directly in the POST body, so same-page submissions can still carry URL attribution.

## Form Types And Lead Source Values

- `/quote` multi-step quote form: `website_quiz`
- Quote callback / ads popup callback: `website_contact`
- Cleaner application form: `website_application`

## Backend Persistence

- Current internal persistence remains the existing quote ops ledger / CRM handling.
- Web Leads Google Sheets is added as a parallel destination after successful CRM submission.
- Telegram lead notification is optional and also parallel.
- Sheets or Telegram failures are logged and do not block the CRM success response.

## Error Logging

- Existing request logs record CRM submission success/failure.
- Web Leads adds log events:
  - `web_leads_sheets_append_result`
  - `web_leads_sheets_append_error`
  - `web_leads_telegram_result`
  - `web_leads_telegram_error`
  - `web_leads_pipeline_unhandled_error`
