# 🚀 OAuth + WebRTC SFU API Boilerplate
**By Talha Khalid**

A professional, production-ready API boilerplate built with **Express**, **Prisma (PostgreSQL)**, **Argon2**, **Passport**, **Zod**, **Winston**, and **mediasoup** for real-time WebRTC communication.

---

## ✨ Features

### 🔐 Authentication
- Password hashing with **Argon2id** (OWASP recommended).
- JWT Access & Refresh token rotation (with cookie support).
- Social Auth: Google & GitHub via Passport.js.
- Soft delete (users marked as deleted, never permanently removed).
- Profile management (update username, avatar, etc.).

### 🎥 WebRTC SFU (Selective Forwarding Unit)
- Built with **mediasoup v3** for real-time video/audio conferencing.
- **WebSocket signaling** (Socket.IO) for transport/producer/consumer control.
- HTTP REST API for room and peer management.
- Supports:
  - Room creation/deletion
  - Peer creation/deletion
  - Producer/Consumer management
  - Transport creation (send/recv)
  - DTLS handshake & ICE negotiation

### 🛠 Database
- **Prisma 7** ORM with PostgreSQL.
- Type-safe database queries.
- Automatic connection pooling.

### 🛡️ Security
- **Helmet.js** for secure HTTP headers.
- **Dynamic CORS Support**: Allow all origins safely or restrict via comma-separated list.
- **Toggleable Rate Limiting**: Easily configure window size and max requests to prevent DDoS.
- Environment variable validation with **Zod**.

### 📝 Logging
- Structured logging with **Winston**.
- Daily log rotation (application, error, audit logs).
- HTTP request logging with Morgan.

### 🚦 Production Utilities
- Global error handling middleware.
- Request validation middleware (Zod).
- Health check endpoint (`/health`).
- Graceful shutdown handlers.
- Docker support (optional).

---

## 🛠 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm or pnpm
- (Optional) Docker & Docker Compose

---

## 🚀 Getting Started

### 1. Installation

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in the values:

```bash
# Server Configuration
PORT=5050
HTTPS_ENABLED=true
SSL_KEY_PATH="./src/certs/status.lab.mli.key"
SSL_CERT_PATH="./src/certs/status.lab.mli.crt"

# Networking & CORS
LISTEN_IP=0.0.0.0
ANNOUNCED_IP=192.168.100.185
CORS_ORIGIN=*

# WebRTC (Mediasoup) Configuration
RTC_MIN_PORT=2000
RTC_MAX_PORT=3000
MAX_TRANSPORTS_PER_PEER=10
STUN_SERVERS=stun:stun.l.google.com:19302

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=10000

# Auth & Database
JWT_SECRET=Your_secret_key_here
JWT_REFRESH_SECRET=Your_refresh_secret_here
DATABASE_URL="postgresql://user:pass@localhost:5432/sfu_db"
LOG_LEVEL="info"

```

### 3. Database Initialization

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations (ensure PostgreSQL is running)
npm run db:migrate

# (Optional) Seed the database
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
```

The server will start and bind to your `LISTEN_IP` (e.g. `0.0.0.0`). The console logs will dynamically show your `ANNOUNCED_IP` or `localhost`:
- **API:** `http(s)://<ANNOUNCED_IP>:5050/api/v1`
- **Swagger Docs:** `http(s)://<ANNOUNCED_IP>:5050/api-docs`
- **WebSocket (Socket.IO):** `ws(s)://<ANNOUNCED_IP>:5050`
- **Health Check:** `http(s)://<ANNOUNCED_IP>:5050/health`

---

## 🏗 Project Structure

