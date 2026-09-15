# State Management (BLoC / Cubit + foundations)

## Overview
State management decides where mutable app data lives and how widgets rebuild when it changes. Flutter ships local primitives (`setState`, `InheritedWidget`, `ValueNotifier`, `ChangeNotifier`) for in-widget/local needs; the bloc family (`bloc`/`flutter_bloc`) adds testable, observable, stream-based separation of business logic from UI. The reference app uses **Cubit for almost everything** and **Bloc only for streams** (Firebase auth), with immutable `Equatable` states carrying a `FormzSubmissionStatus`.

## Quick reference

| API | Purpose | Notes |
|---|---|---|
| `setState(() {})` | rebuild one `State` | local, ephemeral only |
| `InheritedWidget` / `InheritedNotifier` | propagate down the tree, O(1) lookup | `of(context)` reads + subscribes |
| `ValueNotifier<T>` + `ValueListenableBuilder` | single mutable value, zero deps | identity-based change detection |
| `ChangeNotifier` + `ChangeNotifierProvider` | listenable object + `notifyListeners()` | `context.watch/read/select` (provider pkg) |
| `Cubit<S>` | functions → `emit(state)` | no events; simplest bloc |
| `Bloc<E,S>` | events → `on<E>` → `emit` | use for streams / transformers |
| `emit(state)` | push new state | no-op + assert if called after close |
| `emit.forEach<T>(stream, onData:, onError:)` | bind a stream → returns state | auto-cancels on handler end/close |
| `emit.onEach<T>(stream, onData:, onError:)` | bind a stream → side effects (you call `emit`) | for auth/userChanges streams |
| transformer: `sequential/concurrent/droppable/restartable` | `bloc_concurrency` ^0.3 | per-`on<E>` or global `Bloc.transformer` |
| `BlocProvider(create:, lazy:)` | DI a bloc/cubit | `lazy:false` builds eagerly |
| `BlocProvider.value(value:)` | re-expose existing bloc | does **not** auto-close |
| `MultiBlocProvider(providers:[...])` | flatten nested providers | |
| `RepositoryProvider` / `.value` | DI a repository/service | `dispose:` optional |
| `context.read<T>()` | one-off lookup, no rebuild | use in callbacks/`initState`-safe spots |
| `context.watch<T>()` | read + subscribe to whole state | rebuilds on every change |
| `context.select<B,V>((b)=>v)` | read + subscribe to a slice | rebuild only when `v` changes |
| `BlocBuilder<B,S>(buildWhen:, builder:)` | rebuild UI | |
| `BlocListener<B,S>(listenWhen:, listener:)` | side effects (nav/snackbar) | no rebuild |
| `BlocConsumer` | builder + listener in one | |
| `BlocSelector<B,S,V>(selector:, builder:)` | rebuild on slice only | |
| `BlocObserver` | global lifecycle logging | `Bloc.observer = ...` |

**Versions:** `bloc ^9.1`, `flutter_bloc ^9.1`, `bloc_concurrency ^0.3`, `equatable ^2.0`, `formz ^0.8`, `hydrated_bloc ^10`, `provider`.

---

## Foundations (when each fits)

| Need | Reach for |
|---|---|
| Toggle/counter inside one widget | `setState` |
| Share a value with a few descendants | lift state up + pass via constructor |
| One value, many distant listeners, no logic | `ValueNotifier` + `ValueListenableBuilder` |
| Object with several fields + methods, simple app | `ChangeNotifier` + `ChangeNotifierProvider` |
| Testable business logic, observability, streams | **Cubit / Bloc** |

```dart
// ValueNotifier: surgical rebuilds, no package, no BuildContext lookup.
final _quality = ValueNotifier<int>(0); // image qualityScore 0–100

ValueListenableBuilder<int>(
  valueListenable: _quality,
  builder: (context, score, _) => Text('Calidad: $score'),
);
// _quality.value = 72;  // notifies only this builder

// ChangeNotifier + provider: context.watch subscribes, context.read does not.
class CartModel extends ChangeNotifier {
  final _items = <String>[];
  List<String> get items => List.unmodifiable(_items);
  void add(String x) { _items.add(x); notifyListeners(); } // WHY: tell listeners to rebuild
}
// ChangeNotifierProvider(create: (_) => CartModel(), child: ...)
// context.watch<CartModel>().items   → rebuilds
// context.read<CartModel>().add('x') → no rebuild (use in callbacks)
```

