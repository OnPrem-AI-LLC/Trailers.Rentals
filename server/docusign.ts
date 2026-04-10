/**
 * DocuSign Integration Scaffold
 * ─────────────────────────────────────────────────────────────────────────────
 * This module provides a commented-out scaffold for DocuSign e-signature
 * integration. When DocuSign credentials are available, uncomment and configure
 * the code below.
 *
 * TODO: To activate DocuSign:
 *  1. Create a DocuSign developer account at https://developers.docusign.com/
 *  2. Create an app and obtain:
 *     - DOCUSIGN_INTEGRATION_KEY (client ID)
 *     - DOCUSIGN_SECRET_KEY (client secret)
 *     - DOCUSIGN_ACCOUNT_ID (your DocuSign account ID)
 *     - DOCUSIGN_BASE_URL (e.g. https://demo.docusign.net/restapi for sandbox)
 *  3. Set these as environment variables (use the environment-secrets tool)
 *  4. Run: npm install docusign-esign
 *  5. Uncomment the code below
 *
 * Current e-signature flow (active):
 *  - Admin triggers "Send Agreement" → POST /api/admin/rentals/:id/send-agreement
 *  - Renter visits /agreement/:rentalId → signs with canvas or typed signature
 *  - Signature image uploaded to Cloudinary → stored as rental.signatureUrl
 *  - Rental status → "pending_payment", agreementSignedAt recorded
 *
 * DocuSign flow (scaffolded below, requires activation):
 *  - Create envelope with agreement template
 *  - Add renter as recipient
 *  - Send envelope via DocuSign API
 *  - Handle webhook callback when signed
 *  - Download completed document from DocuSign
 */

// ────────────────────────────────────────────────────────────────────────────
// SCAFFOLD: DocuSign integration (commented out — activate when credentials ready)
// ────────────────────────────────────────────────────────────────────────────

