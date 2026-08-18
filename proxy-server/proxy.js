const http = require("http");
const {
	buildHashRing,
	consistentHash,
	discoverServers,
	DEFAULT_DISCOVERY_MODE,
	DEFAULT_DISCOVERY_END_PORT,
	DEFAULT_DISCOVERY_HOST,
	DEFAULT_DISCOVERY_SERVICE_NAME,
	DEFAULT_DISCOVERY_SERVICE_PORT,
	DEFAULT_DISCOVERY_START_PORT,
	DEFAULT_DISCOVERY_TIMEOUT_MS,
} = require("./server-discovery");

const proxyPort = Number(process.env.PORT ?? 5001);
const discoveryMode = process.env.DISCOVERY_MODE ?? (process.env.DISCOVERY_SERVICE_NAME ? "service" : DEFAULT_DISCOVERY_MODE);
const discoveryHost = process.env.DISCOVERY_HOST ?? DEFAULT_DISCOVERY_HOST;
const discoveryServiceName = process.env.DISCOVERY_SERVICE_NAME ?? DEFAULT_DISCOVERY_SERVICE_NAME;
const discoveryServicePort = Number(process.env.DISCOVERY_SERVICE_PORT ?? DEFAULT_DISCOVERY_SERVICE_PORT);
const discoveryStartPort = Number(process.env.DISCOVERY_PORT_START ?? DEFAULT_DISCOVERY_START_PORT);
const discoveryEndPort = Number(process.env.DISCOVERY_PORT_END ?? DEFAULT_DISCOVERY_END_PORT);
const discoveryTimeoutMs = Number(process.env.DISCOVERY_TIMEOUT_MS ?? DEFAULT_DISCOVERY_TIMEOUT_MS);
const discoveryIntervalMs = Number(process.env.DISCOVERY_INTERVAL_MS ?? 20_000);

let backendServers = [];
let hashRing = [];

function firstHeaderValue(value) {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

function logProxyResponse(logger, { reqId, method, path, targetServer, backendId, backendPort, statusCode }) {
	logger(
		`[proxy] ${method} ${path} reqId=${reqId} -> ${targetServer} backendId=${backendId} backendPort=${backendPort} responded ${statusCode}`,
	);
}

async function refreshDiscovery() {
	const discoveredServers = await discoverServers({
		mode: discoveryMode,
		host: discoveryHost,
		serviceName: discoveryServiceName,
		servicePort: discoveryServicePort,
		startPort: discoveryStartPort,
		endPort: discoveryEndPort,
		timeoutMs: discoveryTimeoutMs,
	});

	backendServers = discoveredServers;
	hashRing = buildHashRing(discoveredServers);

	console.log(`[proxy] discovered ${backendServers.length} backend server(s)`);
}

function buildProxy(port, { getHashRing = () => hashRing, logger = console.log, listenHost } = {}) {
	const server = http.createServer((req, res) => {
		const activeHashRing = getHashRing();

		if (activeHashRing.length === 0) {
			res.writeHead(503, { "content-type": "text/plain" });
			res.end("No backend servers available");
			return;
		}

		const reqId = req.headers["x-request-id"] ?? req.socket.remotePort ?? req.url;
		const targetServer = consistentHash(reqId, activeHashRing);

		if (!targetServer) {
			res.writeHead(503, { "content-type": "text/plain" });
			res.end("No backend servers available");
			return;
		}

		const targetUrl = new URL(targetServer);
		const proxyReq = http.request(
			{
				hostname: targetUrl.hostname,
				path: req.url,
				headers: req.headers,
				method: req.method,
				port: targetUrl.port,
			},
			(proxyRes) => {
				const backendId = firstHeaderValue(proxyRes.headers["x-server-id"]) ?? targetServer;
				const backendPort = firstHeaderValue(proxyRes.headers["x-server-port"]) ?? targetUrl.port;

				logProxyResponse(logger, {
					reqId,
					method: req.method,
					path: req.url,
					targetServer,
					backendId,
					backendPort,
					statusCode: proxyRes.statusCode ?? 500,
				});

				res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
				proxyRes.pipe(res);
			},
		);

		proxyReq.on("error", (error) => {
			console.error(error);

			if (!res.headersSent) {
				res.writeHead(502);
			}

			res.end("Bad Gateway");
		});

		req.pipe(proxyReq);
	});

	const listenOptions = listenHost ? { port, host: listenHost } : port;

	server.listen(listenOptions, () => {
		logger(`[proxy] listening on port ${port}`);
	});

	return server;
}

async function start() {
	await refreshDiscovery();
	buildProxy(proxyPort);

	setInterval(() => {
		console.log("[proxy] searching for servers...");
		refreshDiscovery().catch((error) => {
			console.error("[proxy] discovery failed", error);
		});
	}, discoveryIntervalMs);
}

if (require.main === module) {
	start().catch((error) => {
		console.error("[proxy] failed to start", error);
		process.exit(1);
	});
}

module.exports = {
	buildProxy,
};
