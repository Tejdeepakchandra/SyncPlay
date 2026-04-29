import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import api from './api';

// Global flag so components can check if auth is attached
let _authReady = false;
export const isApiAuthReady = () => _authReady;

export const useApiAuth = () => {
  const { getToken, isSignedIn, isLoaded } = useClerkAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      _authReady = false;
      setReady(false);
      return;
    }

    if (!isSignedIn) {
      // Not signed in — auth is "ready" (just no token to attach)
      _authReady = true;
      setReady(true);
      return;
    }

    // Set up axios interceptor to include Clerk token
    const interceptor = api.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('🔐 useApiAuth: Failed to get auth token:', error);
      }
      return config;
    });

    _authReady = true;
    setReady(true);

    return () => {
      api.interceptors.request.eject(interceptor);
      _authReady = false;
      setReady(false);
    };
  }, [getToken, isLoaded, isSignedIn]);

  return { ready };
};
