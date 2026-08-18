# Consistent Hashing Proxy

A small Node.js reverse proxy that discovers backend containers and routes requests with consistent hashing.

## Run

```bash
make spin-servers servers=3
```

Or run directly with Docker Compose:

```bash
docker compose up -d --build --scale server=3
```

## Notes

- Proxy: `http://localhost:5001`
- Backends listen on `6001` inside the Docker network
- Routing key: `x-request-id`
- Each backend returns its own `x-server-id` header so replicas are easy to tell apart
