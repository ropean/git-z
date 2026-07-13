.PHONY: build build-web build-go dev clean

build: build-web build-go

build-web:
	cd web && npm install && npm run build

build-go:
	go build -o git-viz .

dev:
	cd web && npm run dev

clean:
	rm -f git-viz
