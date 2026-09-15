# App Architecture & Conventions

## Overview
How to lay out a Flutter app so it scales: layering (presentation/domain/data), the repository + service split, where models and DI live, and the naming/error conventions that keep a multi-feature codebase navigable. Matters most once you have >2 features and >1 data source. The reference app uses a **feature-first** layout with BLoC/Cubit as the view-model layer, static-method/singleton services, and a pub-sub event bus for cross-cutting push events.

## Quick reference

| Concept | Reference choice | Alternative |
|---|---|---|
| Project structure | **Feature-first** (`lib/features/<f>/{cubit,models,services,view}`) | Layer-first (`lib/{views,cubits,repos}`) |
| Presentation/VM | **Cubit** (`flutter_bloc ^9.1`); `Bloc` only for streams (Firebase auth) | MVVM ViewModel + ChangeNotifier |
| Data access | **Service** classes (static methods / singletons) | Repository class instances |
| State/model objects | `final class … extends Equatable` + `copyWith()` | `freezed`, plain classes |
| DI | **Constructor injection** + global `MultiBlocProvider` + singletons | `get_it` / `injectable`, `Provider` |
| Cross-cutting events | **`NotificationEventBus`** broadcast `StreamController` | `get_it` event bus, `Stream` per cubit |
| Page wiring | `flow_builder ^0.1` + static `route()` / `page()` factories | `go_router`, named routes |
| Networking | single static `ApiService` (auto-injects JWT) | Dio + interceptors |
| Pagination | cursor (`afterCursor` / `beforeCursor`, legacy `lastKey`) | offset/limit |
| Equality | `equatable ^2.0` on every state & model | manual `==`/`hashCode` |

Verified versions (pub.dev, 2026-06): `flutter_bloc 9.1.1`, `bloc 9.0.0`, `equatable 2.0.8`, `get_it 9.2.1` (reference only — not a dependency of the reference app).

## Feature-first vs layer-first

**Layer-first** groups by technical role (`lib/cubits/`, `lib/models/`, `lib/services/`). It collapses fast: touching one feature means editing four far-apart folders, and feature boundaries blur.

**Feature-first** groups by product capability. Everything a feature needs lives under one folder; shared pieces graduate to `lib/core/`. This keeps a PR's blast radius inside one directory and makes deleting a feature a `rm -rf`.

```
lib/
  core/                         # cross-feature shared layer
    services/                   # ApiService, NotificationEventBus
    models/                     # widely reused domain types
    widgets/                    # AppBackground, AppBottomNavBar, …
    form_inputs/                # formz inputs (Email, Password)
    form_widgets/               # TextInput, AppGradientButton
    icons/  theme.dart  snackbar.dart
  features/
    patient/
      analysis/                 # a feature MODULE
        cubit/                  # *_cubit.dart + *_state.dart (part-of)
        models/                 # Job, JobDetail (+ fromJson)
        services/               # JobsService, JobReportService (data layer)
        view/                   # pages + subfolders (history/, job_detail/)
  main.dart  routes.dart  firebase_options.dart
```

