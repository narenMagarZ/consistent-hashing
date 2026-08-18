const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildProxy } = require("../proxy");
const { buildHashRing, consistentHash } = require("../server-discovery");

async function startBackend(serverId) {
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		res.setHeader("x-server-id", serverId);
		res.end(
			JSON.stringify({
				server_id: serverId,
				path: req.url,
			}),
		);
	});

	server.listen({ host: "127.0.0.1", port: 0 });
	await once(server, "listening");

	const { port } = server.address();

	return {
		port,
		server,
		serverId,
		url: `http://127.0.0.1:${port}`,
	};
}

function requestThroughProxy({ agent, port, requestId, path = "/api/demo" }) {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				agent,
				headers: {
					"x-request-id": requestId,
				},
				host: "127.0.0.1",
				method: "GET",
				path,
				port,
			},
			(res) => {
				let body = "";

				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => {
					resolve({
						body,
						headers: res.headers,
						statusCode: res.statusCode,
					});
				});
			},
		);

		req.on("error", reject);
		req.end();
	});
}

test("proxy routes requests by x-request-id through consistent hashing", async () => {
	const backends = await Promise.all([startBackend("backend-a"), startBackend("backend-b")]);
	const backendByUrl = new Map(backends.map(({ serverId, url }) => [url, serverId]));
	const ring = buildHashRing(backends.map(({ url }) => url));
	const proxy = buildProxy(0, {
		getHashRing: () => ring,
		logger: () => {},
		listenHost: "127.0.0.1",
	});
	const agent = new http.Agent({ keepAlive: true });

	await once(proxy, "listening");

	try {
		const idsByTarget = new Map();

		for (let i = 0; i < 10_000 && idsByTarget.size < ring.length; i += 1) {
			const requestId = `request-${i}`;
			const target = consistentHash(requestId, ring);

			if (!idsByTarget.has(target)) {
				idsByTarget.set(target, requestId);
			}
		}

		assert.equal(idsByTarget.size, ring.length, "expected to find request ids for every backend");

		const [targetA, targetB] = ring.map(({ server }) => server);
		const requestIdA = idsByTarget.get(targetA);
		const requestIdB = idsByTarget.get(targetB);

		const responseA1 = await requestThroughProxy({
			agent,
			port: proxy.address().port,
			requestId: requestIdA,
		});
		const responseA2 = await requestThroughProxy({
			agent,
			port: proxy.address().port,
			requestId: requestIdA,
		});
		const responseB = await requestThroughProxy({
			agent,
			port: proxy.address().port,
			requestId: requestIdB,
		});

		assert.equal(responseA1.statusCode, 200);
		assert.equal(responseA2.statusCode, 200);
		assert.equal(responseB.statusCode, 200);
		assert.equal(responseA1.headers["x-server-id"], backendByUrl.get(targetA));
		assert.equal(responseA2.headers["x-server-id"], backendByUrl.get(targetA));
		assert.equal(responseB.headers["x-server-id"], backendByUrl.get(targetB));
		assert.equal(responseA1.headers["x-server-id"], responseA2.headers["x-server-id"]);
		assert.notEqual(responseA1.headers["x-server-id"], responseB.headers["x-server-id"]);

		assert.equal(JSON.parse(responseA1.body).server_id, backendByUrl.get(targetA));
		assert.equal(JSON.parse(responseB.body).server_id, backendByUrl.get(targetB));
	} finally {
		agent.destroy();
		await Promise.all(
			[
				proxy,
				...backends.map(({ server }) => server),
			].map(
				(server) =>
					new Promise((resolve) => {
						server.close(() => resolve());
					}),
			),
		);
	}
});
