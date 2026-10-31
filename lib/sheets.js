import { google } from "googleapis";

export async function getSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  const client = await auth.getClient();

  return google.sheets({
    version: "v4",
    auth: client,
  });
}
