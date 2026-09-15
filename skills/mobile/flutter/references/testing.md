# Testing

## Overview
Flutter testing has three layers: **unit** (pure Dart logic, cubits, services), **widget** (a single widget tree in a headless environment), and **integration** (the full app on a real device/emulator). The reference app is overwhelmingly unit + widget tests: `bloc_test` for cubits, `mocktail` for service/repo fakes, and `MockCubit`/`whenListen` to drive widget tests deterministically. All test code lives under `test/` mirroring `lib/`.

## Quick reference

| API | Package | Purpose |
|---|---|---|
| `group`, `test`, `expect`, `setUp`, `tearDown`, `setUpAll`, `tearDownAll` | `flutter_test` (re-exports `test`) | Unit test scaffolding |
| Matchers: `equals`, `isA<T>()`, `isTrue`, `throwsA`, `emitsInOrder`, `emits`, `completion`, `predicate` | `flutter_test` | Assertions |
| `testWidgets((tester) async {...})` | `flutter_test` | Widget test entry |
| `tester.pumpWidget(w)` / `pump([d])` / `pumpAndSettle()` | `WidgetTester` | Build / advance one frame / settle all animations |
| `tester.tap` / `enterText` / `drag` / `fling` / `longPress` | `WidgetTester` | Interactions |
| `find.byType` / `byKey` / `text` / `byIcon` / `byWidgetPredicate` / `byTooltip` | `CommonFinders` | Locate widgets |
| `findsOneWidget` / `findsNothing` / `findsNWidgets(n)` / `findsWidgets` / `findsAtLeastNWidgets(n)` | matchers | Quantity assertions |
| `blocTest<B,S>(desc, build:, seed:, act:, expect:, verify:, wait:, skip:)` | `bloc_test` ^10 | Cubit/Bloc behavior test |
| `MockCubit<S>` / `MockBloc<E,S>` | `bloc_test` | Base classes for mock cubits/blocs |
| `whenListen(mock, stream, initialState:)` | `bloc_test` | Stub a bloc's state stream |
| `when(() => ...).thenReturn / thenAnswer / thenThrow` | `mocktail` ^1 | Stub mock methods |
| `verify(() => ...).called(n)` / `verifyNever` / `verifyZeroInteractions` | `mocktail` | Assert interactions |
| `any()` / `captureAny()` / `registerFallbackValue(x)` | `mocktail` | Argument matchers |
| `MockClient((req) async => Response(...))` | `http/testing.dart` | Fake HTTP transport |
| `MockFirebaseAuth(signedIn:, mockUser:)` / `MockUser(...)` | `firebase_auth_mocks` | Fake Firebase Auth |
| `matchesGoldenFile('x.png')` | `flutter_test` | Golden/snapshot assertion |
| `IntegrationTestWidgetsFlutterBinding.ensureInitialized()` | `integration_test` | Full-app device tests |

Run: `flutter test` · `flutter test test/foo_test.dart` · `flutter test --coverage` · `flutter test integration_test/`.

## Unit tests (`flutter_test` / `test`)

`flutter_test` re-exports the `test` package, so import only `flutter_test` in a Flutter project. Group related tests; use `setUp` for per-test fresh state (it runs before *each* `test`), `setUpAll` for one-time expensive setup (run once, e.g. `registerFallbackValue`).

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:myapp/core/form_inputs/email.dart';

void main() {
  group('Email FormzInput', () {
    test('pure input is invalid but shows no error', () {
      const email = Email.pure();
      // pure() = untouched: validate() still runs but UI suppresses the error.
      expect(email.isPure, isTrue);
      expect(email.isValid, isFalse);
    });

    test('dirty input rejects malformed address', () {
      const email = Email.dirty('not-an-email');
      expect(email.error, EmailValidationError.invalid);
      expect(Formz.validate([email]), isFalse);
    });

    test('dirty input accepts a valid address', () {
      const email = Email.dirty('paciente@example.com');
      expect(email.isValid, isTrue);
    });
  });
}
```

**Async + throwing matchers:**

```dart
test('fetchToken completes with a JWT', () async {
  expect(await service.fetchToken(), completion(startsWith('eyJ')));
});

