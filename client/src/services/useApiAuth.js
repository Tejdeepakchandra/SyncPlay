import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import api from './api';

export const useApiAuth = () => {
  const { getToken, isSignedIn, isLoaded } = useClerkAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      if (!isLoaded) {
      } else {
      }
      return;
    }


    // Set up axios interceptor to include Clerk token
    const interceptor = api.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
        }
      } catch (error) {
        console.error('🔐 useApiAuth: Failed to get auth token:', error);
      }
      return config;
    });

    return () => {
      api.interceptors.request.eject(interceptor);
    };
  }, [getToken, isLoaded, isSignedIn]);
};
