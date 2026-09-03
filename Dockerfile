FROM node:20-slim

# Install ALL dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-full \
    make \
    g++ \
    openssl \
    git \
    nano \
    net-tools \
    libtool \
    autoconf \
    automake \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# ✅ Create virtual environment and use it
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# ✅ Now pip works inside venv
RUN pip install --upgrade pip setuptools wheel invoke

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --no-frozen-lockfile

# ✅ Build mediasoup worker with venv python
RUN cd node_modules/mediasoup && \
    echo "🔨 Building mediasoup worker..." && \
    PATH="/opt/venv/bin:$PATH" npm run build:worker || \
    (cd worker && PATH="/opt/venv/bin:$PATH" make clean && PATH="/opt/venv/bin:$PATH" make -j$(nproc)) || \
    echo "⚠️ Worker build failed"

# ✅ Verify worker exists
RUN if [ -f /app/node_modules/mediasoup/worker/out/Release/mediasoup-worker ]; then \
    echo "✅ Worker found!"; \
    ls -la /app/node_modules/mediasoup/worker/out/Release/mediasoup-worker; \
    else \
    echo "❌ Worker still missing"; \
    exit 1; \
    fi

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 5050
EXPOSE 20000-20200/udp

CMD ["node", "server.js"]