import { createContext, useContext } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useApiAuth } from '@/services/useApiAuth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const auth = useAuth();
  const { ready: apiReady } = useApiAuth(); // Set up API auth interceptor
  
  return (
    <AuthContext.Provider value={{ ...auth, apiReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};