`InheritedWidget` is what `BlocProvider`/`Provider` are built on: `dependOnInheritedWidgetOfExactType` both reads and registers the caller for rebuilds. You rarely hand-write it now — use bloc/provider.

In the `provider` package, scope rebuilds with `Selector<T, V>` (the provider equivalent of `BlocSelector`/`context.select`, rebuilds only when `V` changes), and derive one provided value from another with `ProxyProvider<A, B>` / `ChangeNotifierProxyProvider<A, B>` (recompute/update `B` whenever its dependency `A` changes). The reference app uses bloc's `BlocSelector`/`RepositoryProvider` for these cases rather than the raw `provider` equivalents.

---

## Cubit vs Bloc — pick one

- **Cubit**: expose methods that call `emit(newState)`. No events, less boilerplate. Default choice.
- **Bloc**: input is **events** dispatched with `add(event)`, mapped by `on<Event>` handlers to `emit`. Choose it when you need: an event audit trail (`onTransition`), **event transformers** (debounce/throttle/drop), or to bind a **stream** cleanly (`emit.onEach`/`emit.forEach`).

```dart
// CUBIT — emit + onChange. State is immutable; always emit a new instance.
class CounterCubit extends Cubit<int> {
  CounterCubit() : super(0);
  void increment() => emit(state + 1);

  @override
  void onChange(Change<int> change) {
    super.onChange(change); // change.currentState / change.nextState
  }
}
```

```dart
// BLOC — events + on<Event> + Emitter. Register handlers in the constructor.
sealed class CounterEvent {}
final class Increment extends CounterEvent {}

class CounterBloc extends Bloc<CounterEvent, int> {
  CounterBloc() : super(0) {
    on<Increment>((event, emit) => emit(state + 1));
  }
}
// dispatch: context.read<CounterBloc>().add(Increment());
```

### Binding streams inside a Bloc

`emit.forEach` returns the next **state** per emission; `emit.onEach` gives you the value and you decide what to emit (and can emit multiple times). Both auto-manage the `StreamSubscription` and cancel when the handler completes or the bloc closes. Always pass `onError` — an unhandled error cancels the subscription.

```dart
Future<void> _onSubscriptionRequested(
  SubscriptionRequested event,
  Emitter<TodosState> emit,
) async {
  // forEach: map each emission → a new state
  await emit.forEach<List<Todo>>(
    _repo.todos(),
    onData: (todos) => state.copyWith(todos: todos, status: Status.success),
    onError: (e, st) => state.copyWith(status: Status.error),
  );
}
```

### Event transformers (`bloc_concurrency` ^0.3)

By default events run **concurrently**. Pass a transformer per handler (or set `Bloc.transformer` globally).

| Transformer | Behavior | Use for |
|---|---|---|
| `concurrent()` | all in parallel (default) | independent events |
| `sequential()` | one at a time, FIFO | ordered writes, avoid races |
| `droppable()` | ignore events while one is in flight | submit buttons (no double-submit) |
| `restartable()` | cancel in-flight, keep only latest | search / type-ahead |

```dart
import 'package:bloc_concurrency/bloc_concurrency.dart';

class SearchBloc extends Bloc<SearchEvent, SearchState> {
  SearchBloc() : super(const SearchState()) {
    on<QueryChanged>(_onQuery, transformer: restartable()); // cancel stale searches
    on<Submitted>(_onSubmit,   transformer: droppable());   // ignore taps while submitting
  }
}
```

---

## Providing

```dart
// Single bloc, lazily created the first time it's read (default).
BlocProvider(
  create: (context) => ProfileCubit(context.read<ProfileService>()),
  child: const ProfileView(),
);

// lazy:false builds it immediately (e.g. an auth stream that must start at boot).
BlocProvider(create: (_) => AuthBloc(...), lazy: false, child: ...);

// Re-expose an EXISTING bloc to a subtree (e.g. across a Navigator push).
// .value does NOT close the bloc — whoever created it owns its lifecycle.
BlocProvider.value(value: context.read<ProfileCubit>(), child: nextPage);

// Flatten nesting at the app root.
MultiBlocProvider(
  providers: [
    BlocProvider(create: (_) => AuthBloc(...), lazy: false),
    BlocProvider(create: (_) => ProfileCubit(...)),
    BlocProvider(create: (_) => RoleCubit(...)),
  ],
  child: const App(),
);

// Repositories/services (not state) → RepositoryProvider.
RepositoryProvider(
  create: (_) => ProfileService(),
  child: const App(),
);
// Existing instance (e.g. a singleton service):
RepositoryProvider.value(value: ApiService.instance, child: const App());
```

