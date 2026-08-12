const http = require("http");
const murmur = require("murmurhash3js");
const { exec } = require("node:child_process");

const backendServers = new Map();

function buildProxy(port) {
	http
		.createServer(async (req, res) => {
			const targetServer = getServer(req.socket.remotePort);
			const targetUrl = new URL(targetServer);
            console.log(targetUrl, 'target url')
			const proxyReq = http.request(
				{
					hostname: targetUrl.hostname,
					host: targetUrl.host,
					path: targetUrl.url,
					headers: targetUrl.headers,
					method: targetUrl.method,
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

function getServer(key) {
    const hashed = hash(key);
    console.log(hashed)
	const index = hashed % backendServers.length;
    console.log(index, 'index')
	return backendServers[index];
}

function discoverServers() {
	setInterval(() => {
		exec("lsof -nP -iTCP -sTCP:LISTEN", async (error, stdout) => {
			if (error) {
				console.error(error);
				return;
			}

            const process = stdout.split("\n");
			const regex = /^node.*\*:(6\d+)/;
			const serverPorts = process.filter((process) => process.match(regex)).map((process) => Number(process.match(regex)?.[1]));

			// will discover healthy servers
			for (const port of serverPorts) {
				const url = `http://localhost:${port}/api/health`;
				try {
					const response = await fetch(url);
					if (response.ok) {
						console.log(`${port} is healthy`);
						backendServers.set(port, url);
					}
				} catch (error) {
					console.log(`${port} is unreachable`);
				}
			}
		});
	}, 2_000);
}

discoverServers();
buildProxy(process.env.PORT ?? 5001);
