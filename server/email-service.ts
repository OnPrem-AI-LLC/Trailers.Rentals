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

// ── 8a. Admin notification when deposit received ──────────────────────────────
export async function sendDepositReceivedAdminEmail(data: {
  rentalId: string;
  companyName: string;
  trailerVin: string;
  trailerType: string;
  monthlyRate: number;
  paymentIntentId?: string;
}): Promise<void> {
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const monthlyStr = `$${(data.monthlyRate / 100).toLocaleString()}/month`;

  if (!isConfigured()) {
    console.log("[email] SendGrid not configured — skipping admin deposit notification");
    return;
  }

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #22c55e; margin: 0; font-size: 18px;">💰 Security Deposit Received</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics — Admin Notification</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>A security deposit has been paid and the rental has been automatically activated.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 5px 0; color: #64748b;">Company</td><td style="padding: 5px 0; font-weight: bold;">${esc(data.companyName)}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Trailer</td><td style="padding: 5px 0;">${esc(data.trailerType)} — VIN: ${esc(data.trailerVin)}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Monthly Rate</td><td style="padding: 5px 0; color: #16a34a; font-weight: bold;">${monthlyStr}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Deposit Paid</td><td style="padding: 5px 0; color: #16a34a;">$${((data.monthlyRate * 2) / 100).toLocaleString()} ✓</td></tr>
      ${data.paymentIntentId ? `<tr><td style="padding: 5px 0; color: #64748b;">Stripe PI</td><td style="padding: 5px 0; font-family: monospace; font-size: 12px;">${esc(data.paymentIntentId)}</td></tr>` : ""}
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
      View Rental →
    </a>
  </div>
</div>`;

  await sgMail.send({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Deposit Paid] ${data.companyName} — ${data.trailerType} rental now active`,
    html,
    text: `Security deposit received.\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly: ${monthlyStr}\nDeposit: $${((data.monthlyRate * 2) / 100).toLocaleString()}\n\nView: ${adminUrl}`,
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

// ── Monthly invoice email ─────────────────────────────────────────────────────
export interface MonthlyInvoiceEmailData {
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerType: string;
  trailerVin: string;
  amount: number;         // cents
  invoiceUrl: string | null;
  pdfUrl: string | null;
  billingPeriod?: string; // e.g. "May 2026"
}

export async function sendMonthlyInvoiceEmail(data: MonthlyInvoiceEmailData): Promise<void> {
  if (!isConfigured()) {
    console.log("[email] SendGrid not configured — skipping monthly invoice email");
    return;
  }

  const safeName    = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeType    = esc(data.trailerType);
  const safeVin     = esc(data.trailerVin);
  const amountStr   = `$${(data.amount / 100).toLocaleString()}`;
  const period      = data.billingPeriod ? esc(data.billingPeriod) : "this month";
  const dashUrl     = `${domain()}/dashboard`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #0a0a0a; padding: 30px; text-align: center;">
    <h1 style="color: #f59e0b; margin: 0; font-size: 24px;">Monthly Invoice</h1>
    <p style="color: #9ca3af; margin: 8px 0 0;">Deluxe Logistics Inc.</p>
  </div>
  <div style="background: #111; padding: 30px;">
    <p style="color: #e5e7eb;">Hi ${safeName},</p>
    <p style="color: #9ca3af;">Your monthly rental invoice for <strong style="color:#e5e7eb;">${period}</strong> is ready.</p>
    <div style="background: #1c1c1c; border: 1px solid #333; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width:100%; color:#9ca3af; font-size:14px; border-collapse:collapse;">
        <tr><td style="padding:4px 0;">Company</td><td style="text-align:right; color:#e5e7eb;">${safeCompany}</td></tr>
        <tr><td style="padding:4px 0;">Trailer</td><td style="text-align:right; color:#e5e7eb;">${safeType} — VIN ${safeVin}</td></tr>
        <tr style="border-top:1px solid #333;">
          <td style="padding:8px 0 4px; font-weight:bold; color:#e5e7eb;">Amount Due</td>
          <td style="text-align:right; color:#f59e0b; font-weight:bold; font-size:18px;">${amountStr}</td>
        </tr>
      </table>
    </div>
    ${data.invoiceUrl ? `<div style="text-align:center; margin:24px 0;"><a href="${esc(data.invoiceUrl)}" style="background:#f59e0b; color:#000; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:bold;">View &amp; Pay Invoice</a></div>` : ''}
    <p style="color:#6b7280; font-size:13px;">You can also view your payment history in your <a href="${dashUrl}" style="color:#f59e0b;">dashboard</a>.</p>
    <p style="color:#6b7280; font-size:12px;">Questions? Contact us at <a href="mailto:info@deluxelogistics.com" style="color:#f59e0b;">info@deluxelogistics.com</a></p>
  </div>
</div>`;

  await sgMail.send({
    to: data.renterEmail,
    from: FROM,
    subject: `Invoice for ${period} — ${safeType} rental (${safeVin})`,
    html,
    text: `Hi ${data.renterName},\n\nYour monthly rental invoice for ${period} is ready.\n\nAmount: ${amountStr}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\n${data.invoiceUrl ? `Pay here: ${data.invoiceUrl}\n\n` : ''}Questions? info@deluxelogistics.com\n\nDeluxe Logistics Inc.`,
  });
}

// ── QR Pickup confirmed notification ──────────────────────────────────────────
export interface QREventData {
  rentalId: string;
  companyName: string;
  renterEmail: string;
  renterName: string;
  trailerVin: string;
  trailerType: string;
  confirmedAt: Date;
}

export async function sendPickupConfirmedEmails(data: QREventData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping pickup confirmed email"); return; }
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const dateStr = esc(data.confirmedAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  const dashUrl = `${domain()}/dashboard`;

  const renterHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #052e16; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #4ade80; margin: 0; font-size: 20px;">Pickup Confirmed!</h1>
    <p style="color: #86efac; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Your trailer pickup has been confirmed. Welcome aboard!</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Pickup Confirmed</td><td style="padding: 4px 0; color: #16a34a;">${dateStr}</td></tr>
      </table>
    </div>
    <p>Your rental is now <strong style="color: #16a34a;">in use</strong>. Monthly billing is active. View your dashboard to track invoices and documents.</p>
    <a href="${dashUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Dashboard →
    </a>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;"><strong>Deluxe Logistics Inc.</strong><br/>818 Corning Way, Martinsburg, WV 25401<br/><a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a></p>
  </div>
</div>`;

  const adminHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #052e16; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #4ade80; margin: 0; font-size: 18px;">Pickup Confirmed via QR Scan</h1>
    <p style="color: #86efac; margin: 6px 0 0;">Deluxe Logistics Admin</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p><strong>${safeCompany}</strong> has scanned the pickup QR code and confirmed trailer receipt.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0;">${safeCompany}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Confirmed At</td><td style="padding: 4px 0; color: #16a34a;">${dateStr}</td></tr>
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Rental →</a>
  </div>
</div>`;

  await Promise.allSettled([
    sgMail.send({ to: data.renterEmail, from: FROM, subject: `Pickup confirmed — ${data.trailerType} (${data.trailerVin})`, html: renterHtml, text: `Hi ${data.renterName},\n\nYour trailer pickup has been confirmed.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nPickup Time: ${dateStr}\n\nView your dashboard: ${dashUrl}\n\nDeluxe Logistics Inc.` }),
    sgMail.send({ to: ADMIN_EMAIL, from: FROM, subject: `[Pickup] ${data.companyName} confirmed pickup via QR`, html: adminHtml, text: `${data.companyName} confirmed pickup via QR scan at ${dateStr}.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\nView: ${adminUrl}` }),
  ]);
}

export async function sendReturnConfirmedEmails(data: QREventData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping return confirmed email"); return; }
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const dateStr = esc(data.confirmedAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  const dashUrl = `${domain()}/dashboard`;

  const renterHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #0c1a2e; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #60a5fa; margin: 0; font-size: 20px;">Return Confirmed — Thank You!</h1>
    <p style="color: #93c5fd; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Your trailer return has been confirmed. Thank you for choosing Deluxe Logistics!</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Return Confirmed</td><td style="padding: 4px 0; color: #2563eb;">${dateStr}</td></tr>
      </table>
    </div>
    <p>Your rental has been marked as <strong>completed</strong>. Any outstanding invoices will be finalized shortly.</p>
    <a href="${dashUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Dashboard →
    </a>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;"><strong>Deluxe Logistics Inc.</strong><br/>818 Corning Way, Martinsburg, WV 25401<br/><a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a></p>
  </div>
</div>`;

  const adminHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #0c1a2e; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #60a5fa; margin: 0; font-size: 18px;">Return Confirmed via QR Scan</h1>
    <p style="color: #93c5fd; margin: 6px 0 0;">Deluxe Logistics Admin</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p><strong>${safeCompany}</strong> has scanned the return QR code and confirmed trailer return. Rental is now <strong>completed</strong>.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0;">${safeCompany}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Return Time</td><td style="padding: 4px 0; color: #2563eb;">${dateStr}</td></tr>
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Rental →</a>
  </div>
</div>`;

  await Promise.allSettled([
    sgMail.send({ to: data.renterEmail, from: FROM, subject: `Return confirmed — ${data.trailerType} (${data.trailerVin}) — Thank you!`, html: renterHtml, text: `Hi ${data.renterName},\n\nYour trailer return has been confirmed.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nReturn Time: ${dateStr}\n\nThank you for choosing Deluxe Logistics!\n\nDeluxe Logistics Inc.` }),
    sgMail.send({ to: ADMIN_EMAIL, from: FROM, subject: `[Return] ${data.companyName} returned trailer via QR`, html: adminHtml, text: `${data.companyName} confirmed return via QR scan at ${dateStr}.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\nView: ${adminUrl}` }),
  ]);
}

// ── Engine Hours: Request email ─────────────────────────────────────────────
export interface EngineHoursRequestData {
  rentalId: string;
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerVin: string;
  trailerType: string;
  previousReading?: number | null;
}

export async function sendEngineHoursRequest(data: EngineHoursRequestData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping engine hours request"); return; }
  const dashboardUrl = `/dashboard/engine-hours/${data.rentalId}`;
  // Link to login with a redirect param so logged-out users land directly on the submission page
  const submitUrl = `${domain()}/login?redirect=${encodeURIComponent(dashboardUrl)}`;
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const prevReading = data.previousReading != null ? data.previousReading.toLocaleString() : "None";

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Engine Hour Reading Requested</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Deluxe Logistics is requesting your current reefer engine hour reading for your trailer.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Last Reading</td><td style="padding: 4px 0;">${prevReading} hours</td></tr>
      </table>
    </div>
    <p>Please submit your current hour reading using the button below:</p>
    <a href="${esc(submitUrl)}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      Submit Engine Hours →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or paste this link: <a href="${esc(submitUrl)}" style="color: #e63946;">${esc(submitUrl)}</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;"><strong>Deluxe Logistics Inc.</strong><br/>818 Corning Way, Martinsburg, WV 25401<br/><a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a></p>
  </div>
</div>`;

  await sgMail.send({
    to: data.renterEmail,
    from: FROM,
    subject: `Engine hour reading requested — ${safeType} VIN ${safeVin}`,
    html,
    text: `Hi ${data.renterName},\n\nDeluxe Logistics is requesting your current reefer engine hour reading.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nLast Reading: ${prevReading} hours\n\nSubmit here: ${submitUrl}\n\nDeluxe Logistics Inc.`,
  });
}

// ── Engine Hours: Admin notification when renter submits ───────────────────
export interface EngineHoursSubmittedData {
  rentalId: string;
  companyName: string;
  trailerVin: string;
  trailerType: string;
  currentReading: number;
  hoursUsed: number | null;
  calculatedCharge: number | null;
}

export async function sendEngineHoursReceivedAdmin(data: EngineHoursSubmittedData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping engine hours admin notify"); return; }
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const chargeStr = data.calculatedCharge != null ? `$${(data.calculatedCharge / 100).toLocaleString()}` : "N/A";

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Engine Hours Submitted</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental Portal</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p><strong>${safeCompany}</strong> has submitted an engine hour reading.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Current Reading</td><td style="padding: 4px 0; font-weight: bold;">${data.currentReading.toLocaleString()} hrs</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Hours Used</td><td style="padding: 4px 0;">${data.hoursUsed != null ? data.hoursUsed.toLocaleString() + " hrs" : "N/A"}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Calculated Charge</td><td style="padding: 4px 0; font-weight: bold; color: #e63946;">${chargeStr}</td></tr>
      </table>
    </div>
    <a href="${esc(adminUrl)}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
      View Rental &amp; Bill →
    </a>
  </div>
</div>`;

  await sgMail.send({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Engine Hours] ${safeCompany} submitted reading — ${chargeStr} due`,
    html,
    text: `${data.companyName} submitted an engine hour reading.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nReading: ${data.currentReading} hrs\nHours Used: ${data.hoursUsed ?? "N/A"}\nCharge: ${chargeStr}\n\nView: ${adminUrl}\n\nDeluxe Logistics Inc.`,
  });
}

