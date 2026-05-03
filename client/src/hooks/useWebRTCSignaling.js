import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";

/**
 * WebRTC Signaling Hook (Star Topology)
 * Host broadcasts screen share to all participants
 * Uses Socket.IO for signaling
 */

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    // Metered.ca TURN servers (reliable, global) — same as mesh hook
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

export const useWebRTCSignaling = ({ roomCode, isHost, participantIds, userId }) => {

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const isHostRef = useRef(isHost);
  const participantIdsRef = useRef(participantIds);
  const userIdRef = useRef(userId || socket.userId || null);
  const hasRemoteStreamRef = useRef(false);
  const iceCandidateQueueRef = useRef(new Map());

  useEffect(() => {
    isHostRef.current = isHost;
    participantIdsRef.current = participantIds;
    userIdRef.current = userId || socket.userId || null;
  }, [isHost, participantIds, userId]);

  // Create peer for participant (host side)
  const createPeerForParticipant = useCallback((peerId, stream) => {
    // Close existing peer if any (prevents duplicate connections)
    const existing = peersRef.current.get(peerId);
    if (existing) {
      try { existing.close(); } catch {}
      peersRef.current.delete(peerId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ICE candidates
    pc.onicecandidate = (e) => {
      const myId = userIdRef.current;
      if (e.candidate && myId) {
        socket.emit("webrtc:ice-candidate", {
          roomCode,
          to: peerId,
          from: myId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    // Create offer
    pc.onnegotiationneeded = async () => {
      try {
        const myId = userIdRef.current;
        if (!myId) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", {
          roomCode,
          to: peerId,
          from: myId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("[WebRTC] Negotiation error:", err);
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        peersRef.current.delete(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" && pc.connectionState !== "closed") {
            pc.restartIce();
          }
        }, 3000);
      }
    };

    return pc;
  }, [roomCode]);

  // Create peer for host (participant side)
  const createPeerForHost = useCallback((hostId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(hostId, pc);

    // Handle remote tracks
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
        hasRemoteStreamRef.current = true;
      } else {
        const ms = new MediaStream();
        ms.addTrack(e.track);
        setRemoteStream(ms);
        hasRemoteStreamRef.current = true;
      }
    };

    // ICE candidates
    pc.onicecandidate = (e) => {
      const myId = userIdRef.current;
      if (e.candidate && myId) {
        socket.emit("webrtc:ice-candidate", {
          roomCode,
          to: hostId,
          from: myId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    // Connection state monitoring — auto-recover on failure
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        console.warn("[WebRTC Screen] Connection to host failed, requesting new stream...");
        try { pc.close(); } catch {}
        peersRef.current.delete(hostId);
        setRemoteStream(null);
        hasRemoteStreamRef.current = false;
        // Re-request stream from host after short delay
        const myId = userIdRef.current;
        if (myId) {
          setTimeout(() => {
            socket.emit("webrtc:request-stream", { roomCode, from: myId });
          }, 1000);
        }
      } else if (pc.connectionState === "closed") {
        peersRef.current.delete(hostId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" && pc.connectionState !== "closed") {
            console.warn("[WebRTC Screen] ICE disconnected, restarting ICE...");
            pc.restartIce();
          }
        }, 3000);
      }
    };

    return pc;
  }, [roomCode]);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setRemoteStream(null);
  }, []);

  // Setup Socket.IO listeners
  useEffect(() => {
    const myId = userIdRef.current;
    if (!roomCode || !myId) return;

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

    const flushIceCandidates = (peerId, pc) => {
      if (iceCandidateQueueRef.current.has(peerId)) {
        const queued = iceCandidateQueueRef.current.get(peerId);
        iceCandidateQueueRef.current.delete(peerId);
        queued.forEach((c) => {
          try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        });
      }
    };

    const handleOffer = async ({ from, sdp }) => {
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeerForHost(from);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        flushIceCandidates(from, pc);
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
          flushIceCandidates(from, pc);
        } catch (err) {
          console.error("[WebRTC] Set remote description failed:", err);
        }
      }
    };

    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (!pc || !pc.remoteDescription) {
        // Queue until peer/remote description is ready
        if (!iceCandidateQueueRef.current.has(from)) {
          iceCandidateQueueRef.current.set(from, []);
        }
        iceCandidateQueueRef.current.get(from).push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    };

    const handleStreamStopped = ({ from }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        pc.close();
        peersRef.current.delete(from);
      }
      setRemoteStream(null);
      hasRemoteStreamRef.current = false;
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

    const handleReconnect = () => {
      if (isHostRef.current) return;
      const id = userIdRef.current;
      if (!id) return;
      socket.emit("webrtc:request-stream", { roomCode, from: id });
    };

    // Register listeners
    socket.on("webrtc:request-stream", handleRequestStream);
    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:stream-stopped", handleStreamStopped);
    socket.on("audio:permission-denied", handleAudioPermissionDenied);
    socket.on("video:permission-denied", handleVideoPermissionDenied);
    socket.on("connect", handleReconnect);

    // If not host, request stream on connection and retry for late-join scenarios.
    if (!isHostRef.current) {
      let attempts = 0;
      const maxAttempts = 12;
      const requestStream = () => {
        socket.emit("webrtc:request-stream", { roomCode, from: myId });
      };

      requestStream();

      const retryTimer = setInterval(() => {
        if (hasRemoteStreamRef.current || attempts >= maxAttempts) {
          clearInterval(retryTimer);
          return;
        }
        attempts += 1;
        requestStream();
      }, 1500);

      return () => {
        clearInterval(retryTimer);
        closeAllPeers();
        socket.off("webrtc:request-stream", handleRequestStream);
        socket.off("webrtc:offer", handleOffer);
        socket.off("webrtc:answer", handleAnswer);
        socket.off("webrtc:ice-candidate", handleIceCandidate);
        socket.off("webrtc:stream-stopped", handleStreamStopped);
        socket.off("audio:permission-denied", handleAudioPermissionDenied);
        socket.off("video:permission-denied", handleVideoPermissionDenied);
        socket.off("connect", handleReconnect);
      };
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
      socket.off("connect", handleReconnect);
    };
  }, [roomCode, userId, createPeerForParticipant, createPeerForHost, closeAllPeers]);

  // Host: start broadcasting
  const startBroadcastStream = useCallback((stream) => {
    const myId = userIdRef.current;
    localStreamRef.current = stream;

    participantIdsRef.current.forEach((pid) => {
      if (pid === myId) return;
      createPeerForParticipant(pid, stream);
    });
  }, [createPeerForParticipant]);

  // Host: stop broadcasting
  const stopBroadcastStream = useCallback(() => {
    const myId = userIdRef.current;
    localStreamRef.current = null;
    if (myId) {
      socket.emit("webrtc:stream-stopped", { roomCode, from: myId });
    }
    closeAllPeers();
  }, [roomCode, closeAllPeers]);

  const requestStream = useCallback(() => {
    const myId = userIdRef.current;
    if (!roomCode || !myId) return;
    socket.emit("webrtc:request-stream", { roomCode, from: myId });
  }, [roomCode]);

  return {
    remoteStream,
    startBroadcastStream,
    stopBroadcastStream,
    requestStream,
  };
};