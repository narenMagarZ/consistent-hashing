/*

    request -> proxy server -> multiple instances of server

*/

const http = require('http');

const backendServers = [
    "http://localhost:8000",
    "http://localhost:8001",
    "http://localhost:8002",
]

http.createServer(async (req, res) => {
    await distributeRequests(req);
})

async function distributeRequests(req) {
    const server = backendServers.length % ( backendServers.length - 1 )

    const baseUrl = `http://localhost:8001/${req.url}`
    const response = await fetch(baseUrl, {
        method: req.method,
        headers: req.headers
    });

    return response;
}