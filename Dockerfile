# Mimesis in a container: the page and the mimesis command, no Rust or Node
# needed on your computer. The desktop app isn't included.
#
#   docker compose up -d      then open http://localhost:4620

# 1. Build the page.
FROM node:22-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

# 2. Build the mimesis command, with the page built into it.
FROM rust:1-slim-bookworm AS server
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY app app
COPY skills skills
COPY --from=web /src/web/dist web/dist
RUN cargo build --release -p mimesis

# 3. A small image with just the command.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=server /src/target/release/mimesis /usr/local/bin/mimesis
ENV MIMESIS_HOME=/data \
    MIMESIS_PORT=4620 \
    MIMESIS_LISTEN=0.0.0.0
VOLUME /data
EXPOSE 4620
CMD ["mimesis", "serve"]
