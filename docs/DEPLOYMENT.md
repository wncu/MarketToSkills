# 🚢 Guía de Despliegue — MarketToSkills

## Entornos

| Entorno | Propósito | Base de datos |
|---------|----------|---------------|
| **Local** | Desarrollo | SQLite |
| **Staging** | QA y pruebas | PostgreSQL |
| **Producción** | Usuarios finales | PostgreSQL |

---

## Opción 1: Docker Compose (Recomendado)

### Dockerfile — Backend (Rust)

```dockerfile
# apps/api/Dockerfile
FROM rust:1.80-slim AS builder

WORKDIR /app
COPY apps/api/ .

RUN apt-get update && apt-get install -y pkg-config libssl-dev
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/markettoskills-api /usr/local/bin/
COPY --from=builder /app/migrations /app/migrations

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["markettoskills-api"]
```

### Dockerfile — Frontend (Bun + Nginx)

```dockerfile
# apps/web/Dockerfile
FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lockb ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile

COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/

RUN cd apps/web && bun run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://mts:mts_password@db:5432/markettoskills
      - CORS_ORIGIN=http://localhost
      - RUST_LOG=info
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - api
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=markettoskills
      - POSTGRES_USER=mts
      - POSTGRES_PASSWORD=mts_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mts"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

### Desplegar con Docker Compose

```bash
# Build y levantar
docker compose up -d --build

# Ver logs
docker compose logs -f

# Parar
docker compose down

# Parar y borrar datos
docker compose down -v
```

---

## Opción 2: VPS Manual

### 1. Preparar el servidor

```bash
# Ubuntu 22.04+
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential pkg-config libssl-dev postgresql nginx certbot

# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Instalar Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 2. Configurar PostgreSQL

```bash
sudo -u postgres psql

CREATE DATABASE markettoskills;
CREATE USER mts WITH PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE markettoskills TO mts;
\q
```

### 3. Build del proyecto

```bash
# Frontend
bun install
cd apps/web
bun run build
# Los archivos estáticos quedan en dist/

# Backend
cd apps/api
cargo build --release
# El binario queda en target/release/markettoskills-api
```

### 4. Configurar Nginx

```nginx
# /etc/nginx/sites-available/markettoskills
server {
    listen 80;
    server_name markettoskills.tudominio.com;

    # Frontend
    location / {
        root /var/www/markettoskills/web;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/markettoskills /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Systemd service para el backend

```ini
# /etc/systemd/system/markettoskills-api.service
[Unit]
Description=MarketToSkills API
After=network.target postgresql.service

[Service]
Type=simple
User=mts
WorkingDirectory=/opt/markettoskills
ExecStart=/opt/markettoskills/markettoskills-api
Environment=DATABASE_URL=postgres://mts:password@localhost/markettoskills
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=RUST_LOG=info
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable markettoskills-api
sudo systemctl start markettoskills-api
```

### 6. SSL con Let's Encrypt

```bash
sudo certbot --nginx -d markettoskills.tudominio.com
```

---

## CI/CD con GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Lint & Test Frontend
        run: |
          bun run lint
          bun run test

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Test Backend
        working-directory: apps/api
        run: cargo test

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & push Docker images
        run: |
          docker compose build
          # Push a tu registry (GHCR, DockerHub, etc.)

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        run: |
          # SSH al servidor y docker compose pull + up
          echo "Deploy step - configurar según tu infra"
```

---

## Checklist de Producción

- [ ] Variables de entorno configuradas (no hardcoded)
- [ ] CORS restringido al dominio de producción
- [ ] HTTPS habilitado (Let's Encrypt o similar)
- [ ] Base de datos PostgreSQL con backups automáticos
- [ ] Logs centralizados
- [ ] Rate limiting habilitado
- [ ] Health check endpoint (`GET /api/health`)
- [ ] Monitoreo básico (uptime, errores)
- [ ] `.env` excluido del repositorio
- [ ] Imágenes Docker optimizadas (multi-stage build)
