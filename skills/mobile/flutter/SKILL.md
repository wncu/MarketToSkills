---
name: Flutter
description: Use when developing, debugging, or reviewing Flutter / Dart mobile apps — widgets & layout, state management (BLoC/Cubit), navigation (flow_builder/go_router), forms (formz), Material 3 theming, REST/http, WebSockets, Firebase auth + FCM push, maps (flutter_map) & location, in-app purchases, animations, testing, performance, or build/deploy. Especially apps using BLoC/Cubit, formz, flow_builder, Firebase, and flutter_map.
---

# Flutter Development

## Overview

Comprehensive, version-accurate reference for building Flutter apps with **Dart 3** and **Material 3**, weighted toward a **production mobile** stack (Cubit/BLoC, formz, flow_builder, a static `ApiService`, `web_socket_channel`, Firebase auth + FCM, `flutter_map`, `in_app_purchase`).

This is a **reference skill**: this file routes you to the right topic. **Load only the `references/*.md` file(s) for your current task** — do not read them all. Each reference file ends with a `## Real-world usage` section showing the real pattern this codebase uses.

## When to use

- Writing/editing any Flutter widget, screen, cubit, bloc, service, or model.
- Choosing an approach (state management, navigation, forms, theming) and wanting the idiom this codebase already uses.
- Wiring a package: BLoC, formz, flow_builder, http, web_socket_channel, firebase_auth/messaging, flutter_map, geolocator, image_picker, in_app_purchase, flutter_local_notifications.
- Debugging rebuilds/jank, fixing an outdated package API, or setting up build/flavors/dotenv/splash/icons.
- Reviewing Flutter code for correctness or convention drift.

