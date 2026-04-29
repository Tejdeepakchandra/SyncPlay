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
        const payload = response.data?.data || {};

        return {
          ...payload,
          id: payload.id || payload.userId || payload.clerkId || clerkUser?.id || null,
          userId: payload.userId || payload.id || payload.clerkId || clerkUser?.id || null,
          clerkId: payload.clerkId || payload.userId || payload.id || clerkUser?.id || null,
          displayName: payload.displayName || clerkUser?.fullName || payload.username || 'User',
          username: payload.username || clerkUser?.username || 'user',
          avatar_emoji: payload.avatar_emoji || '🧑',
          bio: payload.bio || '',
          preferences: payload.preferences || {},
          stats: payload.stats || {},
        };
      } catch (error) {
        console.error('❌ Failed to fetch user:', error.message);
        // Don't throw - allow room creation to proceed with just Clerk auth
        return null;
      }
    },
    enabled: isSignedIn && clerkLoaded && sessionLoaded,
    retry: false, // /users/me is now instant, no need to retry
  });

  const updateProfile = async (updates = {}) => {
    const response = await api.put('/users/me', updates);
    const updated = response?.data?.data;

    queryClient.setQueryData(['currentUser', isSignedIn], (prev) => ({
      ...(prev || {}),
      ...(updated || {}),
      id: updated?.id || prev?.id,
      userId: updated?.userId || prev?.userId,
      clerkId: updated?.clerkId || prev?.clerkId,
    }));

    return updated;
  };

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
    isAuthenticated: Boolean(isSignedIn && clerkLoaded && sessionLoaded),
    isLoading,
    isLoaded: clerkLoaded,
    clerkLoaded,
    sessionLoaded,
    dbLoading,
    error: queryError,
    signOut,
    updateProfile,
    refetchUser: refetch,
  };
};