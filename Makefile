.PHONY: build build-web build-go dev clean

build: build-web build-go

build-web:
	cd web && pnpm install && pnpm run build

build-go:
	go build -o digit .

dev:
	cd web && pnpm run dev

clean:
	rm -f digit