/*
import docusign from "docusign-esign";

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY;
const SECRET_KEY = process.env.DOCUSIGN_SECRET_KEY;
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;
const BASE_URL = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";
const REDIRECT_URI = process.env.DOCUSIGN_REDIRECT_URI || "http://localhost:5000/api/docusign/callback";

// ── OAuth: Generate Authorization URL ──────────────────────────────────────
export function getDocuSignAuthUrl(): string {
  const oAuth = new docusign.OAuthClient({
    oAuthBasePath: "account-d.docusign.com", // sandbox; use "account.docusign.com" for prod
    clientId: INTEGRATION_KEY!,
    clientSecret: SECRET_KEY!,
    redirectUri: REDIRECT_URI,
  });

  return oAuth.generateAuthorizationUri(REDIRECT_URI, {
    responseType: "code",
    scope: "signature",
    state: "deluxe-logistics",
  });
}

// ── OAuth: Exchange code for access token ───────────────────────────────────
export async function exchangeDocuSignCode(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const oAuth = new docusign.OAuthClient({
    oAuthBasePath: "account-d.docusign.com",
    clientId: INTEGRATION_KEY!,
    clientSecret: SECRET_KEY!,
    redirectUri: REDIRECT_URI,
  });

  const results = await oAuth.generateAccessToken("authorization_code", { code });
  return {
    accessToken: results.access_token,
    expiresIn: results.expires_in,
  };
}

// ── Create and send a DocuSign envelope (sends agreement to renter) ─────────
export async function sendDocuSignEnvelope(params: {
  accessToken: string;
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerVin: string;
  trailerType: string;
  monthlyRate: number;
  rentalId: string;
  agreementHtml: string; // HTML content of the agreement document
}): Promise<{ envelopeId: string; signingUrl: string }> {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(BASE_URL);
  apiClient.addDefaultHeader("Authorization", `Bearer ${params.accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  // Build the document from HTML
  const documentBytes = Buffer.from(params.agreementHtml).toString("base64");

  const envelope = new docusign.EnvelopeDefinition();
  envelope.emailSubject = `Rental Agreement — ${params.trailerType} VIN: ${params.trailerVin}`;
  envelope.status = "sent"; // immediately send to recipient

  // Define the document
  const doc = new docusign.Document();
  doc.documentBase64 = documentBytes;
  doc.name = "Rental_Agreement.html";
  doc.fileExtension = "html";
  doc.documentId = "1";
  envelope.documents = [doc];

  // Define the signer recipient
  const signer = new docusign.Signer();
  signer.email = params.renterEmail;
  signer.name = params.renterName;
  signer.recipientId = "1";
  signer.routingOrder = "1";

  // Add signature tab (where the renter signs)
  const signHere = new docusign.SignHere();
  signHere.documentId = "1";
  signHere.pageNumber = "1";
  signHere.recipientId = "1";
  signHere.tabLabel = "signHereTab";
  signHere.xPosition = "195";
  signHere.yPosition = "147";

  // Add date tab
  const dateSigned = new docusign.DateSigned();
  dateSigned.documentId = "1";
  dateSigned.pageNumber = "1";
  dateSigned.recipientId = "1";
  dateSigned.tabLabel = "dateSigned";
  dateSigned.xPosition = "400";
  dateSigned.yPosition = "147";

  const tabs = new docusign.Tabs();
  tabs.signHereTabs = [signHere];
  tabs.dateSignedTabs = [dateSigned];
  signer.tabs = tabs;

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];
  envelope.recipients = recipients;

  // Create the envelope
  const result = await envelopesApi.createEnvelope(ACCOUNT_ID!, {
    envelopeDefinition: envelope,
  });

  const envelopeId = result.envelopeId!;

  // Get embedded signing URL (redirect-back signing view)
  const viewRequest = new docusign.RecipientViewRequest();
  viewRequest.authenticationMethod = "email";
  viewRequest.email = params.renterEmail;
  viewRequest.userName = params.renterName;
  viewRequest.recipientId = "1";
  viewRequest.returnUrl = `${process.env.APP_BASE_URL || "http://localhost:5000"}/dashboard?docusign=signed&rentalId=${params.rentalId}`;

  const viewResult = await envelopesApi.createRecipientView(ACCOUNT_ID!, envelopeId, {
    recipientViewRequest: viewRequest,
  });

  return {
    envelopeId,
    signingUrl: viewResult.url!,
  };
}

// ── Webhook handler: called by DocuSign when envelope is signed ─────────────
// Register this at: POST /api/docusign/webhook
// Configure in DocuSign Connect under: Settings → Integrations → Connect
export async function handleDocuSignWebhook(payload: {
  envelopeId: string;
  status: string;
  // ... DocuSign Connect payload shape — see DocuSign Connect documentation
}): Promise<void> {
  if (payload.status !== "completed") return; // Only process fully signed envelopes

  // TODO:
  //  1. Look up rental by envelopeId (store envelopeId on rental when sending)
  //  2. Download the signed document: envelopesApi.getDocument(accountId, envelopeId, "combined")
  //  3. Upload PDF to Cloudinary → store URL on rental.agreementUrl
  //  4. Update rental: status → "pending_payment", agreementSignedAt = new Date()
  //  5. Send "agreement signed" confirmation email to renter and admin

  console.log("[docusign] Webhook received for envelope:", payload.envelopeId, "status:", payload.status);
}

// ── Download completed signed document from DocuSign ───────────────────────
export async function downloadSignedDocument(
  accessToken: string,
  envelopeId: string
): Promise<Buffer> {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(BASE_URL);
  apiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  // "combined" downloads all documents as a single PDF
  const result = await envelopesApi.getDocument(ACCOUNT_ID!, envelopeId, "combined");
  return Buffer.from(result as unknown as string, "binary");
}
*/

// ── Active (non-DocuSign) exports for current in-house e-signature flow ─────
// These are used by routes.ts and do NOT require DocuSign credentials.

export const DOCUSIGN_CONFIGURED = !!(
  process.env.DOCUSIGN_INTEGRATION_KEY &&
  process.env.DOCUSIGN_SECRET_KEY &&
  process.env.DOCUSIGN_ACCOUNT_ID
);

export function getDocuSignStatus(): { configured: boolean; message: string } {
  if (DOCUSIGN_CONFIGURED) {
    return { configured: true, message: "DocuSign is configured and ready." };
  }
  return {
    configured: false,
    message:
      "DocuSign is not configured. Using in-house e-signature (canvas/typed). " +
      "Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_SECRET_KEY, and DOCUSIGN_ACCOUNT_ID to activate.",
  };
}
