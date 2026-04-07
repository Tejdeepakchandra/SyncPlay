import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";
import { useAuth } from "@/hooks/useAuth";

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

export const useWebRTCMesh = ({ roomCode, participantIds, localStream, enabled, userId }) => {
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localStreamRef = useRef(null);
  const participantIdsRef = useRef(participantIds);
  const enabledRef = useRef(enabled);
  const userIdRef = useRef(userId);
  const iceCandidateQueueRef = useRef(new Map()); // Queue candidates by peerId

  useEffect(() => {
    console.log(`[WebRTC Mesh] 🔧 Init props:`, {
      roomCode,
      localStreamExists: !!localStream,
      participantIds: participantIds,
      enabled,
      userId,
      userIdType: typeof userId,
    });
    localStreamRef.current = localStream;
    participantIdsRef.current = participantIds;
    enabledRef.current = enabled;
    userIdRef.current = userId;
  }, [localStream, participantIds, enabled, userId, roomCode]);

  // Stream management
  const addRemoteStream = (peerId, stream) => {
    console.log(`[WebRTC Mesh] 📺 Adding remote stream from ${peerId}:`, {
      hasVideo: stream.getVideoTracks().length > 0,
      videoTracks: stream.getVideoTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })),
      hasAudio: stream.getAudioTracks().length > 0,
      audioTracks: stream.getAudioTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })),
    });
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(peerId, stream);
      console.log(`[WebRTC Mesh] Stream map updated - total streams: ${next.size}`);
      return next;
    });
  };

  const removeRemoteStream = (peerId) => {
    console.log(`[WebRTC Mesh] ❌ Removing remote stream from ${peerId}`);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  };

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    iceCandidateQueueRef.current.clear();
    setRemoteStreams(new Map());
  }, []);

  // Determine if we should initiate connection (lexicographic comparison)
  const shouldInitiate = (selfId, peerId) => selfId < peerId;

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
      const stream = e.streams[0] || new MediaStream([e.track]);
      addRemoteStream(peerId, stream);
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

    console.log(`[WebRTC Mesh] 📝 Creating offer to ${peerId}, hasLocalStream=${!!localStreamRef.current}`);
    
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
      console.log(`[WebRTC Mesh] 🎬 Creating offer...`);
      const offer = await pc.createOffer();
      console.log(`[WebRTC Mesh] ✅ Offer created, setting local description...`);
      await pc.setLocalDescription(offer);

      if (pc.localDescription) {
        console.log(`[WebRTC Mesh] 📤 Sending OFFER to ${peerId}`);
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

    const handleMeshJoin = ({ from }) => {
      console.log(`[WebRTC Mesh] 🔔 Join event from ${from}, myId=${myId}, shouldInitiate=${shouldInitiate(myId, from)}`);
      if (!localStreamRef.current || from === myId) {
        console.warn(`[WebRTC Mesh] ❌ Skipping - no local stream or same user`);
        return;
      }

      // Use deterministic initiator selection - no timeouts to avoid bidirectional offers
      if (shouldInitiate(myId, from)) {
        console.log(`[WebRTC Mesh] 📱 I AM initiator (${myId} < ${from}) - creating offer`);
        createAndSendOffer(from);
      } else {
        console.log(`[WebRTC Mesh] ⏳ I AM answerer - waiting for offer from ${from}`);
      }
    };

    const handleMeshOffer = async ({ from, sdp }) => {
      console.log(`[WebRTC Mesh] 📨 Received OFFER from ${from}, signalingEnabled=${enabledRef.current}`);
      
      if (!enabledRef.current) {
        console.warn(`[WebRTC Mesh] ❌ Mesh disabled, ignoring offer`);
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
            from: myId,
            sdp: pc.localDescription,
          });
        }
      } catch (err) {
        console.error("[WebRTC Mesh] ❌ Answer error:", err);
      }
    };

    const handleMeshAnswer = async ({ from, sdp }) => {
      console.log(`[WebRTC Mesh] 📥 Received ANSWER from ${from}`);
      
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
        console.log(`[WebRTC Mesh] 🎬 Setting remote description from answer...`);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log(`[WebRTC Mesh] ✅ Remote description set successfully`);
      } catch (err) {
        console.error("[WebRTC Mesh] ❌ Set remote description error:", err);
      }
    };

    const handleMeshIceCandidate = async ({ from, candidate }) => {
      if (!enabledRef.current) return;

      const pc = peersRef.current.get(from);
      if (!pc) {
        // Queue the candidate - the peer connection will be created soon
        console.log(`[WebRTC Mesh] 🧊 Queuing ICE candidate from ${from} (peer not ready yet)`);
        if (!iceCandidateQueueRef.current.has(from)) {
          iceCandidateQueueRef.current.set(from, []);
        }
        iceCandidateQueueRef.current.get(from).push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[WebRTC Mesh] 🧊 Added ICE candidate from ${from}`);
      } catch (err) {
        console.warn(`[WebRTC Mesh] ⚠️ Failed to add ICE candidate from ${from}:`, err.message);
      }
    };

    // Register listeners
    console.log(`[WebRTC Mesh] 📡 Registering socket listeners for ${myId}`);
    socket.on("webrtc-mesh:join", handleMeshJoin);
    socket.on("webrtc-mesh:offer", handleMeshOffer);
    socket.on("webrtc-mesh:answer", handleMeshAnswer);
    socket.on("webrtc-mesh:ice-candidate", handleMeshIceCandidate);

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
          if (shouldInitiate(myId, participantId)) {
            console.log(`[WebRTC Mesh] 📱 I AM initiator for ${participantId} (${myId} < ${participantId}) - creating offer`);
            createAndSendOffer(participantId);
          } else {
            console.log(`[WebRTC Mesh] ⏳ I AM answerer for ${participantId} - waiting for offer`);
          }
        }
      });
    }

    return () => {
      console.log(`[WebRTC Mesh] 🛑 Cleaning up mesh connections`);
      closeAllPeers();
      socket.off("webrtc-mesh:join", handleMeshJoin);
      socket.off("webrtc-mesh:offer", handleMeshOffer);
      socket.off("webrtc-mesh:answer", handleMeshAnswer);
      socket.off("webrtc-mesh:ice-candidate", handleMeshIceCandidate);
    };
  }, [roomCode, userId, enabled, createPeer, createAndSendOffer, closeAllPeers]);

  // Update tracks when local stream changes
  useEffect(() => {
    if (!enabled || !localStreamRef.current) return;

    const previousTracks = new Set();
    const currentTracks = new Set(localStreamRef.current.getTracks());

    // Find removed tracks
    previousTracks.forEach((prevTrack) => {
      if (!currentTracks.has(prevTrack)) {
        peersRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          const sender = senders.find((s) => s.track === prevTrack);
          if (sender) pc.removeTrack(sender);
        });
      }
    });

    // Find added tracks and update peers
    currentTracks.forEach((track) => {
      if (!previousTracks.has(track)) {
        peersRef.current.forEach((pc) => {
          const hasSender = pc
            .getSenders()
            .some((s) => s.track?.kind === track.kind);
          if (!hasSender) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }
    });
  }, [enabled, localStream]);

  return {
    remoteStreams,
  };
};