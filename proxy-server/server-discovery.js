const dns = require("node:dns").promises;
const murmur = require("murmurhash3js");

const DEFAULT_DISCOVERY_MODE = "ports";
const DEFAULT_DISCOVERY_HOST = "localhost";
const DEFAULT_DISCOVERY_SERVICE_NAME = "server";
const DEFAULT_DISCOVERY_SERVICE_PORT = 6001;
const DEFAULT_DISCOVERY_START_PORT = 6001;
const DEFAULT_DISCOVERY_END_PORT = 6003;
const DEFAULT_DISCOVERY_HEALTH_PATH = "/api/health";
const DEFAULT_DISCOVERY_TIMEOUT_MS = 1000;

function hash(value) {
	return murmur.x86.hash32(String(value));
}

function buildDiscoveryPorts(startPort = DEFAULT_DISCOVERY_START_PORT, endPort = DEFAULT_DISCOVERY_END_PORT) {
	const ports = [];

	for (let port = startPort; port <= endPort; port += 1) {
		console.log(port, 'port')
		ports.push(port);
	}

	return ports;
}

function buildHashRing(servers = []) {
	return [...new Set(servers)]
		.map((server) => ({
			hash: hash(server),
			server,
		}))
		.sort((left, right) => left.hash - right.hash);
}

function consistentHash(key, ring = []) {
	if (ring.length === 0) {
		return null;
	}

	const hashed = hash(key);
	let left = 0;
	let right = ring.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);

		if (ring[mid].hash >= hashed) {
			right = mid - 1;
		} else {
			left = mid + 1;
		}
	}

	return ring[left % ring.length].server;
}

async function probeOrigins(origins, { fetchImpl = fetch, healthPath = DEFAULT_DISCOVERY_HEALTH_PATH, timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS } = {}) {
	const probes = origins.map(async (origin) => {
		try {
			const response = await fetchImpl(`${origin}${healthPath}`, {
				signal: AbortSignal.timeout(timeoutMs),
			});

			return response.ok ? origin : null;
		} catch {
			return null;
		}
	});

	const results = await Promise.all(probes);

	return results.filter(Boolean);
}

async function discoverServersByPorts({
	fetchImpl = fetch,
	host = DEFAULT_DISCOVERY_HOST,
	startPort = DEFAULT_DISCOVERY_START_PORT,
	endPort = DEFAULT_DISCOVERY_END_PORT,
	healthPath = DEFAULT_DISCOVERY_HEALTH_PATH,
	timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
} = {}) {
	const origins = buildDiscoveryPorts(startPort, endPort).map((port) => `http://${host}:${port}`);
	return probeOrigins(origins, { fetchImpl, healthPath, timeoutMs });
}

async function discoverServersByService({
	fetchImpl = fetch,
	resolveImpl = dns.resolve4,
	serviceName = DEFAULT_DISCOVERY_SERVICE_NAME,
	servicePort = DEFAULT_DISCOVERY_SERVICE_PORT,
	healthPath = DEFAULT_DISCOVERY_HEALTH_PATH,
	timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
} = {}) {
	let addresses = [];

	try {
		addresses = await resolveImpl(serviceName);
		console.log(addresses, '[addresses]')
	} catch {
		return [];
	}

	const normalizedAddresses = [...new Set(addresses.map((record) => (typeof record === "string" ? record : record?.address)).filter(Boolean))].sort((left, right) => left.localeCompare(right));
	const origins = normalizedAddresses.map((address) => `http://${address}:${servicePort}`);

	return probeOrigins(origins, { fetchImpl, healthPath, timeoutMs });
}

async function discoverServers(options = {}) {
	const mode = options.mode ?? DEFAULT_DISCOVERY_MODE;

	if (mode === "service") {
		return discoverServersByService(options);
	}

	return discoverServersByPorts(options);
}

module.exports = {
	DEFAULT_DISCOVERY_END_PORT,
	DEFAULT_DISCOVERY_HEALTH_PATH,
	DEFAULT_DISCOVERY_HOST,
	DEFAULT_DISCOVERY_MODE,
	DEFAULT_DISCOVERY_SERVICE_NAME,
	DEFAULT_DISCOVERY_SERVICE_PORT,
	DEFAULT_DISCOVERY_START_PORT,
	DEFAULT_DISCOVERY_TIMEOUT_MS,
	buildDiscoveryPorts,
	buildHashRing,
	consistentHash,
	discoverServers,
	discoverServersByPorts,
	discoverServersByService,
	hash,
};
