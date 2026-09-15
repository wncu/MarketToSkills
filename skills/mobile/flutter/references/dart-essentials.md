# Dart Language Essentials

## Overview

Dart 3 (SDK `^3.x`, shipped with Flutter `^3.10+`) is the language under every widget, cubit, and service in a production Flutter app. This file is the fast reference for the language surface you touch daily: sound null safety, immutable `final class extends Equatable` models, records for multi-return, and `sealed` + `switch` for exhaustive state handling. When in doubt about a model's equality, a state machine's branches, or a function's return shape — start here.

## Quick reference

| Feature | Syntax | Notes |
|---|---|---|
| Nullable type | `String?` | May hold `null` |
| Non-null assert | `value!` | Throws if `null` — avoid; prefer `?.`/`??` |
| Null-aware access | `user?.name` | Short-circuits to `null` |
| Default if null | `x ?? fallback` | |
| Assign if null | `x ??= compute()` | Only assigns when `x == null` |
| Lazy / late init | `late final Foo f;` | Non-null, initialized later (once if `final`) |
| Required named | `required this.id` | Compile-time enforced |
| Compile-time const | `const Color(...)` | Canonicalized, deep-immutable |
| Run-time immutable | `final x = ...` | Single assignment, value may be runtime |
| Records | `(int, {String name})` | Anonymous aggregate, value equality built in |
| Destructure | `final (a, b) = pair;` | Pattern in a declaration |
| Switch expression | `final r = switch (x) { ... };` | Returns a value; `,`-separated arms |
| Sealed class | `sealed class S {}` | Exhaustive `switch`, implicitly abstract |
| Enhanced enum | `enum E { a, b; final int v; ... }` | Fields, ctors, methods on enums |
| Extension | `extension on String { ... }` | Add methods/getters without subclassing |
| Spread | `[...a, ...?maybeNull]` | `...?` skips a null iterable |
| Collection-if/for | `[if (c) x, for (e in xs) e]` | Build collections declaratively |
| Cascade | `obj..a()..b()` | Chain calls on the same target |

## Sound null safety

Every type is non-nullable unless suffixed with `?`. The compiler proves a variable is non-null before you dereference it — no NPEs unless you force them with `!`.

```dart
String greet(String? name) {
  // ?? supplies a fallback; the result is non-null String.
  final safe = name ?? 'paciente';
  // ?. short-circuits: length is int? here.
  final int? len = name?.length;
  // After this guard, Dart promotes `name` to non-null String inside the block.
  if (name != null) {
    return 'Hola $name (${name.length})'; // no ! needed — flow analysis
  }
  return 'Hola $safe ($len)';
}

class Session {
  // late: promise to assign before first read. With `final`, assignable once.
  // WHY late instead of nullable: token is logically always present after init,
  // so callers shouldn't have to null-check it everywhere.
  late final String token;
  void hydrate(String t) => token = t;
}
```

`!` is a runtime assertion that throws `TypeError` if the value is null — treat its presence in a diff as a code smell. Prefer promotion, `??`, or `late`.

## Variables and types

```dart
var n = 3;          // inferred int, reassignable
final id = 'abc';   // inferred, single assignment (runtime value OK)
const pi = 3.14;    // compile-time constant (must be known at compile time)

// dynamic disables type checking — any member call compiles, may fail at runtime.
dynamic d = fetch();
d.whatever();       // compiles, risky

// Object? is the safe top type: you must narrow before using members.
Object? o = fetch();
if (o is String) o.toUpperCase(); // promoted to String
```

Rule of thumb: `final` by default, `const` when the value is compile-time known, `var` only when reassignment is real. Avoid `dynamic` — use `Object?` + `is` checks for unknown shapes (e.g. decoding JSON `Map<String, dynamic>`).

## Functions

```dart
// Named params with defaults + required.
Uri build(String path, {int page = 1, required String token}) =>
    Uri.parse('$path?page=$page&token=$token');

// Optional positional params (rarely used in this codebase).
String join(String a, [String? b]) => b == null ? a : '$a/$b';

// Arrow body for single expressions.
int square(int x) => x * x;

// Closures capture their lexical scope.
Function counter() {
  var count = 0;
  return () => ++count; // `count` lives on after counter() returns
}

// typedef names a function/record type for reuse.
typedef Json = Map<String, dynamic>;
typedef Validator = String? Function(String value);
```

## Collections

```dart
final tags = <String>['caries', 'gingivitis'];
final byId = <String, int>{'a': 1};
final ids = <int>{1, 2, 3}; // Set literal

// Collection-if / collection-for / spread build lists declaratively —
// the idiom for conditional children in widget trees.
List<Widget> actions({required bool isDoctor, List<Widget>? extra}) => [
      const Icon(Icons.search),
      if (isDoctor) const Icon(Icons.verified),
      for (final t in tags) Chip(label: Text(t)),
      ...?extra,            // ...? skips a null iterable
    ];
```