// ── Driver Application Emails ─────────────────────────────────────────────

export interface DriverApplicationEmailData {
  applicationId: string;
  fullName: string;
  email: string;
  phone: string;
  cdlClass: string;
  cdlState: string;
  yearsExperience: number;
  desiredPosition?: string | null;
  hasTwic: boolean;
  hasHazmat: boolean;
  hasTanker: boolean;
  coverLetter?: string | null;
}

export async function sendDriverApplicationConfirmation(data: DriverApplicationEmailData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping driver app confirmation"); return; }
  const safeName = esc(data.fullName);
  const positionLabel = data.desiredPosition === "otr" ? "OTR" : data.desiredPosition === "regional" ? "Regional" : data.desiredPosition === "local" ? "Local" : "Any";
  const endorsements = [data.hasTwic && "TWIC", data.hasHazmat && "Hazmat", data.hasTanker && "Tanker"].filter(Boolean).join(", ") || "None";

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Application Received</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Inc. — Driver Hiring</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>Thank you for applying to drive for Deluxe Logistics. We've received your application and will review it within 2 business days. If you're a strong match, we'll reach out to schedule a quick call.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <p style="font-weight: bold; margin: 0 0 10px; font-size: 14px;">Your Application Summary</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b; width: 40%;">CDL Class</td><td style="padding: 4px 0;">Class ${esc(data.cdlClass)} — ${esc(data.cdlState)}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Experience</td><td style="padding: 4px 0;">${data.yearsExperience} year(s)</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Position</td><td style="padding: 4px 0;">${positionLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Endorsements</td><td style="padding: 4px 0;">${endorsements}</td></tr>
      </table>
    </div>
    <p style="font-size: 13px; color: #64748b;">Questions? Reply to this email or contact us at jobs@deluxelogistics.com.</p>
    <p style="font-size: 13px; color: #64748b;">— The Deluxe Logistics Team</p>
  </div>
</div>`;

  await sgMail.send({
    to: data.email,
    from: FROM,
    subject: "We received your driver application — Deluxe Logistics",
    html,
    text: `Hi ${data.fullName},\n\nThank you for applying to drive for Deluxe Logistics. We'll review your application within 2 business days.\n\nCDL: Class ${data.cdlClass} (${data.cdlState})\nExperience: ${data.yearsExperience} year(s)\nPosition: ${positionLabel}\nEndorsements: ${endorsements}\n\nQuestions? Email jobs@deluxelogistics.com\n\n— Deluxe Logistics Inc.`,
  });
}

