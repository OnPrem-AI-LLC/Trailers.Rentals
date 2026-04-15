import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Settings, Truck, Menu, X } from "lucide-react";
import logoPath from "@assets/Deluxe Logo_1758417985453.jpg";
import { useState } from "react";

export default function Header() {
  const { user, isAdmin, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src={logoPath}
              alt="Deluxe Logistics"
              className="logo-eagle"
            />
            <div>
              <div className="text-lg font-black tracking-widest text-foreground group-hover:text-primary transition-colors">
                DELUXE
              </div>
              <div className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground -mt-0.5">
                LOGISTICS INC.
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/#trailers">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                <Truck className="w-4 h-4" />
                Trailers
              </Button>
            </Link>
            <Link href="/services">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Services
              </Button>
            </Link>
            <Link href="/jobs">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Hiring
              </Button>
            </Link>

            <div className="w-px h-5 bg-border mx-2" />

            {user ? (
              <>
                {isAdmin ? (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                      <Settings className="w-4 h-4" />
                      Admin Portal
                    </Button>
                  </Link>
                ) : (
                  <Link href="/dashboard">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </Button>
                  </Link>
                )}
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-muted-foreground">
                    {user.firstName}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    className="text-muted-foreground hover:text-destructive h-8 w-8"
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Link href="/signup">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    Create Account
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-white">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-muted-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden py-3 border-t border-border space-y-1">
            <Link href="/#trailers" onClick={() => setMobileOpen(false)}>
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                <Truck className="w-4 h-4" /> Trailers
              </div>
            </Link>
            <Link href="/services" onClick={() => setMobileOpen(false)}>
              <div className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Services</div>
            </Link>
            <Link href="/jobs" onClick={() => setMobileOpen(false)}>
              <div className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Hiring</div>
            </Link>
            {user ? (
              <>
                <Link href={isAdmin ? "/admin" : "/dashboard"} onClick={() => setMobileOpen(false)}>
                  <div className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                    {isAdmin ? "Admin Portal" : "Dashboard"}
                  </div>
                </Link>
                <button
                  onClick={() => { handleLogout(); setMobileOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-destructive hover:text-destructive/80"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/signup" onClick={() => setMobileOpen(false)}>
                  <div className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Create Account
                  </div>
                </Link>
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <div className="px-3 py-2 text-sm font-medium text-primary">Sign In</div>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
