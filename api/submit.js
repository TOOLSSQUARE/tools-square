import { getSheet } from "../lib/sheets.js";
import crypto from "crypto";

export default async function handler(req, res) {
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

    // Validate registration details
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, Email and Phone are required.",
      });
    }

    // Check Google Sheets configuration
    const requiredVariables = [
      "GOOGLE_SHEET_ID",
      "GOOGLE_PROJECT_ID",
      "GOOGLE_PRIVATE_KEY",
      "GOOGLE_CLIENT_EMAIL",
    ];

    const missingVariables = requiredVariables.filter(
      (key) => !process.env[key]
    );

    if (missingVariables.length > 0) {
      console.error(
        "Missing Google Sheets environment variables:",
        missingVariables
      );

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
            String(name).trim(),
            String(email).trim(),
            String(phone).trim(),
            profession ? String(profession).trim() : "",
            "Website",
          ],
        ],
      },
    });

    console.log("Google Sheets Save Success:", {
      updatedRange: sheetResponse.data.updates?.updatedRange,
      updatedRows: sheetResponse.data.updates?.updatedRows,
    });

    // Send Meta Conversions API event
    // A Meta error will not undo the successful Sheets save.
    if (
      process.env.META_PIXEL_ID &&
      process.env.META_ACCESS_TOKEN
    ) {
      try {
        const hashedEmail = crypto
          .createHash("sha256")
          .update(String(email).trim().toLowerCase())
          .digest("hex");

        const normalizedPhone = String(phone).replace(/\D/g, "");

        const hashedPhone = crypto
          .createHash("sha256")
          .update(normalizedPhone)
          .digest("hex");

        const userData = {
          em: [hashedEmail],
          ph: [hashedPhone],
          client_user_agent: req.headers["user-agent"] || "",
        };

        const forwardedFor = req.headers["x-forwarded-for"];

        if (forwardedFor) {
          userData.client_ip_address = String(forwardedFor)
            .split(",")[0]
            .trim();
        } else if (req.socket?.remoteAddress) {
          userData.client_ip_address = req.socket.remoteAddress;
        }

        if (fbp) {
          userData.fbp = fbp;
        }

        if (fbc) {
          userData.fbc = fbc;
        }

       javascript
const metaUrl =
  `https://graph.facebook.com/v23.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;

const metaResponse = await fetch(metaUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: "https://tools-square.in/ai-tools-reselling.html",
        user_data: {
          client_ip_address: req.headers["x-forwarded-for"]?.split(",")[0],
          client_user_agent: req.headers["user-agent"],
        },
      },
    ],
  }),
});

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
        "Meta CAPI skipped because configuration is missing."
      );
    }

    // Return success after Google Sheets save
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