## Classes

```dart
class Doctor {
  // Initializing formals (`this.x`) assign directly.
  final String id;
  final String name;
  final int? rating;

  // Initializer list runs before the body, after super — use for asserts/derived fields.
  Doctor(this.id, this.name, {this.rating}) : assert(id.isNotEmpty);

  // Named constructor.
  Doctor.guest() : id = 'guest', name = 'Invitado', rating = null;

  // const constructor: all fields final → instances can be compile-time constants.
  const Doctor.empty() : id = '', name = '', rating = null;

  // Factory: may return a cached/subtype instance or run logic before constructing.
  factory Doctor.fromJson(Map<String, dynamic> j) =>
      Doctor(j['id'] as String, j['name'] as String, rating: j['rating'] as int?);

  // Getter / setter.
  bool get isRated => rating != null;
  set displayName(String v) => name = v; // (would need non-final field)
}

// Cascade (..) operates on the SAME object, returning it — handy for builders.
final controller = TextEditingController()
  ..text = 'inicial'
  ..selection = const TextSelection.collapsed(offset: 0);
```

## Mixins, abstract, interfaces, extensions

```dart
// Abstract class: cannot be instantiated; defines a contract + shared code.
abstract class Repository<T> {
  Future<T> fetch(String id); // abstract method (no body)
}

// Mixin: reusable behavior bolted on with `with`. `on` restricts where it applies.
mixin Loggable {
  void log(String m) => print('[$runtimeType] $m');
}

// implements forces you to satisfy the full interface (no inherited impl).
class JobRepository extends Repository<String> with Loggable {
  @override
  Future<String> fetch(String id) async {
    log('fetch $id');
    return id;
  }
}

// Extension methods/getters add API to existing types without subclassing.
extension StringX on String {
  String get capitalize => isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
}
// 'caries'.capitalize == 'Caries'
```

### Class modifiers (Dart 3)

Modifiers go before `class` to constrain how a type may be reused *outside its own library*. They prevent fragile-base-class and accidental-`implements` bugs in shared model/state code.

| Modifier | `extends` outside lib? | `implements` outside lib? | Notes |
|---|---|---|---|
| (none) | ✅ | ✅ | Default — open for both |
| `abstract` | ✅ | ✅ | Not instantiable; may have abstract members. Can't combine with `sealed` |
| `base` | ✅ (subtype must be `base`/`final`/`sealed`) | ❌ | Guarantees private members/invariants reach every subtype |
| `interface` | ❌ | ✅ | Implement-only contract; reduces fragile-base-class risk |
| `final` | ❌ | ❌ | Closes the hierarchy entirely (implies `base`) |
| `sealed` | ❌ (same-lib only) | ❌ (same-lib only) | Implicitly `abstract`; closed subtype set → exhaustive `switch` |

`sealed` is the one you reach for in state modeling (see Pattern matching below). `final class` is the common pick for leaf models you don't want others subclassing/faking — pairs naturally with `final class X extends Equatable`.

## Generics

```dart
// Bounded type parameter: `extends Object` means T must be non-nullable
// (any type, but not T?). Use `extends Equatable` to require value equality.
class Cache<T extends Object> {
  final _store = <String, T>{};
  T? get(String k) => _store[k];
  void put(String k, T v) => _store[k] = v;
}

// Generic function with inference.
T firstOr<T>(List<T> xs, T fallback) => xs.isEmpty ? fallback : xs.first;
```

## Enhanced enums (Dart 3)

Enums can carry fields, const constructors, getters, and methods — perfect for status-with-metadata.

```dart
enum Urgency {
  routine('Rutina', 0),
  withinMonth('Dentro de un mes', 1),
  withinWeek('Dentro de una semana', 2),
  immediate('Inmediato', 3);

  const Urgency(this.label, this.rank);
  final String label;   // Spanish UI label
  final int rank;       // sort key

  bool get isUrgent => rank >= 2;

  // Parse from backend string; `values` is the generated list.
  static Urgency fromApi(String s) =>
      values.firstWhere((u) => u.name == s, orElse: () => Urgency.routine);
}
```

## Records and destructuring (Dart 3)

Records are lightweight, immutable aggregates with built-in value equality and `hashCode`. Use them for multi-return without a throwaway class.

