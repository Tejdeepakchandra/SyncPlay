/**
 * Supabase compatibility shim
 *
 * The backend is Express + Socket.IO, NOT Supabase.
 * This module provides the same API surface that the hooks expect
 * (`.channel()`, `.from()`, `.removeChannel()`) but delegates to
 * Socket.IO for realtime and axios for REST queries.
 */

import { getSocket } from "@/services/socket";
import api from "@/services/api";

// ─── Channel (Realtime) shim ─────────────────────────────────────

class RealtimeChannel {
  constructor(name, opts) {
    this.name = name;
    this.opts = opts;
    this._listeners = [];
    this._socket = getSocket();
  }

  /**
   * .on("broadcast", { event }, handler)
   * .on("postgres_changes", filter, handler)
   *
   * We translate both into Socket.IO event listeners scoped to
   * this channel name.
   */
  on(type, filter, handler) {
    if (type === "broadcast") {
      const event = filter?.event ?? "message";
      const wrappedKey = `${this.name}:${event}`;

      const wrapper = (payload) => handler({ payload });
      this._listeners.push({ key: wrappedKey, wrapper });
      this._socket.on(wrappedKey, wrapper);
    } else if (type === "postgres_changes") {
      // For real-time DB changes we route through a server-side
      // relay that will emit `<channel>:db-change` events.
      const wrappedKey = `${this.name}:db-change`;
      const wrapper = (payload) => handler(payload);
      this._listeners.push({ key: wrappedKey, wrapper });
      this._socket.on(wrappedKey, wrapper);
    }
    return this; // chainable
  }

  /** Subscribe to the channel. */
  subscribe(statusCallback) {
    this._socket.emit("channel:subscribe", { channel: this.name });
    // Notify caller that we're subscribed.
    // In real Supabase the callback receives a status string.
    if (typeof statusCallback === "function") {
      statusCallback("SUBSCRIBED");
    }
    return this;
  }

  /** Broadcast a payload to the channel. */
  send(payload) {
    this._socket.emit("channel:broadcast", {
      channel: this.name,
      ...payload,
    });
    return this;
  }

  /** Unsubscribe / cleanup. */
  unsubscribe() {
    this._listeners.forEach(({ key, wrapper }) => {
      this._socket.off(key, wrapper);
    });
    this._listeners = [];
    this._socket.emit("channel:unsubscribe", { channel: this.name });
  }
}

// ─── Query builder shim (.from()) ────────────────────────────────

class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._filters = {};
    this._selectCols = "*";
    this._orderCol = null;
    this._orderAsc = true;
    this._limitVal = null;
    this._single = false;
    this._insertData = null;
  }

  select(cols = "*") {
    this._selectCols = cols;
    return this;
  }

  eq(col, val) {
    this._filters[col] = val;
    return this;
  }

  order(col, { ascending = true } = {}) {
    this._orderCol = col;
    this._orderAsc = ascending;
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  single() {
    this._single = true;
    return this._execute();
  }

  insert(data) {
    this._insertData = data;
    return this._execute();
  }

  /** Trigger the HTTP request (also called implicitly via `.single()` or await). */
  async _execute() {
    try {
      if (this._insertData) {
        const { data } = await api.post(`/db/${this._table}`, this._insertData);
        return { data: data?.data ?? data, error: null };
      }

      const params = {
        select: this._selectCols,
        ...this._filters,
      };
      if (this._orderCol) {
        params._order = this._orderCol;
        params._asc = this._orderAsc;
      }
      if (this._limitVal) params._limit = this._limitVal;
      if (this._single) params._single = true;

      const { data } = await api.get(`/db/${this._table}`, { params });
      return { data: data?.data ?? data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Support `await supabase.from("x").select("*").eq("id",1)` without `.single()`
  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }
}

// ─── Public client ───────────────────────────────────────────────

const _channels = new Map();

export const supabase = {
  /**
   * Create / get a Realtime channel.
   */
  channel(name, opts) {
    const ch = new RealtimeChannel(name, opts);
    _channels.set(name, ch);
    return ch;
  },

  /**
   * Remove (unsubscribe + cleanup) a channel.
   */
  removeChannel(channel) {
    if (channel) {
      channel.unsubscribe();
      _channels.delete(channel.name);
    }
  },

  /**
   * Query builder entry — `.from("rooms").select("*").eq("id", 1)`.
   */
  from(table) {
    return new QueryBuilder(table);
  },
};
