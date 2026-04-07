import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";
import { useAuth } from "@/hooks/useAuth";

/**
 * WebRTC Signaling Hook (Star Topology)
 * Host broadcasts screen share to all participants
 * Uses Socket.IO for signaling
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

export const useWebRTCSignaling = ({ roomCode, isHost, participantIds }) => {
  const { user } = useAuth();
  
  // Guard: Don't initialize if user is not authenticated
  if (!user?.id || !roomCode) {
    return {
      remoteStream: null,
      startBroadcastStream: () => {},
      stopBroadcastStream: () => {},
    };
  }

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const isHostRef = useRef(isHost);
  const participantIdsRef = useRef(participantIds);

  useEffect(() => {
    isHostRef.current = isHost;
    participantIdsRef.current = participantIds;
  }, [isHost, participantIds]);

  // Send signal via Socket.IO
  const sendSignal = useCallback((payload) => {
    socket.emit("webrtc:signal", { roomCode, ...payload });
  }, [roomCode]);

  // Create peer for participant (host side)
  const createPeerForParticipant = useCallback((peerId, stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && user?.id) {
        socket.emit("webrtc:ice-candidate", {
          roomCode,
          to: peerId,
          from: user.id,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    // Create offer
    pc.onnegotiationneeded = async () => {
      try {
        if (!user?.id) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", {
          roomCode,
          to: peerId,
          from: user.id,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("[WebRTC] Negotiation error:", err);
      }
    };

    return pc;
  }, [roomCode, user?.id]);

  // Create peer for host (participant side)
  const createPeerForHost = useCallback((hostId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(hostId, pc);

    // Handle remote tracks
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        const ms = new MediaStream();
        ms.addTrack(e.track);
        setRemoteStream(ms);
      }
    };

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && user?.id) {
        socket.emit("webrtc:ice-candidate", {
          roomCode,
          to: hostId,
          from: user.id,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    return pc;
  }, [roomCode, user?.id]);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setRemoteStream(null);
  }, []);

  // Setup Socket.IO listeners
  useEffect(() => {
    if (!roomCode || !user?.id) return;

    const myId = user.id;

    const handleRequestStream = async ({ from }) => {
      if (!isHostRef.current || !localStreamRef.current) return;

      const pc = createPeerForParticipant(from, localStreamRef.current);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", {
          roomCode,
          to: from,
          from: myId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("[WebRTC] Offer creation failed:", err);
      }
    };

    const handleOffer = async ({ from, sdp }) => {
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeerForHost(from);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", {
          roomCode,
          to: from,
          from: myId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("[WebRTC] Answer creation failed:", err);
      }
    };

    const handleAnswer = async ({ from, sdp }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error("[WebRTC] Set remote description failed:", err);
        }
      }
    };

    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore - may arrive before remote description
        }
      }
    };

    const handleStreamStopped = ({ from }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        pc.close();
        peersRef.current.delete(from);
      }
      setRemoteStream(null);
    };

    const handleAudioPermissionDenied = ({ error, error_code }) => {
      // Dispatch custom event that can be caught in useRoom or components
      window.dispatchEvent(new CustomEvent('permission:audio-denied', {
        detail: { error, error_code }
      }));
    };

    const handleVideoPermissionDenied = ({ error, error_code }) => {
      window.dispatchEvent(new CustomEvent('permission:video-denied', {
        detail: { error, error_code }
      }));
    };

    // Register listeners
    socket.on("webrtc:request-stream", handleRequestStream);
    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:stream-stopped", handleStreamStopped);
    socket.on("audio:permission-denied", handleAudioPermissionDenied);
    socket.on("video:permission-denied", handleVideoPermissionDenied);

    // If not host, request stream on connection
    if (!isHostRef.current) {
      socket.emit("webrtc:request-stream", { roomCode, from: myId });
    }

    return () => {
      closeAllPeers();
      socket.off("webrtc:request-stream", handleRequestStream);
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
      socket.off("webrtc:stream-stopped", handleStreamStopped);
      socket.off("audio:permission-denied", handleAudioPermissionDenied);
      socket.off("video:permission-denied", handleVideoPermissionDenied);
    };
  }, [roomCode, user?.id, createPeerForParticipant, createPeerForHost, closeAllPeers]);

  // Host: start broadcasting
  const startBroadcastStream = useCallback((stream) => {
    localStreamRef.current = stream;

    participantIdsRef.current.forEach((pid) => {
      if (pid === user?.id) return;
      createPeerForParticipant(pid, stream);
    });
  }, [user?.id, createPeerForParticipant]);

  // Host: stop broadcasting
  const stopBroadcastStream = useCallback(() => {
    localStreamRef.current = null;
    if (user?.id) {
      socket.emit("webrtc:stream-stopped", { roomCode, from: user.id });
    }
    closeAllPeers();
  }, [roomCode, user?.id, closeAllPeers]);

  return {
    remoteStream,
    startBroadcastStream,
    stopBroadcastStream,
  };
};