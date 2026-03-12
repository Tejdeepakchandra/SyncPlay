import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * WebRTC Signaling Hook (Star Topology)
 * Host broadcasts screen share to all participants
 * Uses Supabase Realtime for signaling
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

export const useWebRTCSignaling = ({ roomId, isHost, participantIds }) => {
  const { user } = useAuth();
  const channelRef = useRef(null);
  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const isHostRef = useRef(isHost);
  const participantIdsRef = useRef(participantIds);

  useEffect(() => {
    isHostRef.current = isHost;
    participantIdsRef.current = participantIds;
  }, [isHost, participantIds]);

  // Send signal
  const sendSignal = useCallback((payload) => {
    channelRef.current?.send({ type: "broadcast", event: "webrtc", payload });
  }, []);

  // Create peer for participant (host side)
  const createPeerForParticipant = useCallback((peerId, stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({
          signal: "ice",
          candidate: e.candidate.toJSON(),
          from: user.id,
          to: peerId,
        });
      }
    };

    // Create offer
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          signal: "offer",
          sdp: pc.localDescription,
          from: user.id,
          to: peerId,
        });
      } catch (err) {
        console.error("[WebRTC] Negotiation error:", err);
      }
    };

    return pc;
  }, [user, sendSignal]);

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
      if (e.candidate) {
        sendSignal({
          signal: "ice",
          candidate: e.candidate.toJSON(),
          from: user.id,
          to: hostId,
        });
      }
    };

    return pc;
  }, [user, sendSignal]);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setRemoteStream(null);
  }, []);

  // Setup Supabase channel
  useEffect(() => {
    if (!roomId || !user?.id) return;

    const channel = supabase.channel(`rtc-signal-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "webrtc" }, async ({ payload }) => {
        const myId = user.id;

        switch (payload.signal) {
          case "request_stream": {
            if (!isHostRef.current || !localStreamRef.current) break;

            const pc = createPeerForParticipant(payload.from, localStreamRef.current);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendSignal({
                signal: "offer",
                sdp: pc.localDescription,
                from: myId,
                to: payload.from,
              });
            } catch (err) {
              console.error("[WebRTC] Offer creation failed:", err);
            }
            break;
          }

          case "offer": {
            if (payload.to !== myId) break;

            let pc = peersRef.current.get(payload.from);
            if (!pc) pc = createPeerForHost(payload.from);

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal({
                signal: "answer",
                sdp: pc.localDescription,
                from: myId,
                to: payload.from,
              });
            } catch (err) {
              console.error("[WebRTC] Answer creation failed:", err);
            }
            break;
          }

          case "answer": {
            if (payload.to !== myId) break;

            const pc = peersRef.current.get(payload.from);
            if (pc) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              } catch (err) {
                console.error("[WebRTC] Set remote description failed:", err);
              }
            }
            break;
          }

          case "ice": {
            if (payload.to !== myId) break;

            const pc = peersRef.current.get(payload.from);
            if (pc) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch {
                // Ignore - may arrive before remote description
              }
            }
            break;
          }

          case "stream_stopped": {
            const pc = peersRef.current.get(payload.from);
            if (pc) {
              pc.close();
              peersRef.current.delete(payload.from);
            }
            setRemoteStream(null);
            break;
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (!isHostRef.current) {
            sendSignal({ signal: "request_stream", from: user.id });
          }
        }
      });

    channelRef.current = channel;

    return () => {
      closeAllPeers();
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id, createPeerForParticipant, createPeerForHost, sendSignal, closeAllPeers]);

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
    sendSignal({ signal: "stream_stopped", from: user.id });
    closeAllPeers();
  }, [user, sendSignal, closeAllPeers]);

  return {
    remoteStream,
    startBroadcastStream,
    stopBroadcastStream,
  };
};