test('throws on missing user', () {
  expect(() => service.requireUser(), throwsA(isA<StateError>()));
});
```

## Widget tests (`testWidgets` + `WidgetTester`)

A widget test runs in a headless 800×600 surface. The frame pump model is the part people get wrong:

| Method | Effect |
|---|---|
| `pumpWidget(w)` | Inflate `w` as the root, render one frame. Call once per test. |
| `pump([Duration d])` | Render exactly one more frame, optionally advancing the clock by `d`. Use after `setState`/state emit. |
| `pumpAndSettle()` | Repeatedly `pump` until no frames are scheduled. Settles animations/transitions. **Hangs forever on an infinite animation** (e.g. a perpetual spinner) — use `pump(duration)` instead. |

```dart
testWidgets('login button validates and submits', (tester) async {
  await tester.pumpWidget(const MaterialApp(home: LoginView()));

  await tester.enterText(find.byKey(const Key('login_email')), 'a@b.cl');
  await tester.enterText(find.byKey(const Key('login_password')), 'Secret123');
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump(); // process the tap + first rebuild

  expect(find.text('Bienvenido'), findsOneWidget);
});
```

**Finders & quantity matchers:**

```dart
find.byType(ElevatedButton);                 // by widget runtimeType
find.byKey(const Key('login_submit'));        // by key (most stable)
find.text('Iniciar sesión');                  // exact text in a Text/EditableText
find.textContaining('sesión');                // substring
find.byIcon(Icons.visibility_off);            // by IconData
find.byTooltip('Cerrar');                     // by Tooltip message
find.byWidgetPredicate(                        // arbitrary predicate
  (w) => w is TextField && w.enabled == false,
);

expect(find.text('Error'), findsNothing);
expect(find.byType(ListTile), findsNWidgets(3));
expect(find.byType(CircularProgressIndicator), findsOneWidget);
expect(find.byType(Card), findsAtLeastNWidgets(1));
```

**Drag / fling / scroll:**

```dart
await tester.drag(find.byType(ListView), const Offset(0, -300)); // scroll up
await tester.fling(find.byType(ListView), const Offset(0, -400), 1000);
await tester.pumpAndSettle();
await tester.ensureVisible(find.text('Último elemento')); // scroll until visible
```

A widget under test must be wrapped in the inherited widgets it reads from — at minimum `MaterialApp` (provides `Directionality`, `Theme`, `MediaQuery`). For pages backed by blocs add `MultiBlocProvider`.

## bloc_test (cubit/bloc behavior)

`blocTest<B, S>` builds a fresh bloc, optionally seeds state, runs `act`, and asserts the **ordered list of states emitted after build** (the initial state is *not* included). The reference app's cubits put a `FormzSubmissionStatus` on state, so the expected list is the status transition.

```dart
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthService extends Mock implements AuthService {}

