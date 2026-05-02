import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";

/**
 * WebRTC Mesh Networking Hook — "Perfect Negotiation" Pattern
 *
 * Creates a full mesh network where every participant connects to every other.
 * Uses the W3C "Perfect Negotiation" pattern to handle offer/answer glare
 * and prevent m-line ordering errors during renegotiation.
 *
 * Key design decisions:
 * - Pre-create transceivers for audio+video to keep m-line order stable
 * - Use sender.replaceTrack() instead of addTrack/removeTrack
 * - Polite/impolite peer roles for collision resolution
 */

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    // Metered.ca TURN servers (reliable, global)
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
  const peersRef = useRef(new Map());           // peerId -> RTCPeerConnection
  const makingOfferRef = useRef(new Set());     // peerIds currently creating offers
  const remoteMediaStreamsRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localStreamRef = useRef(null);
  const participantIdsRef = useRef(participantIds);
  const enabledRef = useRef(enabled);
  const userIdRef = useRef(userId);
  const isHostRef = useRef(isHost);
  const iceCandidateQueueRef = useRef(new Map());
  const pendingOffersRef = useRef(new Map());
  const reconnectTimerRef = useRef(null);

  // Stable handler refs
  const handlersRef = useRef({});
  const shouldInitiateRef = useRef(null);
  const createAndSendOfferRef = useRef(null);
  const closeAllPeersRef = useRef(null);

  useEffect(() => {
    localStreamRef.current = localStream;
    participantIdsRef.current = participantIds;
    enabledRef.current = enabled;
    userIdRef.current = userId;
    isHostRef.current = isHost;
  }, [localStream, participantIds, enabled, userId, isHost, roomCode]);

  // ── Stream management ──────────────────────────────────────────────

  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams((prev) => {
      if (prev.get(peerId) === stream) return prev;
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
    peersRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    peersRef.current.clear();
    makingOfferRef.current.clear();
    remoteMediaStreamsRef.current.clear();
    iceCandidateQueueRef.current.clear();
    setRemoteStreams(new Map());
  }, []);

  // ── Polite/Impolite role (Perfect Negotiation) ─────────────────────
  // The "polite" peer yields when both sides send offers simultaneously.
  // We use lexicographic ordering: smaller ID is "polite".

  const isPolite = useCallback((selfId, peerId) => {
    return (selfId || "") < (peerId || "");
  }, []);

  // The "initiator" (who sends the first offer) is the impolite peer.
  const shouldInitiate = useCallback((selfId, peerId) => {
    // Impolite peer initiates
    return !isPolite(selfId, peerId);
  }, [isPolite]);

  // ── Create peer connection ─────────────────────────────────────────

  const createPeer = useCallback((peerId) => {
    if (peersRef.current.has(peerId)) {
      return peersRef.current.get(peerId);
    }

    const myId = userIdRef.current;
    if (!myId) return null;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const polite = isPolite(myId, peerId);

    peersRef.current.set(peerId, pc);

    // ── Pre-create transceivers for stable m-line ordering ──
    // This ensures the SDP always has audio then video in the same order,
    // preventing the "order of m-lines" error during renegotiation.
    const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });

    // Attach local tracks via replaceTrack (never addTrack/removeTrack)
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (audioTrack) audioTransceiver.sender.replaceTrack(audioTrack);
      if (videoTrack) videoTransceiver.sender.replaceTrack(videoTrack);
    }

    // ── Handle remote tracks ──
    pc.ontrack = (e) => {
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
        const exists = currentStream.getTracks().some((t) => t.id === e.track.id);
        if (exists) currentStream.removeTrack(e.track);
        if (currentStream.getTracks().length === 0) {
          removeRemoteStream(peerId);
          return;
        }
        addRemoteStream(peerId, currentStream);
      };

      e.track.onmute = () => {
        // Trigger re-render so UI can show placeholder
        addRemoteStream(peerId, peerStream);
      };
      e.track.onunmute = () => {
        addRemoteStream(peerId, peerStream);
      };

      addRemoteStream(peerId, peerStream);
    };

    // ── Perfect Negotiation: onnegotiationneeded ──
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current.add(peerId);
        await pc.setLocalDescription();
        socket.emit("webrtc-mesh:offer", {
          roomCode,
          to: peerId,
          from: myId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("[WebRTC Mesh] ❌ Negotiation error:", err);
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    };

    // ── ICE candidates ──
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

    // Flush queued ICE candidates
    if (iceCandidateQueueRef.current.has(peerId)) {
      const queued = iceCandidateQueueRef.current.get(peerId);
      queued.forEach((c) => {
        try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      });
      iceCandidateQueueRef.current.delete(peerId);
    }

    // ── Connection state monitoring ──
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "failed") {
        // Auto-restart: close and re-create
        console.warn(`[WebRTC Mesh] Connection to ${peerId} failed, restarting...`);
        try { pc.close(); } catch {}
        peersRef.current.delete(peerId);
        removeRemoteStream(peerId);
        // Re-initiate after a short delay
        if (enabledRef.current && localStreamRef.current) {
          setTimeout(() => {
            if (shouldInitiateRef.current?.(userIdRef.current, peerId)) {
              createAndSendOfferRef.current?.(peerId);
            }
          }, 1000);
        }
      } else if (state === "closed") {
        peersRef.current.delete(peerId);
        removeRemoteStream(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected") {
        // ICE restart
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" && pc.connectionState !== "closed") {
            console.warn(`[WebRTC Mesh] ICE disconnected for ${peerId}, restarting ICE...`);
            pc.restartIce();
          }
        }, 3000);
      }
    };

    return pc;
  }, [roomCode, isPolite]);

  // ── Create and send offer ──────────────────────────────────────────

  const createAndSendOffer = useCallback(async (peerId) => {
    const myId = userIdRef.current;
    if (!myId) return;

    const pc = createPeer(peerId);
    if (!pc) return;

    // The onnegotiationneeded handler will fire automatically
    // because we added transceivers in createPeer.
    // But if the peer already exists and is stable, we may need to trigger manually:
    if (pc.signalingState === "stable" && !makingOfferRef.current.has(peerId)) {
      try {
        makingOfferRef.current.add(peerId);
        await pc.setLocalDescription();
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
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    }
  }, [roomCode, createPeer]);

  useEffect(() => {
    shouldInitiateRef.current = shouldInitiate;
    createAndSendOfferRef.current = createAndSendOffer;
    closeAllPeersRef.current = closeAllPeers;
  }, [shouldInitiate, createAndSendOffer, closeAllPeers]);

  // ── Participant changes ────────────────────────────────────────────

  useEffect(() => {
    if (!enabledRef.current || !userIdRef.current || !localStreamRef.current || !roomCode) return;

    // Prune peers that left
    const participantSet = new Set(participantIds || []);
    Array.from(peersRef.current.entries()).forEach(([peerId, pc]) => {
      if (!participantSet.has(peerId)) {
        try { pc.close(); } catch {}
        peersRef.current.delete(peerId);
        removeRemoteStream(peerId);
      }
    });

    // Connect to new participants
    (participantIds || []).forEach((pid) => {
      if (pid === userIdRef.current) return;
      if (peersRef.current.has(pid)) return;

      if (shouldInitiateRef.current?.(userIdRef.current, pid)) {
        createAndSendOfferRef.current?.(pid);
      }
    });
  }, [participantIds, roomCode]);

  // ── Socket event handlers (Perfect Negotiation) ────────────────────

  const handleMeshJoin = useCallback(({ from }) => {
    if (!localStreamRef.current || from === userIdRef.current) return;

    const existing = peersRef.current.get(from);
    if (existing) {
      // If connection is stuck, restart it
      const isStuck = existing.connectionState === "failed"
        || existing.connectionState === "disconnected"
        || existing.iceConnectionState === "failed"
        || existing.iceConnectionState === "disconnected";
      if (isStuck) {
        try { existing.close(); } catch {}
        peersRef.current.delete(from);
        if (shouldInitiate(userIdRef.current, from)) {
          createAndSendOffer(from);
        }
        return;
      }
      return;
    }

    if (shouldInitiate(userIdRef.current, from)) {
      createAndSendOffer(from);
    }
  }, [createAndSendOffer, shouldInitiate]);

  // ── Perfect Negotiation: Handle incoming offer ──
  const handleMeshOffer = useCallback(async ({ from, to, sdp }) => {
    if (to !== userIdRef.current || from === userIdRef.current) return;

    if (!enabledRef.current) {
      pendingOffersRef.current.set(from, { from, to, sdp });
      return;
    }
    if (!localStreamRef.current) {
      pendingOffersRef.current.set(from, { from, to, sdp });
      return;
    }

    const myId = userIdRef.current;
    const polite = isPolite(myId, from);
    const pc = createPeer(from);
    if (!pc) return;

    // Perfect Negotiation: handle offer collision
    const offerCollision = sdp.type === "offer"
      && (makingOfferRef.current.has(from) || pc.signalingState !== "stable");

    const ignoreOffer = !polite && offerCollision;

    if (ignoreOffer) {
      // We're impolite and there's a collision — ignore their offer
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush queued ICE candidates now that remote description is set
      if (iceCandidateQueueRef.current.has(from)) {
        const queued = iceCandidateQueueRef.current.get(from);
        iceCandidateQueueRef.current.delete(from);
        queued.forEach((c) => {
          try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        });
      }

      if (sdp.type === "offer") {
        await pc.setLocalDescription();
        socket.emit("webrtc-mesh:answer", {
          roomCode,
          to: from,
          from: myId,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error("[WebRTC Mesh] ❌ Offer/Answer handling error:", err);
    }
  }, [roomCode, createPeer, isPolite]);

  const handleMeshLeave = useCallback(({ from }) => {
    if (!from || from === userIdRef.current) return;
    const existing = peersRef.current.get(from);
    if (existing) {
      try { existing.close(); } catch {}
      peersRef.current.delete(from);
    }
    removeRemoteStream(from);
    iceCandidateQueueRef.current.delete(from);
    pendingOffersRef.current.delete(from);
  }, []);

  // Process pending offers when mesh becomes enabled/stream-ready
  useEffect(() => {
    if (!enabled || !localStream || !userIdRef.current || pendingOffersRef.current.size === 0) return;
    const queued = Array.from(pendingOffersRef.current.values());
    pendingOffersRef.current.clear();
    queued.forEach((offer) => handleMeshOffer(offer));
  }, [enabled, localStream, handleMeshOffer]);

  // ── Perfect Negotiation: Handle incoming answer ──
  const handleMeshAnswer = useCallback(async ({ from, to, sdp }) => {
    if (to !== userIdRef.current || from === userIdRef.current) return;
    if (!enabledRef.current) return;

    const pc = peersRef.current.get(from);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush queued ICE candidates
      if (iceCandidateQueueRef.current.has(from)) {
        const queued = iceCandidateQueueRef.current.get(from);
        iceCandidateQueueRef.current.delete(from);
        queued.forEach((c) => {
          try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        });
      }
    } catch (err) {
      console.error("[WebRTC Mesh] ❌ Answer handling error:", err);
    }
  }, []);

  // ── ICE candidate handling ──
  const handleMeshIceCandidate = useCallback(({ from, to, candidate }) => {
    if (to !== userIdRef.current || from === userIdRef.current) return;

    const pc = peersRef.current.get(from);
    if (!pc || !pc.remoteDescription) {
      // Queue until remote description is set
      if (!iceCandidateQueueRef.current.has(from)) {
        iceCandidateQueueRef.current.set(from, []);
      }
      iceCandidateQueueRef.current.get(from).push(candidate);
      return;
    }

    try {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {}
  }, []);

  // Update handler refs
  useEffect(() => {
    handlersRef.current = {
      handleMeshJoin,
      handleMeshLeave,
      handleMeshOffer,
      handleMeshAnswer,
      handleMeshIceCandidate,
    };
  }, [handleMeshJoin, handleMeshLeave, handleMeshOffer, handleMeshAnswer, handleMeshIceCandidate]);

  // ── Socket.IO listeners ────────────────────────────────────────────

  useEffect(() => {
    if (!roomCode || !userId || !enabled) return;

    const myId = userId;

    const wrappedJoinHandler = (data) => handlersRef.current.handleMeshJoin(data);
    const wrappedLeaveHandler = (data) => handlersRef.current.handleMeshLeave(data);
    const wrappedOfferHandler = (data) => handlersRef.current.handleMeshOffer(data);
    const wrappedAnswerHandler = (data) => handlersRef.current.handleMeshAnswer(data);
    const wrappedCandidateHandler = (data) => handlersRef.current.handleMeshIceCandidate(data);

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

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        (participantIdsRef.current || []).forEach((pid) => {
          if (pid === reconnectUserId) return;
          if (shouldInitiateRef.current?.(reconnectUserId, pid)) {
            createAndSendOfferRef.current?.(pid);
          }
        });
      }, 300);
    };

    const handleDisconnect = () => {
      if (!enabledRef.current) return;
      closeAllPeersRef.current?.();
    };

    socket.on("connect", handleReconnect);
    socket.on("disconnect", handleDisconnect);

    // Announce join to mesh
    socket.emit("webrtc-mesh:join", { roomCode, from: myId });

    // Initiate connections to existing participants
    if (localStreamRef.current) {
      (participantIdsRef.current || []).forEach((pid) => {
        if (pid !== myId && shouldInitiateRef.current?.(myId, pid)) {
          createAndSendOfferRef.current?.(pid);
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

  // ── Track updates: use replaceTrack (NEVER addTrack/removeTrack) ───
  // This is the critical fix for the m-line ordering error.
  // We pre-created transceivers in createPeer, so we just replace tracks on senders.

  useEffect(() => {
    if (!enabled) return;

    const localAudio = localStreamRef.current?.getAudioTracks()[0] || null;
    const localVideo = localStreamRef.current?.getVideoTracks()[0] || null;

    peersRef.current.forEach((pc) => {
      if (pc.connectionState === "closed") return;

      const transceivers = pc.getTransceivers();
      transceivers.forEach((transceiver) => {
        try {
          const sender = transceiver.sender;
          // Determine the media kind from the transceiver (mid or receiver track)
          const kind = transceiver.receiver?.track?.kind
            || sender?.track?.kind
            || (transceiver.mid === "0" ? "audio" : transceiver.mid === "1" ? "video" : null);

          if (kind === "audio") {
            if (sender.track?.id !== localAudio?.id) {
              sender.replaceTrack(localAudio);
            }
          } else if (kind === "video") {
            if (sender.track?.id !== localVideo?.id) {
              sender.replaceTrack(localVideo);
            }
          }
        } catch (err) {
          console.warn("[WebRTC Mesh] replaceTrack error:", err.message);
        }
      });
    });
  }, [enabled, localStream]);

  return {
    remoteStreams,
  };
};