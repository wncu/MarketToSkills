# 🤝 Contribuir a MarketToSkills

¡Gracias por tu interés en contribuir! Aquí tienes las pautas para hacerlo.

## Cómo Contribuir

### 1. Reportar Bugs

Abre un [Issue](https://github.com/tu-usuario/MarketToSkills/issues/new) con:
- Descripción clara del bug
- Pasos para reproducirlo
- Comportamiento esperado vs actual
- Screenshots si aplica
- Tu entorno (OS, versiones de Bun/Rust)

### 2. Sugerir Features

Abre un Issue con la etiqueta `enhancement` incluyendo:
- Descripción del feature
- Caso de uso / problema que resuelve
- Diseño propuesto (opcional)

### 3. Enviar Pull Requests

1. Haz fork del repositorio
2. Crea una rama desde `develop`:
   ```bash
   git checkout -b feat/mi-feature develop
   ```
3. Haz tus cambios siguiendo las [convenciones de código](docs/DEVELOPMENT.md)
4. Escribe/actualiza tests
5. Asegúrate de que todo pasa:
   ```bash
   bun run lint
   bun run test
   cd apps/api && cargo test && cargo clippy
   ```
6. Haz commit con [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat(skills): add tag filtering"
   ```
7. Push y crea un Pull Request contra `develop`

## Estructura del PR

- **Título**: Sigue Conventional Commits
- **Descripción**: Explica qué, por qué y cómo
- **Tests**: Incluye tests para cambios nuevos
- **Screenshots**: Para cambios de UI

## Código de Conducta

- Sé respetuoso y constructivo
- Acepta feedback con apertura
- Enfócate en el problema, no en la persona
- Respeta las decisiones del equipo

## Setup para Desarrollo

Sigue la [Guía de Desarrollo](docs/DEVELOPMENT.md) para configurar tu entorno local.

---

¡Toda contribución es bienvenida, desde corregir un typo hasta implementar un feature completo! 🎉
