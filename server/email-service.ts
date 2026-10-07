import { Resend } from "resend";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { emailLogs, users, marketingSuppressions } from "@shared/schema";
import { COMPANY } from "@shared/constants";
import { CANCELLATION_POLICY, RENEWAL_TERMS_VERSION, formatMonthly, renewalTerms } from "@shared/renewal";
import { makeUnsubscribeToken } from "./unsubscribe";

const FROM = "noreply@getonprem.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || "admin@deluxelogistics.com";

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY!);
}

async function logEmail(opts: {
  recipient: string;
  sender?: string;
  subject: string;
  template: string;
  entityType?: string;
  entityId?: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}): Promise<void> {
  try {
    await db.insert(emailLogs).values({
      recipient: opts.recipient,
      sender: opts.sender ?? null,
      subject: opts.subject,
      template: opts.template,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      status: opts.status,
      error: opts.error ?? null,
    });
  } catch {
    // Non-fatal: never let logging break email delivery
  }
}

// ── Reusable branded HTML template ─────────────────────────────────────────
export function emailTemplate(title: string, body: string, accentColor = "#e63946"): string {
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a0a0c; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: ${accentColor}; margin: 0; font-size: 20px;">${title}</h1>
    <p style="color: #94a3b8; margin: 6px 0 0;">Deluxe Logistics Equipment Rental</p>
  </div>
  <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
    ${body}
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 13px;">
      <strong>${COMPANY.name}</strong> &middot; ${COMPANY.fullAddress}<br/>
      <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>
    </p>
  </div>
</div>`;
}

// ── Tracked send wrapper — single gatekeeper for all email sends ──────────
// Logs every send as: sent, failed, or skipped (when Resend is unconfigured)
interface MailPayload {
  to: string | string[];
  from: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>; // List-Unsubscribe etc.; only sendMarketing sets these
}

const MAX_EMAIL_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000]; // ms: 1s, 3s, 8s

async function sendTracked(
  msg: MailPayload,
  opts: { template: string; entityType?: string; entityId?: string }
): Promise<void> {
  const to = Array.isArray(msg.to) ? msg.to.join(", ") : msg.to;
  const sender = msg.from;
  const subject = msg.subject;

  if (!isConfigured()) {
    console.log(`[email] Resend not configured — skipping ${opts.template}`);
    logEmail({ recipient: to, sender, subject, template: opts.template, entityType: opts.entityType, entityId: opts.entityId, status: "skipped" });
    return;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_EMAIL_RETRIES; attempt++) {
    try {
      const resend = getResend();
      await resend.emails.send({
        from: msg.from,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
      });
      logEmail({ recipient: to, sender, subject, template: opts.template, entityType: opts.entityType, entityId: opts.entityId, status: "sent" });
      return; // success
    } catch (err: unknown) {
      lastErr = err;
      if (attempt < MAX_EMAIL_RETRIES - 1) {
        console.warn(`[email] Attempt ${attempt + 1} failed for ${opts.template}, retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  const errMsg = lastErr instanceof Error ? (lastErr as Error).message : String(lastErr);
  logEmail({ recipient: to, sender, subject, template: opts.template, entityType: opts.entityType, entityId: opts.entityId, status: "failed", error: errMsg });
  throw lastErr;
}

// ── Marketing sends ──────────────────────────────────────────────────────────
// Nothing sends marketing today. This exists so any future campaign is
// compliant by construction: it refuses opted-out recipients, appends an
// unsubscribe link and the postal address, and sets the one-click
// List-Unsubscribe headers (RFC 2369 / RFC 8058). Transactional senders above
// and below deliberately do NOT go through here: they are service messages
// about an active rental or application and carry no unsubscribe link.
export interface MarketingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  template: string;
}

export async function sendMarketing(msg: MarketingEmail): Promise<void> {
  const to = msg.to.trim().toLowerCase();
  // The suppression table is the primary opt-out record (it outlives the user
  // row); users.marketing_opt_out_at is kept for the account view. Usernames
  // keep their typed case, so that lookup ignores case.
  const [suppressed] = await db.select({ email: marketingSuppressions.email }).from(marketingSuppressions).where(eq(marketingSuppressions.email, to));
  const [user] = suppressed
    ? [undefined]
    : await db.select({ optOut: users.marketingOptOutAt }).from(users).where(sql`lower(${users.username}) = ${to}`);
  if (suppressed || user?.optOut) {
    console.log(`[email] recipient opted out of marketing — skipping ${msg.template}`);
    logEmail({ recipient: to, sender: FROM, subject: msg.subject, template: msg.template, status: "skipped", error: "recipient opted out of marketing" });
    return;
  }

  const unsubscribeUrl = `${domain()}/unsubscribe/${makeUnsubscribeToken(to)}`;
  const html = `${msg.html}
<p style="color: #64748b; font-size: 12px; margin-top: 24px;">
  You are receiving this because you have an account with ${COMPANY.name}.
  <a href="${unsubscribeUrl}" style="color: #64748b;">Unsubscribe</a> from marketing email.<br/>
  ${COMPANY.name} &middot; ${COMPANY.fullAddress}
</p>`;
  const text = `${msg.text ?? ""}\n\nUnsubscribe from marketing email: ${unsubscribeUrl}\n${COMPANY.name} · ${COMPANY.fullAddress}`;

  await sendTracked({
    to,
    from: FROM,
    subject: msg.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<mailto:${COMPANY.email}?subject=unsubscribe>, <${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  }, { template: msg.template });
}

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
  trailerName?: string;
  priceMonthly?: number;
}

