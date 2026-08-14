const http = require("http");

function buildServer(port) {
	const server = http.createServer((req, res) => {
		const requestId = req.headers['x-request-id'];
		console.log(requestId, 'handled by server', port);
		
		if (req.url === "/api/health") {
			return res.end("Okay");
		}

		res.setHeader("content-type", "application/json");
		res.statusCode = 200;
		return res.end(JSON.stringify({ status: "Okay", message: "successful" }));
	});
	server.listen(port, () => {
		console.log("server is running on port", port);
	});
}

buildServer(process.env.PORT || 6001);
