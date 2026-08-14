const http = require("http");
const murmur = require("murmurhash3js");
const { exec } = require("node:child_process");

const backendServers = [];
const hashRing = [];

function buildProxy(port) {
	http
		.createServer(async (req, res) => {
			const reqId = req.headers['x-request-id'];
			// simple hash
			// const targetServer = getServer(reqId || req.socket.remotePort);

			// consistent hash 
			const targetServer = consistentHash(reqId || req.socket.remotePort);
			console.log(targetServer, 'target server')
			const targetUrl = new URL(targetServer);

			const proxyReq = http.request(
				{
					hostname: targetUrl.hostname,
					host: targetUrl.host,
					path: req.url,
					headers: req.headers,
					method: req.method,
					port: targetUrl.port,
				},
				(proxyRes) => {
					res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
					proxyRes.pipe(res);
				},
			);

			proxyReq.on("error", (err) => {
				console.error(err);

				if (!res.headersSent) {
					res.writeHead(502);
				}

				res.end("Bad Gateway");
			});

			req.pipe(proxyReq);
		})
		.listen(port);
}

function hash(key) {
	return murmur.x86.hash32(key);
}

function consistentHash(key) {
	const hashed = hash(key);
	let left = 0;
	let right = hashRing.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);

		if (hashRing[mid].hash >= hashed) {
			right = mid - 1;
		} else {
			left = mid + 1;
		}
	}

	return hashRing[left % hashRing.length].server;
}

function buildHashRing(servers = []) {
	hashRing.length = 0;
	for (const server of servers) {
		hashRing.push({ key: hash(server), origin: server });
	}
	return hashRing.sort((a, b) => a.key - b.key);
}

function getServer(key) {
    const hashed = hash(key);
	const index = hashed % backendServers.length;
	return backendServers[index];
}

function discoverServers() {
	exec("lsof -nP -iTCP -sTCP:LISTEN", async (error, stdout) => {
		if (error) {
			console.error(error);
			process.exit(1);
		}

		const process = stdout.split("\n");
		const regex = /^node.*\*:(6\d+)/;
		const regexV2 = /^com.docke.*\*:(6\d+)/;

		const v1Ports = process.filter((process) => process.match(regex)).map((process) => Number(process.match(regex)?.[1]));
		const v2Ports = process.filter((process) => process.match(regexV2)).map((process) => Number(process.match(regexV2)?.[1]));

		const mergedPorts = v1Ports.concat(v2Ports)


		// will discover healthy servers
		for (const port of mergedPorts) {
			const origin = `http://localhost:${port}`;
			const healthCheckUrl = `${origin}/api/health`;
			try {
				const response = await fetch(healthCheckUrl);
				if (response.ok) {
					console.log(`${port} is healthy`);
					
					const index = backendServers.findIndex(server => server === origin);
					const ringIndex = hashRing.findIndex(node => node.server === origin);

					if (index === -1) backendServers.push(origin);
					if (ringIndex === -1) hashRing.push({ key: hash(origin), origin });
					
					continue;
				}
			} catch (error) {
				console.log(`${port} is unreachable`);
			}

		}

		// build ring of servers
		buildHashRing(hashRing);
	});
}

discoverServers();
setInterval(() => {
	console.log('searching for servers....')
	discoverServers()
	if (backendServers.length === 0) {
		console.log('no servers found!')
	}
}, 20_000);

buildProxy(process.env.PORT ?? 5001);