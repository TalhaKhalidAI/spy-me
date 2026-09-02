# Backend/Dockerfile
FROM node:20-bookworm-slim

# ─── Install build dependencies ────────────────────────────
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    build-essential \
    openssl \
    iputils-ping \
    nano \
    htop \
    net-tools \
    clang \
    git \
    && rm -rf /var/lib/apt/lists/*

# ─── Set working directory ─────────────────────────────────
WORKDIR /app

# ─── Enable pnpm ────────────────────────────────────────────
RUN corepack enable && corepack prepare pnpm@9 --activate

# ─── Copy package files ────────────────────────────────────
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# ─── Install dependencies (builds mediasoup) ──────────────
RUN pnpm install --no-frozen-lockfile

# ─── ⚠️ CRITICAL: Build mediasoup worker manually ──────────
RUN cd node_modules/mediasoup/worker && \
    make CC=clang CXX=clang++ -j$(nproc) || \
    make -j$(nproc)

# ─── Copy Prisma schema ────────────────────────────────────
COPY prisma ./prisma
RUN npx prisma generate

# ─── Copy application ──────────────────────────────────────
COPY . .

# ─── Expose ports ──────────────────────────────────────────
EXPOSE 5050
EXPOSE 20000-20200/udp
EXPOSE 20000-20200/tcp

# ─── Start application ─────────────────────────────────────
CMD ["node", "server.js"]