function domain(): string {
  return process.env.APP_URL || "https://trailers.rentals";
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

// Renewal terms + cancellation policy, repeated in every billing email so an
// enrolled renter always has a retainable copy (ROSCA / state auto-renewal
// laws). The wording comes from shared/renewal.ts; only the layout lives here.
function renewalTermsHtml(monthlyRateCents: number, dashboardUrl: string): string {
  return `
    <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; color: #1e293b; line-height: 1.6;">
      <p style="margin: 0 0 8px;"><strong>Automatic monthly billing</strong></p>
      <p style="margin: 0 0 8px;">${esc(renewalTerms(monthlyRateCents))}</p>
      <p style="margin: 0;">Manage or cancel monthly billing in your <a href="${dashboardUrl}" style="color: #e63946;">dashboard</a>. Terms version ${RENEWAL_TERMS_VERSION}.</p>
    </div>`;
}

function renewalTermsText(monthlyRateCents: number, dashboardUrl: string): string {
  return `Automatic monthly billing: ${renewalTerms(monthlyRateCents)}\nManage or cancel monthly billing: ${dashboardUrl}\nTerms version ${RENEWAL_TERMS_VERSION}`;
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
    trailerName: app.trailerName ? esc(app.trailerName) : app.trailerName,
  };
}

// ── 1. Admin notification on new application ────────────────────────────────
export async function sendAdminApplicationAlert(rawApp: ApplicationData): Promise<void> {
  const app = escApp(rawApp);

  const reviewUrl = app.adminToken
    ? `${domain()}/admin/requests/${app.id}?tk=${app.adminToken}`
    : `${domain()}/admin/requests/${app.id}`;
  const price = app.priceMonthly ? `$${(app.priceMonthly / 100).toLocaleString()}/month` : "N/A";

  const html = emailTemplate("New Rental Application", `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 160px;">Company</td><td style="padding: 8px 0; font-weight: bold;">${app.companyName}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Owner/Officer</td><td style="padding: 8px 0;">${app.ownerName}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0;"><a href="mailto:${app.email}">${app.email}</a></td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Phone</td><td style="padding: 8px 0;">${app.phone}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">DOT Number</td><td style="padding: 8px 0; font-weight: bold;">${app.dotNumber}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">MC Number</td><td style="padding: 8px 0;">${app.mcNumber || "Not provided"}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Trailer</td><td style="padding: 8px 0;">${app.trailerName || app.trailerType || "N/A"}${app.trailerVin ? ` — VIN: ${app.trailerVin}` : ""}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Monthly Rate</td><td style="padding: 8px 0;">${price}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Intended Use</td><td style="padding: 8px 0;">${app.intendedUse}</td></tr>
      ${app.intendedUseDetails ? `<tr><td style="padding: 8px 0; color: #64748b;">Details</td><td style="padding: 8px 0;">${app.intendedUseDetails}</td></tr>` : ""}
      ${app.authorizedUser ? `<tr><td style="padding: 8px 0; color: #64748b;">Authorized User</td><td style="padding: 8px 0;">${app.authorizedUser}</td></tr>` : ""}
    </table>
    <a href="${reviewUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
      Review Application &amp; SAFER Data →
    </a>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">This link requires admin login.</p>
  `);

  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Application] ${app.companyName} — ${app.dotNumber}`,
    html,
    text: `New rental application from ${app.companyName}.\nDOT: ${app.dotNumber}\nEmail: ${app.email}\nReview: ${reviewUrl}`,
  }, { template: "admin_application_alert", entityType: "rental_application", entityId: rawApp.id });
}

// ── 2. Renter acknowledgment ────────────────────────────────────────────────
export async function sendRenterAcknowledgment(rawApp: ApplicationData): Promise<void> {
  const app = escApp(rawApp);

  const html = emailTemplate("Application Received", `
    <p>Hi ${app.ownerName},</p>
    <p>We've received your rental application for <strong>${app.trailerName || "your requested trailer"}</strong>.</p>
    <p><strong>What happens next:</strong></p>
    <ul>
      <li>Our team will review your application and DOT/MC information</li>
      <li>We typically respond within 24 hours by email</li>
      <li>You may be asked for additional documentation such as a Certificate of Insurance</li>
    </ul>
    <p>If you have questions in the meantime, reply to this email or call us.</p>
  `);

  await sendTracked({
    to: app.email,
    from: FROM,
    subject: "Your Deluxe Logistics rental application has been received",
    html,
    text: `Hi ${app.ownerName},\n\nWe've received your rental application. Our team will review it and contact you within 24 hours.\n\n${COMPANY.name}\n${COMPANY.fullAddress}`,
  }, { template: "renter_acknowledgment", entityType: "rental_application", entityId: rawApp.id });
}

// ── 3. Rejection email ──────────────────────────────────────────────────────
export async function sendRejectionEmail(rawApp: ApplicationData, reason?: string): Promise<void> {
  const app = escApp(rawApp);
  const safeReason = reason ? esc(reason) : undefined;

  const html = emailTemplate("Application Update", `
    <p>Hi ${app.ownerName},</p>
    <p>Thank you for your interest in renting from Deluxe Logistics. After reviewing your application, we are unable to proceed at this time.</p>
    ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ""}
    <p>You are welcome to reapply in the future. If you have questions, please don't hesitate to reach out.</p>
  `);

  await sendTracked({
    to: app.email,
    from: FROM,
    subject: "Update on your Deluxe Logistics rental application",
    html,
    text: `Hi ${app.ownerName},\n\nThank you for your interest in renting from Deluxe Logistics. After reviewing your application, we are unable to proceed at this time.\n\n${reason ? `Reason: ${reason}\n\n` : ""}Please contact us if you have questions.\n\nDeluxe Logistics Inc.`,
  }, { template: "rejection_email", entityType: "rental_application", entityId: rawApp.id });
}

