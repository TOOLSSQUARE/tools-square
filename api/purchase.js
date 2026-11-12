import crypto from "crypto";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  const expectedSecret = process.env.PURCHASE_WEBHOOK_SECRET;
  const receivedSecret = req.headers["x-purchase-webhook-secret"];

  if (!expectedSecret || !safeEqual(receivedSecret, expectedSecret)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return res.status(500).json({
      success: false,
      message: "Meta CAPI configuration is incomplete.",
    });
  }

  try {
    const { email, phone, spreadsheetId, sheetId, row } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof phone !== "string" ||
      !phone.trim() ||
      typeof spreadsheetId !== "string" ||
      !spreadsheetId.trim() ||
      (typeof row !== "number" && typeof row !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Email, phone, spreadsheetId and row are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let normalizedPhone = phone.replace(/\D/g, "");

    // Add India's country code when the Sheet contains a 10-digit mobile number.
    if (normalizedPhone.length === 10) {
      normalizedPhone = "91" + normalizedPhone;
    }

    const userData = {
      em: [sha256(normalizedEmail)],
      ph: [sha256(normalizedPhone)],
    };

    const eventKey = [spreadsheetId, String(sheetId || "0"), String(row)].join(":");
    const eventId = "purchase_" + sha256(eventKey).slice(0, 32);

    const event = {
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: "https://tools-square.in/ai-tools-reselling.html",
      user_data: userData,
    };

    const metaUrl =
      `https://graph.facebook.com/v23.0/${encodeURIComponent(pixelId)}/events` +
      `?access_token=${encodeURIComponent(accessToken)}`;

    // Optional temporary Meta Test Events mode.
    // Set PURCHASE_TEST_EVENT_CODE only while testing, then remove it for live sales.
    const payload = {
      ...(process.env.PURCHASE_TEST_EVENT_CODE
        ? { test_event_code: process.env.PURCHASE_TEST_EVENT_CODE }
        : {}),
      data: [event],
    };

    const metaResponse = await fetch(metaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const metaResult = await metaResponse.json();

    console.log("Meta Purchase CAPI:", {
      status: metaResponse.status,
      events_received: metaResult.events_received,
      messages: metaResult.messages,
    });

    if (!metaResponse.ok || Number(metaResult.events_received) !== 1) {
      return res.status(502).json({
        success: false,
        message: "Meta did not confirm the Purchase event.",
        meta: metaResult,
      });
    }

    return res.status(200).json({
      success: true,
      event: "Purchase",
      event_id: eventId,
      events_received: metaResult.events_received,
    });
  } catch (error) {
    console.error("Purchase CAPI Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to send Purchase event.",
    });
  }
}
