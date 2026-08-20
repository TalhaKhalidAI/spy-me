# 🚀   OAuth API Boilerplate BY Talha Khalid

A professional, production-ready API boilerplate built with Express, Prisma (PostgreSQL), Argon2, Passport, Zod, and Winston. Fully configured for secure authentication (Local + OAuth2) and scalable growth.

## ✨ Features

- **🔐 Robust Authentication**: 
  - Password hashing with **Argon2id** (OWASP recommended).
  - JWT Access & Refresh token rotation.
  - Social Auth: Google & GitHub login via Passport.js.
  - **Soft Delete**: User accounts are never permanently deleted but marked as deleted.
  - **Profile Management**: Update user profile and manage account status.
- **📜 API Documentation**:
  - **Swagger/OpenAPI 3.0** interactive documentation.
  - Access at `/api-docs`.
- **🛠 Database Ready**: 
  - **Prisma 7** for type-safe database queries.
  - PostgreSQL support out of the box.
  - Automatic connection pool management.
- **🛡️ Security First**:
  - **Helmet.js** for secure HTTP headers.
  - **CORS** pre-configured.
  - Rate limiting (coming soon/optional).
  - Environment variable validation using **Zod**.
- **📝 Enterprise Logging**:
  - Structured logging with **Winston**.
  - Daily log rotation.
  - Error and Audit log separation.
- **🚦 Production Utilities**:
  - Global error handling middleware.
  - Request validation middleware.
  - Health check endpoint (`/health`).
  - Graceful shutdown handlers.

---

## 🛠 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL
- npm or pnpm

## 🚀 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

Copy `.env.example` (or edit existing `.env`):

```bash
# Security
JWT_SECRET=your_super_secret_at_least_32_characters
JWT_REFRESH_SECRET=another_long_secret_for_refresh_token

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

### 3. Database Initialization

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations (ensure DB is running)
npm run db:migrate
```

### 4. Run Development Server

```bash
npm run dev
```

---

## 🏗 Project Structure

```bash
src/
├── api/
│   ├── controllers/   # Request logic
│   ├── middleware/    # Auth, Error, Validation
│   ├── routes/        # Express routes
│   ├── utils/         # Helpers (Logger, JWT)
│   └── validators/    # Zod schemas
├── config/            # App configurations (DB, Passport, Env)
├── generated/         # Custom Prisma client output
├── services/          # Business logic (Password, Bio)
└── server.js          # App entry point
```

## 🔐 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register new user | Public |
| POST | `/api/v1/auth/login` | Login & get tokens | Public |
| GET | `/api/v1/auth/me` | Get current user profile | JWT |
| GET | `/health` | Server & DB health status | Public |

## 🌐 OAuth Setup

To enable Google/GitHub auth:
1. Create credentials in [Google Cloud Console](https://console.cloud.google.com/) and [GitHub Developer Settings](https://github.com/settings/developers).
2. Set callback URLs to: `http://localhost:3000/api/v1/auth/[provider]/callback`.
3. Fill the `CLIENT_ID` and `CLIENT_SECRET` in your `.env`.

---

## 📄 License

MIT
