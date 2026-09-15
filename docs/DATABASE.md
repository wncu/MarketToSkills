# 🗄️ Database Schema — MarketToSkills

## Motor de Base de Datos

| Entorno | Motor | Justificación |
|---------|-------|---------------|
| **Desarrollo** | SQLite | Zero-config, archivo local, rápido de resetear |
| **Producción** | PostgreSQL | Concurrencia, escalabilidad, features avanzados |

Se usa **SQLx** como query builder en Rust, que soporta ambos motores con queries verificadas en compile-time.

---

## Diagrama ER

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│  categories  │       │     skills       │       │     tags     │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id      (PK) │◄──────│ category_id (FK) │       │ id      (PK) │
│ name         │       │ id          (PK) │       │ name         │
│ description  │       │ name             │       │ created_at   │
│ icon         │       │ description      │       └──────┬───────┘
│ color        │       │ level            │              │
│ sort_order   │       │ created_at       │              │
│ created_at   │       │ updated_at       │              │
│ updated_at   │       └────────┬─────────┘              │
└──────────────┘                │                        │
                                │    ┌───────────────┐   │
                                │    │  skill_tags   │   │
                                │    ├───────────────┤   │
                                └────│ skill_id (FK) │   │
                                     │ tag_id   (FK) │───┘
                                     └───────────────┘

┌──────────────────┐
│    resources     │
├──────────────────┤
│ id          (PK) │
│ skill_id    (FK) │──── skills.id
│ title            │
│ url              │
│ type             │
│ created_at       │
└──────────────────┘

--- Futuro (v0.3+) ---

┌──────────────────┐       ┌──────────────────────┐
│    roadmaps      │       │   roadmap_nodes      │
├──────────────────┤       ├──────────────────────┤
│ id          (PK) │◄──────│ roadmap_id (FK)      │
│ title            │       │ id            (PK)   │
│ description      │       │ skill_id      (FK)   │──── skills.id
│ is_public        │       │ position_x           │
│ created_at       │       │ position_y           │
│ updated_at       │       │ created_at           │
└──────────────────┘       └──────────┬───────────┘
                                      │
                           ┌──────────▼───────────┐
                           │  node_dependencies   │
                           ├──────────────────────┤
                           │ node_id       (FK)   │
                           │ depends_on_id (FK)   │
                           └──────────────────────┘

--- Futuro (v0.4+) ---

┌──────────────────┐       ┌──────────────────────┐
│     users        │       │   user_skills        │
├──────────────────┤       ├──────────────────────┤
│ id          (PK) │◄──────│ user_id     (FK)     │
│ username         │       │ skill_id    (FK)     │──── skills.id
│ email            │       │ proficiency          │
│ password_hash    │       │ notes                │
│ avatar_url       │       │ started_at           │
│ created_at       │       │ completed_at         │
│ updated_at       │       └──────────────────────┘
└──────────────────┘
```

---

## Definiciones de Tablas

### `categories`

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| `id` | TEXT | PK | ID único (formato: `cat_xxxxx`) |
| `name` | TEXT | NOT NULL, UNIQUE | Nombre de la categoría |
| `description` | TEXT | — | Descripción breve |
| `icon` | TEXT | — | Emoji o icono representativo |
| `color` | TEXT | — | Color hex para UI (`#3B82F6`) |
| `sort_order` | INTEGER | DEFAULT 0 | Orden de visualización |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### `skills`

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| `id` | TEXT | PK | ID único (formato: `sk_xxxxx`) |
| `name` | TEXT | NOT NULL | Nombre de la skill |
| `description` | TEXT | — | Descripción detallada |
| `category_id` | TEXT | FK → categories.id | Categoría padre |
| `level` | TEXT | NOT NULL, CHECK | `beginner` \| `intermediate` \| `advanced` \| `expert` |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

**Constraints adicionales:**
- `UNIQUE(name, category_id)` — No puede haber dos skills con el mismo nombre en la misma categoría