export async function sendDriverApplicationAdmin(data: DriverApplicationEmailData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping driver app admin notify"); return; }
  const safeName = esc(data.fullName);
  const adminUrl = `${domain()}/admin/driver-applications`;
  const positionLabel = data.desiredPosition === "otr" ? "OTR" : data.desiredPosition === "regional" ? "Regional" : data.desiredPosition === "local" ? "Local" : "Any";
  const endorsements = [data.hasTwic && "TWIC", data.hasHazmat && "Hazmat", data.hasTanker && "Tanker"].filter(Boolean).join(", ") || "None";

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">New Driver Application</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Hiring Portal</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p><strong>${safeName}</strong> submitted a driver application.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b; width: 40%;">Email</td><td style="padding: 4px 0;">${esc(data.email)}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Phone</td><td style="padding: 4px 0;">${esc(data.phone)}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">CDL Class</td><td style="padding: 4px 0;">Class ${esc(data.cdlClass)} — ${esc(data.cdlState)}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Experience</td><td style="padding: 4px 0;">${data.yearsExperience} year(s)</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Position</td><td style="padding: 4px 0;">${positionLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Endorsements</td><td style="padding: 4px 0;">${endorsements}</td></tr>
      </table>
    </div>
    <a href="${esc(adminUrl)}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
      Review Application →
    </a>
  </div>
</div>`;

  await sgMail.send({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[New Driver Application] ${data.fullName} — Class ${data.cdlClass} CDL, ${data.yearsExperience} yrs exp`,
    html,
    text: `New driver application from ${data.fullName}\n\nEmail: ${data.email}\nPhone: ${data.phone}\nCDL: Class ${data.cdlClass} (${data.cdlState})\nExperience: ${data.yearsExperience} yr(s)\nPosition: ${positionLabel}\nEndorsements: ${endorsements}\n\nReview: ${adminUrl}\n\nDeluxe Logistics Inc.`,
  });
}