`context.read<T>()` resolves a provided bloc/repo without subscribing — use it inside `onPressed`, `initState`, and when constructing other blocs.

---

## Consuming

```dart
// BlocBuilder — rebuild UI; buildWhen gates rebuilds.
BlocBuilder<ProfileCubit, ProfileState>(
  buildWhen: (prev, curr) => prev.status != curr.status, // WHY: skip text-field keystroke rebuilds
  builder: (context, state) {
    if (state.status.isInProgress) return const CircularProgressIndicator();
    return Text(state.name);
  },
);

// BlocListener — side effects only (no rebuild). listenWhen gates the callback.
BlocListener<AuthBloc, AuthState>(
  listenWhen: (prev, curr) => prev.status != curr.status,
  listener: (context, state) {
    if (state.status == AuthStatus.unauthenticated) {
      Navigator.of(context).pushAndRemoveUntil(LoginPage.route(), (_) => false);
    }
  },
  child: child,
);

// BlocConsumer — both, when a single subtree needs to rebuild AND fire effects.
BlocConsumer<SignUpCubit, SignUpState>(
  listenWhen: (p, c) => p.status != c.status,
  listener: (context, state) {
    if (state.status.isFailure) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Error al registrarse')));
    }
  },
  buildWhen: (p, c) => p.status != c.status,
  builder: (context, state) =>
      ElevatedButton(onPressed: state.isValid ? _submit : null, child: const Text('Crear cuenta')),
);

// BlocSelector — rebuild only when the selected slice changes.
BlocSelector<ProfileCubit, ProfileState, FormzSubmissionStatus>(
  selector: (state) => state.status,
  builder: (context, status) => status.isInProgress
      ? const CircularProgressIndicator()
      : const SizedBox.shrink(),
);

// context.select — inline equivalent of BlocSelector inside a build method.
final isLoading = context.select((ProfileCubit c) => c.state.status.isInProgress);
```

**Builder vs Selector vs Listener:** rebuild whole subtree → `BlocBuilder`; rebuild on one slice → `BlocSelector`/`context.select`; navigate/snackbar/dialog → `BlocListener` (never do these inside `builder`, which can run multiple times).

---

## Immutable state: Equatable + copyWith + FormzSubmissionStatus

State classes are `final`, extend `Equatable`, list every field in `props` (so bloc skips no-op emits), and expose a `copyWith`. This idiom pairs it with `formz`'s `FormzSubmissionStatus` and semantic getters.

```dart
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';

// FormzSubmissionStatus: { initial, inProgress, success, failure, canceled }
// getters: isInitial, isInProgress, isSuccess, isFailure, isCanceled, isInProgressOrSuccess

final class LoginState extends Equatable {
  const LoginState({
    this.email = const EmailInput.pure(),
    this.password = const PasswordInput.pure(),
    this.status = FormzSubmissionStatus.initial,
    this.errorMessage,
  });

  final EmailInput email;
  final PasswordInput password;
  final FormzSubmissionStatus status;
  final String? errorMessage;

  bool get isValid => Formz.validate([email, password]); // formz aggregate
  bool get isLoading => status.isInProgress;

  LoginState copyWith({
    EmailInput? email,
    PasswordInput? password,
    FormzSubmissionStatus? status,
    String? errorMessage,
  }) =>
      LoginState(
        email: email ?? this.email,
        password: password ?? this.password,
        status: status ?? this.status,
        errorMessage: errorMessage ?? this.errorMessage,
      );

  // WHY: every field must be in props, or bloc treats unequal states as equal and drops emits.
  @override
  List<Object?> get props => [email, password, status, errorMessage];
}
```

```dart
// formz FormzInput: pure()/dirty() + validator override; displayError is null while pure.
enum EmailError { invalid }

class EmailInput extends FormzInput<String, EmailError> {
  const EmailInput.pure() : super.pure('');
  const EmailInput.dirty([super.value = '']) : super.dirty();

  static final _re = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  EmailError? validator(String value) =>
      _re.hasMatch(value) ? null : EmailError.invalid;
}
```