void main() {
  late MockAuthService authService;

  setUp(() => authService = MockAuthService());

  group('LoginCubit', () {
    blocTest<LoginCubit, LoginState>(
      'emits [inProgress, success] on valid credentials',
      setUp: () => when(() => authService.signIn(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenAnswer((_) async {}),
      build: () => LoginCubit(authService),
      seed: () => const LoginState(
        email: Email.dirty('a@b.cl'),
        password: Password.dirty('Secret123'),
        isValid: true,
      ),
      act: (cubit) => cubit.submit(),
      expect: () => const [
        LoginState(status: FormzSubmissionStatus.inProgress, isValid: true,
            email: Email.dirty('a@b.cl'), password: Password.dirty('Secret123')),
        LoginState(status: FormzSubmissionStatus.success, isValid: true,
            email: Email.dirty('a@b.cl'), password: Password.dirty('Secret123')),
      ],
      verify: (_) => verify(() => authService.signIn(
            email: 'a@b.cl', password: 'Secret123')).called(1),
    );

    blocTest<LoginCubit, LoginState>(
      'emits [inProgress, failure] when service throws',
      setUp: () => when(() => authService.signIn(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenThrow(FirebaseAuthException(code: 'wrong-password')),
      build: () => LoginCubit(authService),
      seed: () => const LoginState(isValid: true),
      act: (cubit) => cubit.submit(),
      expect: () => [
        isA<LoginState>().having((s) => s.status, 'status',
            FormzSubmissionStatus.inProgress),
        isA<LoginState>().having((s) => s.status, 'status',
            FormzSubmissionStatus.failure),
      ],
    );
  });
}
```

| Param | Purpose |
|---|---|
| `setUp` | Stub mocks just before `build` (per-test). |
| `build` | **Required.** Return a *new* bloc instance. |
| `seed` | Inject an initial state (skips going through reducers). |
| `act` | Trigger behavior (`cubit.method()` or `bloc.add(Event())`). |
| `expect` | Function returning the ordered list of *emitted* states (matchers allowed). |
| `verify` | Post-`act` assertions, typically `mocktail` `verify(...)`. |
| `wait` | `Duration` to wait for async/debounced emits (e.g. `debounce` on search). |
| `skip` | Skip the first N emitted states (default 0). |
| `errors` | Function returning a matcher for expected uncaught errors. |
| `setUp` / `tearDown` | Per-test dependency setup before `build` / cleanup after the test. |
| `tags` | User-defined tags for selecting tests (`--tags`/`--exclude-tags`). |

**Using matchers** instead of literal states avoids brittle equality — `isA<S>().having((s) => s.field, 'name', value)` asserts only the field you care about.

### MockCubit + whenListen (for widget tests)

When testing a *page* you don't want the real cubit running side effects — mock it and feed it a scripted state stream.

```dart
class MockJobsCubit extends MockCubit<JobsState> implements JobsCubit {}

testWidgets('JobsView shows results after loading', (tester) async {
  final cubit = MockJobsCubit();
  // whenListen scripts the stream AND keeps .state in sync with the last value.
  whenListen(
    cubit,
    Stream.fromIterable(const [
      JobsState(status: JobsStatus.loading),
      JobsState(status: JobsStatus.success, jobs: [job1, job2]),
    ]),
    initialState: const JobsState(),
  );

  await tester.pumpWidget(
    MaterialApp(
      home: BlocProvider<JobsCubit>.value(value: cubit, child: const JobsView()),
    ),
  );
  await tester.pump(); // process the loading state
  await tester.pump(); // process the success state

  expect(find.byType(JobCard), findsNWidgets(2));
});
```

For a static snapshot (no stream), just stub `state`: `when(() => cubit.state).thenReturn(const JobsState(status: JobsStatus.success, jobs: [job1]));`.

`emitsInOrder` asserts a real (non-mock) bloc's stream directly:

```dart
final cubit = CounterCubit();
expectLater(cubit.stream, emitsInOrder(<int>[1, 2, 3]));
cubit..increment()..increment()..increment();
```

## Mocking: mocktail vs mockito

**mocktail (the reference app's default)** — no code generation, null-safe, mocks via `extends Mock implements T`. Stub with a closure `when(() => ...)`.

```dart
import 'package:mocktail/mocktail.dart';

class MockApiService extends Mock implements ApiService {}
class FakeUri extends Fake implements Uri {} // for registerFallbackValue

void main() {
  setUpAll(() => registerFallbackValue(FakeUri())); // once, for any() of non-primitive types

  test('stub, run, verify', () async {
    final api = MockApiService();
    // thenAnswer for Futures/Streams; thenReturn only for sync values.
    when(() => api.get(any())).thenAnswer((_) async => {'success': true, 'data': []});

    await api.get('/patient/jobs');

    verify(() => api.get('/patient/jobs')).called(1);
    verifyNever(() => api.post(any(), any()));
  });
}
```

- `any()` / `any(named: 'email')` match positional/named args. Custom (non-primitive) types passed to `any()` require a prior `registerFallbackValue(FakeX())`.
- `captureAny()` + `verify(() => mock.m(captureAny())).captured` to inspect passed args.
- `thenAnswer((invocation) => ...)` reads `invocation.positionalArguments` / `.namedArguments` for dynamic responses.

**mockito** — needs build_runner + generated mocks. Use only if a dependency already standardizes on it.

```dart
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateNiceMocks([MockSpec<ApiService>()]) // mockito ^5.7's recommended annotation
void main() {} // run: dart run build_runner build → generates *.mocks.dart
// then: when(mockApi.get(any)).thenAnswer((_) async => ...);  // no closure, no ()=>
// (legacy @GenerateMocks([ApiService]) still works but throws on unstubbed calls)
```

| | mocktail | mockito |
|---|---|---|
| Codegen | none | `build_runner` required |
| Stub syntax | `when(() => m.x())` (closure) | `when(m.x(any))` (no closure) |
| `any` for custom types | `registerFallbackValue` | works out of the box |
| Reference app use | ✅ default | avoid for new code |

### Mocking http (`MockClient`)

`http`'s testing library lets `ApiService` accept an injected `http.Client`; in tests pass a `MockClient` that returns canned `http.Response`s — no network.

```dart
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'dart:convert';

test('parses the { success, data } envelope', () async {
  final client = MockClient((request) async {
    expect(request.headers['Authorization'], startsWith('Bearer '));
    return http.Response(
      jsonEncode({'success': true, 'data': {'jobId': 'abc'}}),
      200,
      headers: {'content-type': 'application/json'},
    );
  });

  final result = await JobsRepository(client: client).createJob();
  expect(result.jobId, 'abc');
});
```

### Mocking Firebase Auth (`firebase_auth_mocks`)

`firebase_auth_mocks` ^0.15 (compatible with `firebase_auth` ^6) provides `MockFirebaseAuth` that emits to `authStateChanges`/`userChanges` and stubs sign-in methods — inject it instead of `FirebaseAuth.instance`.

```dart
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';

test('emits signed-in user on authStateChanges', () async {
  final user = MockUser(uid: 'u1', email: 'doc@example.com', displayName: 'Dra. Godoy');
  final auth = MockFirebaseAuth(signedIn: true, mockUser: user);

  expect(auth.authStateChanges(), emits(isA<MockUser>()));
  final token = await auth.currentUser!.getIdToken();
  expect(token, isNotNull);
});
```

For code that hardcodes `FirebaseAuth.instance`, refactor to inject the auth instance (constructor param) so the mock can be substituted — see real-world usage below.

## Golden (snapshot) tests

`matchesGoldenFile` renders a widget/layer to a PNG and diffs it against a checked-in reference. Generate/update references with `flutter test --update-goldens`.

```dart
testWidgets('SeverityBadge golden', (tester) async {
  await tester.pumpWidget(const MaterialApp(home: Center(child: SeverityBadge(icdas: 5))));
  await expectLater(
    find.byType(SeverityBadge),
    matchesGoldenFile('goldens/severity_badge_icdas5.png'),
  );
});
```

Fonts: by default Flutter renders text as boxes ("Ahem") in tests. To get real glyphs in goldens, load fonts in `test/flutter_test_config.dart`. `golden_toolkit` (its `loadAppFonts()` / `screenMatchesGolden` helpers, multi-device variants) is now **discontinued** — for new work prefer the maintained `alchemist` package, or load fonts manually:

```dart
// test/flutter_test_config.dart — auto-run before every test file.
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  // loadFontsFromAssets / loadAppFonts here so goldens render real text.
  await testMain();
}
```

Goldens are platform-sensitive (font rendering differs across OS) — pin generation to CI or skip on host with `tags`.

## integration_test (full app on device)

The `integration_test` package (shipped with the Flutter SDK) runs `testWidgets`-style tests against the **real app on a device/emulator** — real Firebase, real plugins. Files live in `integration_test/` (sibling of `test/`).

```dart
// integration_test/app_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:myapp/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized(); // MUST be first

  testWidgets('patient can reach the upload screen', (tester) async {
    app.main();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('tab_analizar')));
    await tester.pumpAndSettle();
    expect(find.text('Subir radiografía'), findsOneWidget);
  });
}
```

Run: `flutter test integration_test/` (on a connected device/emulator) or `flutter test integration_test/app_test.dart` — this is the path the reference app uses (iOS/Android device runs). `flutter drive` is only needed for the **web** browser target (or a host-side driver script). For web you add a one-line driver and run it against ChromeDriver:

```dart
// test_driver/integration_test.dart
import 'package:integration_test/integration_test_driver.dart';
Future<void> main() => integrationDriver();
```

```bash
chromedriver --port=4444 &
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/app_test.dart \
  -d chrome
