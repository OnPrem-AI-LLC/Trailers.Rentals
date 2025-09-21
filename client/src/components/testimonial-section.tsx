import { Play } from "lucide-react";

export default function TestimonialSection() {
  return (
    <section className="py-20 bg-primary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold text-primary-foreground mb-8" data-testid="text-testimonial-title">
          Don't take our word for it. Watch the ReedTMS Logistics Case Study.
        </h2>
        
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="bg-muted rounded-lg h-64 flex items-center justify-center mb-6" data-testid="video-placeholder">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-primary-foreground" data-testid="icon-play" />
              </div>
              <p className="text-muted-foreground" data-testid="text-video-title">ReedTMS Logistics Case Study</p>
            </div>
          </div>
          
          <p className="text-muted-foreground italic" data-testid="text-testimonial-quote">
            "Deluxe Logistics Inc. transformed our operations with their reliable fleet and exceptional service. 
            The GPS tracking and 24/7 support have been game-changers for our business."
          </p>
        </div>
      </div>
    </section>
  );
}
