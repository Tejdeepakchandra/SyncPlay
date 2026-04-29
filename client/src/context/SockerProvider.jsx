import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@clerk/clerk-react';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    let socketInstance = null;

    const initSocket = async () => {
      let token = null;
      
      if (isSignedIn) {
        try {
          token = await getToken();
        } catch (error) {
          console.error('Failed to get auth token:', error);
        }
      }

      socketInstance = io(import.meta.env.VITE_SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      socketInstance.on('connect', () => {
        setIsConnected(true);
      });

      socketInstance.on('disconnect', () => {
        setIsConnected(false);
      });

      socketInstance.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });

      setSocket(socketInstance);
    };

    initSocket();

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [getToken, isSignedIn]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};