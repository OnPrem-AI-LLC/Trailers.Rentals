export default function HeroSection() {
  return (
    <section className="hero-bg text-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mb-8">
            <img 
              src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600" 
              alt="Professional fleet of semi-trailers at logistics facility" 
              className="mx-auto rounded-xl shadow-2xl w-full max-w-4xl h-80 object-cover"
              data-testid="img-hero-fleet"
            />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6" data-testid="text-hero-title">
            Elevate your trailer rental experience!
          </h1>
          
          <p className="text-xl md:text-2xl mb-8 text-white/90 max-w-3xl mx-auto" data-testid="text-hero-subtitle">
            Access one of the largest fleets in the nation with over 65,000 trailers at 40+ locations nationwide
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="#contact" 
              className="bg-white text-primary px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/90 transition-colors"
              data-testid="button-get-started"
            >
              Get Started Today
            </a>
            <a 
              href="#benefits" 
              className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-colors"
              data-testid="button-learn-more"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