```dart
// Positional + named fields.
(int total, {String? cursor}) page(List<int> items, String? next) =>
    (items.length, cursor: next);

void use() {
  // Destructure in a declaration.
  final (total, :cursor) = page([1, 2, 3], 'eyJ...');
  // Swap with a record assignment pattern.
  var (a, b) = (1, 2);
  (b, a) = (a, b);
}
```

## Pattern matching, switch expressions, sealed classes

`sealed` makes the subtype set closed, so a `switch` over it is checked for exhaustiveness at compile time — add a new state and every `switch` that misses it fails to compile. This is the backbone of typed state handling.

```dart
sealed class UploadState {
  const UploadState();
}
class UploadIdle extends UploadState { const UploadIdle(); }
class UploadInProgress extends UploadState {
  const UploadInProgress(this.pct);
  final double pct;
}
class UploadDone extends UploadState {
  const UploadDone(this.jobId);
  final String jobId;
}
class UploadFailed extends UploadState {
  const UploadFailed(this.message);
  final String message;
}

// Switch EXPRESSION returns a value; object patterns destructure fields.
// No default arm needed — the compiler proves all subtypes are covered.
String label(UploadState s) => switch (s) {
      UploadIdle() => 'Listo para subir',
      UploadInProgress(:final pct) => 'Subiendo ${(pct * 100).round()}%',
      UploadDone(:final jobId) => 'Análisis $jobId listo',
      UploadFailed(:final message) => 'Error: $message',
    };

// Guards (`when`), relational + logical-or patterns, and if-case.
String triage(int icdas) => switch (icdas) {
      0 => 'Sano',
      1 || 2 => 'Remineralización',
      >= 3 && <= 4 => 'Vigilancia',
      _ => 'Tratamiento',
    };

void route(Object event) {
  // if-case: match + destructure a map shape in one shot.
  if (event case {'type': 'new_message', 'consultationId': final String id}) {
    openChat(id);
  }
}
```

## Error handling

```dart
Future<String> getToken() async {
  try {
    final t = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (t == null) throw StateError('No autenticado'); // Error: programmer bug
    return t;
  } on FirebaseAuthException catch (e) {
    // `on` filters by type; catch binds the object.
    throw Exception('Auth falló: ${e.code}');
  } catch (e, st) {
    rethrow; // preserve original stack trace; never `throw e;`
  } finally {
    // Always runs — cleanup belongs here.
  }
}
```

`Exception` = recoverable runtime condition you may catch (network, parse). `Error` (e.g. `StateError`, `ArgumentError`, `TypeError`) = a bug you should fix, not catch. Use `rethrow` to bubble while keeping the stack; `throw e;` discards it.

## Equality, hashCode, and Equatable

By default `==` is identity — two structurally identical objects are unequal. Overriding `==`/`hashCode` by hand is error-prone (must stay in sync, easy to forget a field). The reference app uses `equatable ^2.0`: list your fields in `props` and value equality + a correct `hashCode` are generated. This is what lets `flutter_bloc` skip rebuilds when a new state equals the old one.

```dart
import 'package:equatable/equatable.dart';

class Doctor extends Equatable {
  const Doctor({required this.id, required this.name, this.rating});
  final String id;
  final String name;
  final int? rating;

  @override
  List<Object?> get props => [id, name, rating]; // Object? — fields may be null

  // Optional: human-readable toString in logs.
  @override
  bool get stringify => true;
}
// Equatable compares lists/maps/nested Equatable in props BY VALUE.
```

## const vs final, immutability

| | `const` | `final` |
|---|---|---|
| Known at | compile time | runtime (or compile) |
| Reassign? | no | no |
| Deep immutable? | yes (whole object graph frozen) | only the reference |
| Canonicalized? | yes (identical consts are the same instance) | no |

```dart
final list = [1, 2];
list.add(3);            // OK — `final` freezes the reference, not contents
const frozen = [1, 2];
// frozen.add(3);       // runtime error — const list is unmodifiable
```

Prefer `const` constructors on widgets and value objects: const widgets are skipped during rebuilds, a real perf lever in `useMaterial3` trees.

## Real-world usage

**1. Immutable state — `final class extends Equatable` with `FormzSubmissionStatus`, `copyWith`, semantic getters.** This is the shape of nearly every cubit state in `lib/features/<feature>/cubit/*_state.dart`.

```dart
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';

final class LoginState extends Equatable {
  const LoginState({
    this.email = const Email.pure(),
    this.password = const Password.pure(),
    this.status = FormzSubmissionStatus.initial,
    this.errorMessage,
  });

  final Email email;                  // formz FormzInput (pure/dirty)
  final Password password;
  final FormzSubmissionStatus status;
  final String? errorMessage;

  // Semantic getters keep widgets dumb: context.select((c) => c.state.isLoading).
  bool get isLoading => status.isInProgress;
  bool get isValid => Formz.validate([email, password]);

  LoginState copyWith({
    Email? email,
    Password? password,
    FormzSubmissionStatus? status,
    String? errorMessage,
  }) =>
      LoginState(
        email: email ?? this.email,
        password: password ?? this.password,
        status: status ?? this.status,
        errorMessage: errorMessage ?? this.errorMessage,
      );

  @override
  List<Object?> get props => [email, password, status, errorMessage];
}
```