```

## Coverage

```bash
flutter test --coverage          # writes coverage/lcov.info
genhtml coverage/lcov.info -o coverage/html   # human-readable report (lcov package)
```

Exclude generated files from the report by filtering `lcov.info` (e.g. `*.g.dart`, `*.freezed.dart`, `firebase_options.dart`).

## Test structure conventions

- `test/` mirrors `lib/`: `lib/features/login/cubit/login_cubit.dart` → `test/features/login/cubit/login_cubit_test.dart`. Suffix every file `_test.dart` (the runner only picks those up).
- One top-level `group` per class under test; nested `group`s per method/scenario.
- Mock classes (`class MockX extends Mock implements X {}`) at the top of the file or in `test/helpers/`.
- A `test/helpers/pump_app.dart` extension wraps the common `MaterialApp` + providers boilerplate (see below).
- `registerFallbackValue` calls go in `setUpAll`; mock construction in `setUp`.

## Real-world usage

### 1. Cubit unit test — mocked static service via an injectable seam

The reference app's services are static-method classes (`ApiService.get(...)`, `AuthService.signIn(...)`). Statics can't be mocked directly, so cubits take the call as an injected function/instance seam (default points at the static). Tests pass a mocktail mock through that seam.

```dart
// login_cubit.dart — the seam: a typedef'd function defaulting to the static.
typedef SignIn = Future<void> Function({required String email, required String password});

