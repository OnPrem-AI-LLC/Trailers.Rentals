import { Link } from "wouter";
import logoPath from "@assets/Deluxe Logo_1758417985453.jpg";
import { COMPANY, YARD } from "@shared/constants";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-3">
              <img src={logoPath} alt="Deluxe Logistics" className="w-10 h-10 object-contain" />
              <div>
                <div className="text-sm font-black tracking-widest text-foreground">DELUXE</div>
                <div className="text-[9px] font-semibold tracking-[0.2em] text-muted-foreground -mt-0.5">
                  LOGISTICS INC.
                </div>
              </div>
            </Link>
            <p className="text-xs text-muted-foreground max-w-xs">
              Flat rates. Reefer hours included. No mileage fees. No BS.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-12">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rentals</div>
              <div className="space-y-1.5">
                <Link href="/#trailers">
                  <div className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">Available Trailers</div>
                </Link>
                <Link href="/login">
                  <div className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">Renter Login</div>
                </Link>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company</div>
              <div className="space-y-1.5">
                <Link href="/jobs">
                  <div className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">Driver Hiring</div>
                </Link>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div>Yard: {YARD.fullAddress}</div>
                <div>{YARD.landmark.charAt(0).toUpperCase() + YARD.landmark.slice(1)}</div>
                <a href={`mailto:${COMPANY.email}`} className="block hover:text-foreground">
                  {COMPANY.email}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Deluxe Logistics Inc. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            {/* Privacy policy and terms pages don't exist yet; link them here once they do. */}
            <Link href="/legal" className="hover:text-foreground">Legal</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
