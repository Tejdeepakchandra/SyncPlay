import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";

/**
 * WebRTC Mesh Networking Hook
 * Creates a full mesh network where every participant connects to every other
 * Used for video chat between all participants
 */

const ICE_SERVERS = {
  iceServers: [
    // STUN servers (free — for direct P2P when both clients have simple NAT)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    // TURN servers (relay — required when clients are behind symmetric NAT)
    // Metered.ca free-tier TURN servers (reliable, global PoPs)
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "cff36aa5a20e4ba148f3363f",
      credential: "oa+YPfTh4Xhp2uJc",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "cff36aa5a20e4ba148f3363f",
      credential: "oa+YPfTh4Xhp2uJc",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "cff36aa5a20e4ba148f3363f",
      credential: "oa+YPfTh4Xhp2uJc",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "cff36aa5a20e4ba148f3363f",
      credential: "oa+YPfTh4Xhp2uJc",
    },
  ],
  iceCandidatePoolSize: 6,
};

export const useWebRTCMesh = ({ roomCode, participantIds, localStream, enabled, userId, isHost = false }) => {
  const peersRef = useRef(new Map());
  const remoteMediaStreamsRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localStreamRef = useRef(null);
  const participantIdsRef = useRef(participantIds);
  const enabledRef = useRef(enabled);
  const userIdRef = useRef(userId);
  const isHostRef = useRef(isHost);
  const iceCandidateQueueRef = useRef(new Map()); // Queue candidates by peerId
  const pendingOffersRef = useRef(new Map()); // Queue offers when mesh is disabled
  const shouldInitiateRef = useRef(null);
  const createAndSendOfferRef = useRef(null);
  const closeAllPeersRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  
  // Stable handler refs - these prevent socket.off() from failing due to stale references
  const handlersRef = useRef({
    handleMeshJoin: null,
    handleMeshLeave: null,
    handleMeshOffer: null,
    handleMeshAnswer: null,
    handleMeshIceCandidate: null,
  });

  useEffect(() => {
    localStreamRef.current = localStream;
    participantIdsRef.current = participantIds;
    enabledRef.current = enabled;
    userIdRef.current = userId;
    isHostRef.current = isHost;
  }, [localStream, participantIds, enabled, userId, isHost, roomCode]);

  // Stream management
  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams((prev) => {
      const existingStream = prev.get(peerId);
      if (existingStream === stream) {
        return prev;
      }

      const next = new Map(prev);
      next.set(peerId, stream);
      return next;
    });
  };

  const removeRemoteStream = (peerId) => {
    remoteMediaStreamsRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  };

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    remoteMediaStreamsRef.current.clear();
    iceCandidateQueueRef.current.clear();
    setRemoteStreams(new Map());
  }, []);

  // Determine if we should initiate connection
  // Use ID patterns which are always reliable:
  // - Authenticated users (host/members): ID starts with "user_"
  // - Guests: ID starts with "guest-"
  // 
  // Rule: Authenticated users always initiate to guests
  // Between two authenticated users: lexicographic (stable tiebreaker)
  const shouldInitiate = useCallback((selfId, peerId) => {
    const iAmAuthenticated = selfId?.startsWith("user_");
    const theyAreGuest = peerId?.startsWith("guest-");
    const theyAreAuthenticated = peerId?.startsWith("user_");
    
    // If I'm authenticated and they're a guest → I initiate
    if (iAmAuthenticated && theyAreGuest) {
      return true;
    }
    
    // If they're authenticated and I'm a guest → They initiate, I wait
    if (theyAreAuthenticated && !iAmAuthenticated) {
      return false;
    }
    
    // Both authenticated or both guests → use lexicographic (stable tiebreaker)
    const result = selfId < peerId;
    return result;
  }, []);

  // Create peer connection for a participant
  const createPeer = useCallback((peerId) => {
    if (peersRef.current.has(peerId)) {
      return peersRef.current.get(peerId);
    }

    const myId = userIdRef.current;
    if (!myId) return null;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add local tracks
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      tracks.forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
    }

    // Handle remote tracks
    pc.ontrack = (e) => {

      // Keep a stable remote stream per peer and merge tracks into it.
      // This avoids replacing stream objects (which can interrupt hidden audio playback).
      let peerStream = remoteMediaStreamsRef.current.get(peerId);
      if (!peerStream) {
        peerStream = new MediaStream();
        remoteMediaStreamsRef.current.set(peerId, peerStream);
      }

      const alreadyHasTrack = peerStream.getTracks().some((t) => t.id === e.track.id);
      if (!alreadyHasTrack) {
        peerStream.addTrack(e.track);
      }

      e.track.onended = () => {
        const currentStream = remoteMediaStreamsRef.current.get(peerId);
        if (!currentStream) return;

        const trackStillExists = currentStream.getTracks().some((t) => t.id === e.track.id);
        if (trackStillExists) {
          currentStream.removeTrack(e.track);
        }

        if (currentStream.getTracks().length === 0) {
          removeRemoteStream(peerId);
          return;
        }

        addRemoteStream(peerId, currentStream);
      };

      addRemoteStream(peerId, peerStream);
    };

    // Handle negotiation needed (e.g. when track is added dynamically)
    // Use rollback to prevent m-line ordering errors on renegotiation
    let negotiating = false;
    pc.onnegotiationneeded = async () => {
      try {
        if (negotiating) return;
        negotiating = true;
        // Rollback if in unstable state to prevent m-line ordering error
        if (pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" });
        }
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") {
          negotiating = false;
          return;
        }
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          socket.emit("webrtc-mesh:offer", {
            roomCode,
            to: peerId,
            from: myId,
            sdp: pc.localDescription,
          });
        }
      } catch (err) {
        console.error("[WebRTC Mesh] ❌ Negotiation error:", err);
      } finally {
        negotiating = false;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc-mesh:ice-candidate", {
          roomCode,
          to: peerId,
          from: myId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    // Flush any queued ICE candidates for this peer
    if (iceCandidateQueueRef.current.has(peerId)) {
      const queuedCandidates = iceCandidateQueueRef.current.get(peerId);
      queuedCandidates.forEach((candidate) => {
        try {
          pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
        }
      });
      iceCandidateQueueRef.current.delete(peerId);
    }

    // Handle connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removeRemoteStream(peerId);
        peersRef.current.delete(peerId);
      }
    };

    // Log signaling state changes
    pc.onsignalingstatechange = () => {
    };

    // Log ICE connection state
    pc.oniceconnectionstatechange = () => {
    };

    return pc;
  }, [roomCode]);

  // Create and send offer
  const createAndSendOffer = useCallback(async (peerId) => {
    const myId = userIdRef.current;
    if (!myId) {
      console.error("[WebRTC Mesh] ❌ Missing myId for offer");
      return;
    }

    
    const pc = createPeer(peerId);
    if (!pc) {
      console.error(`[WebRTC Mesh] ❌ Failed to create peer connection for ${peerId}`);
      return;
    }

    if (pc.signalingState !== "stable") {
      return;
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);


      if (pc.localDescription) {
        socket.emit("webrtc-mesh:offer", {
          roomCode,
          to: peerId,
          from: myId,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error("[WebRTC Mesh] ❌ Offer error:", err);
    }
  }, [roomCode, createPeer]);

  useEffect(() => {
    shouldInitiateRef.current = shouldInitiate;
    createAndSendOfferRef.current = createAndSendOffer;
    closeAllPeersRef.current = closeAllPeers;
  }, [shouldInitiate, createAndSendOffer, closeAllPeers]);

  // When participantIds changes and we're enabled, process any new participants
  useEffect(() => {
    if (!enabledRef.current || !userIdRef.current || !localStreamRef.current || !roomCode) {
      return;
    }


    // Prune peers that are no longer participants
    const participantSet = new Set(participantIds || []);
    Array.from(peersRef.current.entries()).forEach(([peerId, pc]) => {
      if (!participantSet.has(peerId)) {
        try {
          pc.close();
        } catch (err) {
        }
        peersRef.current.delete(peerId);
        removeRemoteStream(peerId);
      }
    });

    // For new participants we don't have peer connections for yet
    (participantIds || []).forEach((participantId) => {
      if (participantId === userIdRef.current) return; // Skip self

      const existingPeer = peersRef.current.get(participantId);
      if (existingPeer) {
        // Peer already exists
        return;
      }

      
      // Only initiate if we should (use local function, not dependency)
      if (shouldInitiateRef.current?.(userIdRef.current, participantId)) {
        createAndSendOfferRef.current?.(participantId);
      } else {
      }
    });
  }, [participantIds, roomCode]);

  // Socket event handlers - wrapped in useCallback for stable references
  const handleMeshJoin = useCallback(({ from }) => {
    if (!localStreamRef.current || from === userIdRef.current) {
      return;
    }

    // Check if peer already exists - if so, skip (probably being setup by participantIds effect)
    const existingPeer = peersRef.current.get(from);
    if (existingPeer) {
      const iShouldInitiate = shouldInitiate(userIdRef.current, from);
      const isStuckInitiatorPeer =
        iShouldInitiate &&
        (existingPeer.signalingState === "have-local-offer" ||
          existingPeer.connectionState === "failed" ||
          existingPeer.connectionState === "disconnected" ||
          existingPeer.iceConnectionState === "failed" ||
          existingPeer.iceConnectionState === "disconnected");

      if (isStuckInitiatorPeer) {
        try {
          existingPeer.close();
        } catch (err) {
        }
        peersRef.current.delete(from);
        createAndSendOffer(from);
        return;
      }

      return;
    }

    // Use deterministic initiator selection - no timeouts to avoid bidirectional offers
    if (shouldInitiate(userIdRef.current, from)) {
      createAndSendOffer(from);
    } else {
    }
  }, [createAndSendOffer, shouldInitiate]);

  const handleMeshOffer = useCallback(async ({ from, to, sdp }) => {
    if (to !== userIdRef.current) {
      return;
    }

    if (from === userIdRef.current) {
      return;
    }

    
    if (!enabledRef.current) {
      pendingOffersRef.current.set(from, { from, to, sdp });
      return;
    }

    if (!localStreamRef.current) {
      pendingOffersRef.current.set(from, { from, to, sdp });
      return;
    }

    const pc = createPeer(from);
    if (!pc) {
      console.error(`[WebRTC Mesh] ❌ Failed to create peer for offer from ${from}`);
      return;
    }

    
    if (pc.signalingState !== "stable") {
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (pc.localDescription) {
        socket.emit("webrtc-mesh:answer", {
          roomCode,
          to: from,
          from: userIdRef.current,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error(`[WebRTC Mesh] ❌ Offer handling error:`, err);
    }
  }, [roomCode, createPeer]);

  const handleMeshLeave = useCallback(({ from }) => {
    if (!from || from === userIdRef.current) {
      return;
    }

    const existingPeer = peersRef.current.get(from);
    if (existingPeer) {
      try {
        existingPeer.close();
      } catch (err) {
      }
      peersRef.current.delete(from);
    }
    removeRemoteStream(from);
    iceCandidateQueueRef.current.delete(from);
    pendingOffersRef.current.delete(from);
  }, []);

  // Process any offers that arrived before mesh was enabled/stream-ready
  useEffect(() => {
    if (!enabled || !localStream || !userIdRef.current || pendingOffersRef.current.size === 0) {
      return;
    }

    const queuedOffers = Array.from(pendingOffersRef.current.values());
    pendingOffersRef.current.clear();

    queuedOffers.forEach((offerPayload) => {
      handleMeshOffer(offerPayload);
    });
  }, [enabled, localStream, handleMeshOffer]);

  const handleMeshAnswer = useCallback(async ({ from, to, sdp }) => {
    if (to !== userIdRef.current) {
      return;
    }

    if (from === userIdRef.current) {
      return;
    }

    
    if (!enabledRef.current) {
      return;
    }

    const pc = peersRef.current.get(from);
    if (!pc) {
      console.error(`[WebRTC Mesh] ❌ No peer connection for answer from ${from}`);
      return;
    }
    
    if (pc.signalingState !== "have-local-offer") {
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error(`[WebRTC Mesh] ❌ Answer handling error:`, err);
    }
  }, []);

  const handleMeshIceCandidate = useCallback(({ from, to, candidate }) => {
    if (to !== userIdRef.current || from === userIdRef.current) {
      return;
    }

    const pc = peersRef.current.get(from);
    if (!pc) {
      if (!iceCandidateQueueRef.current.has(from)) {
        iceCandidateQueueRef.current.set(from, []);
      }
      iceCandidateQueueRef.current.get(from).push(candidate);
      return;
    }

    try {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
    }
  }, []);

  // Update handler refs with current implementations
  // This ensures socket listeners always have stable references that call the current handler logic
  useEffect(() => {
    handlersRef.current = {
      handleMeshJoin,
      handleMeshLeave,
      handleMeshOffer,
      handleMeshAnswer,
      handleMeshIceCandidate,
    };
  }, [handleMeshJoin, handleMeshLeave, handleMeshOffer, handleMeshAnswer, handleMeshIceCandidate]);

  // Setup Socket.IO listeners
  useEffect(() => {
    
    if (!roomCode || !userId || !enabled) {
      return;
    }

    const myId = userId;

    // Use stable wrapper functions that always look up current handlers from ref
    // This prevents socket.off() from failing due to stale function references
    const wrappedJoinHandler = (data) => handlersRef.current.handleMeshJoin(data);
    const wrappedLeaveHandler = (data) => handlersRef.current.handleMeshLeave(data);
    const wrappedOfferHandler = (data) => handlersRef.current.handleMeshOffer(data);
    const wrappedAnswerHandler = (data) => handlersRef.current.handleMeshAnswer(data);
    const wrappedCandidateHandler = (data) => handlersRef.current.handleMeshIceCandidate(data);

    // Register listeners using wrapped handlers
    socket.on("webrtc-mesh:join", wrappedJoinHandler);
    socket.on("webrtc-mesh:leave", wrappedLeaveHandler);
    socket.on("webrtc-mesh:offer", wrappedOfferHandler);
    socket.on("webrtc-mesh:answer", wrappedAnswerHandler);
    socket.on("webrtc-mesh:ice-candidate", wrappedCandidateHandler);

    const handleReconnect = () => {
      const reconnectUserId = userIdRef.current;
      if (!roomCode || !reconnectUserId || !enabledRef.current) return;

      closeAllPeersRef.current?.();
      socket.emit("webrtc-mesh:join", { roomCode, from: reconnectUserId });

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        (participantIdsRef.current || []).forEach((participantId) => {
          if (participantId === reconnectUserId) return;
          if (shouldInitiateRef.current?.(reconnectUserId, participantId)) {
            createAndSendOfferRef.current?.(participantId);
          }
        });
      }, 180);
    };

    const handleDisconnect = () => {
      if (!enabledRef.current) return;
      closeAllPeersRef.current?.();
    };

    socket.on("connect", handleReconnect);
    socket.on("disconnect", handleDisconnect);

    // Announce join to mesh
    socket.emit("webrtc-mesh:join", { roomCode, from: myId });

    // Handle own join - since Socket.IO doesn't echo messages back to sender,
    // we need to manually trigger join logic for all other participants
    if (localStreamRef.current) {
      (participantIdsRef.current || []).forEach((participantId) => {
        if (participantId !== myId) {
          if (shouldInitiateRef.current?.(myId, participantId)) {
            createAndSendOfferRef.current?.(participantId);
          } else {
          }
        }
      });
    }

    return () => {
      socket.emit("webrtc-mesh:leave", { roomCode, from: myId });
      closeAllPeersRef.current?.();
      socket.off("webrtc-mesh:join", wrappedJoinHandler);
      socket.off("webrtc-mesh:leave", wrappedLeaveHandler);
      socket.off("webrtc-mesh:offer", wrappedOfferHandler);
      socket.off("webrtc-mesh:answer", wrappedAnswerHandler);
      socket.off("webrtc-mesh:ice-candidate", wrappedCandidateHandler);
      socket.off("connect", handleReconnect);
      socket.off("disconnect", handleDisconnect);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [roomCode, userId, enabled]);

  // Update tracks when local stream changes
  useEffect(() => {
    if (!enabled || !localStreamRef.current) return;

    const tracks = localStreamRef.current.getTracks();

    // Update all existing peers with current tracks
    peersRef.current.forEach((pc, peerId) => {
      const senders = pc.getSenders();
      
      // For each track type, ensure it exists
      tracks.forEach((track) => {
        const hasSender = senders.some((s) => s.track?.kind === track.kind);
        if (!hasSender) {
          pc.addTrack(track, localStreamRef.current);
        }
      });

      // Remove any senders for tracks that no longer exist
      senders.forEach((sender) => {
        if (sender.track && !tracks.some(t => t.kind === sender.track.kind)) {
          pc.removeTrack(sender);
        }
      });
    });
  }, [enabled, localStream]);

  return {
    remoteStreams,
  };
};