// ── 4. COI Request email ────────────────────────────────────────────────────
export async function sendCOIRequest(rawApp: ApplicationData): Promise<void> {
  const app = escApp(rawApp);

  const html = emailTemplate("Certificate of Insurance Required", `
    <p>Hi ${app.ownerName},</p>
    <p>Your rental application is progressing well. To finalize the review, we require a <strong>Certificate of Insurance (COI)</strong> naming Deluxe Logistics Inc. as an additional insured/certificate holder.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-weight: bold; color: #1e293b;">Certificate Holder Information:</p>
      <p style="margin: 0; font-family: monospace; font-size: 14px; line-height: 1.8; color: #334155;">
        ${COMPANY.name}<br/>${COMPANY.address}<br/>${COMPANY.city}, ${COMPANY.state} ${COMPANY.zip}
      </p>
    </div>
    <p>Please reply to this email with your COI attached, or email it to <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>. Once received, we will complete our review and get back to you within 24 hours.</p>
  `);

  await sendTracked({
    to: app.email,
    from: FROM,
    subject: "Action required: Certificate of Insurance for your rental application",
    html,
    text: `Hi ${app.ownerName},\n\nTo complete your rental application review, we require a Certificate of Insurance naming:\n\n${COMPANY.name}\n${COMPANY.address}\n${COMPANY.city}, ${COMPANY.state} ${COMPANY.zip}\n\nPlease reply to this email with the COI attached.\n\n${COMPANY.name}`,
  }, { template: "coi_request", entityType: "rental_application", entityId: rawApp.id });
}

// ── 5b. Invite email (after approval) ─────────────────────────────────────
export async function sendInviteEmail(email: string, ownerName: string, inviteToken: string, applicationId?: string): Promise<void> {
  const safeName = esc(ownerName);
  const registerUrl = `${domain()}/register/${inviteToken}`;

  const html = emailTemplate("Your Application Has Been Approved!", `
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
  `);

  await sendTracked({
    to: email,
    from: FROM,
    subject: "Your Deluxe Logistics rental application is approved — create your account",
    html,
    text: `Hi ${ownerName},\n\nYour rental application has been approved! Create your account here:\n${registerUrl}\n\nThis link expires in 48 hours.\n\nDeluxe Logistics Inc.`,
  }, { template: "invite_email", entityType: applicationId ? "rental_application" : undefined, entityId: applicationId });
}

// ── 5. More info request email ──────────────────────────────────────────────
export async function sendMoreInfoRequest(rawApp: ApplicationData, questions: string): Promise<void> {
  const app = escApp(rawApp);
  const safeQuestions = esc(questions);

  if (!rawApp.renterToken) {
    console.warn("[email] sendMoreInfoRequest: renterToken missing — skipping email to avoid broken response link");
    return;
  }
  const responseUrl = `${domain()}/applications/respond/${rawApp.renterToken}`;

  const html = emailTemplate("Additional Information Needed", `
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
  `);

  await sendTracked({
    to: app.email,
    from: FROM,
    subject: "Follow-up questions about your Deluxe Logistics rental application",
    html,
    text: `Hi ${app.ownerName},\n\nWe have a few follow-up questions about your rental application:\n\n${questions}\n\nRespond here: ${responseUrl}\n\nOr reply to this email with your answers.\n\nDeluxe Logistics Inc.`,
  }, { template: "more_info_request", entityType: "rental_application", entityId: rawApp.id });
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


  // Email to renter
  const renterHtml = emailTemplate("Rental Agreement Signed", `
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
  `);

  // Email to admin
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const adminHtml = emailTemplate("Agreement Signed — Action Required", `
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
  `);

  await Promise.allSettled([
    sendTracked({
      to: data.renterEmail,
      from: FROM,
      subject: "Your Deluxe Logistics rental agreement is signed",
      html: renterHtml,
      text: `Hi ${data.renterName},\n\nYour rental agreement has been signed. Summary:\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nRate: ${monthlyStr}\nSigned By: ${data.signedByName}\nDate: ${signedDate}\n\nDeluxe Logistics Inc.`,
    }, { template: "agreement_signed_renter", entityType: "rental", entityId: data.rentalId }),
    sendTracked({
      to: ADMIN_EMAIL,
      from: FROM,
      subject: `[ACTION NEEDED] Agreement signed — ${data.companyName} awaiting payment`,
      html: adminHtml,
      text: `${data.companyName} has signed their rental agreement.\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nRate: ${monthlyStr}\nSigned By: ${data.signedByName}\nDate: ${signedDate}${data.pickupDate ? `\nRequested Pickup: ${data.pickupDate.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}\n\nView: ${adminUrl}`,
    }, { template: "agreement_signed_admin", entityType: "rental", entityId: data.rentalId }),
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


  const html = emailTemplate("Your Rental Agreement is Ready to Sign", `
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
  `);

  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: `Action Required: Sign your rental agreement — ${data.trailerType} (${data.trailerVin})`,
    html,
    text: `Hi ${data.renterName},\n\nYour rental agreement for ${data.trailerType} VIN: ${data.trailerVin} is ready to sign.\n\nMonthly Rate: ${monthlyStr} — No Mileage Fees\n\nSign here: ${signUrl}\n\nDeluxe Logistics Inc.`,
  }, { template: "agreement_request", entityType: "rental", entityId: data.rentalId });
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


  const html = emailTemplate("Security Deposit Received", `
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
  `, "#22c55e");

  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Deposit Paid] ${data.companyName} — ${data.trailerType} rental now active`,
    html,
    text: `Security deposit received.\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly: ${monthlyStr}\nDeposit: $${((data.monthlyRate * 2) / 100).toLocaleString()}\n\nView: ${adminUrl}`,
  }, { template: "admin_deposit_notification", entityType: "rental", entityId: data.rentalId });
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
  // false when the deposit was taken without recorded renewal consent, so the
  // renter still has to start monthly billing from the dashboard
  subscriptionStarted?: boolean;
}

export async function sendDepositConfirmedEmail(data: DepositConfirmedData): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const monthlyStr = `$${(data.monthlyRate / 100).toLocaleString()}/month`;
  const dashboardUrl = `${domain()}/dashboard`;
  const subscriptionStarted = data.subscriptionStarted !== false;

  const html = emailTemplate("Your Rental is Now Active!", `
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
      ${subscriptionStarted
        ? `<li>Your first monthly charge of ${monthlyStr.replace("/month", "")} is due 30 days from today, then on the same day each month</li>`
        : `<li>Monthly billing is not set up yet: start it from your dashboard before pickup</li>`}
      <li>Track your rental status and documents in your dashboard</li>
    </ul>
    ${renewalTermsHtml(data.monthlyRate, dashboardUrl)}
    <a href="${dashboardUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Your Dashboard →
    </a>
  `, "#22c55e");

  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: `Your Deluxe Logistics rental is now active — ${data.trailerType} (${data.trailerVin})`,
    html,
    text: `Hi ${data.renterName},\n\nYour security deposit has been confirmed and your rental is now active!\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly Rate: ${monthlyStr}\n\n${subscriptionStarted ? "Your first monthly charge is due 30 days from today, then on the same day each month." : "Monthly billing is not set up yet: start it from your dashboard before pickup."}\n\n${renewalTermsText(data.monthlyRate, dashboardUrl)}\n\nLog in to your dashboard: ${dashboardUrl}\n\nDeluxe Logistics Inc.`,
  }, { template: "deposit_confirmed", entityType: "rental", entityId: data.rentalId });
}