class LoginCubit extends Cubit<LoginState> {
  LoginCubit({SignIn? signIn})
      : _signIn = signIn ?? AuthService.signIn,
        super(const LoginState());
  final SignIn _signIn;

  Future<void> submit() async {
    if (!state.isValid) return;
    emit(state.copyWith(status: FormzSubmissionStatus.inProgress));
    try {
      await _signIn(email: state.email.value, password: state.password.value);
      emit(state.copyWith(status: FormzSubmissionStatus.success));
    } on FirebaseAuthException {
      emit(state.copyWith(status: FormzSubmissionStatus.failure));
    }
  }
}
```

```dart
// login_cubit_test.dart
class _MockSignIn extends Mock {
  Future<void> call({required String email, required String password});
}

void main() {
  late _MockSignIn signIn;
  setUp(() => signIn = _MockSignIn());

  blocTest<LoginCubit, LoginState>(
    'success path flips status inProgress → success',
    setUp: () => when(() => signIn(
        email: any(named: 'email'),
        password: any(named: 'password'))).thenAnswer((_) async {}),
    build: () => LoginCubit(signIn: signIn.call),
    seed: () => const LoginState(isValid: true,
        email: Email.dirty('a@b.cl'), password: Password.dirty('Secret123')),
    act: (c) => c.submit(),
    expect: () => [
      isA<LoginState>().having((s) => s.status, 'status', FormzSubmissionStatus.inProgress),
      isA<LoginState>().having((s) => s.status, 'status', FormzSubmissionStatus.success),
    ],
    verify: (_) => verify(() => signIn(email: 'a@b.cl', password: 'Secret123')).called(1),
  );
}
```

### 2. Widget test — page wrapped in MaterialApp + MultiBlocProvider with MockCubit/whenListen

```dart
// test/helpers/pump_app.dart
extension PumpApp on WidgetTester {
  Future<void> pumpView(Widget view, {required List<BlocProvider> providers}) {
    return pumpWidget(
      MaterialApp(
        theme: appTheme, // Material 3 theme from lib/core/theme.dart
        home: MultiBlocProvider(providers: providers, child: view),
      ),
    );
  }
}
```

```dart
class MockJobsCubit extends MockCubit<JobsState> implements JobsCubit {}