---

## BlocObserver (global logging)

```dart
class AppBlocObserver extends BlocObserver {
  @override
  void onChange(BlocBase bloc, Change change) {
    super.onChange(bloc, change);
    log('${bloc.runtimeType} $change');
  }
  @override
  void onError(BlocBase bloc, Object error, StackTrace st) {
    log('${bloc.runtimeType} $error', stackTrace: st);
    super.onError(bloc, error, st);
  }
}

void main() {
  Bloc.observer = AppBlocObserver(); // one observer for every Cubit + Bloc
  runApp(const App());
}
```

## hydrated_bloc (brief)

Persists state across restarts. Override `fromJson`/`toJson` (return `null` from `toJson` to skip persisting); initialize storage before `runApp`.

```dart
// HydratedBloc.storage = await HydratedStorage.build(
//   storageDirectory: HydratedStorageDirectory((await getTemporaryDirectory()).path));
class ThemeCubit extends HydratedCubit<ThemeMode> {
  ThemeCubit() : super(ThemeMode.system);
  void toggle() => emit(state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);

  @override
  ThemeMode fromJson(Map<String, dynamic> json) => ThemeMode.values[json['i'] as int];
  @override
  Map<String, dynamic>? toJson(ThemeMode state) => {'i': state.index};
}
```

- **Error recovery:** if `fromJson` throws on malformed/old persisted data, hydrated_bloc swallows it (routed through `onError`) and falls back to the `super(...)` initial state — the bloc still starts. Bump a schema/`version` field in your JSON and migrate (or ignore) when the shape changes, rather than relying on the silent fallback.
- **Clearing:** `clear()` (per-bloc) drops that bloc's persisted entry; `HydratedBloc.storage.clear()` wipes all persisted state (e.g. on logout). Both are async.

---

## Real-world usage

**Idioms:** Cubit for forms/CRUD, Bloc only for the Firebase auth stream, immutable `Equatable` states with `FormzSubmissionStatus`, and `withSubmissionInProgress/Success/Failure` helpers on state.

### Cubit + FormzSubmissionStatus helpers

```dart
final class ProfileState extends Equatable {
  const ProfileState({
    this.status = FormzSubmissionStatus.initial,
    this.profile,
    this.errorMessage,
  });

  final FormzSubmissionStatus status;
  final Profile? profile;
  final String? errorMessage;

  bool get isLoading => status.isInProgress;

  // Semantic transition helpers used across every cubit — read better than raw copyWith.
  ProfileState withSubmissionInProgress() =>
      copyWith(status: FormzSubmissionStatus.inProgress, errorMessage: null);
  ProfileState withSubmissionSuccess(Profile p) =>
      copyWith(status: FormzSubmissionStatus.success, profile: p);
  ProfileState withSubmissionFailure(String message) =>
      copyWith(status: FormzSubmissionStatus.failure, errorMessage: message);

  ProfileState copyWith({
    FormzSubmissionStatus? status,
    Profile? profile,
    String? errorMessage,
  }) =>
      ProfileState(
        status: status ?? this.status,
        profile: profile ?? this.profile,
        errorMessage: errorMessage ?? this.errorMessage,
      );

  @override
  List<Object?> get props => [status, profile, errorMessage];
}

class ProfileCubit extends Cubit<ProfileState> {
  ProfileCubit(this._service) : super(const ProfileState());
  final ProfileService _service;

  Future<void> fetchProfile() async {
    emit(state.withSubmissionInProgress());
    try {
      // ApiService auto-injects the Firebase JWT; envelope is { success, data, message }.
      final profile = await _service.getMyProfile();
      emit(state.withSubmissionSuccess(profile));
    } catch (e) {
      emit(state.withSubmissionFailure('No se pudo cargar el perfil'));
    }
  }
}
```

### AuthBloc with `emit.onEach` over the Firebase stream

