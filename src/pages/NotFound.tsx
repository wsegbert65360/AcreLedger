import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/75 p-8 text-center shadow-sm">
        <p className="font-mono text-sm font-bold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          This page may have moved, or the address may be incorrect.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to fields
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