// ── Renter requested subscription cancellation ───────────────────────────────
export interface SubscriptionCancelRequestedData {
  rentalId: string;
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerType: string;
  trailerVin: string;
  monthlyRate: number; // cents
  endsAt: Date;        // later of the Stripe period end and 30 days from the request
}

export async function sendSubscriptionCancelRequestedEmails(data: SubscriptionCancelRequestedData): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const monthlyStr = `$${(data.monthlyRate / 100).toLocaleString()}/month`;
  // Same zone as the dashboard, so the renter is told one date everywhere.
  const endStr = data.endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: COMPANY.timeZone });
  const dashboardUrl = `${domain()}/dashboard`;
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;

  const renterHtml = emailTemplate("Cancellation Received", `
    <p>Hi ${safeName},</p>
    <p>We received your request to stop monthly billing. Your request is binding and your subscription is now set to end on <strong>${endStr}</strong>, the later of the end of the current billing month and 30 days from your request.</p>
    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Trailer</td><td style="padding: 6px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Monthly Rate</td><td style="padding: 6px 0;">${monthlyStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Billing Ends</td><td style="padding: 6px 0; font-weight: bold; color: #ea580c;">${endStr}</td></tr>
      </table>
    </div>
    <p><strong>What this means:</strong></p>
    <ul style="color: #374151; font-size: 14px; padding-left: 20px; line-height: 2;">
      <li>Monthly rent stops after ${endStr}. A monthly renewal that falls before that date is billed in full; nothing is charged after it.</li>
      <li>The trailer must be returned by ${endStr} under your rental agreement.</li>
      <li>Amounts owed under the agreement, such as late fees, engine-hour charges or damage, may still apply.</li>
      <li>Your security deposit is handled as described in your rental agreement.</li>
    </ul>
    <p style="color: #374151; font-size: 14px;">${esc(CANCELLATION_POLICY)}</p>
    <p style="color: #64748b; font-size: 13px;">Questions? Reply to this email or contact ${COMPANY.email}.</p>
    <a href="${dashboardUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Your Dashboard →
    </a>
  `, "#f59e0b");

  const adminHtml = emailTemplate("Renter Requested Cancellation", `
    <p>A renter has asked to stop monthly billing. The Stripe subscription is set to cancel on the date below (the later of the period end and 30 days from the request); the rental stays active until then.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 5px 0; color: #64748b;">Company</td><td style="padding: 5px 0; font-weight: bold;">${safeCompany}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Renter</td><td style="padding: 5px 0;">${safeName} (${esc(data.renterEmail)})</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Trailer</td><td style="padding: 5px 0;">${safeType} — VIN: ${safeVin}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Monthly Rate</td><td style="padding: 5px 0;">${monthlyStr}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Billing Ends</td><td style="padding: 5px 0; font-weight: bold; color: #ea580c;">${endStr}</td></tr>
    </table>
    <p style="color: #374151; font-size: 14px;">Arrange the return for ${endStr} and process the deposit refund after inspection.</p>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
      View Rental →
    </a>
  `, "#f59e0b");

  await Promise.allSettled([
    sendTracked({
      to: data.renterEmail,
      from: FROM,
      subject: `Cancellation received — billing ends ${endStr} (${data.trailerType} ${data.trailerVin})`,
      html: renterHtml,
      text: `Hi ${data.renterName},\n\nWe received your request to stop monthly billing. Your request is binding and your subscription ends on ${endStr}, the later of the end of the current billing month and 30 days from your request.\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly Rate: ${monthlyStr}\n\nMonthly rent stops after ${endStr}. The trailer must be returned by ${endStr} under your rental agreement. Amounts owed under the agreement, such as late fees, engine-hour charges or damage, may still apply. Your security deposit is handled as described in your rental agreement.\n\n${CANCELLATION_POLICY}\n\nDashboard: ${dashboardUrl}\n\n${COMPANY.name}`,
    }, { template: "subscription_cancel_requested", entityType: "rental", entityId: data.rentalId }),
    sendTracked({
      to: ADMIN_EMAIL,
      from: FROM,
      subject: `[Cancellation] ${data.companyName} — ${data.trailerType} billing ends ${endStr}`,
      html: adminHtml,
      text: `Renter requested cancellation.\n\nCompany: ${data.companyName}\nRenter: ${data.renterName} (${data.renterEmail})\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nBilling ends: ${endStr}\n\nView: ${adminUrl}`,
    }, { template: "admin_subscription_cancel_requested", entityType: "rental", entityId: data.rentalId }),
  ]);
}

