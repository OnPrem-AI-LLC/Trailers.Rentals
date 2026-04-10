import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Truck,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle,
  ChevronDown,
  Loader2,
  BadgeCheck,
} from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const REQUIREMENTS = [
  "Valid Class A CDL",
  "Clean MVR (Motor Vehicle Record)",
  "Minimum 2 years OTR experience",
  "No DUI/DWI convictions",
  "Ability to pass DOT physical",
  "Must be authorized to work in the US",
];

const BENEFITS = [
  "Competitive per-mile rates",
  "No-touch freight available",
  "Consistent home-time schedule",
  "Late-model equipment",
  "Fuel card & ELD provided",
  "Direct deposit weekly",
];

const formSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(7, "Phone required"),
  cdlNumber: z.string().min(1, "CDL number required"),
  cdlState: z.string().length(2, "Select state"),
  cdlClass: z.enum(["A", "B", "C"]),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  desiredPosition: z.enum(["otr", "regional", "local"]).optional(),
  hasTwic: z.boolean().default(false),
  hasHazmat: z.boolean().default(false),
  hasTanker: z.boolean().default(false),
  references: z.string().max(1000).optional(),
  coverLetter: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Jobs() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      cdlNumber: "",
      cdlState: "",
      cdlClass: "A",
      yearsExperience: 0,
      desiredPosition: undefined,
      hasTwic: false,
      hasHazmat: false,
      hasTanker: false,
      references: "",
      coverLetter: "",
    },
  });

  const submitMut = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest("POST", "/api/driver-applications", values),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast({
        title: "Submission failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: FormValues) {
    submitMut.mutate(values);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-14 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(352 65% 20% / 0.35), transparent)",
          }}
        />
        <div className="max-w-5xl mx-auto relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-px bg-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">
              Now Hiring
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-black leading-none tracking-tight mb-5">
            Drive for{" "}
            <span className="text-primary">Deluxe.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
            We're looking for professional Class A CDL drivers who take pride in their work.
            Good equipment, fair pay, and a company that treats you like a professional.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Martinsburg, WV area
            </div>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              OTR & Regional routes
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Full-time positions
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-border mx-4 sm:mx-8 lg:mx-16" />

      {/* Requirements + Benefits */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 mb-14">
            <div>
              <h2 className="text-xl font-black mb-5">Requirements</h2>
              <ul className="space-y-3">
                {REQUIREMENTS.map((req) => (
                  <li key={req} className="flex items-start gap-3 text-sm text-foreground">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xl font-black mb-5">What We Offer</h2>
              <ul className="space-y-3">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-foreground">
                    <DollarSign className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Application */}
          {submitted ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <BadgeCheck className="w-14 h-14 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-black mb-2">Application Submitted!</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                We've received your application and sent a confirmation to your email. We review every
                application and will be in touch within 2 business days if you're a strong fit.
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Collapsed CTA header */}
              <button
                onClick={() => setFormOpen((o) => !o)}
                className="w-full flex items-center justify-between p-8 text-left hover:bg-muted/30 transition-colors"
              >
                <div>
                  <h2 className="text-2xl font-black mb-1">Ready to Apply?</h2>
                  <p className="text-muted-foreground text-sm">
                    Fill out the form below — takes about 3 minutes.
                  </p>
                </div>
                <ChevronDown
                  className={`w-6 h-6 text-muted-foreground transition-transform ${formOpen ? "rotate-180" : ""}`}
                />
              </button>

              {formOpen && (
                <div className="px-8 pb-8 border-t border-border">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-8">

                      {/* Personal Info */}
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">Personal Information</h3>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="fullName" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name *</FormLabel>
                              <FormControl><Input placeholder="John Smith" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="email" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email *</FormLabel>
                              <FormControl><Input type="email" placeholder="john@email.com" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="phone" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone *</FormLabel>
                              <FormControl><Input placeholder="(304) 555-0100" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="desiredPosition" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Desired Position</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select position" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="otr">OTR (Over the Road)</SelectItem>
                                  <SelectItem value="regional">Regional</SelectItem>
                                  <SelectItem value="local">Local</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </div>

                      {/* CDL Info */}
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">CDL Information</h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <FormField control={form.control} name="cdlClass" render={({ field }) => (
                            <FormItem>
                              <FormLabel>CDL Class *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Class" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="A">Class A</SelectItem>
                                  <SelectItem value="B">Class B</SelectItem>
                                  <SelectItem value="C">Class C</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="cdlState" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Issuing State *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="State" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {US_STATES.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="cdlNumber" render={({ field }) => (
                            <FormItem>
                              <FormLabel>CDL Number *</FormLabel>
                              <FormControl><Input placeholder="123456789" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="yearsExperience" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Years Experience *</FormLabel>
                              <FormControl><Input type="number" min={0} max={60} {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </div>

                      {/* Endorsements */}
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">Endorsements &amp; Credentials</h3>
                        <div className="flex flex-wrap gap-6">
                          <FormField control={form.control} name="hasTwic" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">TWIC Card</FormLabel>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="hasHazmat" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">Hazmat Endorsement</FormLabel>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="hasTanker" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">Tanker Endorsement</FormLabel>
                            </FormItem>
                          )} />
                        </div>
                      </div>

                      {/* References + Cover Letter */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="references" render={({ field }) => (
                          <FormItem>
                            <FormLabel>References</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Name, company, phone — one per line"
                                className="min-h-[120px] resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="coverLetter" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Brief Introduction</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Tell us a bit about yourself and why you want to drive for Deluxe..."
                                className="min-h-[120px] resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <Button
                        type="submit"
                        size="lg"
                        disabled={submitMut.isPending}
                        className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 h-12 px-10"
                      >
                        {submitMut.isPending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                        ) : (
                          <><Truck className="w-5 h-5" /> Submit Application</>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        We'll respond within 2 business days. No spam, ever.
                      </p>
                    </form>
                  </Form>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