**Not for:** the AWS/Lambda backend (see the backend repo's `CLAUDE.md`), or the Next.js admin frontend.

## Reference map

| Area | File | Read when |
|---|---|---|
| Dart language | [references/dart-essentials.md](references/dart-essentials.md) | null safety, records, patterns, sealed classes, generics, Equatable equality |
| Async / streams / lifecycle | [references/async-streams-isolates.md](references/async-streams-isolates.md) | Future/Stream, `StreamController.broadcast`, isolates/`compute`, `AppLifecycleListener`, cleanup in `dispose` |
| Widgets & layout | [references/widgets-and-layout.md](references/widgets-and-layout.md) | building UI, the constraints model, Row/Column/Stack, ListView/slivers, `Overlay`, responsive |
| State management | [references/state-management.md](references/state-management.md) | **Cubit/BLoC 9.x**, providers, `BlocBuilder/Listener/Selector`, `context.select`, immutable state + `copyWith` |
| Navigation & routing | [references/navigation-and-routing.md](references/navigation-and-routing.md) | **flow_builder** auth gating, `route()/page()` factories, Navigator 1/2, go_router (reference) |
| Forms & input | [references/forms-and-input.md](references/forms-and-input.md) | **formz** inputs, `FormzSubmissionStatus`, `TextField`/`Form`, focus, dropdown_button2 |
| Theming & Material 3 | [references/theming-material3.md](references/theming-material3.md) | `ThemeData`, `ColorScheme.fromSeed`, `InputDecorationTheme`, `AppColors`/`AppGradients`, dark mode |
| Networking & REST | [references/networking-rest.md](references/networking-rest.md) | **`ApiService`** + JWT injection, `http`, JSON parsing, `{success,data,message}` envelope, cursor pagination |
| WebSockets & realtime | [references/websockets-realtime.md](references/websockets-realtime.md) | **`web_socket_channel`** singleton, `acquire/release` ref-count, backoff reconnect, `channel.ready` |
| Firebase core & auth | [references/firebase-core-auth.md](references/firebase-core-auth.md) | `Firebase.initializeApp`, `firebase_auth` streams, `getIdToken`, Google/Apple sign-in, auth → BLoC |
| FCM & local notifications | [references/firebase-messaging-fcm.md](references/firebase-messaging-fcm.md) | **`firebase_messaging`** handlers, `@pragma('vm:entry-point')`, Android channel, route by `data['type']` |
| Maps & location | [references/maps-and-location.md](references/maps-and-location.md) | **`flutter_map`** (OSM), marker clustering, `geolocator` permissions, `google_places_flutter` |
| Media, files & assets | [references/media-files-assets.md](references/media-files-assets.md) | `image_picker`, `file_picker`, `flutter_svg`, assets/fonts, `url_launcher`, multipart/presigned upload |
| In-app purchases | [references/in-app-purchase.md](references/in-app-purchase.md) | **`in_app_purchase`** product query, purchase stream, server-side receipt verification |
| Animations | [references/animations.md](references/animations.md) | implicit/explicit, `AnimationController` + `SlideTransition`, Hero, page transitions |
| Testing | [references/testing.md](references/testing.md) | unit/widget/integration tests, **`bloc_test`**, mocktail, golden tests |
| Performance & DevTools | [references/performance-and-devtools.md](references/performance-and-devtools.md) | `const`, scoping rebuilds, `ListView.builder`, `RepaintBoundary`, DevTools, profiling |
| Tooling, build & deploy | [references/tooling-build-deploy.md](references/tooling-build-deploy.md) | Flutter CLI, build modes, flavors, `flutter_dotenv`, native splash/launcher icons, lints |
| Architecture & conventions | [references/architecture-conventions.md](references/architecture-conventions.md) | feature-first layout, services/repositories, DI, event bus, the reference conventions distilled |

## "I want to…" → file

| Task | Read |
|---|---|
| Add a screen with loading/error state | state-management.md, forms-and-input.md |
| Call a new REST endpoint | networking-rest.md (+ architecture-conventions.md) |
| Add a real-time chat/message feature | websockets-realtime.md |
| Handle a new push-notification type | firebase-messaging-fcm.md |
| Add a map marker / "near me" | maps-and-location.md |
| Pick/upload an image or file | media-files-assets.md |
| Add a subscription/paywall | in-app-purchase.md |
| Add a multi-step form | forms-and-input.md, state-management.md |
| Animate something | animations.md |
| Fix jank / too many rebuilds | performance-and-devtools.md |
| Add a flavor / env var / splash | tooling-build-deploy.md |
| Write tests for a cubit/screen | testing.md |

## Reference conventions (a proven production setup)

These hold across the whole app — full detail in [references/architecture-conventions.md](references/architecture-conventions.md):

- **State:** Cubit for almost everything; **BLoC only for streams** (Firebase auth). States are `final class … extends Equatable` with `copyWith()`, a `FormzSubmissionStatus status`, and semantic getters (`isLoading`, `isValid`). Never mutate state.
- **Forms:** `formz` inputs (`Email.pure()/.dirty()`); cubit `xChanged()` emits `copyWith(x: X.dirty(v))`; `Formz.validate([...])` for `isValid`.
- **Networking:** all HTTP goes through the single static `ApiService` (auto-injects the Firebase JWT). Parse `{success, data, message}` defensively; use `ApiService.extractErrorMessage`.
- **Navigation:** `FlowBuilder<AuthStatus>` at the root; every page exposes static `route()` (`MaterialPageRoute`) and `page()` (`MaterialPage`) factories; imperative nav via `Navigator.of(context).push(Page.route())`.
- **Theme:** `useMaterial3: true`; colors only from `AppColors` (primary `0xFF0688D3`), gradients only from `AppGradients` — never inline `Color(...)`.
- **Realtime:** one `ConsultationWebSocketService` singleton, `acquire()`/`release()` reference-counted, `await channel.ready`, exponential backoff, `AppLifecycleListener(onResume:)`.
- **Notifications:** FCM events are dispatched to a `NotificationEventBus` (broadcast `StreamController`) by `data['type']`; cubits subscribe — they don't touch `firebase_messaging` directly.
- **Files:** feature-first `lib/features/<feature>/{cubit|bloc,models,services,view}`; shared `lib/core/`. One class per file, `snake_case` filenames; services are static-method classes or singletons.

## How to use this skill

1. Identify the task area in the **Reference map** (or the "I want to…" table).
2. Read that one reference file (and any it cross-links as required).
3. Follow its `## Real-world usage` pattern to match the codebase; verify package APIs against the version pins noted in each file.
