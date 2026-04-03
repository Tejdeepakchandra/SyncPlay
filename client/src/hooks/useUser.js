import { useUser as useClerkUser, useSession } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export const useUser = () => {
  const { user: clerkUser, isSignedIn, isLoaded } = useClerkUser();
  const { session } = useSession();

  const { data: dbUser, isLoading, refetch } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      if (!isSignedIn) return null;
      
      try {
        const token = await session?.getToken();
        const response = await api.get('/users/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        return response.data?.data;
      } catch (error) {
        console.error('Failed to fetch user:', error);
        return null;
      }
    },
    enabled: isSignedIn && isLoaded,
  });

  return {
    user: dbUser,
    clerkUser,
    isAuthenticated: isSignedIn,
    isLoading: isLoading || !isLoaded,
    refetchUser: refetch,
  };
};