// ── Admin account setup email ───────────────────────────────────────────
export async function sendAdminSetupEmail(data: {
  email: string;
  firstName: string;
  lastName: string;
  inviteToken: string;
}): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping admin setup email"); return; }
  const setupUrl = `${domain()}/register/admin/${data.inviteToken}`;
  const safeName = esc(data.firstName);

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Admin Account Setup</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics — Internal Admin Portal</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>You've been invited to join the Deluxe Logistics admin team. Click the link below to set your password and activate your account.</p>
    <p><strong>This invitation link expires in 7 days.</strong></p>
    <a href="${setupUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      Set Up Your Admin Account →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy and paste: <a href="${setupUrl}" style="color: #e63946;">${setupUrl}</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>Deluxe Logistics Inc.</strong><br/>
      818 Corning Way, Martinsburg, WV 25401<br/>
      <a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a>
    </p>
  </div>
</div>`;

  await sgMail.send({
    to: data.email,
    from: FROM,
    subject: "You've been invited to join the Deluxe Logistics admin team",
    html,
    text: `Hi ${data.firstName},\n\nYou've been invited to join the Deluxe Logistics admin portal. Set up your account here:\n${setupUrl}\n\nThis link expires in 7 days.\n\nDeluxe Logistics Inc.`,
  });
}

