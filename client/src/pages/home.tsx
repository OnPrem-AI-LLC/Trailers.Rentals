import Header from "@/components/header.tsx";
import HeroSection from "@/components/hero-section.tsx";
import BenefitsSection from "@/components/benefits-section.tsx";
import FeaturesGrid from "@/components/features-grid.tsx";
import TestimonialSection from "@/components/testimonial-section.tsx";
import ContactForm from "@/components/contact-form.tsx";
import Footer from "@/components/footer.tsx";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <BenefitsSection />
      <FeaturesGrid />
      <TestimonialSection />
      <ContactForm />
      <Footer />
    </div>
  );
}
