import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRoomSync } from "./useRoomSync";

vi.mock("@/services/socket", () => {
  const handlers = new Map();
  return {
    socket: {
      on: vi.fn((event, cb) => {
        const list = handlers.get(event) || [];
        list.push(cb);
        handlers.set(event, list);
      }),
      off: vi.fn((event, cb) => {
        if (!handlers.has(event)) return;
        const list = handlers.get(event).filter((fn) => fn !== cb);
        handlers.set(event, list);
      }),
      emit: vi.fn((event, payload, cb) => {
        if (event === "sync:seek" && typeof cb === "function") {
          cb({ success: true, state: { version: 3 } });
        }
      }),
      __emitToClient: (event, payload) => {
        const list = handlers.get(event) || [];
        list.forEach((cb) => cb(payload));
      },
      __clear: () => {
        handlers.clear();
      },
    },
  };
});

import { socket } from "@/services/socket";

describe("useRoomSync", () => {
  beforeEach(() => {
    socket.__clear();
    vi.clearAllMocks();
  });

  it("rolls back on stale client response and notifies conflict callback", () => {
    const onSeek = vi.fn();
    const onPause = vi.fn();
    const onConflict = vi.fn();

    socket.emit.mockImplementation((event, payload, cb) => {
      if (event === "sync:play" && typeof cb === "function") {
        cb({
          success: false,
          error: "Stale client",
          currentState: {
            version: 9,
            isPlaying: false,
            baseTimestamp: 42,
            playbackRate: 1,
            startAt: null,
          },
        });
      }
      if (event === "sync:request-state") {
        return;
      }
    });

    const { result } = renderHook(() =>
      useRoomSync({
        roomCode: "ROOMA",
        mode: "advanced",
        isHost: true,
        onSeek,
        onPause,
        onSyncConflict: onConflict,
      })
    );

    act(() => {
      result.current.broadcastPlay(5, 100);
    });

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(42);
    expect(onPause).toHaveBeenCalled();
  });

  it("coalesces rapid seek broadcasts into one socket emit", async () => {
    vi.useFakeTimers();
    const onSeek = vi.fn();

    const { result } = renderHook(() =>
      useRoomSync({
        roomCode: "ROOMB",
        mode: "advanced",
        isHost: true,
        onSeek,
      })
    );

    act(() => {
      result.current.broadcastSeek(10, 120);
      result.current.broadcastSeek(20, 120);
      result.current.broadcastSeek(30, 120);
      vi.advanceTimersByTime(130);
    });

    const seekCalls = socket.emit.mock.calls.filter((c) => c[0] === "sync:seek");
    expect(seekCalls).toHaveLength(1);
    expect(seekCalls[0][1]).toMatchObject({ newTime: 30, duration: 120 });

    vi.useRealTimers();
  });
});
