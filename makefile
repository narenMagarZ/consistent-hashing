spin-servers:
	docker build -t ch-server ./backend-server/
	docker run -d --name ch-server-6001 -p "6001:6001" ch-server
	docker run -d --name ch-server-6002 -p "6002:6001" ch-server
	docker run -d --name ch-server-6003 -p "6003:6001" ch-server

add-server:
	docker run -d --name ch-server-${port} -p "${port}:6001" ch-server

stop-server:
	docker stop ${id}

restart-server:
	docker start ${id}

remove-server:
	docker rm -f ${id}

stop-all:
	docker ps -q --filter ancestor=ch-server | xargs docker stop

up-all:
	docker ps -a -q --filter ancestor=ch-server | xargs docker start

remove-all:
	docker ps -a -q --filter ancestor=ch-server | xargs docker rm


list-servers:
	docker ps --format "table {{.ID}}\t{{.Ports}}\t{{.Names}}"


up-proxy:
	docker build -t ch-proxy ./proxy-server/
	docker run -d --name ch-proxy-server -p "5001:5001" ch-proxy



# -q - quiet mode -> only output containers IDs
# --filter ancestor=ch -> show only containers whose images is ch
# | -> pipe, it takes the stdout of command1 and feeds it to stdin of command2 
# xargs -> takes the input and turns it into command arguments