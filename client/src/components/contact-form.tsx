import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { insertContactRequestSchema, type InsertContactRequest, type Location } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Dynamic locations loaded from API

const interestOptions = [
  { value: "dry-vans", label: "Dry Vans" },
  { value: "reefers", label: "Reefers" },
  { value: "roll-door-vans", label: "Roll-door Vans" },
  { value: "lift-gates", label: "Lift Gates" },
  { value: "reefer-lift-gates", label: "Reefer Lift Gates" },
  { value: "flatbeds", label: "Flatbeds" },
  { value: "chassis", label: "Chassis" },
  { value: "specialized", label: "Specialized" },
  { value: "other", label: "Other" }
];

export default function ContactForm() {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const form = useForm<InsertContactRequest>({
    resolver: zodResolver(insertContactRequestSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      businessEmail: "",
      companyName: "",
      phoneNumber: "",
      dotNumber: "",
      primaryLocation: "",
      currentCustomer: "no",
      interests: [],
      message: "",
      newsletter: "false"
    }
  });

  const submitMutation = useMutation({
    mutationFn: async (data: InsertContactRequest) => {
      return apiRequest("POST", "/api/contact", data);
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Thank you for your interest! We'll contact you soon.",
      });
      form.reset();
      setSelectedInterests([]);
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: InsertContactRequest) => {
    submitMutation.mutate({ ...data, interests: selectedInterests });
  };

  const handleInterestChange = (value: string, checked: boolean) => {
    const newInterests = checked 
      ? [...selectedInterests, value]
      : selectedInterests.filter(item => item !== value);
    
    setSelectedInterests(newInterests);
    form.setValue("interests", newInterests);
  };

  return (
    <section id="contact" className="py-20 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4" data-testid="text-contact-title">
            Request Information
          </h2>
          <p className="text-xl text-muted-foreground" data-testid="text-contact-subtitle">
            Fill out the form today to discuss your trailer needs!
          </p>
        </div>
        
        <div className="bg-card border border-border rounded-xl shadow-lg p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-contact">
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-firstName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-lastName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="businessEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Email *</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-businessEmail" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-companyName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number *</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} data-testid="input-phoneNumber" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dotNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DOT Number *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-dotNumber" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="primaryLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select primary location *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-primaryLocation">
                          <SelectValue placeholder="Please Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locationsLoading ? (
                          <SelectItem value="loading">Loading locations...</SelectItem>
                        ) : (
                          locations.map((location) => (
                            <SelectItem key={location.id} value={location.name}>
                              {location.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="currentCustomer"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Are you a current Deluxe Logistics customer? *</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-2"
                        data-testid="radio-currentCustomer"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="yes" />
                          <Label htmlFor="yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="no" />
                          <Label htmlFor="no">No</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="unknown" id="unknown" />
                          <Label htmlFor="unknown">I don't know</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div>
                <Label className="text-sm font-medium mb-3 block">What are you interested in? *</Label>
                <div className="grid md:grid-cols-2 gap-2" data-testid="checkbox-interests">
                  {interestOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={option.value}
                        checked={selectedInterests.includes(option.value)}
                        onCheckedChange={(checked) => 
                          handleInterestChange(option.value, checked as boolean)
                        }
                        data-testid={`checkbox-interest-${option.value}`}
                      />
                      <Label htmlFor={option.value} className="text-sm">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
                {selectedInterests.length === 0 && form.formState.errors.interests && (
                  <p className="text-sm text-destructive mt-2">Please select at least one interest</p>
                )}
              </div>
              
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field}
                        value={field.value || ""}
                        placeholder="Anything else we should know?"
                        rows={4}
                        data-testid="textarea-message"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="newsletter"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value === "true"}
                        onCheckedChange={(checked) => 
                          field.onChange(checked ? "true" : "false")
                        }
                        data-testid="checkbox-newsletter"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm">
                        Yes! Send me the latest news from the Deluxe Logistics Behind the Wheel blog.
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              <div className="text-center">
                <Button 
                  type="submit" 
                  size="lg"
                  disabled={submitMutation.isPending}
                  className="px-12 py-4 text-lg"
                  data-testid="button-submit"
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </section>
  );
}