// ── Monthly billing started (dashboard Checkout path) ────────────────────────
// Sent from the checkout.session.completed webhook once the subscription the
// renter set up from the dashboard exists. Acknowledgment the renter keeps:
// the renewal terms they agreed to, the cancellation policy, dashboard link.
export interface SubscriptionStartedData {
  rentalId: string;
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerType: string;
  trailerVin: string;
  monthlyRate: number; // cents
  renewalTermsVersion: string | null;
}

export async function sendSubscriptionStartedEmail(data: SubscriptionStartedData): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const monthlyStr = `${formatMonthly(data.monthlyRate)}/month`;
  const dashboardUrl = `${domain()}/dashboard`;
  const versionNote = data.renewalTermsVersion ? ` You agreed to terms version ${esc(data.renewalTermsVersion)}.` : "";

  const html = emailTemplate("Monthly Billing Started", `
    <p>Hi ${safeName},</p>
    <p>Monthly billing for your trailer rental is now set up. This email is your copy of the terms you agreed to.${versionNote}</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Trailer</td><td style="padding: 6px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Monthly Rate</td><td style="padding: 6px 0; font-weight: bold;">${monthlyStr}</td></tr>
      </table>
    </div>
    ${renewalTermsHtml(data.monthlyRate, dashboardUrl)}
    <p><strong>Cancellation policy:</strong> ${esc(CANCELLATION_POLICY)}</p>
    <a href="${dashboardUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Your Dashboard →
    </a>
  `);

  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: `Monthly billing started — ${data.trailerType} (${data.trailerVin})`,
    html,
    text: `Hi ${data.renterName},\n\nMonthly billing for your trailer rental is now set up. This email is your copy of the terms you agreed to.${data.renewalTermsVersion ? ` Terms version ${data.renewalTermsVersion}.` : ""}\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly Rate: ${monthlyStr}\n\n${renewalTermsText(data.monthlyRate, dashboardUrl)}\n\nCancellation policy: ${CANCELLATION_POLICY}\n\nDashboard: ${dashboardUrl}\n\n${COMPANY.name}`,
  }, { template: "subscription_started", entityType: "rental", entityId: data.rentalId });
}

// ── Admin: subscription not auto-created because consent is missing ─────────
export async function sendSubscriptionBlockedNoConsentAdminEmail(data: {
  rentalId: string;
  companyName: string;
  trailerType: string;
  trailerVin: string;
  monthlyRate: number; // cents
}): Promise<void> {
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const monthlyStr = `${formatMonthly(data.monthlyRate)}/month`;

  const html = emailTemplate("Subscription Not Started: No Renewal Consent", `
    <p>The deposit for this rental was confirmed, but the rental has no recorded consent to automatic monthly renewal, so no Stripe subscription was created. The rental is active without monthly billing.</p>
    <p>The renter can start monthly billing from their dashboard (that path records consent first). Do not create the subscription by hand until consent is on file.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 5px 0; color: #64748b;">Company</td><td style="padding: 5px 0; font-weight: bold;">${esc(data.companyName)}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Trailer</td><td style="padding: 5px 0;">${esc(data.trailerType)} — VIN: ${esc(data.trailerVin)}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Monthly Rate</td><td style="padding: 5px 0;">${monthlyStr}</td></tr>
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
      View Rental →
    </a>
  `, "#f59e0b");

  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Action] ${data.companyName} — deposit paid, no renewal consent, subscription not started`,
    html,
    text: `Deposit confirmed but no renewal consent is recorded, so no subscription was created.\n\nCompany: ${data.companyName}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nMonthly: ${monthlyStr}\n\nThe renter can start monthly billing from their dashboard.\n\nView: ${adminUrl}`,
  }, { template: "admin_subscription_blocked_no_consent", entityType: "rental", entityId: data.rentalId });
}

// ── Admin: a second live subscription was created for a rental ──────────────
export async function sendDuplicateSubscriptionAdminEmail(data: {
  rentalId: string;
  companyName: string;
  keptSubscriptionId: string;
  duplicateSubscriptionId: string;
}): Promise<void> {
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const html = emailTemplate("Duplicate Subscription Needs Attention", `
    <p>A second Stripe subscription was created for a rental that already had a live one. The app kept the existing subscription and did <strong>not</strong> attach the new one, so the new one is billing with nothing in the app pointing at it.</p>
    <p>In the Stripe dashboard: cancel the duplicate and refund any charge it made.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 5px 0; color: #64748b;">Company</td><td style="padding: 5px 0; font-weight: bold;">${esc(data.companyName)}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Kept</td><td style="padding: 5px 0; font-family: monospace;">${esc(data.keptSubscriptionId)}</td></tr>
      <tr><td style="padding: 5px 0; color: #64748b;">Duplicate (cancel + refund)</td><td style="padding: 5px 0; font-family: monospace; color: #b91c1c;">${esc(data.duplicateSubscriptionId)}</td></tr>
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
      View Rental →
    </a>
  `, "#b91c1c");

  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Action] ${data.companyName} — duplicate Stripe subscription ${data.duplicateSubscriptionId}`,
    html,
    text: `A second Stripe subscription was created for a rental that already had a live one.\n\nCompany: ${data.companyName}\nKept: ${data.keptSubscriptionId}\nDuplicate (cancel + refund in Stripe): ${data.duplicateSubscriptionId}\n\nView: ${adminUrl}`,
  }, { template: "admin_duplicate_subscription", entityType: "rental", entityId: data.rentalId });
}

// ── Monthly invoice email ─────────────────────────────────────────────────────
export interface MonthlyInvoiceEmailData {
  rentalId?: string;
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerType: string;
  trailerVin: string;
  amount: number;         // cents
  monthlyRate: number;    // cents; the recurring rate the renewal terms quote
  invoiceUrl: string | null;
  pdfUrl: string | null;
  billingPeriod?: string; // e.g. "May 2026"
}