// ── Registration delivery email (sent on check-in completion) ────────────
export interface RegistrationEmailData {
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerVin: string;
  trailerType: string;
  registrationUrl: string;
}

export async function sendRegistrationEmail(data: RegistrationEmailData): Promise<void> {
  if (!isConfigured()) { console.log("[email] SendGrid not configured — skipping registration email"); return; }
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #e63946; margin: 0; font-size: 20px;">Trailer Registration Document</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    <p>Hi ${safeName},</p>
    <p>Your trailer pickup has been confirmed. Attached below is the electronic registration for your trailer. Please keep a copy in your cab at all times.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
      </table>
    </div>
    <a href="${esc(data.registrationUrl)}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Registration Document →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy the link: <a href="${esc(data.registrationUrl)}" style="color: #e63946;">${esc(data.registrationUrl)}</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;"><strong>Deluxe Logistics Inc.</strong><br/>818 Corning Way, Martinsburg, WV 25401<br/><a href="mailto:info@deluxelogistics.com">info@deluxelogistics.com</a></p>
  </div>
</div>`;

  await sgMail.send({
    to: data.renterEmail,
    from: FROM,
    subject: `Trailer registration — ${safeType} VIN ${safeVin}`,
    html,
    text: `Hi ${data.renterName},\n\nYour trailer pickup has been confirmed. Here is your electronic registration:\n\n${data.registrationUrl}\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nCompany: ${data.companyName}\n\nKeep a copy in your cab at all times.\n\nDeluxe Logistics Inc.`,
  });
}

export async function sendContactFormEmail(data: {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
}): Promise<void> {
  if (!isConfigured()) return;
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: #1a1a1a; padding: 24px 32px;">
    <h2 style="color: #ffffff; margin: 0; font-size: 20px;">New Contact Form Submission</h2>
    <p style="color: #9ca3af; margin: 4px 0 0; font-size: 14px;">Deluxe Logistics Inc. Website</p>
  </div>
  <div style="padding: 32px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      <tr><td style="padding: 6px 0; color: #64748b; width: 100px;">Name</td><td style="padding: 6px 0; font-weight: bold;">${esc(data.name)}</td></tr>
      <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;"><a href="mailto:${esc(data.email)}" style="color: #e63946;">${esc(data.email)}</a></td></tr>
      ${data.phone ? `<tr><td style="padding: 6px 0; color: #64748b;">Phone</td><td style="padding: 6px 0;">${esc(data.phone)}</td></tr>` : ""}
      <tr><td style="padding: 6px 0; color: #64748b;">Subject</td><td style="padding: 6px 0;">${esc(data.subject)}</td></tr>
    </table>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
      <p style="margin: 0; white-space: pre-wrap; font-size: 14px; color: #1e293b;">${esc(data.message)}</p>
    </div>
    <p style="margin-top: 24px; color: #94a3b8; font-size: 12px;">Reply directly to this email to respond to the inquiry.</p>
  </div>
</div>`;

  await sgMail.send({
    to: ADMIN_EMAIL,
    from: FROM,
    replyTo: data.email,
    subject: `Contact form: ${data.subject} — from ${data.name}`,
    html,
    text: `New contact form submission\n\nName: ${data.name}\nEmail: ${data.email}${data.phone ? `\nPhone: ${data.phone}` : ""}\nSubject: ${data.subject}\n\nMessage:\n${data.message}`,
  });
}