```bash
src/
├── api/
│   ├── controllers/
│   │   ├── auth.controller.js      # Auth endpoints (register, login, refresh)
│   │   ├── user.controller.js      # User profile management
│   │   └── sfu.controller.js       # SFU/WebRTC REST endpoints
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT & role-based auth
│   │   ├── error.middleware.js     # Global error handler
│   │   └── validate.middleware.js  # Zod validation middleware
│   ├── routes/
│   │   └── v1/
│   │       ├── auth.routes.js      # /auth routes
│   │       ├── user.routes.js      # /users routes
│   │       ├── sfu.routes.js       # /sfu routes (rooms, producers, etc.)
│   │       └── index.js            # Route aggregator
│   ├── utils/
│   │   ├── jwt.util.js             # JWT sign/verify helpers
│   │   ├── logger.js               # Winston logger instance
│   │   └── response.util.js        # Standardized API responses
│   └── validators/
│       ├── auth.validator.js       # Zod schemas for auth
│       └── user.validator.js       # Zod schemas for user updates
├── config/
│   ├── env.js                      # Environment validation with Zod
│   ├── passport.js                 # Passport strategies (Local, JWT, OAuth)
│   ├── swagger.js                  # Swagger/OpenAPI configuration
│   └── databases.js                # Prisma client instance
├── services/
│   ├── password.service.js         # Argon2 hashing
│   └── mediasoup/                  # WebRTC SFU core
│       ├── index.js                # SFU orchestrator
│       └── managers/
│           ├── WorkerManager.js    # mediasoup worker pool
│           ├── RouterManager.js    # mediasoup router management
│           ├── TransportManager.js # WebRTC transport management
│           ├── ProducerManager.js  # Media producer management
│           └── ConsumerManager.js  # Media consumer management
└── server.js                       # App entry point (HTTP + WebSocket)
```

---

## 🔐 API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register a new user | Public |
| POST | `/api/v1/auth/login` | Login and get tokens | Public |
| POST | `/api/v1/auth/refresh` | Refresh access token | Public |
| GET | `/api/v1/auth/me` | Get current user profile | JWT |
| GET | `/api/v1/auth/google` | Google OAuth login | Public |
| GET | `/api/v1/auth/google/callback` | Google OAuth callback | Public |
| GET | `/api/v1/auth/github` | GitHub OAuth login | Public |
| GET | `/api/v1/auth/github/callback` | GitHub OAuth callback | Public |

### Users

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/users` | Get all users | JWT (Admin) |
| PATCH | `/api/v1/users/update-me` | Update current user profile | JWT |
| DELETE | `/api/v1/users/delete-me` | Soft delete current user | JWT |
| GET | `/api/v1/users/deleted` | Get deleted users | JWT (Admin) |
| POST | `/api/v1/users/restore/:id` | Restore deleted user | JWT (Admin) |

### WebRTC / SFU (Admin & Peer Management)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/sfu/status` | Get SFU status | JWT |
| POST | `/api/v1/sfu/start` | Start/Initialize SFU | JWT (Admin) |
| POST | `/api/v1/sfu/stop` | Stop SFU | JWT (Admin) |
| POST | `/api/v1/sfu/restart` | Restart SFU | JWT (Admin) |
| GET | `/api/v1/sfu/stats` | Get SFU statistics | JWT |
| GET | `/api/v1/sfu/health` | SFU health check | JWT |
| GET | `/api/v1/sfu/capabilities` | Get RTP capabilities | JWT |
| GET | `/api/v1/sfu/rooms` | List all rooms | JWT |
| POST | `/api/v1/sfu/rooms` | Create a room | JWT (Admin) |
| GET | `/api/v1/sfu/rooms/:roomId` | Get room details | JWT |
| DELETE | `/api/v1/sfu/rooms/:roomId` | Delete a room | JWT (Admin) |
| GET | `/api/v1/sfu/rooms/:roomId/producers` | List producers in a room | JWT |
| GET | `/api/v1/sfu/rooms/:roomId/consumers` | List consumers in a room | JWT |
| DELETE | `/api/v1/sfu/producers/:producerId` | Force close a producer | JWT (Admin) |
| DELETE | `/api/v1/sfu/consumers/:consumerId` | Force close a consumer | JWT (Admin) |

---

## 🌐 OAuth Setup

