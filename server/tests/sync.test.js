function createSocketHarness(userId = 'user-1') {
	const handlers = {};
	const directEmits = [];
	const roomEmits = [];

	const socket = {
		userId,
		on: jest.fn((event, handler) => {
			handlers[event] = handler;
		}),
		emit: jest.fn((event, payload) => {
			directEmits.push({ event, payload });
		}),
		to: jest.fn((roomCode) => ({
			emit: jest.fn((event, payload) => {
				roomEmits.push({ roomCode, event, payload });
			}),
		})),
	};

	return { socket, handlers, directEmits, roomEmits };
}

function makeRoom({ role = 'host', canControl = true, status = 'active' } = {}) {
	return {
		status,
		participants: [
			{
				userId: {
					toString: () => 'user-1',
				},
				role,
				permissions: {
					canControl,
				},
			},
		],
	};
}

function setup({ room = makeRoom(), syncState } = {}) {
	jest.resetModules();

	const mockedSyncState = syncState || {
		isPlaying: false,
		baseTimestamp: 12,
		playbackRate: 1,
		version: 3,
		startAt: null,
		lastUpdated: 1000,
	};

	const stateCache = new Map();

	const syncService = {
		getSyncState: jest.fn().mockResolvedValue(mockedSyncState),
		handlePlay: jest.fn(),
		handlePause: jest.fn(),
		handleSeek: jest.fn(),
		handleRateChange: jest.fn(),
		calculateClientDrift: jest.fn().mockReturnValue({}),
		resetDriftTelemetry: jest.fn().mockReturnValue({ roomCode: 'ROOM10', clearedSamples: 0 }),
		recordControlTelemetry: jest.fn(),
		getControlTelemetry: jest.fn().mockReturnValue({
			roomCode: 'ROOM10',
			sampleCount: 0,
			windowMs: 600000,
			byAction: { play: 0, pause: 0, seek: 0, rate_change: 0 },
			byOutcome: { accepted: 0, stale: 0, rejected: 0, rate_limited: 0, permission_denied: 0 },
			cooldownPressureCount: 0,
			lastUpdated: Date.now(),
		}),
		resetControlTelemetry: jest.fn().mockReturnValue({ roomCode: 'ROOM10', clearedSamples: 0 }),
		stateCache,
	};

	const roomService = {};
	const analyticsService = {
		incrementSyncAction: jest.fn().mockResolvedValue(true),
		logRoomEvent: jest.fn().mockResolvedValue(true),
	};

	const roomDoc = {
		...room,
		_id: 'mongo-room-1',
		hostId: { toString: () => 'user-1' },
		coHosts: [],
		media: { current: null },
	};

	const Room = {
		findOne: jest.fn(() => ({
			select: jest.fn(() => ({
				lean: jest.fn().mockResolvedValue(roomDoc),
			})),
			then: (resolve, reject) => Promise.resolve(roomDoc).then(resolve, reject),
			catch: (reject) => Promise.resolve(roomDoc).catch(reject),
		})),
		findOneAndUpdate: jest.fn().mockReturnValue({
			catch: jest.fn(),
		}),
	};

	const rateLimiter = {
		socketRateLimiter: jest.fn(() => (socket, next) => next()),
	};

	// Mock redis client used inline by sync:media-change
	const redisClient = {
		set: jest.fn().mockReturnValue({ catch: jest.fn() }),
		isReady: true,
	};

	jest.doMock('../src/services/syncService', () => syncService);
	jest.doMock('../src/services/roomService', () => roomService);
	jest.doMock('../src/services/analyticsService', () => analyticsService);
	jest.doMock('../src/models/mongodb/Room', () => Room);
	jest.doMock('../src/socket/middleware/rateLimiter', () => rateLimiter);
	jest.doMock('../src/config/redis', () => redisClient);
	jest.doMock('../src/utils/helpers', () => ({
		createRedisKey: jest.fn((...args) => args.join(':')),
	}));
	jest.doMock('../src/utils/constants', () => ({
		REDIS_KEYS: { SYNC_STATE: 'sync' },
		CACHE_TTL: { SYNC_STATE: 600 },
	}));

	const registerSyncHandlers = require('../src/socket/handlers/syncHandlers');
	const harness = createSocketHarness();

	// Create a proper io mock with to().emit()
	const ioRoomEmits = harness.roomEmits;
	const io = {
		to: jest.fn((roomCode) => ({
			emit: jest.fn((event, payload) => {
				ioRoomEmits.push({ roomCode, event, payload });
			}),
		})),
	};

	registerSyncHandlers(harness.socket, io);

	return {
		...harness,
		syncService,
		roomService,
		analyticsService,
		Room,
		rateLimiter,
	};
}

