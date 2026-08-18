servers ?= 3

spin-servers:
	docker compose up -d --build --scale server=$(servers)

up-all: spin-servers

up-proxy: spin-servers

stop-all:
	docker compose down

rm-all: stop-all

list-servers:
	docker compose ps

down-proxy: stop-all

rm-proxy: stop-all
