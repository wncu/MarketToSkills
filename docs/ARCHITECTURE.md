# 🏗️ Arquitectura del Sistema — MarketToSkills

## Visión General

MarketToSkills sigue una arquitectura **monorepo fullstack** con separación clara entre frontend (TypeScript/Bun) y backend (Rust), conectados a través de una API REST con contratos de tipos compartidos.

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENTE (Web)                       │
│                                                          │
│   React + TypeScript + Vite + Tailwind CSS               │
│   Puerto: 5173                                           │
│                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│   │  Skills   │  │ Roadmaps │  │   Auth   │  ...features │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│        │              │              │                    │
│        └──────────────┼──────────────┘                    │
│                       │                                   │
│              ┌────────▼────────┐                          │
│              │   API Client    │  (fetch + tipos shared)  │
│              └────────┬────────┘                          │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTP / JSON
                        │
┌───────────────────────┼──────────────────────────────────┐
│                       │        SERVIDOR (API)             │
│                       │                                   │
│              ┌────────▼────────┐                          │
│              │  Axum Router    │  Puerto: 3000             │
│              └────────┬────────┘                          │
│                       │                                   │
│   ┌───────────────────┼────────────────────┐              │
│   │                   │                    │              │
│   ▼                   ▼                    ▼              │
│ ┌──────────┐  ┌──────────────┐  ┌──────────────┐        │
│ │ Handlers │  │  Middleware   │  │   Services   │        │
│ │ (routes) │  │ (auth, cors, │  │  (business   │        │
│ │          │  │  logging)    │  │   logic)     │        │
│ └────┬─────┘  └──────────────┘  └──────┬───────┘        │
│      │                                  │                │
│      └──────────────┬───────────────────┘                │
│                     │                                    │
│           ┌─────────▼──────────┐                         │
│           │      Models        │                         │
│           │   (SQLx structs)   │                         │
│           └─────────┬──────────┘                         │
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                      │
              ┌───────▼───────┐
              │   Database    │
              │  SQLite/PG    │
              └───────────────┘
```

## Principios de Diseño

### 1. Feature-First Architecture
El código se organiza por **feature** (skills, categories, roadmaps) en lugar de por tipo de archivo. Cada feature encapsula sus propios componentes, hooks, servicios y tipos.

```
features/
├── skills/
│   ├── components/       # SkillCard, SkillList, SkillForm
│   ├── hooks/            # useSkills, useSkillById
│   ├── services/         # API calls para skills
│   ├── types.ts          # Tipos locales del feature
│   └── index.ts          # Barrel export
```

### 2. Contract-First API Design
Los tipos compartidos en `packages/shared` actúan como **contrato** entre frontend y backend:

```typescript
// packages/shared/src/types/skill.ts
export interface Skill {
  id: string;
  name: string;
  description: string;
  category_id: string;
  level: SkillLevel;
  tags: string[];
  resources: Resource[];
  created_at: string;
  updated_at: string;
}

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
```

Esto garantiza que el backend Rust y el frontend TypeScript siempre estén sincronizados. El backend implementa los mismos tipos como structs de Rust mediante `serde`.

### 3. Separation of Concerns (Backend)

```
Handler → Service → Model → Database
   ↓         ↓        ↓
 HTTP    Business   Data
 layer    logic    access
```

- **Handlers**: Extraen datos del request, llaman al service, formatean la response
- **Services**: Contienen la lógica de negocio pura, testeable sin HTTP
- **Models**: Representan la estructura de datos y queries a la BD

### 4. Unidirectional Data Flow (Frontend)

```
User Action → API Call → State Update → Re-render
```

Usamos React con hooks y un state management ligero (Zustand o React Query) para mantener el flujo de datos predecible.

## Decisiones Técnicas

### ¿Por qué Rust para el backend?
- **Performance**: Manejo eficiente de concurrencia sin GC
- **Type safety**: El compilador previene errores en tiempo de compilación
- **Axum**: Framework moderno, async-first, basado en Tower (middleware reutilizable)
- **SQLx**: Queries verificadas en compile-time contra la BD

### ¿Por qué Bun + TypeScript para el frontend?
- **Velocidad**: Bun es significativamente más rápido que npm/yarn para instalar y ejecutar
- **TypeScript nativo**: Bun ejecuta TS sin transpilación previa
- **Ecosystem**: Acceso completo al ecosystem npm
- **DX**: Hot Module Replacement instantáneo con Vite

### ¿Por qué monorepo con Bun Workspaces?
- **Tipos compartidos**: Un solo `packages/shared` para frontend y definir contratos
- **Atomic commits**: Cambios en frontend y tipos en un solo commit
- **Simplicidad**: No necesitamos Lerna o nx para un proyecto de este tamaño

### ¿Por qué SQLite en desarrollo?
- **Zero config**: No requiere instalar ni configurar un servidor de BD
- **Portabilidad**: Un solo archivo de BD, fácil de borrar y recrear
- **Migración**: SQLx soporta tanto SQLite como PostgreSQL con el mismo código

## Flujo de Datos

### Crear una Skill (ejemplo end-to-end)

```
1. Usuario llena el formulario SkillForm
2. Frontend valida con Zod schema (packages/shared)
3. POST /api/skills con el payload JSON
4. Axum router → skill_handler::create()
5. Handler deserializa con serde (validación de tipos)
6. Handler llama a skill_service::create_skill()
7. Service aplica lógica de negocio
8. Service llama a Skill::insert() via SQLx
9. BD inserta el registro
10. Response 201 con la Skill creada
11. Frontend actualiza el cache/state
12. UI se re-renderiza con la nueva skill
```

## Seguridad

- **CORS**: Configurado para aceptar solo orígenes conocidos
- **Input validation**: Doble validación — Zod en frontend, serde + validaciones custom en backend
- **SQL injection**: Prevenido por SQLx (prepared statements)
- **Rate limiting**: Middleware de Tower en Axum
- **Autenticación** (v0.4): JWT con refresh tokens

## Escalabilidad

### Fase 1 (MVP): Monolito simple
- Un solo binario Rust sirve la API
- SQLite para almacenamiento
- Deploy en un solo servidor/VPS

### Fase 2 (Producción): Escalabilidad vertical
- Migración a PostgreSQL
- Caché con Redis (opcional)
- Deploy con Docker Compose

### Fase 3 (Futuro): Escalabilidad horizontal
- Backend stateless detrás de un load balancer
- PostgreSQL con read replicas
- CDN para assets estáticos del frontend