export async function sendMonthlyInvoiceEmail(data: MonthlyInvoiceEmailData): Promise<void> {

  const safeName    = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeType    = esc(data.trailerType);
  const safeVin     = esc(data.trailerVin);
  const amountStr   = `$${(data.amount / 100).toLocaleString()}`;
  const period      = data.billingPeriod ? esc(data.billingPeriod) : "this month";
  const dashUrl     = `${domain()}/dashboard`;

  const html = emailTemplate("Monthly Invoice", `
    <p>Hi ${safeName},</p>
    <p>Your monthly rental invoice for <strong>${period}</strong> is ready.</p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN ${safeVin}</td></tr>
        <tr style="border-top: 1px solid #e2e8f0;">
          <td style="padding: 8px 0 4px; font-weight: bold; color: #1e293b;">Amount Due</td>
          <td style="padding: 8px 0 4px; font-weight: bold; font-size: 18px; color: #f59e0b;">${amountStr}</td>
        </tr>
      </table>
    </div>
    ${data.invoiceUrl ? `<a href="${esc(data.invoiceUrl)}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">View &amp; Pay Invoice →</a>` : ""}
    <p style="color: #64748b; font-size: 13px;">You can also view your payment history in your <a href="${dashUrl}" style="color: #e63946;">dashboard</a>.</p>
    ${renewalTermsHtml(data.monthlyRate, dashUrl)}
  `, "#f59e0b");

  const rawPeriod = data.billingPeriod ?? "this month";
  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: `Invoice for ${rawPeriod} — ${data.trailerType} rental (${data.trailerVin})`,
    html,
    text: `Hi ${data.renterName},\n\nYour monthly rental invoice for ${rawPeriod} is ready.\n\nAmount: ${amountStr}\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\n${data.invoiceUrl ? `Pay here: ${data.invoiceUrl}\n\n` : ''}${renewalTermsText(data.monthlyRate, dashUrl)}\n\nQuestions? ${COMPANY.email}\n\n${COMPANY.name}`,
  }, { template: "monthly_invoice", entityType: data.rentalId ? "rental" : undefined, entityId: data.rentalId });
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
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const dateStr = esc(data.confirmedAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  const dashUrl = `${domain()}/dashboard`;

  const renterHtml = emailTemplate("Pickup Confirmed!", `
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
  `, "#22c55e");

  const adminHtml = emailTemplate("Pickup Confirmed via QR Scan", `
    <p><strong>${safeCompany}</strong> has scanned the pickup QR code and confirmed trailer receipt.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0;">${safeCompany}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Confirmed At</td><td style="padding: 4px 0; color: #16a34a;">${dateStr}</td></tr>
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Rental →</a>
  `, "#22c55e");

  await Promise.allSettled([
    sendTracked({ to: data.renterEmail, from: FROM, subject: `Pickup confirmed — ${data.trailerType} (${data.trailerVin})`, html: renterHtml, text: `Hi ${data.renterName},\n\nYour trailer pickup has been confirmed.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nPickup Time: ${dateStr}\n\nView your dashboard: ${dashUrl}\n\nDeluxe Logistics Inc.` }, { template: "pickup_confirmed_renter", entityType: "rental", entityId: data.rentalId }),
    sendTracked({ to: ADMIN_EMAIL, from: FROM, subject: `[Pickup] ${data.companyName} confirmed pickup via QR`, html: adminHtml, text: `${data.companyName} confirmed pickup via QR scan at ${dateStr}.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\nView: ${adminUrl}` }, { template: "pickup_confirmed_admin", entityType: "rental", entityId: data.rentalId }),
  ]);
}

