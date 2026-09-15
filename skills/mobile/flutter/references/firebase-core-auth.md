# Firebase Core & Authentication

## Overview
Firebase is the auth + messaging backbone of a production Flutter app. `firebase_core` bootstraps the SDK (one `initializeApp` before `runApp`); `firebase_auth` owns identity — email/password + Google/Apple, the `User` object, ID-token (JWT) minting, and the auth-state streams that drive navigation. The backend reads a `role` custom claim off that JWT, so every authenticated REST/WebSocket call rides a fresh Firebase ID token.

## Quick reference

| API | Signature / usage | Notes |
|---|---|---|
| `Firebase.initializeApp` | `await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` | Call once, after `WidgetsFlutterBinding.ensureInitialized()` |
| `FirebaseAuth.instance` | singleton entry point | |
| `createUserWithEmailAndPassword` | `({required String email, required String password}) → Future<UserCredential>` | named params |
| `signInWithEmailAndPassword` | `({required String email, required String password}) → Future<UserCredential>` | named params |
| `signOut` | `() → Future<void>` | clears `currentUser` |
| `currentUser` | `User?` | synchronous snapshot, null when signed out |
| `authStateChanges()` | `Stream<User?>` | fires on **sign-in / sign-out only** |
| `idTokenChanges()` | `Stream<User?>` | sign-in/out **+ token refresh** (claims change) |
| `userChanges()` | `Stream<User?>` | most fires: above **+ profile mutations** (`updateDisplayName`, `reload`) |
| `User.getIdToken([bool forceRefresh = false])` | `→ Future<String>` | the JWT; `forceRefresh:true` re-mints (picks up new claims) |
| `User.getIdTokenResult([forceRefresh])` | `→ Future<IdTokenResult>` | `.claims` map holds custom claims (`role`) |
| `User.updateDisplayName(String?)` | `→ Future<void>` | replaces deprecated `updateProfile` |
| `User.updatePhotoURL(String?)` | `→ Future<void>` | |
| `User.sendEmailVerification()` | `→ Future<void>` | |
| `FirebaseAuth.sendPasswordResetEmail` | `({required String email}) → Future<void>` | |
| `FirebaseAuthException` | `.code` (machine), `.message` (human) | catch this, not bare `Exception` |
| `signInWithCredential` | `(AuthCredential) → Future<UserCredential>` | path for Google/Apple |

Pinned versions (reference app): `firebase_core ^4.3`, `firebase_auth ^6.1`, `google_sign_in ^6.2`, `sign_in_with_apple ^6.1`.

> Version trap: `google_sign_in 7.x` rewrote the API into a `GoogleSignIn.instance` singleton with `authenticate()`. The reference app is pinned to **`^6.2`**, which uses the `GoogleSignIn(scopes: [...])` **constructor** + `signIn()` + `account.authentication`. The examples below use the **6.x** API. Do not paste v7 `GoogleSignIn.instance.authenticate()` code into this app.

## Initialization

`flutterfire configure` (FlutterFire CLI) generates `lib/firebase_options.dart` with a `DefaultFirebaseOptions` class plus per-platform option blocks, and wires the native config: `android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist`. Re-run it whenever you add a platform or a new Firebase app. Never hand-edit `firebase_options.dart`.

```dart
// main.dart
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

Future<void> main() async {
  // Required before any platform-channel call (Firebase, dotenv, etc.)
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform, // picks android/ios/web at runtime
  );

  runApp(const App());
}
```

Platform setup checklist (mostly handled by `flutterfire configure`):
- **Android**: `google-services.json` in `android/app/`; the Google Services Gradle plugin applied. Add your SHA-1/SHA-256 to the Firebase console for Google Sign-In to work on release builds.
- **iOS**: `GoogleService-Info.plist` in `ios/Runner/` (added to the Xcode target, not just the folder). For Google Sign-In add the reversed-client-id URL scheme to `Info.plist`; for Apple add the **Sign in with Apple** capability in Xcode.
- **Web**: options are inlined in `firebase_options.dart`; no JSON/plist file.

## Email / password

```dart
Future<UserCredential> register(String email, String password) async {
  try {
    return await FirebaseAuth.instance.createUserWithEmailAndPassword(
      email: email,
      password: password,
    );
  } on FirebaseAuthException catch (e) {
    // Surface .code to map to a localized message; never show raw .message to users.
    throw _mapAuthError(e); // e.g. 'email-already-in-use', 'weak-password'
  }
}

Future<UserCredential> login(String email, String password) =>
    FirebaseAuth.instance.signInWithEmailAndPassword(email: email, password: password);

Future<void> logout() => FirebaseAuth.instance.signOut();
```

