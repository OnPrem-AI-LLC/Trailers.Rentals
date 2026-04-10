import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  MessageSquare,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  HelpCircle,
} from "lucide-react";
import type { RentalApplication, AdminNote } from "@shared/schema";

export default function ApplicationRespond() {
  const { id } = useParams();
  const { toast } = useToast();
  const [response, setResponse] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: app, isLoading, isError } = useQuery<Pick<RentalApplication, "id" | "companyName" | "ownerName" | "status">>({
    queryKey: ["/api/applications", id, "public"],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}/public`);
      if (!res.ok) throw new Error("Application not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: questions } = useQuery<{ body: string; createdAt: string | Date }[]>({
    queryKey: ["/api/applications", id, "questions"],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}/questions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && app?.status === "needs_info",
  });

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `/api/applications/${id}/respond`, { response: text });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to submit" }));
        throw new Error((err as { message: string }).message);
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Submission failed", description: message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto w-full px-4 py-12 space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !app) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Application not found</h2>
            <p className="text-muted-foreground text-sm">This link may have expired or the application ID is invalid.</p>
            <Link href="/">
              <Button variant="outline">Go to homepage</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (app.status !== "needs_info") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto" />
            <h2 className="text-xl font-bold">Response not needed</h2>
            <p className="text-muted-foreground text-sm">
              Your application is currently under review. No additional information is needed at this time.
            </p>
            <Link href="/">
              <Button variant="outline">Back to homepage</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-5 max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-950 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-black">Response submitted!</h2>
            <p className="text-muted-foreground">
              Our team will review your response and follow up with you within 24 hours.
            </p>
            <Link href="/">
              <Button className="bg-primary hover:bg-primary/90 text-white">
                Back to homepage
              </Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const latestQuestion = questions && questions.length > 0
    ? questions[0].body.replace(/^\[More Info Request\]\s*/, "")
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 mb-6 -ml-1">
            <ArrowLeft className="w-4 h-4" />
            Back to homepage
          </Button>
        </Link>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Follow-up Required</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Additional Information Needed</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hello {app.ownerName} — our team has a few follow-up questions about your rental application for {app.companyName}.
          </p>
        </div>

        {/* Questions from admin */}
        {latestQuestion && (
          <div className="bg-blue-950/30 border border-blue-800 rounded-xl p-5 mb-6">
            <div className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">Questions from our team</div>
            <p className="text-sm text-foreground whitespace-pre-line">{latestQuestion}</p>
          </div>
        )}

        {/* Response form */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="font-bold">Your Response</h2>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="response">Please answer the questions above *</Label>
            <Textarea
              id="response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Type your response here..."
              className="bg-background border-border resize-none"
              rows={8}
              required
            />
          </div>

          <Button
            onClick={() => response.trim() && mutation.mutate(response.trim())}
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
            disabled={!response.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Submit Response"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Your response will be reviewed by our team within 24 hours.
            If you have an urgent question, email us at{" "}
            <a href="mailto:info@deluxelogistics.com" className="text-primary hover:underline">
              info@deluxelogistics.com
            </a>.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
