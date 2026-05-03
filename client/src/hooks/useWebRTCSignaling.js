import { useEffect, useRef, useCallback, useState } from "react";
import { socket } from "@/services/socket";

/**
 * WebRTC Signaling Hook (Star Topology)
 * Host broadcasts screen share to all participants
 * Uses Socket.IO for signaling
 *
 * Architecture:
 * - Host creates one RTCPeerConnection per viewer
 * - Each viewer creates one RTCPeerConnection to the host
 * - Offers ALWAYS flow host → viewer; answers flow viewer → host
 * - No onnegotiationneeded — all offers are explicit to avoid double-offer races
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

export const useWebRTCSignaling = ({ roomCode, isHost, participantIds, userId }) => {

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const isHostRef = useRef(isHost);
  const participantIdsRef = useRef(participantIds);
  const userIdRef = useRef(userId || socket.userId || null);
  const hasRemoteStreamRef = useRef(false);
  const iceCandidateQueueRef = useRef(new Map());
  // Guard against concurrent offer creation per peer
  const makingOfferRef = useRef(new Set());

  useEffect(() => {
    isHostRef.current = isHost;
    participantIdsRef.current = participantIds;
    userIdRef.current = userId || socket.userId || null;
  }, [isHost, participantIds, userId]);

  // ── Helper: flush queued ICE candidates ──
  const flushIceCandidates = useCallback((peerId, pc) => {
    if (iceCandidateQueueRef.current.has(peerId)) {
      const queued = iceCandidateQueueRef.current.get(peerId);
      iceCandidateQueueRef.current.delete(peerId);
      queued.forEach((c) => {
        try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      });
    }
  }, []);

  // ── Host side: create peer + send offer to a viewer ──
  // NO onnegotiationneeded — we send the offer explicitly after creating
  // the peer to avoid the double-offer m-line ordering bug.
  const createAndOfferToViewer = useCallback(async (viewerId, stream) => {
    const myId = userIdRef.current;
    if (!myId || !stream) return;

    // Prevent concurrent offers to same viewer
    if (makingOfferRef.current.has(viewerId)) return;

    // Close existing peer if any
    const existing = peersRef.current.get(viewerId);
    if (existing) {
      try { existing.close(); } catch {}
      peersRef.current.delete(viewerId);
    }
    iceCandidateQueueRef.current.delete(viewerId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(viewerId, pc);

    // Add tracks (this will NOT trigger onnegotiationneeded since we don't set it)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc:ice-candidate", {
          roomCode,
          to: viewerId,
          from: myId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        peersRef.current.delete(viewerId);
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

    // Create and send offer ONCE — no onnegotiationneeded involved
    try {
      makingOfferRef.current.add(viewerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", {
        roomCode,
        to: viewerId,
        from: myId,
        sdp: pc.localDescription,
      });
    } catch (err) {
      console.error("[WebRTC Screen] Offer creation failed:", err);
      // Cleanup on failure
      try { pc.close(); } catch {}
      peersRef.current.delete(viewerId);
    } finally {
      makingOfferRef.current.delete(viewerId);
    }

    return pc;
  }, [roomCode]);

  // ── Viewer side: create peer for receiving host's stream ──
  const createPeerForHost = useCallback((hostId) => {
    // Close existing peer to avoid state conflicts
    const existing = peersRef.current.get(hostId);
    if (existing) {
      try { existing.close(); } catch {}
      peersRef.current.delete(hostId);
    }
    iceCandidateQueueRef.current.delete(hostId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(hostId, pc);

    // Handle remote tracks (screen share stream from host)
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
        const myId = userIdRef.current;
        if (myId) {
          setTimeout(() => {
            socket.emit("webrtc:request-stream", { roomCode, from: myId });
          }, 1500);
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
    peersRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    peersRef.current.clear();
    iceCandidateQueueRef.current.clear();
    makingOfferRef.current.clear();
    setRemoteStream(null);
    hasRemoteStreamRef.current = false;
  }, []);

  // ── Socket.IO listeners ──
  useEffect(() => {
    const myId = userIdRef.current;
    if (!roomCode || !myId) return;

    // Host: viewer requested the stream → create peer + send offer
    // Guard: don't tear down a peer that is actively connecting or already connected.
    // The viewer retries every 1.5s — without this guard, each retry destroys the
    // in-progress connection, causing an infinite reconnect loop.
    const handleRequestStream = ({ from }) => {
      if (!isHostRef.current || !localStreamRef.current) return;

      const existing = peersRef.current.get(from);
      if (existing) {
        const state = existing.connectionState;
        if (state === "connecting" || state === "connected" || state === "new") {
          // Peer is still viable — don't recreate
          return;
        }
      }

      createAndOfferToViewer(from, localStreamRef.current);
    };

    // Viewer: received offer from host → set remote, create answer
    const handleOffer = async ({ from, sdp }) => {
      // Always create fresh peer for incoming offers to avoid state conflicts
      const pc = createPeerForHost(from);

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
        console.error("[WebRTC Screen] Answer creation failed:", err);
      }
    };

    // Host: received answer from viewer
    const handleAnswer = async ({ from, sdp }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;

      // Accept answer if peer is waiting for one; silently ignore otherwise
      // (stale answers from old offer cycles are harmless)
      if (pc.signalingState !== "have-local-offer") return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        flushIceCandidates(from, pc);
      } catch (err) {
        console.error("[WebRTC Screen] Set remote description failed:", err);
      }
    };

    // ICE candidate from either side
    const handleIceCandidate = ({ from, candidate }) => {
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
    };

    const handleStreamStopped = ({ from }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        try { pc.close(); } catch {}
        peersRef.current.delete(from);
      }
      iceCandidateQueueRef.current.delete(from);
      setRemoteStream(null);
      hasRemoteStreamRef.current = false;
    };

    const handleAudioPermissionDenied = ({ error, error_code }) => {
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
    let retryTimer = null;
    if (!isHostRef.current) {
      let attempts = 0;
      const maxAttempts = 12;

      socket.emit("webrtc:request-stream", { roomCode, from: myId });

      retryTimer = setInterval(() => {
        if (hasRemoteStreamRef.current || attempts >= maxAttempts) {
          clearInterval(retryTimer);
          retryTimer = null;
          return;
        }
        attempts += 1;
        socket.emit("webrtc:request-stream", { roomCode, from: myId });
      }, 1500);
    }

    return () => {
      if (retryTimer) clearInterval(retryTimer);
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
  }, [roomCode, userId, createAndOfferToViewer, createPeerForHost, closeAllPeers, flushIceCandidates]);

  // Host: start broadcasting to all current participants
  const startBroadcastStream = useCallback((stream) => {
    const myId = userIdRef.current;
    localStreamRef.current = stream;

    (participantIdsRef.current || []).forEach((pid) => {
      if (pid === myId) return;
      createAndOfferToViewer(pid, stream);
    });
  }, [createAndOfferToViewer]);

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