Common `FirebaseAuthException.code` values worth mapping: `invalid-email`, `user-disabled`, `user-not-found`, `wrong-password`, `invalid-credential` (newer SDKs collapse user-not-found/wrong-password into this for enumeration protection), `email-already-in-use`, `weak-password`, `too-many-requests`, `network-request-failed`.

## Auth-state streams — which one to use

| Stream | Fires on | Use when |
|---|---|---|
| `authStateChanges()` | sign-in, sign-out | you only care "logged in or not" |
| `idTokenChanges()` | + token refresh / forced refresh | you need to react to **custom-claim** (`role`) changes |
| `userChanges()` | + `updateDisplayName`/`updatePhotoURL`/`reload` | you render profile fields and want UI to update in place |

The reference app's `FirebaseAuthService` exposes a getter *named* `userChanges` but currently backs it with **`authStateChanges()`** (mapped to also cache `_user`). That's enough for login/logout-driven navigation; switch the underlying stream to `userChanges()`/`idTokenChanges()` if you need profile-edit or custom-claim refreshes to push a new `User?` into the BLoC without a manual `getIdTokenResult(true)`.

```dart
// Pump the latest User into your state layer. emit.onEach keeps the subscription
// alive for the life of the bloc and is auto-cancelled on close().
authService.userChanges.listen((User? user) {
  // user == null  → signed out
  // user != null  → signed in (token + claims available via user.getIdToken / getIdTokenResult)
});
```

## ID token + custom claims (role)

The backend sets a `role` custom claim (`patient` | `doctor` | `admin`) at signup/login. It only lands in the JWT after a token refresh, so force-refresh right after a flow that changes claims.

```dart
Future<String?> currentRole() async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) return null;
  // forceRefresh re-mints the JWT so a just-assigned claim is visible.
  final result = await user.getIdTokenResult(true);
  return result.claims?['role'] as String?;
}

// The raw JWT for the Authorization header (see ApiService below).
Future<String?> idToken({bool force = false}) =>
    FirebaseAuth.instance.currentUser?.getIdToken(force) ?? Future.value(null);
```

`getIdToken()` returns a cached token until it nears expiry (~1h) then auto-refreshes, so calling it per-request is cheap — no need to cache it yourself.

## Profile, verification, password reset

```dart
final user = FirebaseAuth.instance.currentUser!;
await user.updateDisplayName('Dra. Godoy'); // updateProfile(...) is deprecated in v6
await user.updatePhotoURL(photoUrl);
await user.reload();                          // refresh local User after a remote change
await user.sendEmailVerification();           // user.emailVerified reflects after reload

await FirebaseAuth.instance.sendPasswordResetEmail(email: 'paciente@example.cl');
```

## Google Sign-In (google_sign_in ^6.2)

```dart
import 'package:google_sign_in/google_sign_in.dart';
import 'package:firebase_auth/firebase_auth.dart';

final _google = GoogleSignIn(scopes: const ['email']); // construct once

Future<UserCredential?> signInWithGoogle() async {
  final account = await _google.signIn();        // null if the user cancels the sheet
  if (account == null) return null;

  final auth = await account.authentication;      // GoogleSignInAuthentication
  final credential = GoogleAuthProvider.credential(
    accessToken: auth.accessToken,                // both available in v6
    idToken: auth.idToken,
  );
  return FirebaseAuth.instance.signInWithCredential(credential);
}

Future<void> signOutGoogle() async {
  await _google.signOut();                        // or disconnect() to revoke grants
  await FirebaseAuth.instance.signOut();
}
```

`scopes` is optional in v6 — the reference app calls the bare `GoogleSignIn().signIn()` (default `email`/`profile`). On web, skip the plugin's `signIn()` and use `FirebaseAuth.instance.signInWithPopup(GoogleAuthProvider())` instead (guard with `kIsWeb`), as the app does.

## Apple Sign-In (sign_in_with_apple ^6.1)

Apple requires a **nonce**: you pass the SHA-256 hash to Apple and the raw value to Firebase, which compares them to block replay.

