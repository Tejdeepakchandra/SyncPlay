import { useState, useEffect, useCallback } from "react";
import { socket, connectSocket, getSocket } from "@/services/socket";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { saveRecentRoom, removeRecentRoom } from "@/utils/recentRooms";

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
  const [guestName, setGuestName] = useState(() => {
    // Restore guest name from session storage for page refresh
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`syncplay:guest:${String(roomCode || '').trim().toUpperCase()}`);
      return stored || null;
    }
    return null;
  });
  const [currentUserId, setCurrentUserId] = useState(null); // Track current user ID (Clerk ID or guest ID)

  useEffect(() => {
    if (!normalizedRoomCode) return;

    let cancelled = false;

    const initializeRoom = async () => {
      try {
        // Ensure socket is connected
        if (!socket.connected) {
          const token = user ? await getToken() : null;
          connectSocket(token);
          
          // Wait for socket to actually connect using event-based approach
          // This handles slow connections (cold Render servers, mobile networks)
          const connected = await new Promise((resolve) => {
            // If it connected during the await above, resolve immediately
            if (socket.connected) { resolve(true); return; }
            
            const timeout = setTimeout(() => {
              resolve(false);
            }, 15000); // 15 second timeout for cold server starts
            
            const onConnect = () => {
              clearTimeout(timeout);
              resolve(true);
            };
            
            // Listen for the connect event on the raw socket
            const rawSocket = getSocket();
            rawSocket.once('connect', onConnect);
            
            // Also check periodically in case the event was missed
            const checkInterval = setInterval(() => {
              if (socket.connected) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                rawSocket.off('connect', onConnect);
                resolve(true);
              }
            }, 500);
            
            // Cleanup on timeout
            setTimeout(() => clearInterval(checkInterval), 15500);
          });
          
          if (!connected || cancelled) {
            if (!cancelled) {
              console.error('❌ Socket failed to connect after waiting');
              setAccessStatus("error");
            }
            return;
          }
        }

        if (cancelled) return;

        // Request room state and try to join
        socket.emit("room:get-state", { roomCode: normalizedRoomCode }, (response) => {
          if (cancelled) return;
          if (!response || !response.success) {
            console.error('Failed to get room state:', response?.error || 'No response');
            setAccessStatus("not_found");
            return;
          }

          // Set current user ID from response
          if (response.userId) {
            setCurrentUserId(response.userId);
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
            // Get display name from user object or Clerk profile
            const displayName = user?.display_name || 
              (clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : null) ||
              user?.username || "User";
            socket.emit("room:join", { roomCode: normalizedRoomCode, guestName: displayName }, (joinResponse) => {
              if (cancelled) return;
              if (joinResponse && joinResponse.success) {
                if (joinResponse.userId) {
                  setCurrentUserId(joinResponse.userId);
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

                // Save to recent rooms for quick rejoin
                const r = joinResponse.room || response.room;
                if (r) {
                  saveRecentRoom({
                    roomCode: normalizedRoomCode,
                    name: r.name,
                    type: r.type,
                    hostName: r.host?.name || displayName,
                    hostEmoji: r.host?.avatarEmoji || "🧑",
                    role: joinResponse.isHost ? "host" : "participant",
                    privacy: r.settings?.privacy || r.privacy || "public",
                  });
                }
              } else {
                console.error('Failed to auto-join room:', joinResponse?.error || 'No response');
              }
            });
          } else if (guestName) {
            // Auto-rejoin as guest on page refresh (we have stored guest name)
            socket.emit("room:join", { roomCode: normalizedRoomCode, guestName }, (joinResponse) => {
              if (cancelled) return;
              if (joinResponse && joinResponse.success) {
                if (joinResponse.userId) setCurrentUserId(joinResponse.userId);
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
              }
            });
          }
        });
      } catch (error) {
        if (!cancelled) {
          console.error('Room initialization error:', error);
          setAccessStatus("error");
        }
      }
    };

    initializeRoom();

    // Listen for socket identification info (tells us the server-assigned userId)
    const handleSocketIdentify = (data) => {
      setCurrentUserId(data.userId);
    };

    socket.on('socket:identify', handleSocketIdentify);

    // Register socket reconnection handler
    // When socket reconnects, re-register all listeners
    const handleSocketReconnect = () => {
      // The listeners will be registered in the separate effect below
      // Just need to ensure they're available
    };

    socket.on('connect', handleSocketReconnect);

    return () => {
      cancelled = true;
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
    
    // Check if this acceptance is for the current room
    if (String(data.roomCode || '').toUpperCase() !== normalizedRoomCode) {
      return;
    }
    
    // Check if this acceptance is for the current socket user
    if (data.userId !== currentUserId) {
      return;
    }
    
    setJoinStatus("joined");
    
    // Emit join after approval, using the guest name they entered
    const joinName = guestName || "Guest";
    // For authenticated users, use their display name instead of guest name
    const finalName = user ? (user?.display_name || 
      (clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : null) ||
      user?.username || "User") : joinName;
    socket.emit("room:join", { roomCode: normalizedRoomCode, guestName: finalName }, (response) => {
      if (response?.success) {
        if (response.userId) {
          setCurrentUserId(response.userId);
        }
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
    
    setAccessStatus("rejected");
    setJoinStatus(null);
  }, [normalizedRoomCode, currentUserId]);

  const handleParticipantPermissionsUpdated = useCallback((data) => {
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

  const handleParticipantAudioState = useCallback((data) => {
    const targetUserId = data?.userId;
    if (!targetUserId) return;

    setParticipants((prev) =>
      prev.map((p) =>
        p.userId === targetUserId
          ? {
              ...p,
              audioEnabled: !!data.audioEnabled && !data.isMuted,
              speaking: !!data.isSpeaking,
            }
          : p
      )
    );
  }, []);

  const handleForceLeave = useCallback((data) => {
    setJoinStatus(null);
    setAccessStatus('not_found');
    setRoom(null);
    setParticipants([]);
    setJoinRequests([]);
    setWaitingUsers([]);
    setGuestName(null);
    sessionStorage.removeItem(`syncplay:guest:${normalizedRoomCode}`);
    setIsHost(false);
    removeRecentRoom(normalizedRoomCode);
  }, [normalizedRoomCode]);

  const handleRoomEnded = useCallback((data) => {
    if (data?.reason === 'auto_expired') {
      toast("Room Expired", {
        description: "You have completed 5 hrs in the room so the room ended automatically. Please create another room.",
        duration: 10000,
        icon: "🕒"
      });
    } else {
      toast("Room ended", {
        description: "The host has ended this room.",
        duration: 4000,
      });
    }
    
    setJoinStatus(null);
    setAccessStatus('not_found');
    setRoom(null);
    setParticipants([]);
    setJoinRequests([]);
    setWaitingUsers([]);
    setGuestName(null);
    sessionStorage.removeItem(`syncplay:guest:${normalizedRoomCode}`);
    setIsHost(false);
    removeRecentRoom(normalizedRoomCode);
  }, [normalizedRoomCode]);

  // Register socket event listeners - this runs whenever handlers change (which happens when dependencies change)
  useEffect(() => {


    socket.on("room:user-joined", handleParticipantJoined);
    socket.on("room:user-left", handleParticipantLeft);
    socket.on("room:new-host", handleNewHost);
    socket.on("room:join-request", handleJoinRequest);
    socket.on("room:join-accepted", handleJoinAccepted);
    socket.on("room:join-rejected", handleJoinRejected);
    socket.on("room:participant-permissions-updated", handleParticipantPermissionsUpdated);
    socket.on("room:participant-role-updated", handleRoleUpdated);
    socket.on("room:role-updated", handleRoleUpdated);
    socket.on("audio:participant-state", handleParticipantAudioState);
    socket.on("room:ended", handleRoomEnded);
    socket.on("room:force-leave", handleForceLeave);

    return () => {
      socket.off("room:user-joined", handleParticipantJoined);
      socket.off("room:user-left", handleParticipantLeft);
      socket.off("room:new-host", handleNewHost);
      socket.off("room:join-request", handleJoinRequest);
      socket.off("room:join-accepted", handleJoinAccepted);
      socket.off("room:join-rejected", handleJoinRejected);
      socket.off("room:participant-permissions-updated", handleParticipantPermissionsUpdated);
      socket.off("room:participant-role-updated", handleRoleUpdated);
      socket.off("room:role-updated", handleRoleUpdated);
      socket.off("audio:participant-state", handleParticipantAudioState);
      socket.off("room:ended", handleRoomEnded);
      socket.off("room:force-leave", handleForceLeave);
    };
  }, [handleParticipantJoined, handleParticipantLeft, handleNewHost, handleJoinRequest, handleJoinAccepted, handleJoinRejected, handleParticipantPermissionsUpdated, handleRoleUpdated, handleParticipantAudioState, handleRoomEnded, handleForceLeave]);

  // Function to join room with guest name
  const joinAsGuest = (guestNameInput) => {
    return new Promise((resolve, reject) => {
      setGuestName(guestNameInput);
      // Persist guest name for page refresh
      sessionStorage.setItem(`syncplay:guest:${normalizedRoomCode}`, guestNameInput);
      
      socket.emit("room:join", { roomCode: normalizedRoomCode, guestName: guestNameInput }, (response) => {
        
        if (!response.success) {
          reject(new Error(response.error || "Failed to join room"));
          return;
        }

        if (response.userId) {
          setCurrentUserId(response.userId);
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

          // Save to recent rooms for quick rejoin
          const r = response.room;
          if (r) {
            saveRecentRoom({
              roomCode: normalizedRoomCode,
              name: r.name,
              type: r.type,
              hostName: r.host?.name || "Host",
              hostEmoji: r.host?.avatarEmoji || "🧑",
              role: response.isHost ? "host" : "guest",
              privacy: r.settings?.privacy || r.privacy || "public",
            });
          }
          
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
          sessionStorage.removeItem(`syncplay:guest:${normalizedRoomCode}`);
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
          sessionStorage.removeItem(`syncplay:guest:${normalizedRoomCode}`);
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
    guestName,
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