testWidgets('JobsView renders a card per finished analysis', (tester) async {
  final jobsCubit = MockJobsCubit();
  whenListen(
    jobsCubit,
    const Stream<JobsState>.empty(),
    initialState: JobsState(status: JobsStatus.success, jobs: [jobFixture]),
  );

  await tester.pumpView(
    const JobsView(),
    providers: [BlocProvider<JobsCubit>.value(value: jobsCubit)],
  );

  expect(find.byType(JobCard), findsOneWidget);
  expect(find.text('Análisis completado'), findsOneWidget);
});
```

### 3. Mocking ApiService / services

Test the repository/service layer by injecting an `http.MockClient`, asserting the `{ success, data, message }` envelope is parsed and the Firebase JWT header is attached:

```dart
test('ApiService.get attaches Bearer token and unwraps data', () async {
  final auth = MockFirebaseAuth(signedIn: true,
      mockUser: MockUser(uid: 'u1', email: 'p@example.com'));
  final client = MockClient((req) async {
    expect(req.headers['Authorization'], startsWith('Bearer '));
    return http.Response(jsonEncode({'success': true, 'data': {'jobs': []}}), 200);
  });

  final data = await JobsApi(client: client, auth: auth).fetchJobs();
  expect(data['jobs'], isEmpty);
});
```

Tests live under `test/` mirroring `lib/`; run the suite with `flutter test` (CI gate) and `flutter test --coverage` before opening a PR.

## Common mistakes

| Pitfall | Fix |
|---|---|
| `pumpAndSettle()` hangs forever | A perpetual animation (spinner) never settles — use `pump(Duration(...))` a fixed number of times. |
| Widget test throws "No Directionality widget found" | Wrap the widget in `MaterialApp` (or at least `Directionality`/`MediaQuery`). |
| `blocTest` `expect` includes the initial/seed state and fails | `expect` lists only states emitted *after* build; never include the initial state. |
| `when(() => mock.fetch()).thenReturn(future)` returns a non-awaitable | Use `thenAnswer((_) async => ...)` for any `Future`/`Stream` return. |
| `any()` throws "registerFallbackValue" error | Call `registerFallbackValue(FakeX())` in `setUpAll` for every non-primitive type matched with `any()`. |
| mocktail stub written without the `() =>` closure | mocktail requires `when(() => ...)` / `verify(() => ...)`; only mockito omits the closure. |
| Mocking a class with static methods directly | Statics can't be mocked — introduce an injectable seam (function typedef or instance) defaulting to the static. |
| `find.text` fails because the Text is split/rich | Use `find.textContaining(...)` or `find.byWidgetPredicate`. |
| Golden test renders text as boxes | Load app fonts in `test/flutter_test_config.dart` before `matchesGoldenFile`. |
| Golden diffs on CI vs local | Font rendering is platform-specific; generate goldens on one platform (CI) or tag-skip elsewhere. |
| Real Firebase init blows up a unit test | Use `firebase_auth_mocks`; never call `Firebase.initializeApp()` in unit/widget tests. |
| Forgetting `IntegrationTestWidgetsFlutterBinding.ensureInitialized()` | Must be the first line of `main()` in every integration test. |
| Stale `mockito` `*.mocks.dart` after signature change | Re-run `dart run build_runner build --delete-conflicting-outputs`. |

## See also

- [state-management.md](state-management.md) — Cubit/Bloc, `FormzSubmissionStatus`, the seam pattern these tests exercise.
- [forms.md](forms-and-input.md) — `FormzInput` pure/dirty, the inputs unit-tested above.
- [networking.md](networking-rest.md) — the static `ApiService` + `{ success, data }` envelope mocked here.
- [firebase.md](firebase-core-auth.md) — `FirebaseAuth` streams faked by `firebase_auth_mocks`.
- Flutter — [An introduction to widget testing](https://docs.flutter.dev/cookbook/testing/widget/introduction)
- Flutter — [Integration testing](https://docs.flutter.dev/testing/integration-tests)
- pub.dev — [bloc_test](https://pub.dev/packages/bloc_test) · [mocktail](https://pub.dev/packages/mocktail) · [firebase_auth_mocks](https://pub.dev/packages/firebase_auth_mocks)
- bloclibrary.dev — [Testing](https://bloclibrary.dev/testing/)