```dart
import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:firebase_auth/firebase_auth.dart';

String _nonce([int len = 32]) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';
  final r = Random.secure();
  return List.generate(len, (_) => chars[r.nextInt(chars.length)]).join();
}

String _sha256(String s) => sha256.convert(utf8.encode(s)).toString();

Future<UserCredential> signInWithApple() async {
  final rawNonce = _nonce();

  final appleCredential = await SignInWithApple.getAppleIDCredential(
    scopes: const [
      AppleIDAuthorizationScopes.email,
      AppleIDAuthorizationScopes.fullName,
    ],
    nonce: _sha256(rawNonce), // hash to Apple
  );

  // OAuthProvider('apple.com') is the Firebase provider id for Apple.
  final oauthCredential = OAuthProvider('apple.com').credential(
    idToken: appleCredential.identityToken,
    rawNonce: rawNonce,        // raw to Firebase
    accessToken: appleCredential.authorizationCode,
  );

  return FirebaseAuth.instance.signInWithCredential(oauthCredential);
}
```

Apple only returns `fullName`/`email` on the **first** authorization — capture and persist them then. `SignInWithApple.isAvailable()` gates the button on platforms that support it.

> Notes: `accessToken: appleCredential.authorizationCode` is **optional** — many setups pass only `idToken` + `rawNonce` and omit `accessToken` entirely; include it only if your backend exchanges the authorization code. **The reference app's current `signInWithApple` omits the nonce** (`OAuthProvider('apple.com').credential(idToken:, accessToken:)` with no `rawNonce`). The nonce flow above is the Firebase-recommended hardening against replay — prefer it for new code.

## Real-world usage

The app wraps Firebase in an instance-based `FirebaseAuthService` (injected as a repository, not a static singleton), drives navigation off its stream via an `AuthBloc`, and gates `runApp` on the first auth emission so the splash never flashes the wrong screen.

```dart
// lib/features/auth/services/firebase_auth.dart (shape — abridged)
class FirebaseAuthService {
  FirebaseAuth get _auth => FirebaseAuth.instance;
  User? _user;

  // NOTE: getter is named `userChanges` but is backed by authStateChanges()
  // (mapped to cache the latest User). Swap to _auth.userChanges() if you need
  // profile-edit / claim-refresh emissions.
  Stream<User?> get userChanges => _auth.authStateChanges().map((u) {
        _user = u;
        return u;
      });

  User? get currentUser => _user;

  Future<void> logInWithEmailAndPassword({
    required String email,
    required String password,
  }) => _auth.signInWithEmailAndPassword(email: email, password: password);

  /// Returns true if sign-in completed, false if the user cancelled the picker.
  Future<bool> signInWithGoogle() async { /* kIsWeb popup vs native flow */ }

  Future<void> signOut() => _auth.signOut();
}
```

```dart
// main.dart — block first frame on initial auth state to avoid a UI flash.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await dotenv.load(fileName: '.env');

  // Wait for Firebase to restore (or reject) the cached session exactly once.
  final initialUser = await FirebaseAuthService.userChanges.first;

  runApp(App(initialUser: initialUser));
}
```

```dart
// AuthBloc — Bloc (not Cubit) because it consumes a Firebase stream.
// emit.onEach binds the subscription to the bloc lifecycle (auto-cancel on close).
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc({
    required FirebaseAuthService authenticationRepository,
    required ProfileCubit profileCubit,
  })  : _authenticationRepository = authenticationRepository,
        _profileCubit = profileCubit,
        super(AuthState(user: authenticationRepository.currentUser)) {
    on<AuthUserSubscriptionRequested>(_onUserSubscriptionRequested);
    on<AuthLogoutPressed>(_onLogoutPressed);
  }

  final FirebaseAuthService _authenticationRepository;
  final ProfileCubit _profileCubit;

  Future<void> _onUserSubscriptionRequested(
    AuthUserSubscriptionRequested event,
    Emitter<AuthState> emit,
  ) =>
      emit.onEach(
        _authenticationRepository.userChanges,
        onData: (user) => emit(AuthState(user: user)),
        onError: addError,
      );

  Future<void> _onLogoutPressed(AuthLogoutPressed event, Emitter<AuthState> emit) async {
    await _profileCubit.prepareLogout();
    await _authenticationRepository.signOut();
  }
}
```

The real bloc keeps only the `User?` in state and resolves `role` elsewhere (via `getIdTokenResult` where a screen needs it) rather than inline — if you add inline role extraction, force-refresh after social login so the freshly-set claim is present. `flow_builder` maps the derived auth status → page stack (`FlowBuilder` with `onGenerateAppViewPages`), so sign-out anywhere unwinds to the login flow automatically.

