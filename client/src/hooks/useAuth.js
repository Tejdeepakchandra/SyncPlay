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
      console.log('🔄 Query started. clerkLoaded:', clerkLoaded, 'sessionLoaded:', sessionLoaded, 'isSignedIn:', isSignedIn);
      
      // Wait for Clerk to load (session might not have isLoaded in some versions)
      if (!clerkLoaded) {
        console.log('⏳ Waiting for Clerk to load...');
        return null;
      }

      if (!isSignedIn) {
        console.log('❌ Not signed in, skipping user fetch');
        return null;
      }
      
      try {
        console.log('🔐 Getting token...');
        const token = await session?.getToken();
        if (!token) {
          console.log('❌ No token available yet');
          return null;
        }

        console.log('🔑 Token obtained:', token.substring(0, 20) + '...');
        console.log('📡 Making API call to /users/me');
        
        // The useApiAuth interceptor should add the token automatically
        const response = await api.get('/users/me');
        
        console.log('✅ User fetched successfully:', response.data?.data);
        return response.data?.data;
      } catch (error) {
        console.error('❌ Failed to fetch user');
        console.error('   Error Message:', error.message);
        console.error('   Error Code:', error.code);
        console.error('   Status:', error.response?.status);
        console.error('   Response Data:', error.response?.data);
        
        if (error.code === 'ECONNABORTED') {
          console.error('   💥 Request TIMED OUT after 30 seconds');
        } else if (!error.response) {
          console.error('   💥 No response from server - connection issue');
        }
        
        throw error;
      }
    },
    enabled: isSignedIn && clerkLoaded,
    retry: 2,
    retryDelay: 1000,
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