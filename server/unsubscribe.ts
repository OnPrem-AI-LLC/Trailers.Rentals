import { createHmac, timingSafeEqual } from "crypto";
import { COMPANY } from "@shared/constants";

// Unsubscribe links are signed with a key derived from the session secret so
// a token proves the link came from one of our emails. Nothing is stored; the
// email is recovered from the token itself. The derivation keeps the session
// cookies and these links from sharing a raw key. Same dev fallback as
// server/index.ts, which refuses to boot outside development without a real
// SESSION_SECRET.
function secret(): string {
  return process.env.SESSION_SECRET ?? "deluxe-dev-only-not-for-prod";
}

let derivedKey: Buffer | null = null;
function key(): Buffer {
  if (!derivedKey) derivedKey = createHmac("sha256", secret()).update("deluxe-unsubscribe-v1").digest();
  return derivedKey;
}

function signature(email: string): string {
  return createHmac("sha256", key()).update(email).digest("hex").slice(0, 32);
}

/** token = base64url(email) + "." + first 32 hex chars of HMAC-SHA256(email, derived key) */
export function makeUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `${Buffer.from(normalized, "utf8").toString("base64url")}.${signature(normalized)}`;
}

/** Returns the email the token was issued for, or null if it is malformed or forged. */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || token.length - dot - 1 !== 32) return null;
  let email: string;
  try {
    email = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email || !email.includes("@")) return null;
  const expected = Buffer.from(signature(email), "hex");
  const given = Buffer.from(token.slice(dot + 1), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return email;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type UnsubscribePageState = "confirm" | "done" | "invalid";

/**
 * Minimal server-rendered page for GET/POST /unsubscribe/:token. No client
 * route. GET renders "confirm" with a single POST button so that link
 * scanners and mail-client prefetchers, which follow GETs, cannot unsubscribe
 * anyone by accident; POST renders "done".
 */
export function renderUnsubscribePage(opts: { state: UnsubscribePageState; email?: string; action?: string }): string {
  const email = escapeHtml(opts.email ?? "");
  const heading =
    opts.state === "done" ? "You're unsubscribed" :
    opts.state === "confirm" ? "Unsubscribe from marketing email?" :
    "This link isn't valid";
  const body =
    opts.state === "done"
      ? `<p><strong>${email}</strong> will receive no marketing email from ${COMPANY.name}.</p>
       <p>Service messages about an active rental (invoices, agreement, pickup and return notices) continue, because they are part of the rental itself.</p>`
    : opts.state === "confirm"
      ? `<p>Confirm to stop marketing email to <strong>${email}</strong>.</p>
       <p>Service messages about an active rental (invoices, agreement, pickup and return notices) continue, because they are part of the rental itself.</p>
       <form method="post" action="${escapeHtml(opts.action ?? "")}">
         <button type="submit">Unsubscribe</button>
       </form>`
      : `<p>The unsubscribe link is incomplete or has been altered. Open the link from the email again, or write to <a href="mailto:${COMPANY.email}">${COMPANY.email}</a> and we will remove you by hand.</p>`;
  const headingColor = opts.state === "invalid" ? "#e63946" : opts.state === "done" ? "#22c55e" : "#e5e7eb";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${heading} - ${COMPANY.name}</title>
<style>
  body { margin: 0; background: #0d0d10; color: #e5e7eb; font-family: Arial, Helvetica, sans-serif; }
  main { max-width: 560px; margin: 10vh auto; padding: 32px 24px; background: #15151a; border: 1px solid #2a2a33; border-radius: 8px; }
  h1 { font-size: 22px; margin: 0 0 16px; color: ${headingColor}; }
  p { line-height: 1.6; font-size: 15px; }
  a { color: #e63946; }
  button { background: #e63946; color: #fff; border: 0; border-radius: 6px; padding: 12px 24px; font-size: 15px; font-weight: bold; cursor: pointer; }
  footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a33; color: #9ca3af; font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  ${body}
  <footer>${COMPANY.name} &middot; ${COMPANY.fullAddress} &middot; <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></footer>
</main>
</body>
</html>`;
}