### `tags`

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| `id` | TEXT | PK | ID único (formato: `tag_xxxxx`) |
| `name` | TEXT | NOT NULL, UNIQUE | Nombre del tag (lowercase) |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### `skill_tags` (tabla de unión)

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| `skill_id` | TEXT | FK → skills.id, ON DELETE CASCADE | |
| `tag_id` | TEXT | FK → tags.id, ON DELETE CASCADE | |

**PK:** `(skill_id, tag_id)`

### `resources`

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| `id` | TEXT | PK | ID único (formato: `res_xxxxx`) |
| `skill_id` | TEXT | FK → skills.id, ON DELETE CASCADE | Skill asociada |
| `title` | TEXT | NOT NULL | Título del recurso |
| `url` | TEXT | NOT NULL | URL del recurso |
| `type` | TEXT | NOT NULL, CHECK | `documentation` \| `tutorial` \| `video` \| `course` \| `article` \| `project` \| `tool` |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |

---

## Migraciones

Las migraciones se gestionan con SQLx CLI. Se almacenan en `apps/api/migrations/`.

### Estructura de archivos de migración

```
apps/api/migrations/
├── 001_create_categories.sql
├── 002_create_skills.sql
├── 003_create_tags.sql
├── 004_create_skill_tags.sql
├── 005_create_resources.sql
```

### Migración inicial: `001_create_categories.sql`

```sql
CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    description TEXT,
    icon       TEXT,
    color      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categorías por defecto
INSERT INTO categories (id, name, description, icon, color, sort_order) VALUES
    ('cat_frontend',  'Frontend',  'Tecnologías de interfaz de usuario',     '🌐', '#3B82F6', 1),
    ('cat_backend',   'Backend',   'Servidores, APIs y lógica de negocio',   '⚙️', '#10B981', 2),
    ('cat_devops',    'DevOps',    'CI/CD, infraestructura y despliegue',    '🚀', '#F59E0B', 3),
    ('cat_database',  'Databases', 'Bases de datos y gestión de datos',      '🗄️', '#EF4444', 4),
    ('cat_mobile',    'Mobile',    'Desarrollo de aplicaciones móviles',     '📱', '#8B5CF6', 5),
    ('cat_tools',     'Tools',     'Herramientas de desarrollo',             '🔧', '#6B7280', 6),
    ('cat_soft',      'Soft Skills','Habilidades blandas y comunicación',    '🤝', '#EC4899', 7),
    ('cat_security',  'Security',  'Seguridad informática y buenas prácticas','🔒', '#14B8A6', 8);
```

### Migración: `002_create_skills.sql`

```sql
CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    level       TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(name, category_id)
);

CREATE INDEX idx_skills_category ON skills(category_id);
CREATE INDEX idx_skills_level ON skills(level);
```

### Migración: `003_create_tags.sql`

```sql
CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tags_name ON tags(name);
```

### Migración: `004_create_skill_tags.sql`

```sql
CREATE TABLE IF NOT EXISTS skill_tags (
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (skill_id, tag_id)
);

CREATE INDEX idx_skill_tags_tag ON skill_tags(tag_id);
```

### Migración: `005_create_resources.sql`

```sql
CREATE TABLE IF NOT EXISTS resources (
    id         TEXT PRIMARY KEY,
    skill_id   TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    url        TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('documentation', 'tutorial', 'video', 'course', 'article', 'project', 'tool')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_resources_skill ON resources(skill_id);
CREATE INDEX idx_resources_type ON resources(type);
```

---

## Comandos útiles de SQLx

```bash
# Instalar SQLx CLI
cargo install sqlx-cli --no-default-features --features sqlite

# Crear base de datos
sqlx database create --database-url sqlite:dev.db

# Ejecutar migraciones
sqlx migrate run --database-url sqlite:dev.db

# Revertir última migración
sqlx migrate revert --database-url sqlite:dev.db

# Verificar queries en compile-time
cargo sqlx prepare --database-url sqlite:dev.db
```

## Seeds (Datos de ejemplo)

Se provee un script de seed para desarrollo en `apps/api/seeds/seed.sql` con skills de ejemplo para cada categoría.
