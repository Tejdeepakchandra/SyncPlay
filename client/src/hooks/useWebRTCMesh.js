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

export const useWebRTCMesh = ({ roomCode, participantIds, localStream, enabled }) => {
  const { user } = useAuth();
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localStreamRef = useRef(null);
  const participantIdsRef = useRef(participantIds);
  const enabledRef = useRef(enabled);
  const userIdRef = useRef(user?.id);

  useEffect(() => {
    localStreamRef.current = localStream;
    participantIdsRef.current = participantIds;
    enabledRef.current = enabled;
    userIdRef.current = user?.id;
  }, [localStream, participantIds, enabled, user?.id]);

  // Stream management
  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(peerId, stream);
      return next;
    });
  };

  const removeRemoteStream = (peerId) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  };

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
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

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote tracks
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      addRemoteStream(peerId, stream);
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

    // Handle connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removeRemoteStream(peerId);
        peersRef.current.delete(peerId);
      }
    };

    return pc;
  }, [roomCode]);

  // Create and send offer
  const createAndSendOffer = useCallback(async (peerId) => {
    const myId = userIdRef.current;
    if (!myId) return;

    const pc = createPeer(peerId);
    if (!pc || pc.signalingState !== "stable") return;

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
      console.error("[WebRTC Mesh] Offer error:", err);
    }
  }, [roomCode, createPeer]);

  // Setup Socket.IO listeners
  useEffect(() => {
    if (!roomCode || !user?.id || !enabled) return;

    const myId = user.id;

    const handleMeshJoin = ({ from }) => {
      if (!localStreamRef.current || from === myId) return;

      if (shouldInitiate(myId, from)) {
        createAndSendOffer(from);
      }
    };

    const handleMeshOffer = async ({ from, sdp }) => {
      if (!enabledRef.current) return;

      const pc = createPeer(from);
      if (!pc || pc.signalingState !== "stable") return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (pc.localDescription) {
          socket.emit("webrtc-mesh:answer", {
            roomCode,
            to: from,
            from: myId,
            sdp: pc.localDescription,
          });
        }
      } catch (err) {
        console.error("[WebRTC Mesh] Answer error:", err);
      }
    };

    const handleMeshAnswer = async ({ from, sdp }) => {
      if (!enabledRef.current) return;

      const pc = peersRef.current.get(from);
      if (!pc || pc.signalingState !== "have-local-offer") return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error("[WebRTC Mesh] Set remote description error:", err);
      }
    };

    const handleMeshIceCandidate = async ({ from, candidate }) => {
      if (!enabledRef.current) return;

      const pc = peersRef.current.get(from);
      if (!pc) return;

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Ignore - may arrive before remote description
      }
    };

    // Register listeners
    socket.on("webrtc-mesh:join", handleMeshJoin);
    socket.on("webrtc-mesh:offer", handleMeshOffer);
    socket.on("webrtc-mesh:answer", handleMeshAnswer);
    socket.on("webrtc-mesh:ice-candidate", handleMeshIceCandidate);

    // Announce join to mesh
    socket.emit("webrtc-mesh:join", { roomCode, from: myId });

    return () => {
      closeAllPeers();
      socket.off("webrtc-mesh:join", handleMeshJoin);
      socket.off("webrtc-mesh:offer", handleMeshOffer);
      socket.off("webrtc-mesh:answer", handleMeshAnswer);
      socket.off("webrtc-mesh:ice-candidate", handleMeshIceCandidate);
    };
  }, [roomCode, user?.id, enabled, createPeer, createAndSendOffer, closeAllPeers]);

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