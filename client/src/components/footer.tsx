import logoPath from "@assets/Deluxe Logo_1758417985453.jpg";

export default function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <img 
                src={logoPath} 
                alt="Deluxe Logistics Inc. Logo" 
                className="w-10 h-10 object-contain"
                data-testid="img-footer-logo"
              />
              <div>
                <h3 className="text-xl font-bold" data-testid="text-footer-company-name">DELUXE</h3>
                <p className="text-sm opacity-90" data-testid="text-footer-company-tagline">LOGISTICS INC.</p>
              </div>
            </div>
            <p className="text-primary-foreground/80" data-testid="text-footer-description">
              Premier trailer rental and leasing solutions with 65,000+ vehicles nationwide.
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4" data-testid="text-footer-links-title">Quick Links</h4>
            <ul className="space-y-2">
              <li><a href="#services" className="text-primary-foreground/80 hover:text-primary-foreground" data-testid="link-footer-services">Services</a></li>
              <li><a href="#benefits" className="text-primary-foreground/80 hover:text-primary-foreground" data-testid="link-footer-fleet">Fleet</a></li>
              <li><a href="#contact" className="text-primary-foreground/80 hover:text-primary-foreground" data-testid="link-footer-contact">Contact</a></li>
              <li><a href="#" className="text-primary-foreground/80 hover:text-primary-foreground" data-testid="link-footer-locations">Locations</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4" data-testid="text-footer-contact-title">Contact Info</h4>
            <div className="space-y-2 text-primary-foreground/80">
              <p data-testid="text-footer-phone">24/7 Support: 1-800-DELUXE</p>
              <p data-testid="text-footer-email">Email: info@deluxelogistics.com</p>
              <p data-testid="text-footer-emergency">Emergency Roadside: 1-800-ROAD-CARE</p>
            </div>
          </div>
        </div>
        
        <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center">
          <p className="text-primary-foreground/60" data-testid="text-footer-copyright">
            © 2024 Deluxe Logistics Inc. All rights reserved. | Privacy Policy | Terms of Service
          </p>
        </div>
      </div>
    </footer>
  );
}
