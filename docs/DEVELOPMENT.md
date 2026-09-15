# 🛠️ Guía de Desarrollo — MarketToSkills

## Prerrequisitos

### Herramientas obligatorias

| Herramienta | Versión mínima | Instalación |
|-------------|---------------|-------------|
| **Bun** | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Rust** | 1.75+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **SQLx CLI** | 0.7+ | `cargo install sqlx-cli --no-default-features --features sqlite` |
| **Git** | 2.30+ | Ya instalado en la mayoría de sistemas |

### Herramientas recomendadas

- **cargo-watch**: Auto-recompilación del backend → `cargo install cargo-watch`
- **VS Code** con extensiones:
  - rust-analyzer
  - Tailwind CSS IntelliSense
  - ESLint
  - Prettier

---

## Setup Inicial

### 1. Clonar y preparar

```bash
git clone https://github.com/tu-usuario/MarketToSkills.git
cd MarketToSkills
```

### 2. Instalar dependencias del frontend

```bash
bun install
```

Esto instala las dependencias de todos los workspaces (web, shared).

### 3. Configurar el backend

```bash
cd apps/api

# Copiar variables de entorno
cp .env.example .env

# Crear la base de datos
sqlx database create

# Ejecutar migraciones
sqlx migrate run

# Volver a la raíz
cd ../..
```

### 4. Levantar el proyecto

```bash
# Todo junto (recomendado)
bun run dev

# O por separado en terminales diferentes:
bun run dev:web   # Terminal 1 - Frontend en http://localhost:5173
bun run dev:api   # Terminal 2 - Backend en http://localhost:3000
```

---

## Estructura del Monorepo

### Workspaces de Bun

El `package.json` raíz define los workspaces:

```json
{
  "workspaces": [
    "apps/web",
    "packages/shared"
  ]
}
```

> **Nota**: El backend Rust no es un workspace de Bun — tiene su propio `Cargo.toml` y se gestiona con cargo.

### Referenciando el paquete shared

Desde `apps/web`, importa tipos compartidos así:

```typescript
import { Skill, SkillLevel, CreateSkillRequest } from '@markettoskills/shared';
```

---

## Convenciones de Código

### TypeScript (Frontend)

| Regla | Convención |
|-------|-----------|
| **Archivos** | `kebab-case.ts` / `PascalCase.tsx` (componentes) |
| **Variables** | `camelCase` |
| **Tipos/Interfaces** | `PascalCase` |
| **Constantes** | `UPPER_SNAKE_CASE` |
| **Componentes** | `PascalCase` (archivos y exportaciones) |
| **Hooks** | `useCamelCase` |
| **Feature folders** | `kebab-case/` |

**Ejemplo de componente:**

```tsx
// apps/web/src/features/skills/components/SkillCard.tsx

interface SkillCardProps {
  skill: Skill;
  onEdit?: (id: string) => void;
}

export function SkillCard({ skill, onEdit }: SkillCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-lg font-semibold">{skill.name}</h3>
      <span className="text-sm text-gray-500">{skill.level}</span>
    </div>
  );
}
```

### Rust (Backend)

| Regla | Convención |
|-------|-----------|
| **Archivos/módulos** | `snake_case.rs` |
| **Structs** | `PascalCase` |
| **Funciones** | `snake_case` |
| **Constantes** | `UPPER_SNAKE_CASE` |
| **Tipos genéricos** | `T`, `E`, etc. |

**Ejemplo de handler:**

```rust
// apps/api/src/handlers/skill_handler.rs

use axum::{Json, extract::Path};
use crate::{models::Skill, services::skill_service, errors::AppError};

pub async fn get_skill(
    Path(id): Path<String>,
) -> Result<Json<Skill>, AppError> {
    let skill = skill_service::find_by_id(&id).await?;
    Ok(Json(skill))
}
```

### Commits (Conventional Commits)

```
tipo(scope): descripción breve

feat(skills): add skill creation form
fix(api): handle duplicate skill names
docs(readme): update installation steps
style(web): adjust card spacing
refactor(api): extract skill validation
test(skills): add unit tests for CRUD
chore(deps): bump axum to 0.8
```

**Tipos válidos:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

### Branches

```
main           ← rama principal, siempre deployable
develop        ← integración de features
feat/nombre    ← nueva funcionalidad
fix/nombre     ← corrección de bug
docs/nombre    ← cambios en documentación
```

---

## Testing

### Frontend (Bun test / Vitest)

```bash
# Ejecutar todos los tests
bun run test

# Tests en modo watch
bun run test:watch

# Coverage
bun run test:coverage
```

**Convenciones de testing:**

```typescript
// __tests__/skill-service.test.ts
import { describe, it, expect } from 'bun:test';

describe('SkillService', () => {
  it('should fetch skills by category', async () => {
    // ...
  });
});
```

### Backend (cargo test)

```bash
cd apps/api

# Ejecutar todos los tests
cargo test

# Tests con output
cargo test -- --nocapture

# Solo un módulo
cargo test skill_service
```

**Convenciones de testing Rust:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_skill() {
        // ...
    }
}
```

---

## Linting y Formateo

### Frontend

```bash
# Lint
bun run lint          # ESLint
bun run lint:fix      # ESLint con auto-fix

# Formateo
bun run format        # Prettier
bun run format:check  # Verificar sin cambiar
```

### Backend

```bash
cd apps/api

# Formateo
cargo fmt

# Lint
cargo clippy -- -W clippy::all
```

---

## Variables de Entorno

### Backend (`apps/api/.env`)

```env
# Server
HOST=127.0.0.1
PORT=3000

# Database
DATABASE_URL=sqlite:dev.db

# CORS
CORS_ORIGIN=http://localhost:5173

# Logging
RUST_LOG=info,markettoskills=debug

# Auth (v0.4+)
# JWT_SECRET=your-secret-key
# JWT_EXPIRY_HOURS=24
```

### Frontend (`apps/web/.env`)

```env
VITE_API_URL=http://localhost:3000/api
```

---

## Troubleshooting

### Error: "sqlx: database not found"
```bash
cd apps/api
sqlx database create --database-url sqlite:dev.db
sqlx migrate run --database-url sqlite:dev.db
```

### Error: "port 3000 already in use"
```bash
lsof -i :3000
kill -9 <PID>
```

### Error: "bun install fails"
```bash
rm -rf node_modules bun.lockb
bun install
```

### Error: "cargo build fails" (linking)
Asegúrate de tener las build tools instaladas:
```bash
# Ubuntu/Debian
sudo apt install build-essential pkg-config libssl-dev

# macOS
xcode-select --install

# Arch
sudo pacman -S base-devel openssl
```
