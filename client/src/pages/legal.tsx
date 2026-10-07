import Header from "@/components/header";
import Footer from "@/components/footer";
import { Building2, Mail, Scale, FileWarning } from "lucide-react";
import { COMPANY } from "@shared/constants";

// The title stays "Copyright Agent" so it matches what will be filed at
// dmca.copyright.gov; the page avoids calling it "our designated agent"
// until that filing exists. Contact details come from COMPANY so the
// address published here and the one on file cannot drift apart.
const DMCA_AGENT_NAME = "Copyright Agent, Deluxe Logistics Inc.";

// 17 U.S.C. 512(c)(2) requires the agent's telephone number both on the site
// and in the Copyright Office filing. COMPANY.phone is empty until Sam
// supplies it; the Telephone lines below are omitted while it is, and the
// safe harbour cannot be relied on until the number is published.
const PHONE: string = COMPANY.phone;

// The six elements a notification must contain under 17 U.S.C. 512(c)(3)(A).
const NOTICE_ELEMENTS = [
  "A physical or electronic signature of a person authorized to act on behalf of the owner of an exclusive right that is allegedly infringed.",
  "Identification of the copyrighted work claimed to have been infringed, or, if multiple works at a single online site are covered by a single notification, a representative list of such works at that site.",
  "Identification of the material that is claimed to be infringing or to be the subject of infringing activity and that is to be removed or access to which is to be disabled, and information reasonably sufficient to permit us to locate the material.",
  "Information reasonably sufficient to permit us to contact you, such as an address, telephone number, and, if available, an email address.",
  "A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.",
  "A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the owner of an exclusive right that is allegedly infringed.",
];

// What a counter-notification must contain under 17 U.S.C. 512(g)(3).
const COUNTER_NOTICE_ELEMENTS = [
  "Your physical or electronic signature.",
  "Identification of the material that was removed or disabled and the location at which it appeared before it was removed or disabled.",
  "A statement under penalty of perjury that you have a good faith belief the material was removed or disabled as a result of mistake or misidentification.",
  "Your name, address and telephone number, and a statement that you consent to the jurisdiction of the federal district court for the judicial district in which your address is located (or, if your address is outside the United States, for any judicial district in which Deluxe Logistics Inc. may be found).",
  "A statement that you will accept service of process from the person who submitted the original notice or their agent.",
];

export default function LegalPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      {/* Hero */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-16 pb-12 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(352 65% 20% / 0.3), transparent)",
          }}
        />
        <div className="max-w-3xl mx-auto relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-px bg-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Legal</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black leading-none tracking-tight mb-4">
            Legal notices
          </h1>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            Who operates this site, how to reach us, and how to report copyright infringement.
          </p>
        </div>
      </section>

      <div className="h-px bg-border mx-4 sm:mx-8 lg:mx-16" />

      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-10">

          {/* Operator */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm uppercase tracking-wider">Site operator</h2>
            </div>
            <div className="text-sm space-y-1">
              <p className="font-semibold">{COMPANY.name}</p>
              <p className="text-muted-foreground">{COMPANY.address}</p>
              <p className="text-muted-foreground">{COMPANY.city}, {COMPANY.state} {COMPANY.zip}</p>
              <p className="text-muted-foreground">United States</p>
              {PHONE !== "" && (
                <p className="text-muted-foreground">Telephone: {PHONE}</p>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm uppercase tracking-wider">Contact</h2>
            </div>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>
                General inquiries:{" "}
                <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">{COMPANY.email}</a>
              </p>
              <p>Office hours: {COMPANY.hours}</p>
              <p>Postal mail: {COMPANY.fullAddress}</p>
            </div>
          </div>

          {/* DMCA */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-black tracking-tight">Copyright infringement claims (DMCA)</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Deluxe Logistics Inc. respects the intellectual property rights of others. If you believe
              material on this site infringes a copyright you own or control, you may report it under the
              Digital Millennium Copyright Act, 17 U.S.C. 512. To report claimed infringement, send a
              written notification to the contact below.
            </p>

            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-bold text-sm uppercase tracking-wider mb-3">Copyright contact</h3>
              <div className="text-sm space-y-1">
                <p className="font-semibold">{DMCA_AGENT_NAME}</p>
                <p className="text-muted-foreground">{COMPANY.fullAddress}</p>
                {PHONE !== "" && (
                  <p className="text-muted-foreground">Telephone: {PHONE}</p>
                )}
                <p>
                  <a href={`mailto:${COMPANY.dmcaEmail}`} className="text-primary hover:underline">{COMPANY.dmcaEmail}</a>
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-3">What a takedown notice must contain</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Under 17 U.S.C. 512(c)(3), a notification is effective only if it is a written communication
                that includes substantially all of the following:
              </p>
              <ol className="space-y-3">
                {NOTICE_ELEMENTS.map((text, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-foreground/90 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground flex items-start gap-3">
              <FileWarning className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p>
                Under 17 U.S.C. 512(f), anyone who knowingly materially misrepresents that material is
                infringing, or that it was removed by mistake, may be liable for damages, including costs
                and attorneys' fees.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3">Counter-notices</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                If material you posted was removed or disabled in response to a notice and you believe
                this was a mistake or misidentification, you may send a counter-notification to the
                contact above. Counter-notices are handled under 17 U.S.C. 512(g) and must include:
              </p>
              <ol className="space-y-3 mb-4">
                {COUNTER_NOTICE_ELEMENTS.map((text, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-foreground/90 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
              <p className="text-sm text-muted-foreground leading-relaxed">
                On receipt of a valid counter-notice we will forward it to the original complainant and
                will restore the material not less than 10 nor more than 14 business days after we receive
                a valid counter-notice, unless the complainant first notifies us that it has filed a court
                action seeking to restrain the activity.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3">Repeat infringers</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Consistent with 17 U.S.C. 512(i), the accounts of renters who are repeat infringers are
                terminated in appropriate circumstances.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
