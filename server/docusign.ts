/**
 * DocuSign Integration Status
 *
 * Current flow uses in-house e-signature (canvas/typed).
 * DocuSign integration can be activated when credentials are available.
 * See docs: https://developers.docusign.com/
 */

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
