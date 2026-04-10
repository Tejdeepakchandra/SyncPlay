import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";

/**
 * WebRTC Mesh Networking Hook
 * Creates a full mesh network where every participant connects to every other
 * Used for video chat between all participants
 */

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
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
    console.log(`[WebRTC Mesh] 🔧 Init props:`, {
      roomCode,
      localStreamExists: !!localStream,
      participantIds: participantIds,
      enabled,
      userId,
      isHost,
      userIdType: typeof userId,
    });
    console.log(`[WebRTC Mesh] participantIds array:`, participantIds);
    localStreamRef.current = localStream;
    participantIdsRef.current = participantIds;
    enabledRef.current = enabled;
    userIdRef.current = userId;
    isHostRef.current = isHost;
  }, [localStream, participantIds, enabled, userId, isHost, roomCode]);

  // Stream management
  const addRemoteStream = (peerId, stream) => {
    console.log(`[WebRTC Mesh] 📺 Adding remote stream from ${peerId}:`, {
      hasVideo: stream.getVideoTracks().length > 0,
      videoTracks: stream.getVideoTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })),
      hasAudio: stream.getAudioTracks().length > 0,
      audioTracks: stream.getAudioTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })),
    });
    setRemoteStreams((prev) => {
      const existingStream = prev.get(peerId);
      if (existingStream === stream) {
        return prev;
      }

      const next = new Map(prev);
      next.set(peerId, stream);
      console.log(`[WebRTC Mesh] Stream map updated - total streams: ${next.size}`);
      return next;
    });
  };

  const removeRemoteStream = (peerId) => {
    console.log(`[WebRTC Mesh] ❌ Removing remote stream from ${peerId}`);
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
      console.log(`[WebRTC Mesh] 🎯 I'm authenticated, they're guest → I INITIATE`);
      return true;
    }
    
    // If they're authenticated and I'm a guest → They initiate, I wait
    if (theyAreAuthenticated && !iAmAuthenticated) {
      console.log(`[WebRTC Mesh] 🎯 They're authenticated, I'm guest → I WAIT`);
      return false;
    }
    
    // Both authenticated or both guests → use lexicographic (stable tiebreaker)
    const result = selfId < peerId;
    console.log(`[WebRTC Mesh] 🎯 Both same type → lexicographic: ${selfId} < ${peerId} = ${result}`);
    return result;
  }, []);

  // Create peer connection for a participant
  const createPeer = useCallback((peerId) => {
    if (peersRef.current.has(peerId)) {
      return peersRef.current.get(peerId);
    }

    const myId = userIdRef.current;
    if (!myId) return null;

    console.log(`[WebRTC Mesh] Creating peer connection for ${peerId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add local tracks
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log(`[WebRTC Mesh] Adding ${tracks.length} local tracks to ${peerId}`);
      tracks.forEach((track) => {
        console.log(`[WebRTC Mesh] Adding ${track.kind} track (enabled=${track.enabled}) to ${peerId}`);
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn("[WebRTC Mesh] No local stream available when creating peer");
    }

    // Handle remote tracks
    pc.ontrack = (e) => {
      console.log(`[WebRTC Mesh] 🎥 ONTRACK EVENT from ${peerId}:`, {
        kind: e.track.kind,
        trackEnabled: e.track.enabled,
        trackMuted: e.track.muted,
        trackReadyState: e.track.readyState,
        streamsCount: e.streams.length,
      });

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

    // Handle ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log(`[WebRTC Mesh] 🧊 ICE candidate generated for ${peerId}`);
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
      console.log(`[WebRTC Mesh] 🧊 Flushing ${queuedCandidates.length} queued ICE candidates for ${peerId}`);
      queuedCandidates.forEach((candidate) => {
        try {
          pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log(`[WebRTC Mesh] 🧊 Added queued ICE candidate from ${peerId}`);
        } catch (err) {
          console.warn(`[WebRTC Mesh] ⚠️ Failed to add queued candidate from ${peerId}:`, err.message);
        }
      });
      iceCandidateQueueRef.current.delete(peerId);
    }

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Mesh] 🔌 Connection state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        console.log(`[WebRTC Mesh] ❌ Connection failed/closed with ${peerId}`);
        removeRemoteStream(peerId);
        peersRef.current.delete(peerId);
      }
    };

    // Log signaling state changes
    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC Mesh] 📡 Signaling state with ${peerId}: ${pc.signalingState}`);
    };

    // Log ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC Mesh] 🧊 ICE connection state with ${peerId}: ${pc.iceConnectionState}`);
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

    console.log(`[WebRTC Mesh] 📝 Creating offer to ${peerId}, hasLocalStream=${!!localStreamRef.current}, myId=${myId}`);
    
    const pc = createPeer(peerId);
    if (!pc) {
      console.error(`[WebRTC Mesh] ❌ Failed to create peer connection for ${peerId}`);
      return;
    }

    console.log(`[WebRTC Mesh] Peer created, signalingState=${pc.signalingState}`);
    if (pc.signalingState !== "stable") {
      console.warn(`[WebRTC Mesh] ❌ Cannot create offer - signaling state: ${pc.signalingState}`);
      return;
    }

    try {
      console.log(`[WebRTC Mesh] 🎬 Creating offer... (peerId=${peerId})`);
      const offer = await pc.createOffer();
      console.log(`[WebRTC Mesh] ✅ Offer created, setting local description...`);
      await pc.setLocalDescription(offer);

      console.log(`[WebRTC Mesh] After setLocalDescription, signalingState=${pc.signalingState}`);

      if (pc.localDescription) {
        console.log(`[WebRTC Mesh] 📤 Sending OFFER to ${peerId}, localDesc=${pc.localDescription.type}`);
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

    console.log(`[WebRTC Mesh] 👥 Participant IDs changed, checking for new connections needed...`, {
      currentParticipants: participantIds,
      existingPeers: Array.from(peersRef.current.keys()),
    });

    // Prune peers that are no longer participants
    const participantSet = new Set(participantIds || []);
    Array.from(peersRef.current.entries()).forEach(([peerId, pc]) => {
      if (!participantSet.has(peerId)) {
        console.log(`[WebRTC Mesh] 🧹 Closing stale peer ${peerId} (no longer in participants)`);
        try {
          pc.close();
        } catch (err) {
          console.warn(`[WebRTC Mesh] ⚠️ Error closing stale peer ${peerId}:`, err?.message || err);
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

      console.log(`[WebRTC Mesh] 🆕 New participant detected: ${participantId}, checking if should initiate...`);
      
      // Only initiate if we should (use local function, not dependency)
      if (shouldInitiateRef.current?.(userIdRef.current, participantId)) {
        console.log(`[WebRTC Mesh] 📱 I AM initiator for new participant ${participantId} - creating offer`);
        createAndSendOfferRef.current?.(participantId);
      } else {
        console.log(`[WebRTC Mesh] ⏳ I AM answerer for new participant ${participantId} - waiting for offer`);
      }
    });
  }, [participantIds, roomCode]);

  // Socket event handlers - wrapped in useCallback for stable references
  const handleMeshJoin = useCallback(({ from }) => {
    console.log(`[WebRTC Mesh] 🔔 Join event from ${from}, myId=${userIdRef.current}`);
    if (!localStreamRef.current || from === userIdRef.current) {
      console.warn(`[WebRTC Mesh] ❌ Skipping - no local stream or same user`);
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
        console.log(
          `[WebRTC Mesh] 🔄 Existing peer with ${from} is stuck (${existingPeer.signalingState}/${existingPeer.connectionState}/${existingPeer.iceConnectionState}). Restarting negotiation.`
        );
        try {
          existingPeer.close();
        } catch (err) {
          console.warn(`[WebRTC Mesh] ⚠️ Error closing stuck peer ${from}:`, err?.message || err);
        }
        peersRef.current.delete(from);
        createAndSendOffer(from);
        return;
      }

      console.log(`[WebRTC Mesh] ⏭️  Peer already exists with state=${existingPeer.signalingState}, skipping duplicate setup from join event`);
      return;
    }

    // Use deterministic initiator selection - no timeouts to avoid bidirectional offers
    if (shouldInitiate(userIdRef.current, from)) {
      console.log(`[WebRTC Mesh] 📱 I AM initiator - creating offer to ${from}`);
      createAndSendOffer(from);
    } else {
      console.log(`[WebRTC Mesh] ⏳ I AM answerer - waiting for offer from ${from}`);
    }
  }, [createAndSendOffer, shouldInitiate]);

  const handleMeshOffer = useCallback(async ({ from, to, sdp }) => {
    if (to !== userIdRef.current) {
      return;
    }

    if (from === userIdRef.current) {
      return;
    }

    console.log(`[WebRTC Mesh] 📨 Received OFFER from ${from} to ${to}, signalingEnabled=${enabledRef.current}`);
    
    if (!enabledRef.current) {
      console.warn(`[WebRTC Mesh] ⏸️ Mesh disabled, queueing offer from ${from}`);
      pendingOffersRef.current.set(from, { from, to, sdp });
      return;
    }

    if (!localStreamRef.current) {
      console.warn(`[WebRTC Mesh] ⏸️ Local stream not ready, queueing offer from ${from}`);
      pendingOffersRef.current.set(from, { from, to, sdp });
      return;
    }

    const pc = createPeer(from);
    if (!pc) {
      console.error(`[WebRTC Mesh] ❌ Failed to create peer for offer from ${from}`);
      return;
    }

    console.log(`[WebRTC Mesh] Setting remote description from offer, signalingState=${pc.signalingState}`);
    
    if (pc.signalingState !== "stable") {
      console.warn(`[WebRTC Mesh] ⚠️ Signaling state not stable: ${pc.signalingState}`);
      return;
    }

    try {
      console.log(`[WebRTC Mesh] 🎬 Setting remote description...`);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[WebRTC Mesh] ✅ Remote description set, creating answer...`);
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (pc.localDescription) {
        console.log(`[WebRTC Mesh] 📤 Sending ANSWER to ${from}`);
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
      console.log(`[WebRTC Mesh] 👋 Peer ${from} left mesh, closing peer connection`);
      try {
        existingPeer.close();
      } catch (err) {
        console.warn(`[WebRTC Mesh] ⚠️ Error closing peer on leave ${from}:`, err?.message || err);
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
    console.log(`[WebRTC Mesh] ▶️ Processing ${queuedOffers.length} queued offers after enabling mesh`);

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

    console.log(`[WebRTC Mesh] 📥 Received ANSWER from ${from} to ${to}`);
    
    if (!enabledRef.current) {
      console.warn(`[WebRTC Mesh] ❌ Mesh disabled, ignoring answer`);
      return;
    }

    const pc = peersRef.current.get(from);
    if (!pc) {
      console.error(`[WebRTC Mesh] ❌ No peer connection for answer from ${from}`);
      return;
    }
    
    console.log(`[WebRTC Mesh] Current signalingState=${pc.signalingState}`);
    if (pc.signalingState !== "have-local-offer") {
      console.warn(`[WebRTC Mesh] ⚠️ Expected 'have-local-offer', got '${pc.signalingState}'`);
      return;
    }

    try {
      console.log(`[WebRTC Mesh] 🎬 Setting answer remote description...`);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[WebRTC Mesh] ✅ Answer set, connection established`);
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
      console.log(`[WebRTC Mesh] 🧊 Queuing ICE candidate from ${from} (peer not ready yet)`);
      if (!iceCandidateQueueRef.current.has(from)) {
        iceCandidateQueueRef.current.set(from, []);
      }
      iceCandidateQueueRef.current.get(from).push(candidate);
      return;
    }

    try {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[WebRTC Mesh] 🧊 Added ICE candidate from ${from}`);
    } catch (err) {
      console.warn(`[WebRTC Mesh] ⚠️ Failed to add ICE candidate from ${from}:`, err.message);
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
    console.log(`[WebRTC Mesh] 📡 Listeners setup effect triggered:`, {
      roomCode,
      userId,
      enabled,
      guardsPass: !!roomCode && !!userId && enabled,
    });
    
    if (!roomCode || !userId || !enabled) {
      console.log(`[WebRTC Mesh] ⏭️  Skipping setup - guards blocked:`, {
        roomCodeMissing: !roomCode,
        userIdMissing: !userId,
        enabledFalse: !enabled,
      });
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
    console.log(`[WebRTC Mesh] 📡 Registering socket listeners for ${myId}`);
    socket.on("webrtc-mesh:join", wrappedJoinHandler);
    socket.on("webrtc-mesh:leave", wrappedLeaveHandler);
    socket.on("webrtc-mesh:offer", wrappedOfferHandler);
    socket.on("webrtc-mesh:answer", wrappedAnswerHandler);
    socket.on("webrtc-mesh:ice-candidate", wrappedCandidateHandler);

    const handleReconnect = () => {
      const reconnectUserId = userIdRef.current;
      if (!roomCode || !reconnectUserId || !enabledRef.current) return;

      console.log(`[WebRTC Mesh] 🔄 Socket reconnected, rejoining mesh for ${reconnectUserId}`);
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
      console.log("[WebRTC Mesh] ⚠️ Socket disconnected, clearing peers for clean recovery");
      closeAllPeersRef.current?.();
    };

    socket.on("connect", handleReconnect);
    socket.on("disconnect", handleDisconnect);

    // Announce join to mesh
    console.log(`[WebRTC Mesh] 📢 Announcing join to mesh: ${myId}`);
    socket.emit("webrtc-mesh:join", { roomCode, from: myId });

    // Handle own join - since Socket.IO doesn't echo messages back to sender,
    // we need to manually trigger join logic for all other participants
    if (localStreamRef.current) {
      console.log(`[WebRTC Mesh] 🔄 Processing own join for ${myId}`);
      (participantIdsRef.current || []).forEach((participantId) => {
        if (participantId !== myId) {
          console.log(`[WebRTC Mesh] 🔔 Processing existing participant ${participantId}`);
          if (shouldInitiateRef.current?.(myId, participantId)) {
            console.log(`[WebRTC Mesh] 📱 I AM initiator for ${participantId} - creating offer`);
            createAndSendOfferRef.current?.(participantId);
          } else {
            console.log(`[WebRTC Mesh] ⏳ I AM answerer for ${participantId} - waiting for offer`);
          }
        }
      });
    }

    return () => {
      console.log(`[WebRTC Mesh] 🛑 Cleaning up mesh connections`);
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
    console.log(`[WebRTC Mesh] 📝 Updating ${tracks.length} tracks across ${peersRef.current.size} peers`, {
      videoTracks: localStreamRef.current.getVideoTracks().length,
      audioTracks: localStreamRef.current.getAudioTracks().length,
    });

    // Update all existing peers with current tracks
    peersRef.current.forEach((pc, peerId) => {
      const senders = pc.getSenders();
      
      // For each track type, ensure it exists
      tracks.forEach((track) => {
        const hasSender = senders.some((s) => s.track?.kind === track.kind);
        if (!hasSender) {
          console.log(`[WebRTC Mesh] ➕ Adding ${track.kind} track to ${peerId} (was missing)`);
          pc.addTrack(track, localStreamRef.current);
        }
      });

      // Remove any senders for tracks that no longer exist
      senders.forEach((sender) => {
        if (sender.track && !tracks.some(t => t.kind === sender.track.kind)) {
          console.log(`[WebRTC Mesh] ➖ Removing ${sender.track.kind} track from ${peerId} (no longer exists)`);
          pc.removeTrack(sender);
        }
      });
    });
  }, [enabled, localStream]);

  return {
    remoteStreams,
  };
};