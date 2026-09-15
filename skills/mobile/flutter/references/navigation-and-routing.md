# Navigation & Routing

## Overview
How screens get on and off the stack in Flutter: the imperative `Navigator` 1.0 API, the declarative `Navigator` 2.0 / `Router` + `Pages` model, the `flow_builder` package (the reference app's choice for auth-gated top-level navigation), and `go_router` (the popular URL/deep-link router the reference app does **not** use). Also covers modals/dialogs/sheets as navigation, deep linking, and the `static route()/page()` factory convention this codebase standardizes on.

## Quick reference

| API | Use | Returns |
|---|---|---|
| `Navigator.of(context).push<T>(route)` | Add a screen on top | `Future<T?>` (the value passed to `pop`) |
| `Navigator.of(context).pop<T>([result])` | Remove top screen, return `result` | — |
| `pushReplacement<T,TO>(route)` | Replace current screen (no back) | `Future<T?>` |
| `pushAndRemoveUntil<T>(route, predicate)` | Push then strip stack until predicate | `Future<T?>` |
| `popUntil((r) => r.isFirst)` | Pop down to the root route | — |
| `maybePop()` | Pop only if something can be popped | `Future<bool>` |
| `MaterialPageRoute(builder:)` | Platform-styled imperative route | `Route<T>` |
| `PageRouteBuilder(pageBuilder:, transitionsBuilder:)` | Custom transition route | `Route<T>` |
| `MaterialApp(onGenerateRoute:)` | Named-route factory (NAV 1.0) | `Route` |
| `MaterialPage(child:)` / `CupertinoPage` | Declarative `Page` for NAV 2.0 | `Page<T>` |
| `FlowBuilder<T>(state:, onGeneratePages:)` | Declarative state-driven stack | widget |
| `context.flow<T>().update / .complete` | Drive a `FlowBuilder` stack | — |
| `showDialog<T>(context:, builder:)` | Modal dialog | `Future<T?>` |
| `showModalBottomSheet<T>(context:, builder:)` | Modal bottom sheet | `Future<T?>` |
| `showGeneralDialog<T>(...)` | Fully custom modal (own transition) | `Future<T?>` |

`MaterialApp.router(routerConfig:)` wires a NAV 2.0 router (e.g. `go_router`). Plain `MaterialApp(home:/routes:)` uses NAV 1.0.

---

## Navigator 1.0 — imperative

The classic stack API. You call methods to push/pop routes; the framework owns the stack.

```dart
// Push and (optionally) await a result the pushed screen returns via pop().
final UserRole? picked = await Navigator.of(context).push<UserRole>(
  MaterialPageRoute<UserRole>(builder: (_) => const RolePickerPage()),
);
// Inside RolePickerPage, return a value:
Navigator.of(context).pop<UserRole>(UserRole.patient);
```

`push<T>` is typed by what `pop` will hand back. Always type both sides so the result isn't `dynamic`.

```dart
// Replace: e.g. login -> home, with no back button to login.
Navigator.of(context).pushReplacement<void, void>(
  MaterialPageRoute<void>(builder: (_) => const HomePage()),
);

// Clear the whole stack down to a new root (common post-login when NOT using
// a declarative router). predicate returns false => keep removing.
Navigator.of(context).pushAndRemoveUntil<void>(
  MaterialPageRoute<void>(builder: (_) => const HomePage()),
  (route) => false,
);

// Pop everything above the first route (the reference app uses this to dismiss a
// "pageless" login route once the declarative FlowBuilder swaps the base stack).
Navigator.of(context).popUntil((route) => route.isFirst);
```

### Custom transitions with `PageRouteBuilder`

```dart
Route<T> fadeRoute<T>(Widget page) => PageRouteBuilder<T>(
      pageBuilder: (_, __, ___) => page,
      // WHY transitionsBuilder is separate: it re-runs each animation frame,
      // while pageBuilder runs once — keep widget construction out of the tween.
      transitionsBuilder: (_, animation, __, child) =>
          FadeTransition(opacity: animation, child: child),
      transitionDuration: const Duration(milliseconds: 250),
    );
```

### Named routes + `onGenerateRoute`

Static `routes:` maps can't take arguments cleanly; `onGenerateRoute` can.

```dart
MaterialApp(
  initialRoute: '/',
  routes: {'/': (_) => const HomePage()},          // arg-less routes
  onGenerateRoute: (RouteSettings settings) {        // arg-bearing routes
    if (settings.name == '/job') {
      final jobId = settings.arguments! as String;   // passed via pushNamed
      return MaterialPageRoute<void>(builder: (_) => JobDetailPage(jobId: jobId));
    }
    return null; // fall through -> onUnknownRoute
  },
);
// Navigator.of(context).pushNamed('/job', arguments: 'job_123');
```

> Named routes don't scale well (stringly-typed args, no compile-time checks). The reference app favors typed constructors via the `route()/page()` factory convention below.

---

## Navigator 2.0 / Router API + `Pages`

Instead of imperatively pushing, you declare a **list of `Page` objects** and the `Navigator` reconciles its stack to match. State change -> new page list -> framework computes the push/pop. This is what `flow_builder` and `go_router` are built on.

```dart
Navigator(
  // Declarative: the page list IS the stack. Add/remove items to navigate.
  pages: [
    const MaterialPage<void>(child: HomePage()),
    if (showDetail) const MaterialPage<void>(child: DetailPage()),
  ],
  // onDidRemovePage (Flutter 3.19+) replaces the deprecated onPopPage.
  // Mutate your state so the page disappears from `pages` on the next build.
  onDidRemovePage: (page) => setState(() => showDetail = false),
);
```

Key idea: you never call `pop` to mutate the `Navigator` directly — popping fires the callback, and **you** drop the page from the list so the next build reflects it. A system back gesture also routes through this.

`MaterialPage`/`CupertinoPage` are the `Page` adapters that build a `MaterialPageRoute`/`CupertinoPageRoute` under the hood. Give pages a stable `key` if the same widget type can appear with different identities, so the framework matches old↔new correctly.

For full URL-driven NAV 2.0 *without* a package you wire `MaterialApp.router` with a `RouterDelegate` (owns the page list + `build`/`setNewRoutePath`), a `RouteInformationParser` (URL ↔ your app-state type), and an optional `BackButtonDispatcher`. This is verbose and error-prone — in practice `flow_builder` (state-driven) or `go_router` (URL-driven) wrap exactly these pieces, so the reference app never hand-rolls them.

---

## flow_builder ^0.1 (the reference app's top-level navigator)

`flow_builder` is a thin, ergonomic wrapper over NAV 2.0 `Pages`: you give it a single `state` value and an `onGeneratePages(state, pages)` builder that returns the page stack for that state. **State changes regenerate the stack** — perfect for auth gating (one state value -> one stack).

```dart
FlowBuilder<AuthStatus>(
  // `state` can be a plain value or selected from a Bloc/Cubit (see the reference app).
  state: someAuthStatus,
  // (state, currentPages) -> new page list. Branch on state to swap stacks.
  onGeneratePages: (AuthStatus status, List<Page<dynamic>> pages) {
    return switch (status) {
      AuthStatus.authenticated => [HomePage.page()],
      AuthStatus.unauthenticated => [LoginPage.page()],
    };
  },
);
```

### Conditional / multi-step stacks

`onGeneratePages` returns a *growing* list as state advances — the classic onboarding wizard:

```dart
FlowBuilder<Profile>(
  state: const Profile(),
  onGeneratePages: (profile, pages) => [
    MaterialPage<void>(child: NameForm()),
    if (profile.name != null) MaterialPage<void>(child: AgeForm()),
    if (profile.age != null) MaterialPage<void>(child: ReviewForm()),
  ],
);
```

### Driving the flow — `context.flow<T>()`

Inside the flow, widgets advance/finish it by mutating its state. No `Navigator.push` needed; the new state regenerates the stack.

```dart
// Advance: update state -> onGeneratePages re-runs -> next page appears.
context.flow<Profile>().update((p) => p.copyWith(name: _name));

// Complete: pop the entire FlowBuilder off its parent navigator, yielding the
// final state to whoever pushed the flow.
context.flow<Profile>().complete((p) => p.copyWith(age: _age));
```

### Imperative `FlowController` (external control)

When a parent needs to drive the flow (not a descendant via `context.flow`), build a `FlowController<T>` and pass it via the `controller:` arg instead of `state:`.

```dart
late final FlowController<Profile> _controller;

@override
void initState() {
  super.initState();
  _controller = FlowController<Profile>(const Profile());
}

@override
void dispose() {
  _controller.dispose(); // owns a ValueNotifier — must dispose
  super.dispose();
}

// _controller.update((p) => ...) / _controller.complete((p) => ...)
// FlowBuilder<Profile>(controller: _controller, onGeneratePages: ...)
```

> Use `state:` for the common case (the reference app selects it straight from a Bloc). Reach for `controller:` only when a non-child needs to push state into the flow.

---

## go_router (reference — the example app does NOT use it)

The community-standard URL-first router. Pick it when you need: real URLs / browser history (web), centralized deep-link parsing, nested persistent shells (bottom-nav that survives navigation), or declarative redirect guards in one place. The reference app's nav is auth-state-driven with no URL requirement, so `flow_builder` + imperative pushes suffice — but know the alternative.

```dart
final _router = GoRouter(
  initialLocation: '/',
  // Centralized auth guard: return a path to redirect, or null to allow.
  redirect: (BuildContext context, GoRouterState state) {
    final loggedIn = authState.isAuthenticated;
    final goingToLogin = state.matchedLocation == '/login';
    if (!loggedIn && !goingToLogin) return '/login';
    if (loggedIn && goingToLogin) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    // ShellRoute: wraps children in a persistent shell (e.g. bottom nav).
    ShellRoute(
      builder: (_, __, child) => ScaffoldWithNav(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
        GoRoute(
          path: '/job/:id', // path param
          builder: (_, state) => JobScreen(id: state.pathParameters['id']!),
        ),
      ],
    ),
  ],
);
// MaterialApp.router(routerConfig: _router);
// Navigate: context.go('/job/123')  (replace stack to URL)
//           context.push('/job/123') (push on top, awaitable result)
//           context.pop()
```

`go()` = declarative URL navigation (sets the location). `push()` = imperative push that returns a `Future`. Path/query params come from `state.pathParameters` / `state.uri.queryParameters`. Deep links resolve through the same route table automatically.

---

## Deep linking & app links (basics)

A NAV 2.0 router (go_router, or a custom `RouteInformationParser`) turns an incoming OS URL into a stack. Platform wiring is required regardless of router:

| Platform | Where | What |
|---|---|---|
| Android | `AndroidManifest.xml` | `<intent-filter>` with `android.intent.action.VIEW`, `BROWSABLE`, your scheme/host. App Links add `android:autoVerify="true"` + a hosted `assetlinks.json`. |
| iOS | `Info.plist` / entitlements | Custom scheme via `CFBundleURLTypes`; Universal Links via Associated Domains + hosted `apple-app-site-association`. |

With NAV 1.0 + `flow_builder` (the reference app), there is no URL parser — "deep links" arrive instead as **FCM push payloads** the app routes manually. See the real-world usage section.

---

## Modals, dialogs & bottom sheets (as navigation)

These push a route onto the navigator (a barrier + your content) and return a `Future` that resolves with whatever you `pop`. Treat them like one-screen navigations.

```dart
// Bottom sheet that RETURNS a typed choice (image-source picker from the reference app).
enum AnalysisImageSourceOption { camera, gallery }

Future<AnalysisImageSourceOption?> showPickImageSourceSheet(BuildContext context) {
  return showModalBottomSheet<AnalysisImageSourceOption>(
    context: context,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: const Text('Tomar una foto'),
            // pop carries the choice back to the awaiter.
            onTap: () => Navigator.of(context).pop(AnalysisImageSourceOption.camera),
          ),
          ListTile(
            title: const Text('Subir foto desde tu dispositivo'),
            onTap: () => Navigator.of(context).pop(AnalysisImageSourceOption.gallery),
          ),
        ],
      ),
    ),
  );
}
// final src = await showPickImageSourceSheet(context); if (src == null) return;
```

```dart
// Confirm dialog returning bool (the reference app's "complete consultation").
final bool confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        content: const Text('¿Marcar esta consulta como completada?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Completar')),
        ],
      ),
    ) ??
    false; // a tap on the barrier pops with null -> default to false
```

`showGeneralDialog<T>` is the low-level form when you need a custom barrier color, transition, or non-Material look — supply `pageBuilder` + `transitionBuilder` + `transitionDuration` yourself (it's what `showDialog` wraps).

```dart
// Custom-transition modal (showDialog is a thin wrapper over this).
showGeneralDialog<bool>(
  context: context,
  barrierDismissible: true,
  barrierLabel: 'cerrar',          // required when barrierDismissible: true
  barrierColor: Colors.black54,
  transitionDuration: const Duration(milliseconds: 200),
  // pageBuilder builds the content once (animation/secondaryAnimation/—).
  pageBuilder: (ctx, animation, secondaryAnimation) =>
      const _MyCustomCard(),
  // transitionBuilder re-runs each frame to wrap that content.
  transitionBuilder: (ctx, animation, _, child) => FadeTransition(
    opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
    child: child,
  ),
);
```

For full-screen modals that should feel like pages, prefer `MaterialPageRoute(fullscreenDialog: true)`.

---

## The `route()/page()` factory convention

The reference app's pages expose **static factories** instead of being constructed inline at call sites. This keeps construction (providers, args) next to the screen and gives both NAV 1.0 and NAV 2.0 a clean entry point.

```dart
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  // NAV 2.0 — for FlowBuilder / declarative page lists.
  static Page<void> page() => const MaterialPage<void>(child: HomePage());

  // NAV 1.0 — for imperative Navigator.push (add when a screen is pushed).
  static Route<void> route() =>
      MaterialPageRoute<void>(builder: (_) => const HomePage());

  @override
  Widget build(BuildContext context) => /* ... */;
}
```

Factories may take typed args (compile-checked, unlike named routes): `LoginPage.page({UserRole? role})` returns `MaterialPage(child: LoginPage(role: role))`. Call sites stay terse: `pages: [LoginPage.page()]` or `Navigator.of(context).push(SomePage.route())`.

---

## Real-world usage

Top-level navigation is a single **`FlowBuilder<AuthStatus>`** in `main.dart`, driven by `AuthBloc` (a Bloc, not a Cubit, because it wraps the Firebase `userChanges` stream). The auth status selects the entire base stack:

```dart
// main.dart — root MaterialApp
MaterialApp(
  navigatorKey: _navigatorKey, // also used to insert the FCM overlay banner
  theme: theme,
  home: FlowBuilder<AuthStatus>(
    // Select rebuilds the flow only when status changes.
    state: context.select((AuthBloc bloc) => bloc.state.status),
    onGeneratePages: onGenerateAppViewPages,
  ),
);

// routes.dart — the page factory list per auth state.
List<Page<dynamic>> onGenerateAppViewPages(
  AuthStatus state,
  List<Page<dynamic>> pages,
) {
  switch (state) {
    case AuthStatus.authenticated:
      return [ProfileGatePage.page()];   // role/profile fork lives here
    case AuthStatus.unauthenticated:
      return [RoleSelectionPage.page()]; // role pick -> login/signup
  }
}
```

Every screen follows the factory convention — at minimum `static Page<void> page() => const MaterialPage<void>(child: X())`; pages that take args parametrize it (`LoginPage.page({UserRole? role})`).

**The `ProfileGatePage` fork** is the second-stage gate inside `authenticated`. On cold start the role is unknown, so it loads `GET /profile` via `ProfileGateCubit` and branches on a `ProfileGateStatus`:

```dart
// ProfileGatePage.build — declarative branching by gate status (no pushes).
if (status == loading || status == initial) return const _Splash();
if (status == needsSocialSignup)  return const _SocialSignupForm();      // Google user, no profile
if (status == needsPatientBasics) return PatientProfileOnboardingPage(...);
if (status == failure)            return _RetryOrLogout();
return const HomePage();          // role resolved -> tabbed home
```

**Imperative navigation inside features** uses `Navigator.of(context).push` with `MaterialPageRoute` (or `SomePage.route()` where defined). Examples in the codebase:

```dart
// role_selection_page.dart — set role in a Cubit, then push the login screen.
static void _goToLogin(BuildContext context, UserRole role) {
  context.read<RoleCubit>().setRole(role);
  Navigator.of(context).push<void>(
    MaterialPageRoute(builder: (_) => LoginPage(role: role)),
  );
}

// login_page.dart — login is a "pageless" route on top of the FlowBuilder base.
// On success the AuthBloc flips to authenticated, FlowBuilder swaps the base
// stack, and this pageless route is cleaned up by popping to the root:
if (state.status.isSuccess) {
  Navigator.of(context).popUntil((route) => route.isFirst);
}

// signup_form.dart — replace (no back to the form) after account creation.
Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const NextStep()));
```

**Push-as-deep-link:** there is no URL router. FCM messages (`onMessageOpenedApp`, `getInitialMessage`) carry a `data.type` + id; `_handleNotificationTap` in `main.dart` switches on `type` to route (e.g. `analysis_complete` -> job detail). Foreground messages instead render a custom slide-down `OverlayEntry` banner inserted via `_navigatorKey.currentState!.overlay` (an `AnimationController` + `SlideTransition`), decoupled from navigation through the `NotificationEventBus`.

**Modals** are used throughout for choices and confirmations: `showModalBottomSheet<ImageSource>`/`<AnalysisImageSourceOption>` for image-source pickers, `showDialog<bool>` for destructive confirmations (complete/cancel consultation). All return their result via `Navigator.pop(value)`.

---

## Common mistakes

| Pitfall | Fix |
|---|---|
| Using a stale `context` after `await` to call `Navigator` | Guard with `if (!context.mounted) return;` before navigating post-await |
| `push` result typed as `dynamic` | Type it: `push<UserRole>(MaterialPageRoute<UserRole>(...))` and `pop<UserRole>(value)` |
| Mixing imperative `Navigator.push` into a `FlowBuilder` base stack and getting orphaned routes | Drive the base stack via state; clean up pageless routes with `popUntil((r) => r.isFirst)` (the reference app's login pattern) |
| Calling `Navigator.pop()` to mutate a NAV 2.0 `pages` list directly | Don't — let `onDidRemovePage`/`complete` fire and update *your state* so the page drops on rebuild |
| `onPopPage` (deprecated) on a raw `Navigator` | Use `onDidRemovePage` (deprecated after v3.16.0-17.0.pre; use it on Flutter 3.19+) |
| Forgetting `controller.dispose()` on a `FlowController` | It owns a notifier — dispose in `State.dispose()`; prefer `state:` when you don't need external control |
| `showDialog`/`showModalBottomSheet` result is `null` and crashes | Barrier dismiss pops with `null`; default it (`?? false`) or null-check |
| Reaching for named routes + `arguments` for typed data | Use `static route()/page()` factories with typed constructor args |
| Adding `go_router` "because it's standard" | The reference app is auth-state-driven with no URL needs — `flow_builder` is the established pattern; don't introduce a second router |
| Assuming push deep links work without platform config | Wire `AndroidManifest.xml` intent-filters / iOS Associated Domains; in the reference app links arrive as FCM payloads, not URLs |

## See also
- [state-management.md](state-management.md) — `AuthBloc`/`Cubit` that drive `FlowBuilder` state and `context.select`
- [firebase-and-push-notifications.md](firebase-messaging-fcm.md) — FCM tap routing, `getInitialMessage`, overlay banner
- [forms-and-validation.md](forms-and-input.md) — multi-step form flows and `formz` inside pushed pages
- [widgets-and-layout.md](widgets-and-layout.md) — `Scaffold`, `Overlay`, `SlideTransition` used by the notification banner
- flow_builder API & examples: https://pub.dev/packages/flow_builder
- Navigation & routing overview: https://docs.flutter.dev/ui/navigation
- Navigator 2.0 / Router (Pages, onDidRemovePage): https://api.flutter.dev/flutter/widgets/Navigator-class.html
- go_router (reference alternative): https://pub.dev/packages/go_router
- Deep linking setup: https://docs.flutter.dev/ui/navigation/deep-linking
