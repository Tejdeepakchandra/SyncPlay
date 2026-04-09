import { useClerk, useUser, useSession } from '@clerk/clerk-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';

export const useAuth = () => {
  const { user: clerkUser, isSignedIn, isLoaded: clerkLoaded } = useUser();
  const { session, isLoaded: sessionLoaded } = useSession();
  const clerk = useClerk();
  const queryClient = useQueryClient();

  // Fetch user from our backend
  const { data: dbUser, isLoading: dbLoading, refetch, error: queryError } = useQuery({
    queryKey: ['currentUser', isSignedIn],
    queryFn: async () => {
      // Wait for Clerk to load
      if (!clerkLoaded) {
        return null;
      }

      if (!isSignedIn) {
        return null;
      }
      
      try {
        const token = await session?.getToken();
        if (!token) {
          return null;
        }

        // The useApiAuth interceptor should add the token automatically
        const response = await api.get('/users/me');
        
        return response.data?.data;
      } catch (error) {
        console.error('❌ Failed to fetch user:', error.message);
        // Don't throw - allow room creation to proceed with just Clerk auth
        return null;
      }
    },
    enabled: isSignedIn && clerkLoaded,
    retry: false, // /users/me is now instant, no need to retry
  });

  const signOut = async () => {
    await clerk.signOut();
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    queryClient.clear();
  };

  // Simpler loading logic - only wait for Clerk and actual DB loading
  const isLoading = !clerkLoaded || dbLoading;

  return {
    user: dbUser,
    clerkUser,
    isAuthenticated: isSignedIn,
    isLoading,
    isLoaded: clerkLoaded,
    clerkLoaded,
    sessionLoaded,
    dbLoading,
    error: queryError,
    signOut,
    refetchUser: refetch,
  };
};