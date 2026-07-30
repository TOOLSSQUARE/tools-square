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
    const { name, email, phone, profession } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, Email and Phone are required.",
      });
    }

    const sheets = await getSheet();

await sheets.spreadsheets.values.append({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: "Sheet1!A:F",
  valueInputOption: "USER_ENTERED",
  requestBody: {
    values: [[
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
      "Website"
    ]]
  }
});

const hashedEmail = crypto
  .createHash("sha256")
  .update(email.trim().toLowerCase())
  .digest("hex");

const hashedPhone = crypto
  .createHash("sha256")
  .update(phone.replace(/\D/g, ""))
  .digest("hex");

const metaResponse = await fetch(
  `https://graph.facebook.com/v23.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`,
  {
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
          user_data: {
            em: [hashedEmail],
            ph: [hashedPhone],
            client_ip_address:
              req.headers["x-forwarded-for"] || req.socket.remoteAddress,
            client_user_agent: req.headers["user-agent"],
          },
        },
      ],
    }),
  }
);

const metaResult = await metaResponse.json();
console.log("Meta CAPI Response:", metaResult);
return res.status(200).json({
  success: true,
  message: "Lead Saved Successfully",
});

} catch (error) {
  console.error("Submit API Error:", error);

  return res.status(500).json({
    success: false,
    message: "Server Error",
  });
}
}