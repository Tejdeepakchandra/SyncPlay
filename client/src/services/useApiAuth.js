import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import api from './api';

export const useApiAuth = () => {
  const { getToken, isSignedIn } = useClerkAuth();

  useEffect(() => {
    if (!isSignedIn) {
      console.log('🔐 useApiAuth: Not signed in, skipping interceptor setup');
      return;
    }

    console.log('🔐 useApiAuth: Setting up request interceptor');

    // Set up axios interceptor to include Clerk token
    const interceptor = api.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          console.log('🔐 useApiAuth: Adding token to request:', config.url);
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn('🔐 useApiAuth: No token available');
        }
      } catch (error) {
        console.error('🔐 useApiAuth: Failed to get auth token:', error);
      }
      return config;
    });

    return () => {
      console.log('🔐 useApiAuth: Removing request interceptor');
      api.interceptors.request.eject(interceptor);
    };
  }, [getToken, isSignedIn]);
};