```dart
sealed class AuthEvent {}
final class _AuthUserChanged extends AuthEvent {
  _AuthUserChanged(this.status);
  final AuthStatus status;
}

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc(this._auth) : super(const AuthState.unknown()) {
    on<AuthSubscriptionRequested>(_onSubscriptionRequested);
    on<_AuthUserChanged>((e, emit) => emit(AuthState(status: e.status)));
    add(AuthSubscriptionRequested());
  }
  final AuthService _auth;

  Future<void> _onSubscriptionRequested(
    AuthSubscriptionRequested event,
    Emitter<AuthState> emit,
  ) async {
    // onEach keeps the FirebaseAuth.userChanges() subscription alive for the bloc's life
    // and auto-cancels on close. onError prevents a transient error from killing the stream.
    await emit.onEach<User?>(
      _auth.userChanges, // FirebaseAuth.instance.userChanges()
      onData: (user) => add(_AuthUserChanged(
        user == null ? AuthStatus.unauthenticated : AuthStatus.authenticated,
      )),
      onError: addError,
    );
  }
}
```

### Global blocs at the root via MultiBlocProvider

```dart
MultiBlocProvider(
  providers: [
    // lazy:false → start the auth stream at boot so FlowBuilder<AuthStatus> reacts immediately.
    BlocProvider(create: (_) => AuthBloc(AuthService())..add(AuthSubscriptionRequested()), lazy: false),
    BlocProvider(create: (_) => ProfileCubit(ProfileService())),
    BlocProvider(create: (_) => RoleCubit()),
  ],
  child: const AppView(), // hosts FlowBuilder<AuthStatus> with onGenerateAppViewPages
);
```

### Root listener: react to auth status transitions

```dart
// At the AppView root — coordinate cross-cutting side effects on login/logout.
BlocListener<AuthBloc, AuthState>(
  listenWhen: (prev, curr) => prev.status != curr.status, // only on real transitions
  listener: (context, state) {
    switch (state.status) {
      case AuthStatus.authenticated:
        context.read<ProfileCubit>().fetchProfile();
      case AuthStatus.unauthenticated:
        WebSocketService.instance.disconnect(); // tear down realtime (wss://your-api.example.com/<stage>) on logout
        context.read<ProfileCubit>().clear();
      case AuthStatus.unknown:
        break;
    }
  },
  child: child,
);

// Gate a widget on auth status without rebuilding on unrelated profile changes:
final status = context.select((AuthBloc b) => b.state.status);
```

---

## Common mistakes

| Pitfall | Fix |
|---|---|
| `emit` after `close()` (async finishes post-dispose) | guard with `if (isClosed) return;` before the late `emit`, or `await` the work before disposing |
| Mutating state in place (`state.list.add(x); emit(state)`) | emit a **new** instance: `emit(state.copyWith(list: [...state.list, x]))` |
| Field missing from `props` | UI doesn't rebuild because Equatable thinks states are equal — add every field |
| Navigating / showing snackbar inside `builder` | move to `BlocListener`/`listener` — `builder` may run many times |
| `context.watch`/`BlocBuilder` on whole state for one field | use `BlocSelector` / `context.select` to scope rebuilds |
| `context.read` inside `build` to subscribe | `read` doesn't subscribe — use `watch`/`select`/`BlocBuilder` for reactive reads |
| Stream handler without `onError` | an emitted error cancels the subscription silently — always pass `onError: addError` |
| `BlocProvider.value` then expecting auto-close | `.value` never closes the bloc; the original `create:` owner closes it |
| New `Bloc` per rebuild because created in `build()` | create in `BlocProvider(create:)`, not inline in a widget's `build` |
| Heavy work in a non-transformed handler causing races | apply `sequential()`/`droppable()`/`restartable()` from `bloc_concurrency` |

## See also

- [testing.md](testing.md) — `bloc_test` (`blocTest`, `seed`, `act`, `expect`, `verify`) covered in full there
- [forms-validation.md](forms-and-input.md) — `formz` `FormzInput`/`Formz.validate` deep dive
- [navigation.md](navigation-and-routing.md) — `flow_builder` `FlowBuilder<AuthStatus>` driven by `AuthBloc`
- [firebase-auth.md](firebase-core-auth.md) — `userChanges()`/`authStateChanges()` stream feeding `AuthBloc`
- [networking.md](networking-rest.md) — `ApiService` JWT injection + `{ success, data, message }` envelope
- Bloc docs (core concepts): https://bloclibrary.dev/getting-started/
- flutter_bloc API: https://pub.dev/packages/flutter_bloc
- bloc_concurrency (transformers): https://pub.dev/packages/bloc_concurrency
- formz: https://pub.dev/packages/formz
- Flutter "List of state management approaches": https://docs.flutter.dev/data-and-backend/state-mgmt/options
