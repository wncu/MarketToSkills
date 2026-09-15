# 🎯 MarketToSkills

> Plataforma open-source para almacenar, organizar y visualizar skills de desarrollo — frontend, backend, DevOps, y más. Inspirada en [roadmap.sh](https://roadmap.sh) y matrices de competencias modernas.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-black?logo=bun)](https://bun.sh/)
[![Rust](https://img.shields.io/badge/Rust-2024-orange?logo=rust)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 📖 Descripción

**MarketToSkills** es una aplicación web fullstack que permite a desarrolladores y equipos:

- 📚 **Almacenar skills** organizadas por categorías (Frontend, Backend, DevOps, Mobile, etc.)
- 🌳 **Visualizar árboles de habilidades** con rutas de aprendizaje interactivas
- 📊 **Trackear progreso** personal y de equipo
- 🏷️ **Etiquetar y filtrar** skills por tecnología, nivel de dificultad y relevancia
- 🔗 **Vincular recursos** de aprendizaje a cada skill (docs, tutoriales, proyectos)
- 👥 **Compartir perfiles** de competencias con otros desarrolladores

## 🏗️ Tech Stack

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Frontend** | Bun + TypeScript + React | DX rápido, ecosystem maduro, types compartidos |
| **Backend** | Rust (Axum) | Performance extremo, type safety, concurrencia segura |
| **Base de datos** | SQLite (dev) / PostgreSQL (prod) | Simplicidad local, escalabilidad en producción |
| **Bundler** | Vite | HMR instantáneo, integración nativa con Bun |
| **Estilos** | Tailwind CSS | Utility-first, rápido de prototipar |
| **Monorepo** | Bun Workspaces | Gestión unificada de dependencias |

## 📁 Estructura del Proyecto

```
MarketToSkills/
├── apps/
│   ├── web/                    # 🌐 Frontend (React + TypeScript + Vite)
│   │   ├── src/
│   │   │   ├── components/     # Componentes reutilizables
│   │   │   ├── features/       # Módulos por feature
│   │   │   │   ├── skills/     # CRUD de skills
│   │   │   │   ├── categories/ # Gestión de categorías
│   │   │   │   ├── roadmaps/   # Árboles de habilidades
│   │   │   │   └── auth/       # Autenticación
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── layouts/        # Layouts de página
│   │   │   ├── lib/            # Utilidades y helpers
│   │   │   └── styles/         # Estilos globales
│   │   ├── public/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── api/                    # 🦀 Backend (Rust + Axum)
│       ├── src/
│       │   ├── main.rs         # Entry point del servidor
│       │   ├── config/         # Configuración y env vars
│       │   ├── routes/         # Definición de rutas HTTP
│       │   ├── handlers/       # Request handlers
│       │   ├── models/         # Structs de datos / ORM
│       │   ├── services/       # Lógica de negocio
│       │   ├── middleware/     # Auth, logging, CORS
│       │   └── errors/         # Error handling centralizado
│       ├── migrations/         # Migraciones de BD
│       ├── Cargo.toml
│       └── .env.example
│
├── packages/
│   └── shared/                 # 📦 Tipos y contratos compartidos
│       ├── src/
│       │   ├── types/          # Interfaces TypeScript
│       │   ├── schemas/        # Schemas de validación (Zod)
│       │   └── constants/      # Constantes compartidas
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                       # 📝 Documentación del proyecto
│   ├── ARCHITECTURE.md         # Arquitectura del sistema
│   ├── API.md                  # Documentación de la API REST
│   ├── DATABASE.md             # Esquema de base de datos
│   ├── DEVELOPMENT.md          # Guía de desarrollo
│   └── DEPLOYMENT.md           # Guía de despliegue
│
├── .gitignore
├── package.json                # Root workspace config
├── turbo.json                  # Orquestación de builds
├── README.md                   # Este archivo
├── LICENSE
└── CONTRIBUTING.md
```

## 🚀 Quick Start

### Prerrequisitos

- [Bun](https://bun.sh/) >= 1.0
- [Rust](https://www.rust-lang.org/tools/install) >= 1.75
- [SQLite](https://www.sqlite.org/) (incluido en la mayoría de SOs)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/MarketToSkills.git
cd MarketToSkills

# Instalar dependencias del frontend
bun install

# Compilar el backend
cd apps/api
cargo build

# Volver a la raíz y levantar todo
cd ../..
bun run dev
```

### Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `bun run dev` | Inicia frontend + backend en modo desarrollo |
| `bun run dev:web` | Solo frontend (Vite dev server) |
| `bun run dev:api` | Solo backend (cargo watch) |
| `bun run build` | Build de producción completo |
| `bun run test` | Ejecuta todos los tests |
| `bun run lint` | Linting de TypeScript |
| `bun run format` | Formateo de código |

## 🗺️ Roadmap

### v0.1.0 — MVP (Fundamentos)
- [ ] Setup del monorepo (Bun Workspaces)
- [ ] Backend Rust básico con Axum
- [ ] CRUD de Skills
- [ ] CRUD de Categorías
- [ ] Frontend con listado y creación de skills
- [ ] Base de datos SQLite con migraciones

### v0.2.0 — Organización
- [ ] Sistema de tags/etiquetas
- [ ] Niveles de dificultad (Beginner, Intermediate, Advanced, Expert)
- [ ] Búsqueda y filtrado de skills
- [ ] Importar/exportar skills (JSON/YAML)

### v0.3.0 — Visualización
- [ ] Árbol de habilidades interactivo (skill tree)
- [ ] Rutas de aprendizaje (roadmaps)
- [ ] Dashboard con métricas personales
- [ ] Gráficos de progreso

### v0.4.0 — Social
- [ ] Autenticación de usuarios
- [ ] Perfiles públicos de competencias
- [ ] Compartir roadmaps
- [ ] Comunidad y discusiones

### v1.0.0 — Producción
- [ ] Migración a PostgreSQL
- [ ] Deploy containerizado (Docker)
- [ ] API pública documentada
- [ ] PWA / modo offline

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [Arquitectura](docs/ARCHITECTURE.md) | Diseño del sistema, patrones y decisiones técnicas |
| [API](docs/API.md) | Endpoints REST, request/response schemas |
| [Base de datos](docs/DATABASE.md) | Esquema, relaciones y migraciones |
| [Desarrollo](docs/DEVELOPMENT.md) | Setup local, convenciones, testing |
| [Despliegue](docs/DEPLOYMENT.md) | Deploy a producción, Docker, CI/CD |

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Lee [CONTRIBUTING.md](CONTRIBUTING.md) para más detalles.

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver [LICENSE](LICENSE) para más detalles.

---

<p align="center">
  Hecho con 🦀 Rust + ⚡ Bun + 💙 TypeScript
</p>