function expectRoomBroadcast(roomEmits, eventName) {
	return roomEmits.find((e) => e.event === eventName);
}

function emitWithCallback(handler, payload) {
	return new Promise((resolve) => {
		handler(payload, (result) => resolve(result));
	});
}

describe('syncHandlers socket contract', () => {
	test('sync:broadcast is disabled and returns explicit migration error', async () => {
		const { handlers } = setup();
		const response = await emitWithCallback(handlers['sync:broadcast'], {
			roomCode: 'ROOM1',
			event: 'play',
		});

		expect(response.success).toBe(false);
		expect(response.error).toContain('Legacy sync:broadcast disabled');
	});

	test('sync:request-state emits sync:update and returns current playback', async () => {
		const { handlers, directEmits, syncService } = setup({
			syncState: {
				isPlaying: false,
				baseTimestamp: 42,
				playbackRate: 1,
				version: 7,
				startAt: null,
				lastUpdated: 5000,
			},
		});

		const response = await emitWithCallback(handlers['sync:request-state'], {
			roomCode: 'ROOM2',
		});

		expect(syncService.getSyncState).toHaveBeenCalledWith('ROOM2');
		expect(response.success).toBe(true);
		expect(response.state).toMatchObject({
			isPlaying: false,
			time: 42,
			version: 7,
			playbackRate: 1,
		});
		expect(directEmits).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					event: 'sync:update',
					payload: expect.objectContaining({
						currentPlayback: expect.objectContaining({ time: 42, version: 7 }),
					}),
				}),
			])
		);
	});

	test('sync:media-change stores media and broadcasts update to room', async () => {
		const { handlers, roomEmits, syncService } = setup();
		const media = { type: 'youtube', url: 'https://youtu.be/demo' };

		const response = await emitWithCallback(handlers['sync:media-change'], {
			roomCode: 'ROOM3',
			media,
		});

		expect(response.success).toBe(true);
		expect(response.currentPlayback.media).toMatchObject(media);


		const mediaChangeEvent = roomEmits.find((e) => e.event === 'sync:media-change');
		const updateEvent = roomEmits.find((e) => e.event === 'sync:update');

		expect(mediaChangeEvent).toBeDefined();
		expect(mediaChangeEvent.payload.media).toEqual(media);
		expect(updateEvent).toBeDefined();
		expect(updateEvent.payload.currentPlayback.media).toMatchObject(media);
	});

	test('sync:media-change dedupes rapid identical media changes', async () => {
		const { handlers, roomEmits } = setup();
		const media = { type: 'youtube', videoId: 'abc123', url: 'https://youtu.be/abc123' };

		const first = await emitWithCallback(handlers['sync:media-change'], {
			roomCode: 'ROOM3D',
			media,
		});
		const second = await emitWithCallback(handlers['sync:media-change'], {
			roomCode: 'ROOM3D',
			media,
		});

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(second.duplicate).toBe(true);
		const mediaChangeEvents = roomEmits.filter((e) => e.event === 'sync:media-change');
		expect(mediaChangeEvents).toHaveLength(1);
	});

	test('sync:seek rejects stale client versions before mutating state', async () => {
		const { handlers, syncService } = setup({
			syncState: {
				isPlaying: true,
				baseTimestamp: 10,
				playbackRate: 1,
				version: 11,
				startAt: Date.now(),
				lastUpdated: Date.now(),
			},
		});

		const response = await emitWithCallback(handlers['sync:seek'], {
			roomCode: 'ROOM4',
			newTime: 99,
			duration: 120,
			clientVersion: 10,
		});

		expect(response.success).toBe(false);
		expect(response.error).toBe('Stale client');
		expect(syncService.handleSeek).not.toHaveBeenCalled();
	});

	test('sync:check-position returns drift payload and syncState snapshot', async () => {
		const { handlers, syncService } = setup({
			syncState: {
				isPlaying: true,
				baseTimestamp: 60,
				playbackRate: 1,
				version: 5,
				startAt: 123456789,
				lastUpdated: Date.now(),
			},
		});

		syncService.calculateClientDrift.mockReturnValue({
			action: 'rateAdjust',
			driftMs: 140,
			suggestedRate: 1.05,
		});

		const response = await emitWithCallback(handlers['sync:check-position'], {
			roomCode: 'ROOM5',
			clientPosition: 63,
			clientNow: Date.now(),
			clientOffset: 5,
		});

		expect(response.success).toBe(true);
		expect(response.action).toBe('rateAdjust');
		expect(response.syncState).toMatchObject({
			version: 5,
			isPlaying: true,
			playbackRate: 1,
			baseTimestamp: 60,
			startAt: 123456789,
		});
	});

	test('sync:play success emits authoritative state and increments analytics', async () => {
		const now = Date.now();
		const { handlers, roomEmits, syncService, analyticsService } = setup({
			syncState: {
				isPlaying: false,
				baseTimestamp: 0,
				playbackRate: 1,
				version: 1,
				startAt: null,
				lastUpdated: now,
			},
		});

		syncService.handlePlay.mockResolvedValue({
			success: true,
			state: {
				isPlaying: true,
				baseTimestamp: 120,
				playbackRate: 1,
				version: 2,
				startAt: now,
				lastUpdated: now,
			},
		});

		const response = await emitWithCallback(handlers['sync:play'], {
			roomCode: 'ROOM6',
			timestamp: 120,
			latency: 80,
			duration: 300,
			clientVersion: 1,
		});

		expect(response.success).toBe(true);
		expect(syncService.handlePlay).toHaveBeenCalledWith('ROOM6', 'user-1', 120, 80, null);
		const stateUpdate = expectRoomBroadcast(roomEmits, 'sync:update');
		expect(stateUpdate.payload.currentPlayback).toHaveProperty('media');
		// Analytics is fire-and-forget (.then after callback), so flush microtasks
		await new Promise(r => setTimeout(r, 50));
		expect(analyticsService.incrementSyncAction).toHaveBeenCalledWith('mongo-room-1', 'play');
	});

	test('sync:pause success emits authoritative state and increments analytics', async () => {
		const now = Date.now();
		const { handlers, roomEmits, syncService, analyticsService } = setup({
			syncState: {
				isPlaying: true,
				baseTimestamp: 200,
				playbackRate: 1,
				version: 4,
				startAt: now - 2000,
				lastUpdated: now,
			},
		});

		syncService.handlePause.mockResolvedValue({
			success: true,
			state: {
				isPlaying: false,
				baseTimestamp: 202,
				playbackRate: 1,
				version: 5,
				startAt: null,
				lastUpdated: now,
			},
		});

		const response = await emitWithCallback(handlers['sync:pause'], {
			roomCode: 'ROOM7',
			timestamp: 202,
			duration: 300,
			clientVersion: 4,
		});

		expect(response.success).toBe(true);
		expect(syncService.handlePause).toHaveBeenCalledWith('ROOM7', 'user-1', 202, null);
		expect(expectRoomBroadcast(roomEmits, 'sync:update')).toBeDefined();
		await new Promise(r => setTimeout(r, 50));
		expect(analyticsService.incrementSyncAction).toHaveBeenCalledWith('mongo-room-1', 'pause');
	});

	test('sync:rate-change success emits authoritative state', async () => {
		const now = Date.now();
		const { handlers, roomEmits, syncService } = setup({
			syncState: {
				isPlaying: true,
				baseTimestamp: 50,
				playbackRate: 1,
				version: 2,
				startAt: now - 1000,
				lastUpdated: now,
			},
		});

		syncService.handleRateChange.mockResolvedValue({
			success: true,
			state: {
				isPlaying: true,
				baseTimestamp: 50,
				playbackRate: 1.25,
				version: 3,
				startAt: now,
				lastUpdated: now,
			},
		});

		const response = await emitWithCallback(handlers['sync:rate-change'], {
			roomCode: 'ROOM8',
			rate: 1.25,
			clientVersion: 2,
		});

		expect(response.success).toBe(true);
		expect(syncService.handleRateChange).toHaveBeenCalledWith('ROOM8', 'user-1', 1.25, null);
		expect(expectRoomBroadcast(roomEmits, 'sync:update')).toBeDefined();
	});

	test('late-join request-state replays authoritative projected time while playing', async () => {
		const now = Date.now();
		const { handlers } = setup({
			syncState: {
				isPlaying: true,
				baseTimestamp: 10,
				playbackRate: 1,
				version: 9,
				startAt: now - 4000,
				lastUpdated: now,
			},
		});

		const response = await emitWithCallback(handlers['sync:request-state'], {
			roomCode: 'ROOM9',
		});

		expect(response.success).toBe(true);
		expect(response.state.isPlaying).toBe(true);
		expect(response.state.time).toBeGreaterThanOrEqual(13.5);
		expect(response.state.time).toBeLessThan(15.5);
	});

	test('sync:get-telemetry returns drift percentiles and correction counts', async () => {
		const { handlers, syncService } = setup();

		syncService.getDriftTelemetry = jest.fn().mockReturnValue({
			roomCode: 'ROOM10',
			sampleCount: 12,
			windowMs: 600000,
			driftMs: { p50: 90, p95: 220 },
			correctionCounts: { none: 6, rateAdjust: 4, gradual: 1, hardSeek: 1 },
			lastUpdated: Date.now(),
		});

		const response = await emitWithCallback(handlers['sync:get-telemetry'], {
			roomCode: 'ROOM10',
		});

		expect(response.success).toBe(true);
		expect(response.telemetry.driftMs.p50).toBe(90);
		expect(response.telemetry.driftMs.p95).toBe(220);
		expect(response.telemetry.correctionCounts.rateAdjust).toBe(4);
	});

	test('sync:reset-telemetry clears room telemetry for controller', async () => {
		const { handlers, syncService } = setup();

		syncService.resetDriftTelemetry = jest.fn().mockReturnValue({
			roomCode: 'ROOM11',
			clearedSamples: 18,
		});

		const response = await emitWithCallback(handlers['sync:reset-telemetry'], {
			roomCode: 'ROOM11',
		});

		expect(response.success).toBe(true);
		expect(response.reset).toMatchObject({ roomCode: 'ROOM11', clearedSamples: 18 });
		expect(syncService.resetDriftTelemetry).toHaveBeenCalledWith('ROOM11');
	});

	test('sync:reset-telemetry denies non-controller users', async () => {
		const { handlers, syncService } = setup({
			room: makeRoom({ role: 'participant', canControl: false }),
		});

		// Override Room.findOne for this test to return a room where user is NOT host
		const Room = require('../src/models/mongodb/Room');
		Room.findOne.mockImplementation(() => ({
			select: jest.fn(() => ({
				lean: jest.fn().mockResolvedValue({
					_id: 'mongo-room-1',
					hostId: { toString: () => 'some-other-user' },
					coHosts: [],
					participants: [{
						userId: { toString: () => 'user-1' },
						role: 'participant',
						permissions: { canControl: false },
					}],
					status: 'active',
				}),
			})),
			then: (resolve) => Promise.resolve({
				_id: 'mongo-room-1',
				hostId: { toString: () => 'some-other-user' },
				coHosts: [],
				participants: [{
					userId: { toString: () => 'user-1' },
					role: 'participant',
					permissions: { canControl: false },
				}],
				status: 'active',
			}).then(resolve),
			catch: (reject) => Promise.resolve({}).catch(reject),
		}));

		const response = await emitWithCallback(handlers['sync:reset-telemetry'], {
			roomCode: 'ROOM12',
		});

		expect(response.success).toBe(false);
		expect(response.error).toBe('Permission denied');
		expect(syncService.resetDriftTelemetry).not.toHaveBeenCalled();
	});
});
