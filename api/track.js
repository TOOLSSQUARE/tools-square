import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  const allowedEvents = new Set(["ThankYouPageView", "WhatsAppCommunityClick"]);
  try {
    const { eventName, eventId, fbp, fbc } = req.body || {};
    if (!allowedEvents.has(eventName) || typeof eventId !== "string" || !eventId.trim()) {
      return res.status(400).json({ success: false, message: "Invalid tracking event." });
    }
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!pixelId || !accessToken) {
      return res.status(503).json({ success: false, message: "Meta CAPI is not configured." });
    }

    const userData = { client_user_agent: req.headers["user-agent"] || "" };
    const forwardedFor = req.headers["x-forwarded-for"];
    if (forwardedFor) userData.client_ip_address = String(forwardedFor).split(",")[0].trim();
    if (typeof fbp === "string" && fbp) userData.fbp = fbp;
    if (typeof fbc === "string" && fbc) userData.fbc = fbc;

    const payload = {
      ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: "https://tools-square.in/thankyou.html",
        user_data: userData
      }]
    };

    const url = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log("Meta funnel CAPI response:", {
      eventName, status: response.status,
      events_received: result.events_received,
      messages: result.messages
    });
    if (!response.ok) return res.status(502).json({ success: false, message: "Meta rejected the event." });
    return res.status(200).json({ success: true, events_received: result.events_received || 0 });
  } catch (error) {
    console.error("Meta funnel tracking error:", error.message);
    return res.status(500).json({ success: false, message: "Tracking request failed." });
  }
}
