import { useQuery } from "@tanstack/react-query";
import { type Feature } from "@shared/schema";

export default function FeaturesGrid() {
  const { data: features = [], isLoading } = useQuery<Feature[]>({
    queryKey: ['/api/features'],
  });

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
          {isLoading ? (
            <div className="feature-card bg-card border border-primary rounded-lg p-6 text-center" data-testid="card-feature-loading">
              <div className="text-4xl font-bold text-primary mb-2" data-testid="text-feature-loading">...</div>
              <h3 className="text-lg font-semibold text-card-foreground mb-2">Loading</h3>
              <p className="text-muted-foreground">Loading features...</p>
            </div>
          ) : (
            features.map((feature, index) => (
              <div 
                key={feature.id}
                className="feature-card bg-card border border-primary rounded-lg p-6 text-center"
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
            ))
          )}
        </div>
      </div>
    </section>
  );
}
