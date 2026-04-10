import { useState, useEffect, useCallback } from "react";
import { socket, connectSocket } from "@/services/socket";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const useRoom = (roomCode) => {
  const { getToken, user, clerkUser } = useAuth();
  const normalizedRoomCode = String(roomCode || "").trim().toUpperCase();
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [accessStatus, setAccessStatus] = useState("loading");
  const [joinStatus, setJoinStatus] = useState(null); // "waiting_for_approval", "joined", null
  const [joinRequests, setJoinRequests] = useState([]); // For host
  const [waitingUsers, setWaitingUsers] = useState([]); // For host to see who's waiting
  const [guestName, setGuestName] = useState(null); // Store guest name for re-join after approval
  const [currentUserId, setCurrentUserId] = useState(null); // Track current user ID (Clerk ID or guest ID)

  useEffect(() => {
    if (!normalizedRoomCode) return;

    console.log('📍 [ROOM INIT] Starting room initialization:', {
      normalizedRoomCode,
      hasUser: !!user,
      userClerkId: user?.clerkId,
      socketConnected: socket.connected,
      socketUserId: socket.userId,
    });

    const initializeRoom = async () => {
      try {
        // Ensure socket is connected
        if (!socket.connected) {
          const token = user ? await getToken() : null;
          connectSocket(token);
          
          // Wait for socket to actually connect
          let attempts = 0;
          while (!socket.connected && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          if (!socket.connected) {
            console.error('❌ Socket failed to connect after waiting');
            setAccessStatus("error");
            return;
          }
        }

        console.log('✅ Socket connected, fetching room state...', normalizedRoomCode);

        // Request room state and try to join
        socket.emit("room:get-state", { roomCode: normalizedRoomCode }, (response) => {
          console.log('📨 Received room state response:', response);
          if (!response || !response.success) {
            console.error('Failed to get room state:', response?.error || 'No response');
            setAccessStatus("not_found");
            return;
          }

          // Set current user ID from response
          if (response.userId) {
            setCurrentUserId(response.userId);
            console.log('🔐 [ROOM] Set currentUserId from room:get-state:', response.userId);
          }

          setRoom(response.room);
          setParticipants(response.participants || []);
          setAccessStatus("granted");

          // Set waiting users and join requests if this is the host
          if (response.room.hostId === socket.userId) {
            setJoinRequests(response.room.joinRequests || []);
            setWaitingUsers(response.room.waitingUsers || []);
          }

          // AUTO-JOIN for authenticated users (host, signed-in users)
          // Guests need to see the GuestNameDialog first (handled in MovieRoom.jsx)
          if (user) {
            console.log('📨 Auto-joining authenticated user...');
            // Get display name from user object or Clerk profile
            const displayName = user?.display_name || 
              (clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : null) ||
              user?.username || "User";
            socket.emit("room:join", { roomCode: normalizedRoomCode, guestName: displayName }, (joinResponse) => {
              console.log('📨 Received room join response (auto-join):', joinResponse);
              if (joinResponse && joinResponse.success) {
                if (joinResponse.userId) {
                  setCurrentUserId(joinResponse.userId);
                  console.log('🔐 [ROOM] Set currentUserId from room:join:', joinResponse.userId);
                }

                if (joinResponse.status === "waiting_for_approval") {
                  setJoinStatus("waiting_for_approval");
                  setRoom(joinResponse.room || response.room || null);
                  setParticipants([]);
                  setIsHost(false);
                  return;
                }

                setJoinStatus("joined");
                setRoom(joinResponse.room || response.room || null);
                setParticipants(joinResponse.participants || []);
                setIsHost(!!joinResponse.isHost);
              } else {
                console.error('Failed to auto-join room:', joinResponse?.error || 'No response');
              }
            });
          }
        });
      } catch (error) {
        console.error('Room initialization error:', error);
        setAccessStatus("error");
      }
    };

    initializeRoom();

    // Listen for socket identification info (tells us the server-assigned userId)
    const handleSocketIdentify = (data) => {
      console.log('🔐 [SOCKET] Received socket identity:', {
        userId: data.userId,
        isGuest: data.isGuest,
        userRole: data.userRole
      });
      setCurrentUserId(data.userId);
      console.log('🔐 [SOCKET] Set currentUserId to:', data.userId);
    };

    socket.on('socket:identify', handleSocketIdentify);

    // Register socket reconnection handler
    // When socket reconnects, re-register all listeners
    const handleSocketReconnect = () => {
      console.log('🔌 [GUEST] Socket reconnected, re-registering listeners...');
      // The listeners will be registered in the separate effect below
      // Just need to ensure they're available
    };

    socket.on('connect', handleSocketReconnect);

    return () => {
      socket.off('socket:identify', handleSocketIdentify);
      socket.off('connect', handleSocketReconnect);
    };
  }, [normalizedRoomCode, getToken, user, clerkUser]);

  // Wrap all handlers with useCallback so they can be used in listener dependencies
  const handleParticipantJoined = useCallback((data) => {
    setParticipants((prev) => {
      const existingIndex = prev.findIndex((p) => p.userId === data.userId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          username: data.username,
          displayName: data.displayName,
          avatar: data.avatar,
          avatar_emoji: data.avatar_emoji || next[existingIndex].avatar_emoji || '🧑',
          role: data.role || next[existingIndex].role,
          status: "online",
        };
        return next;
      }

      const updated = [
        ...prev,
        {
          userId: data.userId,
          username: data.username,
          displayName: data.displayName,
          avatar: data.avatar,
          avatar_emoji: data.avatar_emoji || '🧑',
          role: "guest",
          status: "online",
        },
      ];
      // Also update room participant count
      setRoom((prevRoom) => {
        if (prevRoom) {
          return {
            ...prevRoom,
            participantCount: updated.length,
          };
        }
        return prevRoom;
      });
      return updated;
    });

    if (data.userId && data.userId !== currentUserId) {
      toast(`${data.displayName || data.username || 'Someone'} joined`, { duration: 1600 });
    }
  }, [currentUserId]);

  const handleParticipantLeft = useCallback((data) => {
    setParticipants((prev) => {
      const leavingParticipant = prev.find((p) => p.userId === data.userId);
      const updated = prev.filter((p) => p.userId !== data.userId);
      // Also update room participant count
      setRoom((prevRoom) => {
        if (prevRoom) {
          return {
            ...prevRoom,
            participantCount: updated.length,
          };
        }
        return prevRoom;
      });

      if (data.userId && data.userId !== currentUserId) {
        const name = leavingParticipant?.displayName || leavingParticipant?.username || 'A participant';
        const message = data.removedBy ? `${name} was removed by host` : `${name} left the room`;
        toast(message, { duration: 1800 });
      }

      return updated;
    });
  }, [currentUserId]);

  const handleNewHost = useCallback((data) => {
    const newHostId = data.newHostId;
    const previousHostId = data.previousHost;

    if (newHostId === socket.userId) {
      setIsHost(true);
    } else {
      setIsHost(false);
    }

    setRoom((prevRoom) => {
      if (!prevRoom) return prevRoom;
      return { ...prevRoom, hostId: newHostId };
    });

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.userId === newHostId) {
          return { ...p, role: 'host' };
        }
        if (previousHostId && p.userId === previousHostId && previousHostId !== newHostId) {
          return { ...p, role: 'co-host' };
        }
        return p;
      })
    );

    window.dispatchEvent(
      new CustomEvent('room:host-changed', {
        detail: {
          newHostId,
          previousHostId,
          reason: data.reason,
          restored: !!data.restored,
        },
      })
    );
  }, []);

  const handleJoinRequest = useCallback((data) => {
    console.log('📥 New join request:', data);
    setJoinRequests((prev) => [
      ...prev,
      {
        userId: data.userId,
        username: data.username,
        status: 'pending',
        requestedAt: new Date()
      }
    ]);
    setWaitingUsers((prev) => [
      ...prev,
      {
        userId: data.userId,
        username: data.username,
        displayName: data.username,
        joinRequestedAt: new Date()
      }
    ]);
  }, []);

  const handleJoinAccepted = useCallback((data) => {
    console.log('📥 [GUEST] Received room:join-accepted event:', {
      eventRoomCode: data.roomCode,
      currentRoomCode: normalizedRoomCode,
      eventUserId: data.userId,
      currentUserId: currentUserId,
      guestNameStored: guestName,
      message: data.message
    });
    
    // Check if this acceptance is for the current room
    if (String(data.roomCode || '').toUpperCase() !== normalizedRoomCode) {
      console.log('❌ [GUEST] Wrong room, ignoring acceptance');
      return;
    }
    
    // Check if this acceptance is for the current socket user
    if (data.userId !== currentUserId) {
      console.log(`❌ [GUEST] Wrong user (event: ${data.userId}, current: ${currentUserId}), ignoring`);
      return;
    }
    
    console.log('✅ [GUEST] Join request accepted! Now auto-joining room...', data);
    setJoinStatus("joined");
    
    // Emit join after approval, using the guest name they entered
    const joinName = guestName || "Guest";
    console.log(`📤 [GUEST] Emitting room:join with guestName: "${joinName}"`);
    // For authenticated users, use their display name instead of guest name
    const finalName = user ? (user?.display_name || 
      (clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : null) ||
      user?.username || "User") : joinName;
    socket.emit("room:join", { roomCode: normalizedRoomCode, guestName: finalName }, (response) => {
      console.log('📨 [GUEST] Auto-join response after acceptance:', response);
      if (response?.success) {
        if (response.userId) {
          setCurrentUserId(response.userId);
          console.log('🔐 [ROOM] Set currentUserId from room:join (after approval):', response.userId);
        }
        console.log('✅ [GUEST] Successfully joined room after approval');
        const participants = response.participants || [];
        setParticipants(participants);
        // Update room participant count
        setRoom((prevRoom) => {
          if (prevRoom) {
            return {
              ...prevRoom,
              participantCount: participants.length,
            };
          }
          return prevRoom;
        });
        setIsHost(response.isHost);
      } else {
        console.error('❌ [GUEST] Failed to auto-join after acceptance:', response?.error);
        setJoinStatus("waiting_for_approval"); // Reset state if join failed
      }
    });
  }, [normalizedRoomCode, guestName, currentUserId, user, clerkUser]);

  const handleJoinRejected = useCallback((data) => {
    // Check if this rejection is for the current room and user
    if (String(data.roomCode || '').toUpperCase() !== normalizedRoomCode) {
      return;
    }
    
    if (data.userId !== currentUserId) {
      return;
    }
    
    console.log('❌ Join request rejected:', data);
    setAccessStatus("rejected");
    setJoinStatus(null);
  }, [normalizedRoomCode, currentUserId]);

  const handleParticipantPermissionsUpdated = useCallback((data) => {
    console.log('🔐 Participant permissions updated:', data);
    const targetUserId = data.targetUserId || data.userId;

    // Keep local participant state aligned for all UI sections.
    setParticipants((prev) =>
      prev.map((p) =>
        p.userId === targetUserId
          ? {
              ...p,
              restrictions: data.restrictions || p.restrictions,
              permissions: data.permissions || p.permissions,
            }
          : p
      )
    );

    // Notify component about permission changes
    window.dispatchEvent(new CustomEvent('permission:updated', {
      detail: {
        targetUserId,
        restrictions: data.restrictions,
        permissions: data.permissions,
        updatedBy: data.updatedBy
      }
    }));
  }, []);

  const handleRoleUpdated = useCallback((data) => {
    console.log('👑 User role updated:', data);
    const targetUserId = data.targetUserId || data.userId;

    // Update participants list to reflect role change
    setParticipants((prev) =>
      prev.map((p) => 
        p.userId === targetUserId 
          ? { ...p, role: data.newRole }
          : p
      )
    );

    if (targetUserId === currentUserId) {
      setIsHost(data.newRole === 'host');
    }

    // Also dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('permission:role-updated', {
      detail: {
        targetUserId,
        newRole: data.newRole
      }
    }));
  }, [currentUserId]);

  const handleForceLeave = useCallback((data) => {
    console.warn('🚪 Forced to leave room:', data);
    setJoinStatus(null);
    setAccessStatus('not_found');
    setRoom(null);
    setParticipants([]);
    setJoinRequests([]);
    setWaitingUsers([]);
    setGuestName(null);
    setIsHost(false);
  }, []);

  const handleRoomEnded = useCallback((data) => {
    console.warn('🛑 Room ended:', data);
    setJoinStatus(null);
    setAccessStatus('not_found');
    setRoom(null);
    setParticipants([]);
    setJoinRequests([]);
    setWaitingUsers([]);
    setGuestName(null);
    setIsHost(false);
  }, []);

  // Register socket event listeners - this runs whenever handlers change (which happens when dependencies change)
  useEffect(() => {
    if (!socket.connected) {
      console.log('📡 [LISTENERS] Socket not connected yet, skipping listener registration');
      return;
    }

    console.log('📡 [LISTENERS] Registering socket event listeners...');

    socket.on("room:user-joined", handleParticipantJoined);
    socket.on("room:user-left", handleParticipantLeft);
    socket.on("room:new-host", handleNewHost);
    socket.on("room:join-request", handleJoinRequest);
    socket.on("room:join-accepted", handleJoinAccepted);
    socket.on("room:join-rejected", handleJoinRejected);
    socket.on("room:participant-permissions-updated", handleParticipantPermissionsUpdated);
    socket.on("room:participant-role-updated", handleRoleUpdated);
    socket.on("room:role-updated", handleRoleUpdated);
    socket.on("room:ended", handleRoomEnded);
    socket.on("room:force-leave", handleForceLeave);

    return () => {
      console.log('📡 [LISTENERS] Unregistering socket event listeners...');
      socket.off("room:user-joined", handleParticipantJoined);
      socket.off("room:user-left", handleParticipantLeft);
      socket.off("room:new-host", handleNewHost);
      socket.off("room:join-request", handleJoinRequest);
      socket.off("room:join-accepted", handleJoinAccepted);
      socket.off("room:join-rejected", handleJoinRejected);
      socket.off("room:participant-permissions-updated", handleParticipantPermissionsUpdated);
      socket.off("room:participant-role-updated", handleRoleUpdated);
      socket.off("room:role-updated", handleRoleUpdated);
      socket.off("room:ended", handleRoomEnded);
      socket.off("room:force-leave", handleForceLeave);
    };
  }, [handleParticipantJoined, handleParticipantLeft, handleNewHost, handleJoinRequest, handleJoinAccepted, handleJoinRejected, handleParticipantPermissionsUpdated, handleRoleUpdated, handleRoomEnded, handleForceLeave]);

  // Function to join room with guest name
  const joinAsGuest = (guestNameInput) => {
    return new Promise((resolve, reject) => {
      // Store the guest name for use if they're approved later and need to re-join
      setGuestName(guestNameInput);
      
      socket.emit("room:join", { roomCode: normalizedRoomCode, guestName: guestNameInput }, (response) => {
        console.log('📨 Join response:', response);
        
        if (!response.success) {
          reject(new Error(response.error || "Failed to join room"));
          return;
        }

        if (response.userId) {
          setCurrentUserId(response.userId);
          console.log('🔐 [ROOM] Set currentUserId from joinAsGuest:', response.userId);
        }

        if (response.status === "waiting_for_approval") {
          setJoinStatus("waiting_for_approval");
          setRoom(response.room);
          resolve({ status: "waiting_for_approval" });
        } else if (response.status === "joined") {
          setJoinStatus("joined");
          setRoom(response.room);
          setParticipants(response.participants || []);
          setIsHost(response.isHost);
          
          resolve({ status: "joined" });
        }
      });
    });
  };

  // Function for host to accept join request
  const acceptJoinRequest = (userId) => {
    return new Promise((resolve, reject) => {
      socket.emit("room:accept-join-request", { roomCode: normalizedRoomCode, userId }, (response) => {
        if (response.success) {
          setJoinRequests((prev) => 
            prev.map(jr => jr.userId === userId ? { ...jr, status: 'accepted' } : jr)
          );
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  };

  // Function for host to reject join request
  const rejectJoinRequest = (userId) => {
    return new Promise((resolve, reject) => {
      socket.emit("room:reject-join-request", { roomCode: normalizedRoomCode, userId }, (response) => {
        if (response.success) {
          setJoinRequests((prev) => 
            prev.map(jr => jr.userId === userId ? { ...jr, status: 'rejected' } : jr)
          );
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  };

  const leaveRoom = useCallback(() => {
    return new Promise((resolve, reject) => {
      socket.emit('room:leave', { roomCode: normalizedRoomCode }, (response) => {
        if (response?.success) {
          setJoinStatus(null);
          setParticipants([]);
          setJoinRequests([]);
          setWaitingUsers([]);
          setGuestName(null);
          setRoom(null);
          setIsHost(false);
          setAccessStatus('loading');
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to leave room'));
        }
      });
    });
  }, [normalizedRoomCode]);

  const endRoom = useCallback(() => {
    return new Promise((resolve, reject) => {
      socket.emit('room:end', { roomCode: normalizedRoomCode }, (response) => {
        if (response?.success) {
          setJoinStatus(null);
          setParticipants([]);
          setJoinRequests([]);
          setWaitingUsers([]);
          setGuestName(null);
          setRoom(null);
          setIsHost(false);
          setAccessStatus('loading');
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to end room'));
        }
      });
    });
  }, [normalizedRoomCode]);

  return { 
    room, 
    participants, 
    isHost, 
    accessStatus,
    joinStatus,
    joinRequests,
    waitingUsers,
    currentUserId,
    joinAsGuest,
    acceptJoinRequest,
    rejectJoinRequest,
    leaveRoom,
    endRoom,
  };
};