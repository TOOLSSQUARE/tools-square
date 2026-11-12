/**
 * TOOLS SQUARE — manual Google Sheets payment confirmation → Meta Purchase CAPI
 *
 * Setup:
 * 1. Open the Google Sheet used by the website → Extensions → Apps Script.
 * 2. Paste this file's complete contents and save.
 * 3. In Apps Script → Project Settings → Script properties, add:
 *      PURCHASE_WEBHOOK_SECRET = the exact same secret added in Vercel.
 * 4. Run setupPurchaseTracking() once and approve the requested permissions.
 * 5. The script adds "Payment Status" and "Purchase Sent" headers if missing,
 *    then installs an edit trigger for the spreadsheet's Sheet1 tab.
 *
 * Workflow: set Payment Status to Paid. On confirmed CAPI success,
 * Purchase Sent becomes Yes. Failed sends are marked ERROR; clear that cell
 * and change Payment Status away from Paid and back to Paid to retry.
 */

const PURCHASE_API_URL = "https://tools-square.in/api/purchase";
const PURCHASE_SHEET_TAB_NAME = "Sheet1";

function setupPurchaseTracking() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(PURCHASE_SHEET_TAB_NAME);

  if (!sheet) {
    throw new Error('Could not find the "' + PURCHASE_SHEET_TAB_NAME + '" tab.');
  }

  let headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  let lastColumn = sheet.getLastColumn();

  if (!headers.some((h) => String(h).trim().toLowerCase() === "payment status")) {
    sheet.getRange(1, ++lastColumn).setValue("Payment Status");
  }

  headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (!headers.some((h) => String(h).trim().toLowerCase() === "purchase sent")) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue("Purchase Sent");
  }

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "handlePurchaseStatusEdit")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("handlePurchaseStatusEdit")
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Ready. Set "Payment Status" to Paid after verifying payment.',
    "Tools Square Purchase Tracking",
    8
  );
}

function handlePurchaseStatusEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== PURCHASE_SHEET_TAB_NAME || e.range.getRow() < 2) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;

  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map((h) => String(h).trim().toLowerCase());

    const statusColumn = headers.indexOf("payment status") + 1;
    const sentColumn = headers.indexOf("purchase sent") + 1;
    const emailColumn = headers.indexOf("email") + 1;
    const phoneColumn = headers.indexOf("phone") + 1;

    if (!statusColumn || !sentColumn || !emailColumn || !phoneColumn) {
      throw new Error("Required headers not found. Need Email, Phone, Payment Status and Purchase Sent.");
    }

    // Only react when the edited range includes the Payment Status column.
    if (
      e.range.getColumn() > statusColumn ||
      e.range.getLastColumn() < statusColumn
    ) return;

    const startRow = e.range.getRow();
    const endRow = e.range.getLastRow();

    for (let row = startRow; row <= endRow; row++) {
      const status = String(sheet.getRange(row, statusColumn).getValue()).trim().toLowerCase();
      const sentCell = sheet.getRange(row, sentColumn);
      const sentStatus = String(sentCell.getValue()).trim().toLowerCase();

      if (status !== "paid" || sentStatus === "yes" || sentStatus === "processing") continue;

      const email = String(sheet.getRange(row, emailColumn).getValue()).trim();
      const phone = String(sheet.getRange(row, phoneColumn).getValue()).trim();

      if (!email || !phone) {
        sentCell.setValue("ERROR: Email/Phone missing");
        continue;
      }

      const properties = PropertiesService.getScriptProperties();
      const secret = properties.getProperty("PURCHASE_WEBHOOK_SECRET");
      if (!secret) {
        sentCell.setValue("ERROR: Script secret missing");
        continue;
      }

      // Mark in progress before the network request to avoid overlapping triggers.
      sentCell.setValue("PROCESSING");

      try {
        const response = UrlFetchApp.fetch(PURCHASE_API_URL, {
          method: "post",
          contentType: "application/json",
          headers: { "x-purchase-webhook-secret": secret },
          payload: JSON.stringify({
            email: email,
            phone: phone,
            spreadsheetId: sheet.getParent().getId(),
            sheetId: String(sheet.getSheetId()),
            row: row
          }),
          muteHttpExceptions: true
        });

        const responseCode = response.getResponseCode();
        let result = {};
        try {
          result = JSON.parse(response.getContentText() || "{}");
        } catch (parseError) {
          result = {};
        }

        if (responseCode >= 200 && responseCode < 300 && result.success === true) {
          sentCell.setValue("Yes");
        } else {
          sentCell.setValue("ERROR: " + (result.message || ("HTTP " + responseCode)));
        }
      } catch (error) {
        sentCell.setValue("ERROR: " + error.message);
      }
    }
  } finally {
    lock.releaseLock();
  }
}
