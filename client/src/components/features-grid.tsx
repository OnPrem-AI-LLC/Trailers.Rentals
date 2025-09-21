export default function FeaturesGrid() {
  const features = [
    {
      number: "65,000+",
      title: "Fleet Size",
      description: "Largest inventory of trailers nationwide"
    },
    {
      number: "40+",
      title: "Locations",
      description: "Strategic facilities across the nation"
    },
    {
      number: "24/7",
      title: "Support",
      description: "Round-the-clock roadside assistance"
    },
    {
      number: "GPS",
      title: "Tracking",
      description: "Real-time monitoring technology"
    }
  ];

  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4" data-testid="text-features-title">
            Industry-Leading Fleet & Service
          </h2>
          <p className="text-xl text-muted-foreground" data-testid="text-features-subtitle">
            Comprehensive solutions for your logistics needs
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="feature-card bg-card border border-border rounded-lg p-6 text-center"
              data-testid={`card-feature-${index}`}
            >
              <div className="text-4xl font-bold text-primary mb-2" data-testid={`text-feature-number-${index}`}>
                {feature.number}
              </div>
              <h3 className="text-lg font-semibold text-card-foreground mb-2" data-testid={`text-feature-title-${index}`}>
                {feature.title}
              </h3>
              <p className="text-muted-foreground" data-testid={`text-feature-description-${index}`}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
