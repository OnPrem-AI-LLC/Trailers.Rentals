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
  authorizedUser?: string | null;
  trailerVin?: string;
  trailerType?: string;
  priceMonthly?: number;
}

function domain(): string {
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "https://deluxelogistics.com";
}

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escApp(app: ApplicationData): ApplicationData {
  return {
    ...app,
    companyName: esc(app.companyName),
    ownerName: esc(app.ownerName),
    email: esc(app.email),
    phone: esc(app.phone),
    dotNumber: esc(app.dotNumber),
    mcNumber: app.mcNumber ? esc(app.mcNumber) : app.mcNumber,
    intendedUse: esc(app.intendedUse),
    intendedUseDetails: app.intendedUseDetails ? esc(app.intendedUseDetails) : app.intendedUseDetails,
    authorizedUser: app.authorizedUser ? esc(app.authorizedUser) : app.authorizedUser,
    trailerVin: app.trailerVin ? esc(app.trailerVin) : app.trailerVin,
    trailerType: app.trailerType ? esc(app.trailerType) : app.trailerType,
  };
}

// ── 1. Admin notification on new application ────────────────────────────────
export async function sendAdminApplicationAlert(rawApp: ApplicationData): Promise<void> {
  const app = escApp(rawApp);
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
      ${app.authorizedUser ? `<tr><td style="padding: 8px 0; color: #64748b;">Authorized User</td><td style="padding: 8px 0;">${app.authorizedUser}</td></tr>` : ""}
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
export async function sendRenterAcknowledgment(rawApp: ApplicationData): Promise<void> {
  const app = escApp(rawApp);
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
export async function sendRejectionEmail(rawApp: ApplicationData, reason?: string): Promise<void> {
  const app = escApp(rawApp);
  const safeReason = reason ? esc(reason) : undefined;
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
    ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ""}
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
export async function sendCOIRequest(rawApp: ApplicationData): Promise<void> {
  const app = escApp(rawApp);
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

// ── 5b. Invite email (after approval) ─────────────────────────────────────
export async function sendInviteEmail(email: string, ownerName: string, inviteToken: string): Promise<void> {
  const safeName = esc(ownerName);
  const registerUrl = `${domain()}/register/${inviteToken}`;
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping invite email"); return; }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Your Application Has Been Approved!</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Congratulations! Your rental application has been approved. Please create your account to access your renter dashboard, upload required documents, and manage your rental.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-weight: bold; color: #1e293b;">You'll need to provide:</p>
      <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
        <li>A secure password for your account</li>
        <li>Your driver's license number</li>
        <li>Certificate of Insurance (COI)</li>
        <li>Certificate of Authority</li>
      </ul>
    </div>
    <p><strong>This invite link expires in 48 hours.</strong></p>
    <a href="${registerUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      Create Your Account →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy and paste: <a href="${registerUrl}" style="color: #e63946;">${registerUrl}</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV 25401<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: email,
    from: FROM,
    subject: "Your Deluxe Logistics rental application is approved — create your account",
    html,
    text: `Hi ${ownerName},\n\nYour rental application has been approved! Create your account here:\n${registerUrl}\n\nThis link expires in 48 hours.\n\nDeluxe Logistics Inc.`,
  });
}

// ── 5. More info request email ──────────────────────────────────────────────
export async function sendMoreInfoRequest(rawApp: ApplicationData, questions: string): Promise<void> {
  const app = escApp(rawApp);
  const safeQuestions = esc(questions);
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping more-info email"); return; }

  if (!rawApp.renterToken) {
    console.warn("[email] sendMoreInfoRequest: renterToken missing — skipping email to avoid broken response link");
    return;
  }
  const responseUrl = `${domain()}/applications/respond/${rawApp.renterToken}`;

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
      <p style="margin: 0; white-space: pre-line;">${safeQuestions}</p>
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

// ── 6. Agreement signed notification ──────────────────────────────────────────
export interface AgreementData {
  rentalId: string;
  companyName: string;
  renterEmail: string;
  renterName: string;
  trailerVin: string;
  trailerType: string;
  monthlyRate: number; // cents
  signedAt: Date;
  signedByName: string;
  pickupDate?: Date;
}

export interface AgreementRequestData {
  rentalId: string;
  companyName: string;
  renterEmail: string;
  renterName: string;
  trailerVin: string;
  trailerType: string;
  monthlyRate: number; // cents
}

export async function sendAgreementSignedEmails(data: AgreementData): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeSignedBy = esc(data.signedByName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const safeEmail = esc(data.renterEmail);
  const monthlyStr = `$${(data.monthlyRate / 100).toLocaleString()}/month`;
  const signedDate = data.signedAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const dashboardUrl = `${domain()}/dashboard`;

  if (!isConfigured()) {
    console.log("[email] SendGrid not configured — skipping agreement signed email");
    return;
  }

  // Email to renter
  const renterHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Rental Agreement Signed</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Thank you for signing your rental agreement. Here's a summary of your agreement:</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Trailer</td><td style="padding: 6px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Monthly Rate</td><td style="padding: 6px 0; font-weight: bold;">${monthlyStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Signed By</td><td style="padding: 6px 0;">${safeSignedBy}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Date Signed</td><td style="padding: 6px 0;">${esc(signedDate)}</td></tr>
        ${data.pickupDate ? `<tr><td style="padding: 6px 0; color: #64748b;">Requested Pickup</td><td style="padding: 6px 0; font-weight: bold;">${esc(data.pickupDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))}</td></tr>` : ""}
      </table>
    </div>
    <p><strong>Next Steps:</strong> Our team will review your agreement and reach out regarding payment of the 2-month security deposit to activate your rental.</p>
    <a href="${dashboardUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Your Dashboard →
    </a>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV 25401<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  // Email to admin
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const adminHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Agreement Signed — Action Required</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental Portal</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p><strong>${safeCompany}</strong> has signed their rental agreement and is awaiting payment setup.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Renter Email</td><td style="padding: 6px 0;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Trailer</td><td style="padding: 6px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Monthly Rate</td><td style="padding: 6px 0;">${monthlyStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Signed By</td><td style="padding: 6px 0;">${safeSignedBy}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Date</td><td style="padding: 6px 0;">${esc(signedDate)}</td></tr>
        ${data.pickupDate ? `<tr><td style="padding: 6px 0; color: #64748b;">Requested Pickup</td><td style="padding: 6px 0; font-weight: bold; color: #e63946;">${esc(data.pickupDate.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</td></tr>` : ""}
      </table>
    </div>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Rental in Admin →
    </a>
  </div>
</div>`;

  await Promise.allSettled([
    sgMail.send({
      to: data.renterEmail,
      from: FROM,
      subject: "Your Deluxe Logistics rental agreement is signed",
      html: renterHtml,
      text: `Hi ${data.renterName},\n\nYour rental agreement has been signed. Summary:\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nRate: ${monthlyStr}\nSigned By: ${data.signedByName}\nDate: ${signedDate}\n\nDeluxe Logistics Inc.`,
    }),
    sgMail.send({
      to: ADMIN_EMAIL,
      from: FROM,
      subject: `[ACTION NEEDED] Agreement signed — ${data.companyName} awaiting payment`,
      html: adminHtml,
      text: `${data.companyName} has signed their rental agreement.\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nRate: ${monthlyStr}\nSigned By: ${data.signedByName}\nDate: ${signedDate}${data.pickupDate ? `\nRequested Pickup: ${data.pickupDate.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}\n\nView: ${adminUrl}`,
    }),
  ]);
}

