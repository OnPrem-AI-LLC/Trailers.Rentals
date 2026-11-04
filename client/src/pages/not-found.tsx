import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { COMPANY } from "@shared/constants";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">404</p>
          <h1 className="text-3xl font-black tracking-tight">That page isn't here</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The link may be old, or the unit it pointed to is no longer listed.
            Every trailer available to rent right now is on the home page.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/#trailers">
              <Button className="bg-primary hover:bg-primary/90 text-white font-bold">Browse available trailers</Button>
            </Link>
            <a href={`mailto:${COMPANY.email}`}>
              <Button variant="outline">Email {COMPANY.email}</Button>
            </a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
