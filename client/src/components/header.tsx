import { Link } from "wouter";
import logoPath from "@assets/Deluxe Logo_1758417985453.jpg";

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center space-x-4">
            <img 
              src={logoPath} 
              alt="Deluxe Logistics Inc. Eagle Logo" 
              className="logo-eagle"
              data-testid="img-logo"
            />
            <div>
              <h1 className="text-2xl font-bold text-primary" data-testid="text-company-name">DELUXE</h1>
              <p className="text-sm text-muted-foreground font-medium" data-testid="text-company-tagline">LOGISTICS INC.</p>
            </div>
          </div>
          <nav className="hidden md:flex space-x-8">
            <a href="#services" className="text-foreground hover:text-primary font-medium" data-testid="link-services">Services</a>
            <a href="#about" className="text-foreground hover:text-primary font-medium" data-testid="link-about">About</a>
            <a href="#contact" className="text-foreground hover:text-primary font-medium" data-testid="link-contact">Contact</a>
            <a 
              href="tel:1-800-DELUXE" 
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90"
              data-testid="button-call-now"
            >
              Call Now
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
