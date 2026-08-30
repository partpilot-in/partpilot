# PartPilot Local Development and Production Setup Guide

This guide provides step-by-step instructions for running PartPilot in local development mode and deploying it to production.

---

## 🚀 Quickstart: Local Development via Docker Compose (Recommended)

The easiest way to run the full PartPilot stack (Database, Cache, API Server, RSS Feed Server, and React Frontend) is using Docker Compose.

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Engine & Docker Compose)
* [Git](https://git-scm.com/)

### Steps

1. **Clone the Repository & Environment Configuration**:
   ```bash
   cp .env.example .env
   ```

2. **Launch All Services**:
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```

3. **Access Services**:
   * **React Client**: `http://localhost:3000` (or `http://localhost`)
   * **API Server (`server`)**: `http://localhost:8080`
   * **RSS Feed Server (`feed`)**: `http://localhost:8090`
   * **PostgreSQL Database**: `localhost:5432` (`postgres:postgres`)
   * **Redis Cache**: `localhost:6379`

> [!NOTE]
> Database migrations in `supabase/migrations/*.sql` are automatically executed on initial container startup by the Postgres container.

---

## 🛠 Native Local Development (Without Docker)

If you prefer to work on Rust/React code with instant hot-reloading:

### Prerequisites
* **Rust 1.85+**: `rustup toolchain install stable`
* **Node.js 20+**: `npm install -g npm`
* **PostgreSQL** or **Supabase CLI**
* **Redis**

### 1. Database Setup

Using Supabase CLI:
```bash
supabase start
supabase db reset
```

Or using standard local PostgreSQL:
```bash
psql -U postgres -f infra/postgres/init-db.sql
```

### 2. Run API Server (`server`)

```bash
cargo run --bin server
```
The server will start listening on `http://127.0.0.1:8080`.

### 3. Run RSS Feed Server (`feed`)

```bash
cargo run --bin feed
```
The feed server will listen on `http://127.0.0.1:8090`.

### 4. Run Frontend Client (`apps/client`)

```bash
cd apps/client
npm install
npm run dev
```
Access the client at `http://localhost:5173`.

---

## 🌐 Production Deployment

### Option A: Docker Compose Deployment (VPS / Bare Metal)

1. Copy `.env.example` to `.env` on your production host and configure:
   * Production `DATABASE_URL`, `POSTGRES_PASSWORD`, `REDIS_URL`, and `REDIS_PASSWORD`
   * Production `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS_URL`
   * External integration credentials (`DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `DIGIKEY_ACCOUNT_ID`)
2. Start containers:
   ```bash
   docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --build
   ```

### Option B: Railway Deployment

PartPilot is structured for Railway deployment:
* **Server**: Deploy as a Rust Web Service using `infra/docker/Dockerfile.server`. Configure environment variables (`DATABASE_URL`, `REDIS_URL`, `SUPABASE_*`).
* **Worker**: Deploy `worker` as a background worker service.
* **Feed**: Deploy `feed` using `infra/docker/Dockerfile.feed`.
* **Client**: Deploy `client` as a static SPA site (or build container with `infra/docker/Dockerfile.client`).

---

## 🧪 Verification & Testing

### Test Workspace Compilation
```bash
cargo check --workspace
```

### Build Client Production Bundle
```bash
cd client
npm run build
```
