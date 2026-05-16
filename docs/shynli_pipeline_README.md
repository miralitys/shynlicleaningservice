# Shynli Web Leads Pipeline README

Date: 2026-05-16

## Architecture

Chosen architecture: Option B, existing backend extension.

The current flow remains:

`website form -> Node backend -> Go High Level / LeadConnector CRM`

The new parallel flow is:

`website form -> Node backend -> Google Sheets Web Leads`

Optional Telegram notification:

`website form -> Node backend -> Telegram sendMessage`

Google Sheets and Telegram are secondary destinations. They must not block the CRM path.

## Google Sheet Contract

The backend appends rows to the `Web Leads` tab with the 20-column schema from the dev guide. The backend writes columns A through O and leaves P through T empty.

Column O is always written as `New`.

## Required Environment Variables

Required for Google Sheets writes:

- `WEB_LEADS_SHEET_ID`: Google Sheet ID.
- `WEB_LEADS_TAB_NAME`: optional, defaults to `Web Leads`.

Authentication, choose one:

- `WEB_LEADS_GOOGLE_SERVICE_ACCOUNT_JSON`: full service account JSON as an environment secret.
- `WEB_LEADS_GOOGLE_APPLICATION_CREDENTIALS`: path to a service account JSON file.
- `WEB_LEADS_GOOGLE_ACCESS_TOKEN`: short-lived access token, mainly for tests/debugging.

Optional:

- `WEB_LEADS_TIMEOUT_MS`: Sheets append timeout in ms, defaults to `1800`.

Required for Telegram notifications:

- `WEB_LEADS_TELEGRAM_BOT_TOKEN`
- `WEB_LEADS_TELEGRAM_CHAT_ID`

Optional:

- `WEB_LEADS_TELEGRAM_TIMEOUT_MS`: Telegram timeout in ms, defaults to `1600`.

## Google Cloud Setup

1. Create a project for Shynli Web Leads.
2. Enable Google Sheets API and Google Drive API.
3. Create a service account.
4. Generate a JSON key and store it only as a deployment secret.
5. Share the target Google Sheet with the service account email as Editor.

## Runtime Behavior

- A successful CRM submission queues a Web Leads delivery.
- Sheets append retries once after 2 seconds if the first attempt fails.
- Sheets/Telegram errors are logged but do not change the user-facing form response.
- If Sheets env vars are missing, the pipeline logs a skipped result and the site continues normally.
- If Telegram env vars are missing, Telegram is skipped and the site continues normally.

## Testing

Implemented automated coverage:

- Quote submissions append a 20-column Web Leads row and send Telegram when configured.
- Cleaner applications append as `website_application`.
- Phone values normalize to E.164.
- GCLID/UTM/landing page values are carried from cookies/payload into the row.
- Columns P through T remain empty.

Manual acceptance still needed after production secrets are configured:

1. Submit a quote with synthetic `gclid` and UTM parameters.
2. Confirm the row appears in the production Sheet within 60 seconds.
3. Confirm GCLID persists after navigation.
4. Submit a direct/no-GCLID lead and confirm column J is empty.
5. Temporarily revoke Sheet sharing and confirm the user still sees form success while logs show Sheets failure.