**JWT injection** — every request rides a fresh token; `ApiService` (single static class) reads it straight off `currentUser`:

```dart
// lib/core/services/api_service.dart (excerpt)
static Future<Map<String, String>> _headers() async {
  final token = await FirebaseAuth.instance.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };
}
```

**WebSocket auth** uses the same token but as a query param: `wss://your-api.example.com/<stage>?token=<idToken>` (headers aren't available on the WS handshake from Flutter).

**Social → backend** — after `signInWithCredential` succeeds (Google or Apple), the app POSTs to **`/auth/social-complete`** so the backend can create/sync the profile and **set the `role` custom claim**. Then force-refresh the token so the claim is in the JWT before any role-gated call:

```dart
await FirebaseAuthService.... // signInWithGoogle / signInWithApple
await ApiService.post('/auth/social-complete', body: {/* role flag, profile bits */});
await FirebaseAuth.instance.currentUser?.getIdToken(true); // pull the new role claim
```

**Errors → formz** — the auth cubits catch `FirebaseAuthException` and surface `e.message` (or a mapped Spanish string) into a `formz`-backed failure on the state, alongside `FormzSubmissionStatus.failure`:

```dart
Future<void> submitLogin() async {
  if (!Formz.validate([state.email, state.password])) return;
  emit(state.copyWith(status: FormzSubmissionStatus.inProgress));
  try {
    await FirebaseAuthService.signIn(state.email.value, state.password.value);
    emit(state.copyWith(status: FormzSubmissionStatus.success));
  } on FirebaseAuthException catch (e) {
    emit(state.copyWith(
      status: FormzSubmissionStatus.failure,
      errorMessage: e.message, // shown in a SnackBar / banner
    ));
  }
}
```

## Common mistakes

| Pitfall | Fix |
|---|---|
| Calling Firebase before `WidgetsFlutterBinding.ensureInitialized()` | Ensure binding first, then `await Firebase.initializeApp(...)` |
| Using `google_sign_in 7.x` API (`GoogleSignIn.instance.authenticate()`) on the pinned `^6.2` | Use `GoogleSignIn(scopes: [...])` + `signIn()` + `account.authentication` |
| Role claim missing right after signup/social login | `getIdToken(true)` / `getIdTokenResult(true)` to force-refresh after the backend sets it |
| Listening on `authStateChanges()` but expecting claim or profile updates | Use `idTokenChanges()` (claims) or `userChanges()` (profile) |
| `updateProfile(...)` (deprecated in firebase_auth 6) | Call `updateDisplayName()` / `updatePhotoURL()` |
| Apple replay error / `invalid-credential` | Pass SHA-256 nonce to Apple, **raw** nonce to `OAuthProvider('apple.com').credential(rawNonce:)` |
| Catching bare `Exception` and showing a raw stack | Catch `FirebaseAuthException`, map `.code`/`.message` to localized text |
| Caching the ID token in a field and reusing it for hours | Call `getIdToken()` per request — the SDK caches and auto-refreshes internally |
| Hand-editing `firebase_options.dart` | Re-run `flutterfire configure` |
| `account.authentication` null after a cancelled Google sheet | `signIn()` returns `null` on cancel — null-check before reading `.authentication` |
| Splash flashes wrong screen on cold start | `await userChanges.first` before `runApp` |

## See also
- [state-management.md](state-management.md) — Bloc vs Cubit, `emit.onEach` for streams
- [navigation.md](navigation-and-routing.md) — `flow_builder` `FlowBuilder<AuthStatus>` driven by auth state
- [networking.md](networking-rest.md) — `ApiService` JWT injection, `{success,data,message}` envelope
- [forms-formz.md](forms-and-input.md) — `FormzInput`, `FormzSubmissionStatus`, surfacing auth failures
- [push-notifications-fcm.md](firebase-messaging-fcm.md) — `firebase_messaging`, token registration
- Firebase Auth (Flutter) Get Started — https://firebase.google.com/docs/auth/flutter/start
- Federated / social sign-in (Google + Apple) — https://firebase.google.com/docs/auth/flutter/federated-auth
- `firebase_auth` on pub.dev — https://pub.dev/packages/firebase_auth
- `google_sign_in` 6.x docs — https://pub.dev/documentation/google_sign_in/6.2.1/
- `sign_in_with_apple` on pub.dev — https://pub.dev/packages/sign_in_with_apple
