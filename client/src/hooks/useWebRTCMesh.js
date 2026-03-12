import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export const useWebRTCMesh = ({ roomId, participantIds, localStream, enabled }) => {
  const { user } = useAuth();
  const channelRef = useRef(null);
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localStreamRef = useRef(null);
  const participantIdsRef = useRef(participantIds);
  const enabledRef = useRef(enabled);
  const userIdRef = useRef(user?.id);
  const subscribedRef = useRef(false);
  const messageQueueRef = useRef([]);

  useEffect(() => {
    localStreamRef.current = localStream;
    participantIdsRef.current = participantIds;
    enabledRef.current = enabled;
    userIdRef.current = user?.id;
  }, [localStream, participantIds, enabled, user?.id]);

  // Helper to send signals with queuing
  const sendSignal = useCallback((payload) => {
    const channel = channelRef.current;
    if (!channel) return;

    if (subscribedRef.current) {
      channel.send({ type: "broadcast", event: "webrtc-mesh", payload });
    } else {
      messageQueueRef.current.push(payload);
    }
  }, []);

  // Flush queued messages after subscription
  const flushQueue = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;

    const queue = messageQueueRef.current;
    messageQueueRef.current = [];

    queue.forEach((payload) => {
      channel.send({ type: "broadcast", event: "webrtc-mesh", payload });
    });
  }, []);

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
        sendSignal({
          signal: "mesh_ice",
          candidate: e.candidate.toJSON(),
          from: myId,
          to: peerId,
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
  }, [sendSignal]);

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
        sendSignal({
          signal: "mesh_offer",
          sdp: pc.localDescription,
          from: myId,
          to: peerId,
        });
      }
    } catch (err) {
      console.error("[WebRTC Mesh] Offer error:", err);
    }
  }, [createPeer, sendSignal]);

  // Setup Supabase channel
  useEffect(() => {
    if (!roomId || !user?.id || !enabled) return;

    subscribedRef.current = false;
    messageQueueRef.current = [];

    const channel = supabase.channel(`rtc-mesh-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "webrtc-mesh" }, async ({ payload }) => {
        if (!enabledRef.current) return;

        const myId = user.id;

        switch (payload.signal) {
          case "mesh_join": {
            if (!localStreamRef.current || payload.from === myId) break;

            if (shouldInitiate(myId, payload.from)) {
              await createAndSendOffer(payload.from);
            }
            break;
          }

          case "mesh_offer": {
            if (payload.to !== myId) break;

            const pc = createPeer(payload.from);
            if (!pc || pc.signalingState !== "stable") break;

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              if (pc.localDescription) {
                sendSignal({
                  signal: "mesh_answer",
                  sdp: pc.localDescription,
                  from: myId,
                  to: payload.from,
                });
              }
            } catch (err) {
              console.error("[WebRTC Mesh] Answer error:", err);
            }
            break;
          }

          case "mesh_answer": {
            if (payload.to !== myId) break;

            const pc = peersRef.current.get(payload.from);
            if (!pc || pc.signalingState !== "have-local-offer") break;

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (err) {
              console.error("[WebRTC Mesh] Set remote description error:", err);
            }
            break;
          }

          case "mesh_ice": {
            if (payload.to !== myId) break;

            const pc = peersRef.current.get(payload.from);
            if (!pc) break;

            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch {
              // Ignore - may arrive before remote description
            }
            break;
          }

          case "mesh_leave": {
            const pc = peersRef.current.get(payload.from);
            if (pc) {
              pc.close();
              peersRef.current.delete(payload.from);
            }
            removeRemoteStream(payload.from);
            break;
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
          flushQueue();

          // Announce presence
          if (localStreamRef.current) {
            sendSignal({ signal: "mesh_join", from: user.id });
          }
        }
      });

    channelRef.current = channel;

    return () => {
      if (subscribedRef.current && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc-mesh",
          payload: { signal: "mesh_leave", from: user.id },
        });
      }

      subscribedRef.current = false;
      messageQueueRef.current = [];
      closeAllPeers();
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id, enabled, createPeer, createAndSendOffer, sendSignal, flushQueue, closeAllPeers]);

  // Announce when local stream appears
  useEffect(() => {
    if (!enabled || !localStream || !user?.id) return;

    sendSignal({ signal: "mesh_join", from: user.id });

    participantIdsRef.current.forEach((pid) => {
      if (pid === user.id) return;
      if (shouldInitiate(user.id, pid)) {
        createAndSendOffer(pid);
      }
    });
  }, [localStream, enabled, user?.id, sendSignal, createAndSendOffer]);

  // Update tracks when local stream changes
  useEffect(() => {
    if (!localStream || !enabled) return;

    peersRef.current.forEach((pc) => {
      const senders = pc.getSenders();

      localStream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          pc.addTrack(track, localStream);
        }
      });
    });
  }, [localStream, enabled]);

  // Cleanup when disabled
  useEffect(() => {
    if (!enabled && user?.id) {
      sendSignal({ signal: "mesh_leave", from: user.id });
      // Close peers imperatively without triggering cascading setState
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    }
  }, [enabled, user?.id, sendSignal]);

  // Derive effective streams — when disabled, always return empty map
  const effectiveRemoteStreams = enabled ? remoteStreams : new Map();

  return { remoteStreams: effectiveRemoteStreams, closeAllPeers };
};