**2. `sealed` + exhaustive `switch` over `AuthStatus` for `FlowBuilder` navigation.** `flow_builder`'s `onGenerateAppViewPages` maps the auth status to a page stack; a sealed type (or enum) makes the switch exhaustive.

```dart
enum AuthStatus { unknown, unauthenticated, authenticatedPatient, authenticatedDoctor }

List<Page> onGenerateAppViewPages(AuthStatus status, List<Page> pages) =>
    switch (status) {
      AuthStatus.unknown => [SplashPage.page()],
      AuthStatus.unauthenticated => [LoginPage.page()],
      AuthStatus.authenticatedPatient => [PatientHomePage.page()],
      AuthStatus.authenticatedDoctor => [DoctorHomePage.page()],
    }; // add a status → this switch fails to compile until handled
```

For richer auth state carrying a `User`, prefer a `sealed class AuthState` with `Authenticated(this.user)` subtypes and switch with `Authenticated(:final user) => ...`.

**3. Records for multi-return — cursor pagination.** The `ApiService` paginated reads return both the page and the cursors without a wrapper class.

```dart
Future<(List<Job> jobs, {String? after, String? before})> fetchJobs(
    {String? after}) async {
  final res = await ApiService.get('/patient/jobs', query: {'after': ?after});
  final data = res['data'] as Map<String, dynamic>;
  final jobs = (data['items'] as List).map(Job.fromJson).toList();
  final pg = data['pagination'] as Map<String, dynamic>;
  return (jobs, after: pg['afterCursor'] as String?, before: pg['beforeCursor'] as String?);
}

// Caller destructures:
final (jobs, :after, :before) = await fetchJobs();
```

**4. `NotificationEventBus` payloads via if-case patterns.** FCM `data` maps (`{type, jobId|consultationId}`) are matched/destructured when routing decoupled events to cubits.

```dart
void _onFcmEvent(Map<String, dynamic> data) {
  switch (data) {
    case {'type': 'analysis_complete', 'jobId': final String jobId}:
      _jobsCubit.refresh(jobId);
    case {'type': 'new_message', 'consultationId': final String id}:
      _chatCubit.markUnread(id);
    case {'type': final String t}:
      log('Tipo FCM no manejado: $t');
  }
}
```

## Common mistakes

| Pitfall | Fix |
|---|---|
| `value!` sprinkled everywhere | Use flow promotion (`if (x != null)`), `??`, or `late final` |
| Mutable fields in a state/model | All fields `final`; change via `copyWith` returning a new instance |
| Forgetting a field in `props` | Two "different" objects compare equal → stale UI; list every field |
| `List<Object>` props with a nullable field | Use `List<Object?>` — nullable fields need the nullable element type |
| `throw e;` in `catch (e)` | `rethrow;` to preserve the original stack trace |
| Catching `Error` subtypes (`StateError`) | Catch `Exception`; let `Error` (bugs) crash in dev |
| `default:` / `_` on a sealed switch | Omit it — you lose the compile-time exhaustiveness check on new subtypes |
| `dynamic` for decoded JSON | `Map<String, dynamic>` + `as`/`is` casts at the boundary, typed model after |
| `const` list you later mutate | Runtime crash; use `final` if contents change, `const` only when truly frozen |
| Non-`const` widget constructors | Add `const` where possible so rebuilds skip the subtree |
| `late` field read before assignment | `LateInitializationError`; assign in ctor/init before first read, or make nullable |

## See also

- [state-management.md](state-management.md) — bloc/cubit, `Equatable` states, `copyWith`, `FormzSubmissionStatus`
- [forms-formz.md](forms-and-input.md) — `FormzInput` pure/dirty, `Formz.validate`
- [navigation-flow-builder.md](navigation-and-routing.md) — `FlowBuilder<AuthStatus>` + sealed/switch page stacks
- Dart language tour — null safety: <https://dart.dev/language/type-system> and <https://dart.dev/null-safety>
- Patterns & destructuring: <https://dart.dev/language/patterns>
- Class modifiers (sealed/base/final/interface): <https://dart.dev/language/class-modifiers>
- Records: <https://dart.dev/language/records>
- Equatable package: <https://pub.dev/packages/equatable>