// ── 7. Agreement request email (admin triggers "please sign" to renter) ─────
export async function sendAgreementRequestEmail(data: AgreementRequestData): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const monthlyStr = `$${(data.monthlyRate / 100).toLocaleString()}/month`;
  const signUrl = `${domain()}/dashboard/sign-agreement/${data.rentalId}`;

  if (!isConfigured()) {
    console.log("[email] SendGrid not configured — skipping agreement request email");
    return;
  }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Your Rental Agreement is Ready to Sign</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Great news — your rental agreement for <strong>${safeType} (VIN: ${safeVin})</strong> is ready for your electronic signature.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Equipment</td><td style="padding: 6px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Monthly Rate</td><td style="padding: 6px 0; font-weight: bold;">${monthlyStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">No Mileage Fees</td><td style="padding: 6px 0; color: #22c55e; font-weight: bold;">Unlimited Miles</td></tr>
      </table>
    </div>
    <p>Once you sign, you'll also select your preferred pickup date. After signing, your next step will be paying the 2-month security deposit to activate your rental.</p>
    <a href="${signUrl}" style="display: inline-block; background: #e63946; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px; margin-bottom: 16px;">
      Review &amp; Sign Agreement →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy and paste: <a href="${signUrl}" style="color: #e63946;">${signUrl}</a></p>
    <p><strong>What to have ready:</strong></p>
    <ul style="color: #64748b; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
      <li>Your full legal name for the signature</li>
      <li>Your preferred pickup date and time</li>
    </ul>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV 25401<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: data.renterEmail,
    from: FROM,
    subject: `Action Required: Sign your rental agreement — ${data.trailerType} (${data.trailerVin})`,
    html,
    text: `Hi ${data.renterName},\n\nYour rental agreement for ${data.trailerType} VIN: ${data.trailerVin} is ready to sign.\n\nMonthly Rate: ${monthlyStr} — No Mileage Fees\n\nSign here: ${signUrl}\n\nDeluxe Logistics Inc.`,
  });
}

// ── 8. Deposit confirmed / rental activated email ─────────────────────────────
export interface DepositConfirmedData {
  rentalId: string;
  companyName: string;
  renterEmail: string;
  renterName: string;
  trailerVin: string;
  trailerType: string;
  monthlyRate: number; // cents
}

export async function sendDepositConfirmedEmail(data: DepositConfirmedData): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const monthlyStr = `$${(data.monthlyRate / 100).toLocaleString()}/month`;
  const dashboardUrl = `${domain()}/dashboard`;

  if (!isConfigured()) {
    console.log("[email] SendGrid not configured — skipping deposit confirmed email");
    return;
  }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #22c55e; margin: 0; font-size: 20px;">🚛 Your Rental is Now Active!</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Great news — your security deposit has been confirmed and your rental is now <strong style="color: #16a34a;">active</strong>.</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Trailer</td><td style="padding: 6px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Monthly Rate</td><td style="padding: 6px 0; font-weight: bold; color: #16a34a;">${monthlyStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Status</td><td style="padding: 6px 0; font-weight: bold; color: #16a34a;">Active ✓</td></tr>
      </table>
    </div>
    <p><strong>What's next:</strong></p>
    <ul style="color: #374151; font-size: 14px; padding-left: 20px; line-height: 2;">
      <li>Coordinate pickup timing with our team</li>
      <li>Your monthly billing will begin on your pickup date</li>
      <li>Track your rental status and documents in your dashboard</li>
    </ul>
    <a href="${dashboardUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Your Dashboard →
    </a>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV 25401<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: data.renterEmail,
    from: FROM,
    subject: `Your Deluxe Logistics rental is now active — ${safeType} (${safeVin})`,
    html,
    text: `Hi ${data.renterName},\n\nYour security deposit has been confirmed and your rental is now active!\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly Rate: ${monthlyStr}\n\nLog in to your dashboard: ${dashboardUrl}\n\nDeluxe Logistics Inc.`,
  });
}
