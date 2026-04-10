import sgMail from "@sendgrid/mail";

const FROM = "noreply@deluxelogistics.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || "admin@deluxelogistics.com";

function isConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY;
}

function init() {
  if (isConfigured()) sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
}
init();

interface ApplicationData {
  id: string;
  adminToken?: string | null;
  renterToken?: string | null;
  companyName: string;
  ownerName: string;
  email: string;
  phone: string;
  dotNumber: string;
  mcNumber?: string | null;
  intendedUse: string;
  intendedUseDetails?: string | null;
  trailerVin?: string;
  trailerType?: string;
  priceMonthly?: number;
}

function domain(): string {
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "https://deluxelogistics.com";
}

// ── 1. Admin notification on new application ────────────────────────────────
export async function sendAdminApplicationAlert(app: ApplicationData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping admin alert"); return; }

  const reviewUrl = app.adminToken
    ? `${domain()}/admin/requests/${app.id}?tk=${app.adminToken}`
    : `${domain()}/admin/requests/${app.id}`;
  const price = app.priceMonthly ? `$${(app.priceMonthly / 100).toLocaleString()}/month` : "N/A";

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">New Rental Application</h1>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 160px;">Company</td><td style="padding: 8px 0; font-weight: bold;">${app.companyName}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Owner/Officer</td><td style="padding: 8px 0;">${app.ownerName}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0;"><a href="mailto:${app.email}">${app.email}</a></td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Phone</td><td style="padding: 8px 0;">${app.phone}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">DOT Number</td><td style="padding: 8px 0; font-weight: bold;">${app.dotNumber}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">MC Number</td><td style="padding: 8px 0;">${app.mcNumber || "Not provided"}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Trailer</td><td style="padding: 8px 0;">${app.trailerVin ? `${app.trailerType} — ${app.trailerVin}` : "N/A"}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Monthly Rate</td><td style="padding: 8px 0;">${price}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Intended Use</td><td style="padding: 8px 0;">${app.intendedUse}</td></tr>
      ${app.intendedUseDetails ? `<tr><td style="padding: 8px 0; color: #64748b;">Details</td><td style="padding: 8px 0;">${app.intendedUseDetails}</td></tr>` : ""}
    </table>
    <a href="${reviewUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
      Review Application &amp; SAFER Data →
    </a>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">This link requires admin login.</p>
  </div>
</div>`;

  await sgMail.send({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Application] ${app.companyName} — ${app.dotNumber}`,
    html,
    text: `New rental application from ${app.companyName}.\nDOT: ${app.dotNumber}\nEmail: ${app.email}\nReview: ${reviewUrl}`,
  });
}

// ── 2. Renter acknowledgment ────────────────────────────────────────────────
export async function sendRenterAcknowledgment(app: ApplicationData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping renter ack"); return; }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Application Received</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${app.ownerName},</p>
    <p>We've received your rental application for <strong>${app.trailerVin ? `trailer VIN ${app.trailerVin}` : "your requested trailer"}</strong>.</p>
    <p><strong>What happens next:</strong></p>
    <ul>
      <li>Our team will review your application and DOT/MC information</li>
      <li>We typically respond within 24 hours by email</li>
      <li>You may be asked for additional documentation such as a Certificate of Insurance</li>
    </ul>
    <p>If you have questions in the meantime, reply to this email or call us.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: app.email,
    from: FROM,
    subject: "Your Deluxe Logistics rental application has been received",
    html,
    text: `Hi ${app.ownerName},\n\nWe've received your rental application. Our team will review it and contact you within 24 hours.\n\nDeluxe Logistics Inc.\n818 Corning Way, Martinsburg, WV`,
  });
}

// ── 3. Rejection email ──────────────────────────────────────────────────────
export async function sendRejectionEmail(app: ApplicationData, reason?: string): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping rejection email"); return; }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Application Update</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${app.ownerName},</p>
    <p>Thank you for your interest in renting from Deluxe Logistics. After reviewing your application, we are unable to proceed at this time.</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
    <p>You are welcome to reapply in the future. If you have questions, please don't hesitate to reach out.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: app.email,
    from: FROM,
    subject: "Update on your Deluxe Logistics rental application",
    html,
    text: `Hi ${app.ownerName},\n\nThank you for your interest in renting from Deluxe Logistics. After reviewing your application, we are unable to proceed at this time.\n\n${reason ? `Reason: ${reason}\n\n` : ""}Please contact us if you have questions.\n\nDeluxe Logistics Inc.`,
  });
}

// ── 4. COI Request email ────────────────────────────────────────────────────
export async function sendCOIRequest(app: ApplicationData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping COI request"); return; }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Certificate of Insurance Required</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${app.ownerName},</p>
    <p>Your rental application is progressing well. To finalize the review, we require a <strong>Certificate of Insurance (COI)</strong> naming Deluxe Logistics Inc. as an additional insured/certificate holder.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-weight: bold; color: #1e293b;">Certificate Holder Information:</p>
      <p style="margin: 0; font-family: monospace; font-size: 14px; line-height: 1.8; color: #334155;">
        Deluxe Logistics Inc.<br/>
        818 Corning Way<br/>
        Martinsburg, WV 25401
      </p>
    </div>
    <p>Please reply to this email with your COI attached, or email it to <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>. Once received, we will complete our review and get back to you within 24 hours.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV 25401<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: app.email,
    from: FROM,
    subject: "Action required: Certificate of Insurance for your rental application",
    html,
    text: `Hi ${app.ownerName},\n\nTo complete your rental application review, we require a Certificate of Insurance naming:\n\nDeluxe Logistics Inc.\n818 Corning Way\nMartinsburg, WV 25401\n\nPlease reply to this email with the COI attached.\n\nDeluxe Logistics Inc.`,
  });
}

// ── 5. More info request email ──────────────────────────────────────────────
export async function sendMoreInfoRequest(app: ApplicationData, questions: string): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping more-info email"); return; }

  const responseUrl = app.renterToken
    ? `${domain()}/applications/respond/${app.renterToken}`
    : `${domain()}/applications/${app.id}/respond`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Additional Information Needed</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${app.ownerName},</p>
    <p>Thank you for your rental application. We have a few follow-up questions:</p>
    <div style="background: #f8fafc; border-left: 4px solid #e63946; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; white-space: pre-line;">${questions}</p>
    </div>
    <p>You can respond directly through our site or by replying to this email:</p>
    <a href="${responseUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      Submit Your Response →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy and paste this link: <a href="${responseUrl}" style="color: #e63946;">${responseUrl}</a></p>
    <p>Once we receive your response, we'll complete the review and get back to you within 24 hours.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: app.email,
    from: FROM,
    subject: "Follow-up questions about your Deluxe Logistics rental application",
    html,
    text: `Hi ${app.ownerName},\n\nWe have a few follow-up questions about your rental application:\n\n${questions}\n\nRespond here: ${responseUrl}\n\nOr reply to this email with your answers.\n\nDeluxe Logistics Inc.`,
  });
}
