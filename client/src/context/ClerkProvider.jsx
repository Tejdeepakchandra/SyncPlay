import { ClerkProvider as ClerkProviderBase } from '@clerk/clerk-react';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const ClerkProvider = ({ children }) => {
  return (
    <ClerkProviderBase 
      publishableKey={clerkPubKey}
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      {children}
    </ClerkProviderBase>
  );
};