export async function sendReturnConfirmedEmails(data: QREventData): Promise<void> {
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const dateStr = esc(data.confirmedAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  const dashUrl = `${domain()}/dashboard`;

  const renterHtml = emailTemplate("Return Confirmed — Thank You!", `
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
  `, "#3b82f6");

  const adminHtml = emailTemplate("Return Confirmed via QR Scan", `
    <p><strong>${safeCompany}</strong> has scanned the return QR code and confirmed trailer return. Rental is now <strong>completed</strong>.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0;">${safeCompany}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
      <tr><td style="padding: 4px 0; color: #64748b;">Return Time</td><td style="padding: 4px 0; color: #2563eb;">${dateStr}</td></tr>
    </table>
    <a href="${adminUrl}" style="display: inline-block; background: #e63946; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Rental →</a>
  `, "#3b82f6");

  await Promise.allSettled([
    sendTracked({ to: data.renterEmail, from: FROM, subject: `Return confirmed — ${data.trailerType} (${data.trailerVin}) — Thank you!`, html: renterHtml, text: `Hi ${data.renterName},\n\nYour trailer return has been confirmed.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nReturn Time: ${dateStr}\n\nThank you for choosing Deluxe Logistics!\n\nDeluxe Logistics Inc.` }, { template: "return_confirmed_renter", entityType: "rental", entityId: data.rentalId }),
    sendTracked({ to: ADMIN_EMAIL, from: FROM, subject: `[Return] ${data.companyName} returned trailer via QR`, html: adminHtml, text: `${data.companyName} confirmed return via QR scan at ${dateStr}.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\nView: ${adminUrl}` }, { template: "return_confirmed_admin", entityType: "rental", entityId: data.rentalId }),
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
  const dashboardUrl = `/dashboard/engine-hours/${data.rentalId}`;
  // Link to login with a redirect param so logged-out users land directly on the submission page
  const submitUrl = `${domain()}/login?redirect=${encodeURIComponent(dashboardUrl)}`;
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const prevReading = data.previousReading != null ? data.previousReading.toLocaleString() : "None";

  const html = emailTemplate("Engine Hour Reading Requested", `
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
  `);

  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: `Engine hour reading requested — ${data.trailerType} VIN ${data.trailerVin}`,
    html,
    text: `Hi ${data.renterName},\n\nDeluxe Logistics is requesting your current reefer engine hour reading.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nLast Reading: ${prevReading} hours\n\nSubmit here: ${submitUrl}\n\nDeluxe Logistics Inc.`,
  }, { template: "engine_hours_request", entityType: "rental", entityId: data.rentalId });
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
  const adminUrl = `${domain()}/admin/rentals/${data.rentalId}`;
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const chargeStr = data.calculatedCharge != null ? `$${(data.calculatedCharge / 100).toLocaleString()}` : "N/A";

  const html = emailTemplate("Engine Hours Submitted", `
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
  `);

  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[Engine Hours] ${data.companyName} submitted reading — ${chargeStr} due`,
    html,
    text: `${data.companyName} submitted an engine hour reading.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nReading: ${data.currentReading} hrs\nHours Used: ${data.hoursUsed ?? "N/A"}\nCharge: ${chargeStr}\n\nView: ${adminUrl}\n\nDeluxe Logistics Inc.`,
  }, { template: "engine_hours_received_admin", entityType: "rental", entityId: data.rentalId });
}

// ── Driver Application Emails ─────────────────────────────────────────────

export interface DriverApplicationEmailData {
  applicationId: string;
  fullName: string;
  email: string;
  phone: string;
  cdlNumber?: string;
  cdlClass: string;
  cdlState: string;
  yearsExperience: number;
  desiredPosition?: string | null;
  hasTwic: boolean;
  hasHazmat: boolean;
  hasTanker: boolean;
  coverLetter?: string | null;
  jobListingTitle?: string | null;
}

export async function sendDriverApplicationConfirmation(data: DriverApplicationEmailData): Promise<void> {
  const safeName = esc(data.fullName);
  const positionLabel = data.desiredPosition === "otr" ? "OTR" : data.desiredPosition === "regional" ? "Regional" : data.desiredPosition === "local" ? "Local" : "Any";
  const endorsements = [data.hasTwic && "TWIC", data.hasHazmat && "Hazmat", data.hasTanker && "Tanker"].filter(Boolean).join(", ") || "None";

  const html = emailTemplate("Application Received", `
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
    <p style="font-size: 13px; color: #64748b;">Questions? Reply to this email or contact us at jobs@trailers.rentals.</p>
    <p style="font-size: 13px; color: #64748b;">— The Deluxe Logistics Team</p>
  `);

  await sendTracked({
    to: data.email,
    from: FROM,
    subject: "We received your driver application — Deluxe Logistics",
    html,
    text: `Hi ${data.fullName},\n\nThank you for applying to drive for Deluxe Logistics. We'll review your application within 2 business days.\n\nCDL: Class ${data.cdlClass} (${data.cdlState})\nExperience: ${data.yearsExperience} year(s)\nPosition: ${positionLabel}\nEndorsements: ${endorsements}\n\nQuestions? Email jobs@trailers.rentals\n\n— Deluxe Logistics Inc.`,
  }, { template: "driver_application_confirmation", entityType: "driver_application", entityId: data.applicationId });
}

export async function sendDriverApplicationAdmin(data: DriverApplicationEmailData): Promise<void> {
  const safeName = esc(data.fullName);
  const adminUrl = `${domain()}/admin/driver-applications`;
  const positionLabel = data.desiredPosition === "otr" ? "OTR" : data.desiredPosition === "regional" ? "Regional" : data.desiredPosition === "local" ? "Local" : "Any";
  const endorsements = [data.hasTwic && "TWIC", data.hasHazmat && "Hazmat", data.hasTanker && "Tanker"].filter(Boolean).join(", ") || "None";

  const html = emailTemplate("New Driver Application", `
    <p><strong>${safeName}</strong> submitted a driver application.</p>
    ${data.jobListingTitle ? `<p style="color: #64748b; font-size: 13px;">Applied for: <strong>${esc(data.jobListingTitle)}</strong></p>` : ""}
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b; width: 40%;">Email</td><td style="padding: 4px 0;">${esc(data.email)}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Phone</td><td style="padding: 4px 0;">${esc(data.phone)}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">CDL Class</td><td style="padding: 4px 0;">Class ${esc(data.cdlClass)} — ${esc(data.cdlState)}</td></tr>
        ${data.cdlNumber ? `<tr><td style="padding: 4px 0; color: #64748b;">CDL Number</td><td style="padding: 4px 0; font-family: monospace;">${esc(data.cdlNumber)}</td></tr>` : ""}
        <tr><td style="padding: 4px 0; color: #64748b;">Experience</td><td style="padding: 4px 0;">${data.yearsExperience} year(s)</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Position</td><td style="padding: 4px 0;">${positionLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Endorsements</td><td style="padding: 4px 0;">${endorsements}</td></tr>
      </table>
    </div>
    ${data.coverLetter ? `
    <div style="background: #f8fafc; border-left: 4px solid #e63946; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
      <p style="font-size: 12px; font-weight: bold; color: #64748b; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.05em;">Applicant's Introduction</p>
      <p style="font-size: 14px; color: #1e293b; margin: 0; white-space: pre-line;">${esc(data.coverLetter)}</p>
    </div>` : ""}
    <a href="${esc(adminUrl)}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
      Review Application →
    </a>
  `);

  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    subject: `[New Driver Application] ${data.fullName} — Class ${data.cdlClass} CDL, ${data.yearsExperience} yrs exp`,
    html,
    text: `New driver application from ${data.fullName}${data.jobListingTitle ? ` (Position: ${data.jobListingTitle})` : ""}\n\nEmail: ${data.email}\nPhone: ${data.phone}\nCDL: Class ${data.cdlClass} (${data.cdlState})${data.cdlNumber ? `\nCDL Number: ${data.cdlNumber}` : ""}\nExperience: ${data.yearsExperience} yr(s)\nPosition: ${positionLabel}\nEndorsements: ${endorsements}${data.coverLetter ? `\n\nIntroduction:\n${data.coverLetter}` : ""}\n\nReview: ${adminUrl}\n\nDeluxe Logistics Inc.`,
  }, { template: "driver_application_admin", entityType: "driver_application", entityId: data.applicationId });
}

