const http = require("http");
const os = require("node:os");

function getServerId() {
	return process.env.SERVER_ID ?? os.hostname();
}

function buildServer(port) {
	const serverId = getServerId();
	const server = http.createServer((req, res) => {
		const requestId = req.headers["x-request-id"] ?? "-";

		res.setHeader("x-server-id", serverId);
		res.setHeader("x-server-port", String(port));

		console.log(
			`[backend:${serverId}] requestId=${requestId} handled ${req.method} ${req.url} on port ${port}`,
		);

		if (req.url === "/api/health") {
			return res.end("Okay");
		}

		res.setHeader("content-type", "application/json");
		res.statusCode = 200;
		return res.end(
			JSON.stringify({
				status: "Okay",
				message: "successful",
				server_id: serverId,
				server_port: Number(port),
			}),
		);
	});

	server.listen(port, () => {
		console.log(`[backend:${serverId}] server is running on port ${port}`);
	});
}

buildServer(process.env.PORT || 6001);