**Rule:** a type used by exactly one feature stays in that feature; promote to `lib/core/` only on the *second* consumer (YAGNI — don't pre-share).

## Recommended layers (where official guidance lands)

Flutter's official "app architecture" guide (docs.flutter.dev/app-architecture) is **MVVM-ish**: View → ViewModel → Repository → Service. The reference app maps onto it without a separate ViewModel class — the **Cubit is the view model**:

| Flutter official term | Reference equivalent | Responsibility |
|---|---|---|
| View | `*Page` widget (`view/`) | Layout + render state. **No business logic.** |
| View Model | `Cubit` (`cubit/`) | UI logic, holds `State`, exposes command methods. **Thin.** |
| Repository | (folded into) `Service` | Single source of truth for a data domain. |
| Service | `*Service` (`services/`) | Wraps one data source (REST via `ApiService`, WS, Firebase). Holds no UI state. |
| Domain model | `models/` (`Job`, `UserProfile`) | Immutable entity + `fromJson`. |

The thin-everything rule:

- **Thin view** — only `BlocBuilder`/`BlocListener`, layout, navigation. No `http`, no `jsonDecode`.
- **Thin cubit** — orchestrates: call service, map result → state, `emit`. No widgets, no raw HTTP.
- **Thin service** — one call, parse envelope, throw on failure, return a model. No `emit`, no `BuildContext`.

**Optional domain layer (use-cases).** Flutter's official guide treats a domain layer as *optional* — add `UseCase`/`Interactor` classes only when a Cubit would otherwise orchestrate multiple repositories or carry non-trivial business rules. The reference app has **no concrete use-case classes** today (logic is thin enough to live in the Cubit), so this stays a "reach for it when a Cubit gets fat" escape hatch, not a mandated layer. When you do add one, it sits between Cubit and Service: `Cubit → UseCase → Service(s)`, and the use-case is the injected, mockable collaborator.

```dart
// View → command on cubit only.
class JobsHistory extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<JobsCubit, JobsState>(
      builder: (context, state) {
        if (state.status == JobsStatus.loading) return const _Spinner();
        if (state.status == JobsStatus.failure) {
          return _Error(state.errorMessage, // command back into the cubit
              onRetry: () => context.read<JobsCubit>().fetchInitial());
        }
        return _List(state.jobs);
      },
    );
  }
}
```

## Repository / service pattern wrapping data sources + auth

A service is the seam between the app and the outside world. In the reference app it's a **class of static methods** (private constructor to forbid instantiation) wrapping the shared `ApiService`, which itself injects the Firebase JWT. Auth is centralized: services never touch tokens.

```dart
class JobsService {
  JobsService._(); // not instantiable — pure static seam

  static Future<JobsPage> fetchJobs({
    required int limit,
    String? afterCursor,
  }) async {
    // ApiService.get() attaches `Authorization: Bearer <jwt>` from
    // FirebaseAuth.instance.currentUser.getIdToken() — auth lives in ONE place.
    final res = await ApiService.get('/patient/jobs', body: {
      'limit': limit,
      if (afterCursor != null && afterCursor.isNotEmpty) 'afterCursor': afterCursor,
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(ApiService.extractErrorMessage(res.body));
    }
    final decoded = jsonDecode(res.body);
    // Envelope contract: { success, data, message }
    if (decoded is! Map<String, dynamic> || decoded['success'] != true) {
      throw Exception(ApiService.extractErrorMessage(res.body, 'Error obteniendo jobs'));
    }
    final data = decoded['data'] as Map<String, dynamic>;
    final jobs = (data['jobs'] as List? ?? [])
        .whereType<Map>()
        .map((m) => Job.fromJson(m.cast<String, dynamic>()))
        .toList();
    return JobsPage(jobs: jobs, afterCursor: _readCursor(data), count: jobs.length);
  }
}
```

Why static methods here instead of an injected `JobsRepository` instance: the service is stateless and has no collaborators to swap, so an instance buys nothing. The trade-off is **testability** — static calls can't be mocked via constructor injection. When a service grows state or needs faking in tests, promote it to an instance behind an interface (see the seam section).

## Models / entities + serialization placement

- One model per file in the feature's `models/`. Serialization (`fromJson`, optional `toJson`) lives **on the model**, not in the service — the service parses the envelope, the model parses itself.
- Models are **immutable `final class`** with a `const` constructor and `Equatable`.
- `fromJson` is defensive: null-coalesce every field so a partial backend payload never throws.

```dart
final class Job extends Equatable {
  const Job({
    required this.jobId,
    required this.status,
    required this.createdAt,
    required this.imageCount,
    this.healthScore,
  });

  final String jobId;
  final String status;
  final double? healthScore;
  final DateTime createdAt;
  final int imageCount;

  factory Job.fromJson(Map<String, dynamic> json) => Job(
        jobId: (json['jobId'] as String?) ?? '',
        status: (json['status'] as String?) ?? '',
        healthScore: (json['overallHealthScore'] as num?)?.toDouble(),
        createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
        imageCount: (json['imageCount'] as num?)?.toInt() ?? 0,
      );

  @override
  List<Object?> get props => [jobId, status, healthScore, createdAt, imageCount];
}
```

## Equatable everywhere

Every `State` and every domain model extends `Equatable`. Why it's load-bearing: `flutter_bloc` skips a rebuild when the new state `==` the old one. Without value equality, every `emit` is a fresh object reference → unconditional rebuild → jank and lost `BlocListener` dedup. `props` must list **every** field that affects equality (forget one and stale states get silently swallowed).

```dart
final class JobsState extends Equatable {
  const JobsState({
    this.status = JobsStatus.initial,
    this.jobs = const <Job>[],
    this.afterCursor,
    this.isLoadingMore = false,
    this.errorMessage,
  });

  final JobsStatus status;
  final List<Job> jobs;
  final String? afterCursor;
  final bool isLoadingMore;
  final String? errorMessage;

  // errorMessage is intentionally NOT defaulted to this.errorMessage so it
  // clears on the next success — a deliberate copyWith asymmetry.
  JobsState copyWith({
    JobsStatus? status,
    List<Job>? jobs,
    String? afterCursor,
    bool? isLoadingMore,
    String? errorMessage,
  }) =>
      JobsState(
        status: status ?? this.status,
        jobs: jobs ?? this.jobs,
        afterCursor: afterCursor ?? this.afterCursor,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        errorMessage: errorMessage,
      );

  @override
  List<Object?> get props => [status, jobs, afterCursor, isLoadingMore, errorMessage];
}
```

## Dependency injection + testability seams

Patterns in order of the reference app's preference (1–2 are what the reference app ships; 3–5 are ecosystem references):

**1. Constructor injection (default).** A cubit receives its collaborators (repos, other cubits) as constructor params. This is the testability seam: in tests you pass fakes; no global state to reset.

```dart
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc({
    required AuthenticationRepository authenticationRepository,
    required ProfileCubit profileCubit, // injected collaborator → mockable
  })  : _authRepo = authenticationRepository,
        _profileCubit = profileCubit,
        super(const AuthState.unknown());
}
```

Because the collaborators arrive through the constructor, a unit test substitutes fakes with no global state to reset (`mocktail` + `bloc_test 10.x`):

```dart
class _MockAuthRepo extends Mock implements AuthenticationRepository {}
class _MockProfileCubit extends MockCubit<ProfileState> implements ProfileCubit {}

void main() {
  late _MockAuthRepo authRepo;
  late _MockProfileCubit profileCubit;

  setUp(() {
    authRepo = _MockAuthRepo();
    profileCubit = _MockProfileCubit();
    when(() => authRepo.user).thenAnswer((_) => const Stream.empty());
  });

  blocTest<AuthBloc, AuthState>(
    'emits authenticated when the repo stream yields a user',
    build: () => AuthBloc(
      authenticationRepository: authRepo, // injected fake — no real Firebase
      profileCubit: profileCubit,
    ),
    act: (bloc) => bloc.add(const AuthUserSubscriptionRequested()),
    expect: () => [isA<AuthState>()],
  );
}
```

A `static`-method `Service` can't be swapped this way — that's the testability cost called out in the repository section; promote it to an injected instance behind an interface when a test needs to fake it.

**2. Global providers at the app root** for app-lifetime singletons that many features read:

```dart
RepositoryProvider.value(            // share an instance, don't recreate
  value: _authService,
  child: MultiBlocProvider(
    providers: [
      BlocProvider(create: (_) => RoleCubit()),
      BlocProvider(create: (_) => ProfileCubit()),
      BlocProvider(
        lazy: false,                 // AuthBloc must start subscribing immediately
        create: (ctx) => AuthBloc(
          authenticationRepository: ctx.read<AuthenticationRepository>(),
          profileCubit: ctx.read<ProfileCubit>(), // wire cubit-to-cubit via context
        )..add(const AuthUserSubscriptionRequested()),
      ),
    ],
    child: const AppView(),
  ),
)
```

`RepositoryProvider.value` for already-built objects; `create:` for owned-lifecycle objects. Read with `context.read<T>()` (one-shot) vs `context.watch<T>()` (rebuild).

**3. `get_it` (reference — not a dependency of the reference app).** For larger apps that want a global service locator decoupled from the widget tree. `get_it 9.x` API:

```dart
final getIt = GetIt.instance;

void setupLocator() {
  getIt.registerLazySingleton<ApiClient>(() => ApiClient());        // built on first get<T>()
  getIt.registerSingleton<AuthRepository>(AuthRepository());        // eager, shared
  getIt.registerFactory<SearchQuery>(() => SearchQuery());          // new instance each get<T>()
}
// retrieve: getIt<ApiClient>()  — swap registrations in tests, getIt.reset() in tearDown
```

**4. `injectable` (reference — not a dependency of the reference app).** Layers build-time code-gen annotations on top of `get_it` so you never hand-write the locator wiring. `injectable 3.x` API (annotate classes, generate the `.config.dart`, call `getIt.init()`):

```dart
// Annotate the classes …
@lazySingleton
class ApiClient {}                       // → registerLazySingleton

@injectable                              // → registerFactory (new each get<T>())
class SearchQuery { SearchQuery(this.api); final ApiClient api; }

// … and one top-level init seam:
final getIt = GetIt.instance;

@InjectableInit()
void configureDependencies() => getIt.init(); // from generated injection.config.dart
```

Then `dart run build_runner build` generates `injection.config.dart`; call `configureDependencies()` in `main()` before `runApp`. Retrieval is plain `getIt<ApiClient>()`. Annotation cheatsheet: `@injectable`→factory, `@singleton`→eager singleton, `@lazySingleton`→lazy singleton.

**5. `Provider` / `ChangeNotifierProvider` (non-bloc, reference).** `RepositoryProvider` above is the `provider` package scoped to a single value; the standalone `provider` idiom for a plain `ChangeNotifier` view-model (no `flutter_bloc`) is:

```dart
class CounterModel extends ChangeNotifier {
  int _count = 0;
  int get count => _count;
  void increment() { _count++; notifyListeners(); }
}

ChangeNotifierProvider(
  create: (_) => CounterModel(),
  child: const CounterPage(),
);
// read once: context.read<CounterModel>().increment();
// rebuild on change: context.watch<CounterModel>().count  (or Consumer<CounterModel>)
```

The reference app uses Cubit instead of bare `ChangeNotifier` — same tree-scoped DI mechanics (`provider` underpins `flutter_bloc`'s `BlocProvider`), but Cubit gives you `Equatable`-gated rebuilds and `bloc_test` for free.

## Singletons vs DI

The reference app deliberately mixes both:

| Use a **singleton** when | Use **DI** when |
|---|---|
| Exactly one instance must exist process-wide (a socket, an event bus) | The collaborator differs per test / per scope |
| No per-test substitution needed | You need a mockable seam |
| e.g. `ApiService` (static), `ConsultationWebSocketService.instance`, `NotificationEventBus.instance` | e.g. `AuthBloc`'s repository + `profileCubit` |

The singleton idiom — private constructor + `static final instance`:

```dart
final class ConsultationWebSocketService {
  ConsultationWebSocketService._() {
    _lifecycleListener = AppLifecycleListener(onResume: _onAppResumed);
  }
  static final ConsultationWebSocketService instance =
      ConsultationWebSocketService._();

  int _clients = 0;                  // reference counting: keep socket alive
  Future<void> acquire() async {     // while ≥1 screen needs it
    _clients++;
    await connect();
  }
  Future<void> release() async {
    _clients = (_clients - 1).clamp(0, 1 << 30);
    if (_clients == 0) await disconnect();
  }
}
```

The singleton risk is hidden global state in tests; mitigate by keeping singletons *thin* and pushing decisions into injected collaborators.

## Event bus / pub-sub for cross-cutting events

Push notifications (FCM) are received at the app root in `main.dart` but must reach many cubits scattered across features. Wiring FCM directly into each cubit couples every cubit to Firebase. Instead, a **broadcast `StreamController`** decouples producer from consumers.

```dart
// core/services/notification_event_bus.dart
sealed class NotificationEvent { const NotificationEvent(); }
final class AnalysisCompleteEvent extends NotificationEvent {
  const AnalysisCompleteEvent({required this.jobId});
  final String jobId;
}

class NotificationEventBus {
  NotificationEventBus._();
  static final instance = NotificationEventBus._();
  final _controller = StreamController<NotificationEvent>.broadcast(); // many listeners
  Stream<NotificationEvent> get stream => _controller.stream;
  void dispatch(NotificationEvent e) => _controller.add(e);
}

// Producer (main.dart, on FCM message):
NotificationEventBus.instance.dispatch(AnalysisCompleteEvent(jobId: id));

// Consumer (any cubit) — subscribe in ctor, ALWAYS cancel in close():
class JobsCubit extends Cubit<JobsState> {
  JobsCubit() : super(const JobsState()) {
    _sub = NotificationEventBus.instance.stream.listen((event) {
      if (event is AnalysisCompleteEvent) fetchInitial(); // refresh on push
    });
  }
  late final StreamSubscription<NotificationEvent> _sub;

  @override
  Future<void> close() {
    _sub.cancel(); // leak guard — broadcast streams don't auto-clean
    return super.close();
  }
}
```

Use a `sealed class` hierarchy so consumers can exhaustively `switch`/`is`-check event types.

## Folder / file naming

| Rule | Example |
|---|---|
| Files `snake_case.dart` | `jobs_cubit.dart`, `profile_gate_page.dart` |
| One public class per file (small private helpers OK) | `Job` in `job.dart` |
| State is `part of` its cubit | `part 'jobs_state.dart';` ↔ `part of 'jobs_cubit.dart';` |
| `final class` for states & models | `final class JobsState extends Equatable` |
| Pages end `_page.dart`, services `_service.dart`, cubits `_cubit.dart` | — |
| Subfolder views by sub-flow | `view/history/`, `view/job_detail/`, `view/image_flow/` |

## Page wiring & navigation seam

Top-level auth flow is declarative via `flow_builder`; within a flow, pages expose static `route()` / `page()` factories so call sites never hand-build a `MaterialPageRoute`.

```dart
// routes.dart — declarative flow keyed on AuthStatus
List<Page<dynamic>> onGenerateAppViewPages(AuthStatus state, List<Page<dynamic>> pages) =>
    switch (state) {
      AuthStatus.authenticated => [ProfileGatePage.page()],
      AuthStatus.unauthenticated => [RoleSelectionPage.page()],
    };

// Each page owns its factory:
class ProfileGatePage extends StatelessWidget {
  const ProfileGatePage({super.key});
  static Page<void> page() => const MaterialPage<void>(child: ProfileGatePage());
  // imperative pushes elsewhere: static Route<void> route() => MaterialPageRoute(...)
}
```

`ProfileGatePage` is the **role fork**: after auth it loads `GET /profile`, derives the real role (patient/doctor), and routes to the correct shell — keeping role logic out of every downstream page.

## Cursor pagination convention

All growable lists use cursor pagination (`afterCursor`/`beforeCursor`; legacy `lastKey` tolerated). The cubit owns the cursor; the service is stateless.

```dart
Future<void> fetchMore() async {
  if (!state.hasMore || state.isLoadingMore) return;
  if ((state.afterCursor ?? '').isEmpty) return;     // guard double-fetch
  emit(state.copyWith(isLoadingMore: true));
  try {
    final page = await JobsService.fetchJobs(limit: pageSize, afterCursor: state.afterCursor);
    emit(state.copyWith(
      jobs: [...state.jobs, ...page.jobs],            // append, never replace
      afterCursor: page.afterCursor,
      hasMore: (page.afterCursor ?? '').isNotEmpty,
      isLoadingMore: false,
    ));
  } catch (e) {
    emit(state.copyWith(isLoadingMore: false, errorMessage: e.toString()));
  }
}
```

## Scaling a feature module

To add a feature (e.g. `patient/clinics`):

1. `lib/features/patient/clinics/{cubit,models,services,view}/`.
2. Model(s) with `fromJson` + `Equatable` in `models/`.
3. `ClinicsService` (static methods) in `services/`, calling `ApiService` — never raw `http`.
4. `ClinicsCubit` + `ClinicsState` (`part`/`part of`) in `cubit/`. Subscribe to `NotificationEventBus` in the ctor if it must react to push; cancel in `close()`.
5. `ClinicsPage` in `view/` providing the cubit via `BlocProvider`; split sub-flows into subfolders.
6. Wire navigation through the existing flow or a `Page.route()` push. Promote anything a *second* feature needs to `lib/core/`.

## Error handling strategy app-wide

| Layer | Responsibility |
|---|---|
| **Service** | Inspect HTTP status + envelope `success`; `throw Exception(ApiService.extractErrorMessage(...))` (Spanish, user-facing). Never returns a half-parsed object. |
| **Cubit** | `try/catch` around the service call → `emit(copyWith(status: failure, errorMessage: e.toString()))`. Never rethrows into the widget tree. |
| **View** | Renders `failure` state with a retry command + reads `errorMessage`. Transient errors → `snackbar.dart`. |
| **Firebase** | Catch `FirebaseAuthException` at the auth-service boundary, map `e.code` → Spanish copy (`core/firebase_auth_errors.dart`). |

Principle: **errors become state, not thrown exceptions crossing the UI boundary.** A failed fetch is a `JobsStatus.failure`, never an unhandled `Future` error.

## Real-world usage

The whole file is the reference app's architecture; this is the one-glance canonical checklist (the layout/idioms every feature must match):

```
lib/
  core/            services/ models/ widgets/ form_inputs/ form_widgets/ icons/ theme.dart  (shared, cross-feature)
  features/<f>/    cubit|bloc/  models/  services/  view/                                    (feature-first, self-contained)
  main.dart        routes.dart                                                               (root: MultiBlocProvider + FlowBuilder)
```

- **One class per file**, `snake_case` filename = class name. `final class` for every state/model, `extends Equatable` with complete `props`.
- **State** is immutable: `copyWith()` + a `FormzSubmissionStatus status` + semantic getters (`isLoading`, `isValid`). Cubit by default; **Bloc only for streams** (auth).
- **Services** are static-method classes (`ApiService`, `ProfileService`) or singletons (`ConsultationWebSocketService`). They parse + validate + return a model or throw — never touch UI/state.
- **DI seam:** inject the service (or a typed function) into the cubit ctor so tests pass a fake; global cubits (`Profile`, `Role`, `Auth`) live in the root `MultiBlocProvider`.
- **Cross-cutting events** (FCM) go through `NotificationEventBus` (broadcast `StreamController`) — cubits subscribe; nothing else imports `firebase_messaging`.
- **Errors become state**, never exceptions crossing the UI boundary. **Lists** use cursor pagination (`after`/`before`/`lastKey`), never page numbers.

See [state-management.md](state-management.md), [networking-rest.md](networking-rest.md), and [websockets-realtime.md](websockets-realtime.md) for each piece in depth.

## Common mistakes

| Pitfall | Fix |
|---|---|
| `http`/`jsonDecode` inside a widget | Move to a `*Service`; the cubit calls the service. |
| Forgetting a field in `Equatable.props` | Rebuilds silently dropped — list **every** state field. |
| Mutating the jobs list in place | `copyWith(jobs: [...state.jobs, ...new])` — new list, value equality holds. |
| `StreamSubscription` (event bus / WS) not cancelled | Cancel in `Cubit.close()` / `State.dispose()` — broadcast streams leak. |
| Wiring FCM directly into a cubit | Dispatch a `NotificationEvent`; cubits subscribe to `NotificationEventBus`. |
| Promoting a type to `lib/core/` on first use | Wait for the second consumer (YAGNI). |
| `context.watch` in an `onPressed` callback | Use `context.read<T>()` for one-shot reads; `watch` only in `build`. |
| Singleton holding test-relevant state | Keep singletons thin; inject the variable collaborator instead. |
| `errorMessage` sticking after success | Don't `?? this.errorMessage` it in `copyWith` — let it clear. |

## See also

- [state-management.md](state-management.md) — Cubit/Bloc, `FormzSubmissionStatus`, `BlocBuilder`/`BlocListener`, semantic getters.
- [navigation.md](navigation-and-routing.md) — `flow_builder`, `Page.route()`/`page()` factories, `Navigator.push`.
- [networking.md](networking-rest.md) — `ApiService`, `{success,data,message}` envelope, JWT injection, cursor pagination.
- [firebase-auth-fcm.md](firebase-core-auth.md) — auth `Bloc` over `userChanges`, FCM background handler, `NotificationEventBus`.
- Official docs consulted:
  - Flutter app architecture guide — https://docs.flutter.dev/app-architecture/guide
  - Flutter architecture concepts (MVVM, layers) — https://docs.flutter.dev/app-architecture/concepts
  - `flutter_bloc` — https://pub.dev/packages/flutter_bloc
  - `equatable` — https://pub.dev/packages/equatable
  - `get_it` (service locator reference) — https://pub.dev/packages/get_it
  - `injectable` (code-gen DI reference) — https://pub.dev/packages/injectable
  - `provider` (`ChangeNotifierProvider` reference) — https://pub.dev/packages/provider
  - `bloc_test` (cubit/bloc unit-test seam) — https://pub.dev/packages/bloc_test
