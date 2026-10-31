```javascript
import { getSheet } from "../lib/sheets.js";
import crypto from "crypto";

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const {
      name,
      email,
      phone,
      profession,
      eventId,
      fbp,
      fbc,
    } = req.body || {};

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, Email and Phone are required.",
      });
    }

    // Check Google Sheets configuration
    if (
      !process.env.GOOGLE_SHEET_ID ||
      !process.env.GOOGLE_PROJECT_ID ||
      !process.env.GOOGLE_PRIVATE_KEY ||
      !process.env.GOOGLE_CLIENT_EMAIL
    ) {
      console.error("Google Sheets configuration is incomplete.");

      return res.status(500).json({
        success: false,
        message: "Google Sheets configuration is incomplete.",
      });
    }

    // Connect to Google Sheets
    const sheets = await getSheet();

    // Save registration to Google Sheets
    const sheetResponse = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:F",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            new Date().toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }),
            name,
            email,
            phone,
            profession || "",
            "Website",
          ],
        ],
      },
    });

    console.log("Google Sheets Save Success:", {
      updatedRange: sheetResponse.data.updates?.updatedRange,
      updatedRows: sheetResponse.data.updates?.updatedRows,
    });

    // Send Meta Conversions API event if configured
    if (process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN) {
      try {
        const userData = {
          em: [
            crypto
              .createHash("sha256")
              .update(String(email).trim().toLowerCase())
              .digest("hex"),
          ],
          ph: [
            crypto
              .createHash("sha256")
              .update(String(phone).replace(/\D/g, ""))
              .digest("hex"),
          ],
          client_ip_address: String(
            req.headers["x-forwarded-for"] ||
              req.socket?.remoteAddress ||
              ""
          ).split(",")[0].trim(),
          client_user_agent: req.headers["user-agent"] || "",
        };

        if (fbp) userData.fbp = fbp;
        if (fbc) userData.fbc = fbc;

        ```javascript
const metaUrl = `https://graph.facebook.com/v23.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;

const metaResponse = await fetch(metaUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    data: [
      {
        event_name: "Lead",
        event_id: eventId || crypto.randomUUID(),
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: {
          em: [hashedEmail],
          ph: [hashedPhone],
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
          client_ip_address: (
            req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""
          ).split(",")[0].trim(),
          client_user_agent: req.headers["user-agent"] || "",
        },
      },
    ],
  }),
});

const metaResult = await metaResponse.json();

console.log("Meta CAPI Response:", metaResult);

if (!metaResponse.ok) {
  console.error("Meta API Error:", metaResult);
}
```

        const metaResult = await metaResponse.json();

        console.log("Meta CAPI Response:", {
          status: metaResponse.status,
          events_received: metaResult.events_received,
          messages: metaResult.messages,
        });

        if (!metaResponse.ok) {
          console.error("Meta API Error:", metaResult);
        }
      } catch (metaError) {
        console.error("Meta CAPI Error:", metaError.message);
      }
    } else {
      console.warn(
        "Meta CAPI skipped: META_PIXEL_ID or META_ACCESS_TOKEN is missing."
      );
    }

    // Registration saved successfully
    return res.status(200).json({
      success: true,
      message: "Lead Saved Successfully",
    });
  } catch (error) {
    console.error("Submit API Error:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      details: error.response?.data?.error?.message,
    });

    return res.status(500).json({
      success: false,
      message: "Unable to save registration. Please try again.",
    });
  }
}
```