To enable Google/GitHub authentication:

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select existing).
3. Enable the **Google+ API**.
4. Create OAuth 2.0 credentials (Web application).
5. Set Authorized redirect URIs to:
   - `http://localhost:3000/api/v1/auth/google/callback`
   - `https://yourdomain.com/api/v1/auth/google/callback`
6. Copy `Client ID` and `Client Secret` to your `.env`.

### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers).
2. Click **New OAuth App**.
3. Set Authorization callback URL to:
   - `http://localhost:3000/api/v1/auth/github/callback`
   - `https://yourdomain.com/api/v1/auth/github/callback`
4. Copy `Client ID` and `Client Secret` to your `.env`.

---

## 📡 WebSocket Events (Socket.IO)

The WebSocket server is integrated with the main HTTP server and handles real-time signaling for WebRTC.

### Connection
```javascript
const socket = io('ws://localhost:3000');
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `joinRoom` | `{ roomId }` | Join a WebRTC room |
| `getRouterRtpCapabilities` | (none) | Get RTP capabilities |
| `createSendTransport` | `{ roomId }` | Create a send transport |
| `createRecvTransport` | `{ roomId }` | Create a receive transport |
| `connectTransport` | `{ transportId, dtlsParameters }` | Complete DTLS handshake |
| `produce` | `{ transportId, kind, rtpParameters, source }` | Publish media |
| `consume` | `{ transportId, producerId, rtpCapabilities }` | Subscribe to media |
| `pauseProducer` | `{ producerId }` | Pause a producer |
| `resumeProducer` | `{ producerId }` | Resume a producer |
| `pauseConsumer` | `{ consumerId }` | Pause a consumer |
| `resumeConsumer` | `{ consumerId }` | Resume a consumer |
| `closeProducer` | `{ producerId }` | Close a producer |
| `closeConsumer` | `{ consumerId }` | Close a consumer |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `newProducer` | `{ producerId, socketId, kind, source }` | New producer added |
| `producerClosed` | `{ producerId }` | Producer closed |
| `clientLeft` | `{ socketId, roomId }` | Client left the room |

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

---

## 🐳 Docker Deployment

```bash
# Build the Docker image
npm run docker:build

# Run the container
npm run docker:run

# Or use docker-compose
docker-compose up -d
```

---

## 📝 Logging

Logs are written to:
- `logs/application-YYYY-MM-DD.log` — All logs (info and above)
- `logs/error-YYYY-MM-DD.log` — Error logs only
- `logs/audit-YYYY-MM-DD.log` — Audit trail (if enabled)
- `logs/exceptions-YYYY-MM-DD.log` — Uncaught exceptions
- `logs/rejections-YYYY-MM-DD.log` — Unhandled promise rejections

Log rotation:
- Files are rotated daily.
- Old files are automatically archived and deleted after 14 days (configurable).

---

## 🛡️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment (`development`/`production`) | `development` |
| `JWT_SECRET` | JWT access token secret | (required) |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | (required) |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | (optional) |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | (optional) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | (optional) |
| `LISTEN_IP` | SFU listen IP | `0.0.0.0` |
| `ANNOUNCED_IP` | SFU announced IP | `127.0.0.1` |
| `RTC_MIN_PORT` | Min UDP port for RTC | `10000` |
| `RTC_MAX_PORT` | Max UDP port for RTC | `20000` |
| `WORKER_MAX` | Max mediasoup workers | `4` |
| `MAX_TRANSPORTS_PER_PEER` | Max transports per peer | `10` |
| `MAX_TRANSPORTS_PER_ROOM` | Max transports per room | `20` |
| `TRANSPORT_TIMEOUT` | Transport inactivity timeout (ms) | `60000` |
| `LOG_LEVEL` | Log level (`error`/`warn`/`info`/`http`/`debug`) | `info` |
| `LOG_DIR` | Log directory | `logs` |
| `ENABLE_AUDIT_LOG` | Enable audit logging | `true` |
| `CORS_ORIGIN` | CORS allowed origin | `*` |

---

## 📄 License

MIT © 2026 Talha Khalid

---

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.