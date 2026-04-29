import { useAuth } from '@clerk/clerk-react';

export const useSocketToken = () => {
  const { getToken } = useAuth();
  
  const getSocketToken = async () => {
    try {
      const token = await getToken();
      return token;
    } catch (error) {
      console.error('Failed to get socket token:', error);
      return null;
    }
  };
  
  return { getSocketToken };
};
