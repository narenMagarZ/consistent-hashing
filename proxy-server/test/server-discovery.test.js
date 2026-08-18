const test = require("node:test");
const assert = require("node:assert/strict");

const {
	buildDiscoveryPorts,
	buildHashRing,
	consistentHash,
	discoverServers,
} = require("../server-discovery");

test("buildDiscoveryPorts expands the configured range", () => {
	assert.deepEqual(buildDiscoveryPorts(6001, 6003), [6001, 6002, 6003]);
});

test("consistentHash returns the only backend in the ring", () => {
	const ring = buildHashRing(["http://localhost:6001"]);

	assert.equal(consistentHash("request-123", ring), "http://localhost:6001");
});

test("discoverServers probes every Docker service instance and health-checks each one", async () => {
	const requestedUrls = [];

	const discovered = await discoverServers({
		mode: "service",
		serviceName: "server",
		servicePort: 6001,
		resolveImpl: async () => ["172.20.0.3", "172.20.0.2"],
		fetchImpl: async (url) => {
			requestedUrls.push(url);

			return {
				ok: url.endsWith("172.20.0.2:6001/api/health") || url.endsWith("172.20.0.3:6001/api/health"),
			};
		},
		timeoutMs: 1000,
	});

	assert.deepEqual(requestedUrls, [
		"http://172.20.0.2:6001/api/health",
		"http://172.20.0.3:6001/api/health",
	]);
	assert.deepEqual(discovered, [
		"http://172.20.0.2:6001",
		"http://172.20.0.3:6001",
	]);
});

test("discoverServers still supports the manual host-port fallback", async () => {
	const requestedUrls = [];

	const discovered = await discoverServers({
		mode: "ports",
		host: "localhost",
		startPort: 6001,
		endPort: 6003,
		fetchImpl: async (url) => {
			requestedUrls.push(url);

			return {
				ok: url.endsWith(":6001/api/health") || url.endsWith(":6003/api/health"),
			};
		},
		timeoutMs: 1000,
	});

	assert.deepEqual(requestedUrls, [
		"http://localhost:6001/api/health",
		"http://localhost:6002/api/health",
		"http://localhost:6003/api/health",
	]);
	assert.deepEqual(discovered, [
		"http://localhost:6001",
		"http://localhost:6003",
	]);
});
