export default function BenefitsSection() {
  const benefits = [
    "Real-time GPS tracking and cargo monitoring",
    "Refrigeration monitoring and remote control",
    "Fuel savings and CARB compliance with approved Aero devices",
    "Online customer dashboard for complete access to account information",
    "24/7 access to our RoadCARE roadside assistance team",
    "Our premier customer experience"
  ];

  return (
    <section id="benefits" className="py-20 bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <img 
              src="https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&h=600" 
              alt="Professional logistics warehouse operations with loading docks" 
              className="rounded-xl shadow-lg w-full h-auto"
              data-testid="img-logistics-operations"
            />
          </div>
          
          <div>
            <h2 className="text-4xl font-bold text-foreground mb-6" data-testid="text-benefits-title">
              Need to flex your fleet with semitrailer rentals or leases?
            </h2>
            
            <p className="text-lg text-muted-foreground mb-8" data-testid="text-benefits-description">
              Not only can our partners choose from an inventory of over 65,000 dry vans, flatbeds, reefers, chassis and specialized equipment at 40+ locations nationwide, they can also access trailers that are fitted with advanced equipment and a team that truly cares.
            </p>
            
            <h3 className="text-2xl font-semibold text-foreground mb-6" data-testid="text-benefits-subtitle">Take advantage of:</h3>
            
            <div className="space-y-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className="w-6 h-6 bg-primary rounded-full flex-shrink-0 mt-1" data-testid={`icon-benefit-${index}`}></div>
                  <p className="text-foreground" data-testid={`text-benefit-${index}`}>{benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
