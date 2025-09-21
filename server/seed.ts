import { storage } from "./storage";

const locations = [
  "AL - Birmingham", "AZ - Phoenix", "CA - Fontana", "CA - Los Angeles", "CA - Stockton",
  "CO - Denver", "FL - Orlando", "FL - Tampa", "GA - Atlanta", "GA - Savannah",
  "IL - Chicago", "IN - Indianapolis", "KS - Kansas City", "KY - Louisville",
  "MA - Boston", "MD - Baltimore", "MI - Detroit", "MN - Minneapolis", "MO - St. Louis",
  "NC - Charlotte", "NJ - New Jersey", "NJ - New Jersey (South)", "NV - Reno",
  "OH - Cincinnati", "OH - Cleveland", "OH - Columbus", "OR - Portland",
  "PA - Allentown", "PA - Mechanicsburg", "PA - Pittsburgh", "SC - Greenville",
  "TN - Memphis", "TN - Nashville", "TX - Dallas", "TX - Fort Worth", "TX - Houston",
  "TX - Laredo", "TX - San Antonio", "UT - Salt Lake City", "VA - Richmond",
  "WA - Seattle", "WI - Milwaukee", "National / Corporate"
];

const benefits = [
  "Real-time GPS tracking and cargo monitoring",
  "Refrigeration monitoring and remote control", 
  "Fuel savings and CARB compliance with approved Aero devices",
  "Online customer dashboard for complete access to account information",
  "24/7 access to our RoadCARE roadside assistance team",
  "Our premier customer experience"
];

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

const testimonials = [
  {
    customerName: "ReedTMS Logistics",
    companyName: "ReedTMS Logistics",
    quote: "Deluxe Logistics Inc. transformed our operations with their reliable fleet and exceptional service. The GPS tracking and 24/7 support have been game-changers for our business.",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    displayOrder: "1"
  }
];

export async function seedDatabase() {
  console.log("Seeding database...");

  // Seed locations
  for (let i = 0; i < locations.length; i++) {
    await storage.createLocation({
      name: locations[i],
      displayOrder: String(i + 1)
    });
  }

  // Seed benefits  
  for (let i = 0; i < benefits.length; i++) {
    await storage.createBenefit({
      title: `Benefit ${i + 1}`,
      description: benefits[i],
      displayOrder: String(i + 1)
    });
  }

  // Seed features
  for (let i = 0; i < features.length; i++) {
    await storage.createFeature({
      ...features[i],
      displayOrder: String(i + 1)
    });
  }

  // Seed testimonials
  for (let i = 0; i < testimonials.length; i++) {
    await storage.createTestimonial({
      ...testimonials[i],
      displayOrder: String(i + 1)
    });
  }

  console.log("Database seeded successfully!");
}

// Run seeding when this file is executed directly
seedDatabase().catch(console.error);