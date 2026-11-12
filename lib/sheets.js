import { google } from "googleapis";

// Reuse the authenticated Sheets client across warm Vercel invocations.
// This avoids rebuilding GoogleAuth and refreshing the client on every request.
let sheetsClientPromise;

export async function getSheet() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const projectId = process.env.GOOGLE_PROJECT_ID;
      const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error(
          "Missing Google credentials. Check GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY."
        );
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          type: "service_account",
          project_id: projectId,
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const authClient = await auth.getClient();

      return google.sheets({
        version: "v4",
        auth: authClient,
      });
    })().catch((error) => {
      // Allow a later invocation to retry if initialization fails.
      sheetsClientPromise = undefined;
      throw error;
    });
  }

  return sheetsClientPromise;
}
