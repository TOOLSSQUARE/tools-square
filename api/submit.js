import { getSheet } from "../lib/sheets.js";
import crypto from "crypto";

export default async function handler(req, res) {
  // Allow POST requests only
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
      fbclid,
      utm_source,
      utm_campaign,
    } = req.body || {};

    // Validate required fields
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof phone !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !phone.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, Email and Phone are required.",
      });
    }

    // Validate Google Sheets configuration
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

    // Normalize registration data
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanProfession =
      typeof profession === "string" ? profession.trim() : "";

    // Get Google Sheets API client
    const sheets = await getSheet();

    // Preserve the existing columns and add Profession in column H.
    // A Timestamp, B Name, C Phone, D Email,
    // E FBCLID, F UTM Source, G UTM Campaign, H Profession.
    // Keep the H1 header in place so the new data is clearly labelled.
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!H1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Profession"]],
      },
    });

    const timestamp = new Date().toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const sheetResponse = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:H",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            timestamp,
            cleanName,
            cleanPhone,
            cleanEmail,
            typeof fbclid === "string" ? fbclid : "",
            typeof utm_source === "string" ? utm_source : "Website",
            typeof utm_campaign === "string" ? utm_campaign : "",
            cleanProfession,
          ],
        ],
      },
    });

    console.log("Google Sheets Save Success:", {
      updatedRange: sheetResponse.data.updates?.updatedRange,
      updatedRows: sheetResponse.data.updates?.updatedRows,
      professionSaved: Boolean(cleanProfession),
    });

    // Send Meta Conversions API event.
    // A Meta error will not undo the successful Sheets save.
    if (process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN) {
      try {
        const hashedEmail = crypto
          .createHash("sha256")
          .update(cleanEmail)
          .digest("hex");

        // Meta expects a normalized phone number before hashing.
        const normalizedPhone = cleanPhone.replace(/\D/g, "");

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
        }

        if (typeof fbp === "string" && fbp) {
          userData.fbp = fbp;
        }

        if (typeof fbc === "string" && fbc) {
          userData.fbc = fbc;
        }

        const pixelId = process.env.META_PIXEL_ID;
        const accessToken = process.env.META_ACCESS_TOKEN;

        const metaUrl =
          `https://graph.facebook.com/v23.0/${pixelId}/events` +
          `?access_token=${encodeURIComponent(accessToken)}`;

        const metaPayload = {
          ...(process.env.META_TEST_EVENT_CODE
            ? { test_event_code: process.env.META_TEST_EVENT_CODE }
            : {}),
          data: [
            {
              event_name: "Lead",
              event_time: Math.floor(Date.now() / 1000),
              event_id:
                typeof eventId === "string" && eventId
                  ? eventId
                  : `lead_${Date.now()}_${crypto.randomUUID()}`,
              action_source: "website",
              event_source_url:
                "https://tools-square.in/ai-tools-reselling.html",
              user_data: userData,
            },
          ],
        };

        const metaResponse = await fetch(metaUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metaPayload),
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

    // Report success after Google Sheets confirms the append.
    return res.status(200).json({
      success: true,
      message: "Registration saved successfully.",
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