// ── Admin account setup email ───────────────────────────────────────────
export async function sendAdminSetupEmail(data: {
  email: string;
  firstName: string;
  lastName: string;
  inviteToken: string;
}): Promise<void> {
  const setupUrl = `${domain()}/register/admin/${data.inviteToken}`;
  const safeName = esc(data.firstName);

  const html = emailTemplate("Admin Account Setup", `
    <p>Hi ${safeName},</p>
    <p>You've been invited to join the Deluxe Logistics admin team. Click the link below to set your password and activate your account.</p>
    <p><strong>This invitation link expires in 7 days.</strong></p>
    <a href="${setupUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      Set Up Your Admin Account →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy and paste: <a href="${setupUrl}" style="color: #e63946;">${setupUrl}</a></p>
  `);

  await sendTracked({
    to: data.email,
    from: FROM,
    subject: "You've been invited to join the Deluxe Logistics admin team",
    html,
    text: `Hi ${data.firstName},\n\nYou've been invited to join the Deluxe Logistics admin portal. Set up your account here:\n${setupUrl}\n\nThis link expires in 7 days.\n\nDeluxe Logistics Inc.`,
  }, { template: "admin_setup_email" });
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
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);

  const html = emailTemplate("Trailer Registration Document", `
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
  `);

  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: `Trailer registration — ${data.trailerType} VIN ${data.trailerVin}`,
    html,
    text: `Hi ${data.renterName},\n\nYour trailer pickup has been confirmed. Here is your electronic registration:\n\n${data.registrationUrl}\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\nCompany: ${data.companyName}\n\nKeep a copy in your cab at all times.\n\nDeluxe Logistics Inc.`,
  }, { template: "registration_email" });
}

// ── Password Reset email ─────────────────────────────────────────────────────
export async function sendPasswordResetEmail(data: {
  email: string;
  firstName: string;
  resetToken: string;
}): Promise<void> {
  const resetUrl = `${domain()}/reset-password/${data.resetToken}`;
  const safeName = esc(data.firstName || "there");

  const html = emailTemplate("Reset Your Password", `
    <p>Hi ${safeName},</p>
    <p>We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
    <a href="${resetUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin: 16px 0;">
      Reset Password →
    </a>
    <p style="color: #64748b; font-size: 13px;">Or copy and paste: <a href="${resetUrl}" style="color: #e63946;">${resetUrl}</a></p>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
  `);

  await sendTracked({
    to: data.email,
    from: FROM,
    subject: "Reset your Deluxe Logistics password",
    html,
    text: `Hi ${data.firstName || "there"},\n\nClick here to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request a reset, ignore this email.\n\nDeluxe Logistics Inc.`,
  }, { template: "password_reset" });
}

// ── Return Reminder email ─────────────────────────────────────────────────────
export async function sendReturnReminderEmail(data: {
  renterEmail: string;
  renterName: string;
  companyName: string;
  trailerVin: string;
  trailerType: string;
  endDate: Date;
  daysUntilReturn: number;
  rentalId: string;
}): Promise<void> {
  const safeName = esc(data.renterName);
  const safeCompany = esc(data.companyName);
  const safeVin = esc(data.trailerVin);
  const safeType = esc(data.trailerType);
  const dateStr = esc(data.endDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
  const dashUrl = `${domain()}/dashboard`;
  const urgencyColor = data.daysUntilReturn <= 1 ? "#dc2626" : "#f59e0b";
  const urgencyLabel = data.daysUntilReturn <= 1 ? "Tomorrow" : `${data.daysUntilReturn} days`;

  const html = emailTemplate("Trailer Return Reminder", `
    <p>Hi ${safeName},</p>
    <p>This is a reminder that your trailer rental is scheduled to end <strong style="color: ${urgencyColor};">${urgencyLabel === "Tomorrow" ? "tomorrow" : `in ${data.daysUntilReturn} days`}</strong>.</p>
    <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; font-weight: bold;">${safeCompany}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Trailer</td><td style="padding: 4px 0;">${safeType} — VIN: ${safeVin}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Return Date</td><td style="padding: 4px 0; font-weight: bold; color: ${urgencyColor};">${dateStr}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Days Remaining</td><td style="padding: 4px 0; font-weight: bold; color: ${urgencyColor};">${urgencyLabel}</td></tr>
      </table>
    </div>
    <p>Please coordinate trailer return logistics with our team. If you need to extend your rental, contact us as soon as possible.</p>
    <a href="${dashUrl}" style="display: inline-block; background: #e63946; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 16px;">
      View Dashboard →
    </a>
  `, urgencyColor);

  const reminderSubject = `Reminder: Your trailer return is ${urgencyLabel === "Tomorrow" ? "tomorrow" : `in ${data.daysUntilReturn} days`} — ${safeType} VIN ${safeVin}`;
  await sendTracked({
    to: data.renterEmail,
    from: FROM,
    subject: reminderSubject,
    html,
    text: `Hi ${data.renterName},\n\nYour trailer rental ends in ${data.daysUntilReturn} day(s) on ${data.endDate.toLocaleDateString()}.\n\nTrailer: ${data.trailerType} VIN: ${data.trailerVin}\n\nPlease coordinate return logistics with our team.\n\nView dashboard: ${dashUrl}\n\nDeluxe Logistics Inc.`,
  }, { template: "return_reminder", entityType: "rental", entityId: data.rentalId });
}

export async function sendContactFormEmail(data: {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
}): Promise<void> {
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

  const contactSubject = `Contact form: ${data.subject} — from ${data.name}`;
  await sendTracked({
    to: ADMIN_EMAIL,
    from: FROM,
    replyTo: data.email,
    subject: contactSubject,
    html,
    text: `New contact form submission\n\nName: ${data.name}\nEmail: ${data.email}${data.phone ? `\nPhone: ${data.phone}` : ""}\nSubject: ${data.subject}\n\nMessage:\n${data.message}`,
  }, { template: "contact_form" });
}
