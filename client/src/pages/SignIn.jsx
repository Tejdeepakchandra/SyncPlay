import { SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Film } from "lucide-react";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function SignInPage() {
  if (!CLERK_KEY) {
    return (
      <main className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Film className="w-7 h-7 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">Sign In Unavailable</h2>
          <p className="text-sm text-muted-foreground mb-4">Authentication is not configured for this instance.</p>
          <Link to="/" className="text-sm text-primary hover:underline">Back to Home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-md">
        <SignIn
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/"
        />
      </div>
    </main>
  );
}