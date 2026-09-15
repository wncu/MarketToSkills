# 📡 API Documentation — MarketToSkills

## Base URL

```
Development: http://localhost:3000/api
Production:  https://api.markettoskills.dev/api
```

## Convenciones

- **Formato**: JSON (Content-Type: application/json)
- **Autenticación**: Bearer token (JWT) — a partir de v0.4
- **Paginación**: Query params `?page=1&limit=20`
- **Ordenamiento**: Query param `?sort=name&order=asc`
- **Errores**: Formato estandarizado (ver sección Errores)

## Formato de Respuesta

### Éxito (singular)
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### Éxito (lista)
```json
{
  "data": [ ... ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8,
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### Error
```json
{
  "error": {
    "code": "SKILL_NOT_FOUND",
    "message": "Skill with id '123' was not found",
    "details": null
  }
}
```

---

## 🎯 Skills

### Listar Skills

```http
GET /api/skills
```

**Query Parameters:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | integer | 1 | Número de página |
| `limit` | integer | 20 | Resultados por página (max: 100) |
| `category_id` | string | — | Filtrar por categoría |
| `level` | string | — | Filtrar por nivel: `beginner`, `intermediate`, `advanced`, `expert` |
| `tag` | string | — | Filtrar por tag (se puede repetir) |
| `search` | string | — | Búsqueda por nombre/descripción |
| `sort` | string | `created_at` | Campo para ordenar |
| `order` | string | `desc` | Dirección: `asc` o `desc` |

**Response 200:**
```json
{
  "data": [
    {
      "id": "sk_01H8X...",
      "name": "React Hooks",
      "description": "Manejo de estado y efectos con hooks de React",
      "category_id": "cat_frontend",
      "level": "intermediate",
      "tags": ["react", "javascript", "frontend"],
      "resources": [
        {
          "id": "res_01...",
          "title": "React Docs - Hooks",
          "url": "https://react.dev/reference/react",
          "type": "documentation"
        }
      ],
      "created_at": "2025-01-10T08:00:00Z",
      "updated_at": "2025-01-12T14:30:00Z"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "total_pages": 3
  }
}
```

### Obtener Skill por ID

```http
GET /api/skills/:id
```

**Response 200:** Skill object
**Response 404:** Skill not found

### Crear Skill

```http
POST /api/skills
```

**Request Body:**
```json
{
  "name": "Docker Compose",
  "description": "Orquestación de contenedores multi-servicio",
  "category_id": "cat_devops",
  "level": "intermediate",
  "tags": ["docker", "devops", "containers"],
  "resources": [
    {
      "title": "Docker Docs",
      "url": "https://docs.docker.com/compose/",
      "type": "documentation"
    }
  ]
}
```

**Validaciones:**
- `name`: requerido, 2-100 caracteres, único dentro de la categoría
- `description`: opcional, max 2000 caracteres
- `category_id`: requerido, debe existir
- `level`: requerido, uno de: `beginner`, `intermediate`, `advanced`, `expert`
- `tags`: opcional, array de strings, max 10 tags, cada tag max 50 chars
- `resources`: opcional, array de Resource objects

**Response 201:** Skill creada
**Response 400:** Validación fallida
**Response 409:** Skill con ese nombre ya existe en la categoría

### Actualizar Skill

```http
PUT /api/skills/:id
```

**Request Body:** Mismo formato que crear (todos los campos opcionales para PATCH parcial)

**Response 200:** Skill actualizada
**Response 404:** Skill not found

### Eliminar Skill

```http
DELETE /api/skills/:id
```

**Response 204:** Sin contenido (eliminada)
**Response 404:** Skill not found

---

## 📂 Categorías

### Listar Categorías

```http
GET /api/categories
```

**Response 200:**
```json
{
  "data": [
    {
      "id": "cat_frontend",
      "name": "Frontend",
      "description": "Tecnologías y frameworks de interfaz de usuario",
      "icon": "🌐",
      "color": "#3B82F6",
      "skill_count": 25,
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": "cat_backend",
      "name": "Backend",
      "description": "Servidores, APIs y lógica de negocio",
      "icon": "⚙️",
      "color": "#10B981",
      "skill_count": 30,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Crear Categoría

```http
POST /api/categories
```

**Request Body:**
```json
{
  "name": "Mobile",
  "description": "Desarrollo de aplicaciones móviles",
  "icon": "📱",
  "color": "#8B5CF6"
}
```

**Response 201:** Categoría creada

### Actualizar Categoría

```http
PUT /api/categories/:id
```

### Eliminar Categoría

```http
DELETE /api/categories/:id
```

> ⚠️ Solo se puede eliminar si no tiene skills asociadas

---

## 🏷️ Tags

### Listar Tags

```http
GET /api/tags
```

**Query Parameters:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `search` | string | Búsqueda parcial por nombre |
| `popular` | boolean | Ordenar por frecuencia de uso |

**Response 200:**
```json
{
  "data": [
    {
      "id": "tag_01...",
      "name": "typescript",
      "skill_count": 18
    }
  ]
}
```

### Tags populares

```http
GET /api/tags/popular?limit=10
```

---

## 🗺️ Roadmaps (v0.3+)

### Listar Roadmaps

```http
GET /api/roadmaps
```

**Response 200:**
```json
{
  "data": [
    {
      "id": "rm_01...",
      "title": "Frontend Developer 2025",
      "description": "Ruta completa para convertirse en frontend developer",
      "nodes": [
        {
          "id": "node_01...",
          "skill_id": "sk_01...",
          "position": { "x": 100, "y": 200 },
          "dependencies": ["node_00..."]
        }
      ],
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Crear Roadmap

```http
POST /api/roadmaps
```

---

## 📊 Stats (v0.3+)

### Dashboard personal

```http
GET /api/stats/me
```

**Response 200:**
```json
{
  "data": {
    "total_skills": 45,
    "skills_by_level": {
      "beginner": 10,
      "intermediate": 20,
      "advanced": 12,
      "expert": 3
    },
    "skills_by_category": {
      "Frontend": 15,
      "Backend": 18,
      "DevOps": 12
    },
    "top_tags": ["typescript", "react", "rust", "docker", "sql"],
    "recent_skills": [ ... ]
  }
}
```

---

## ❌ Códigos de Error

| Código HTTP | Error Code | Descripción |
|-------------|-----------|-------------|
| 400 | `VALIDATION_ERROR` | Datos de entrada inválidos |
| 401 | `UNAUTHORIZED` | Token faltante o inválido |
| 403 | `FORBIDDEN` | Sin permisos para esta acción |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `CONFLICT` | Recurso ya existe (duplicado) |
| 422 | `UNPROCESSABLE` | Datos válidos pero lógicamente incorrectos |
| 429 | `RATE_LIMITED` | Demasiadas peticiones |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |

## 🔄 Versionado

La API usa versionado por URL path:

```
/api/v1/skills    # Versión 1 (futura)
/api/skills       # Sin versión = latest (MVP)
```

Se añadirá versionado explícito cuando la API sea pública (v1.0).
