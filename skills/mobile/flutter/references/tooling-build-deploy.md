# Tooling, Build & Deployment

## Overview
Everything between `flutter create` and a binary in the store: the Flutter CLI, build modes
and artifacts, flavor/environment wiring, config packages (`flutter_dotenv`,
`flutter_native_splash`, `flutter_launcher_icons`), `pubspec.yaml`/`analysis_options.yaml`,
and the Android/iOS native build files. Matters whenever you change versions, add a runtime
config value, ship icons/splash, set up CI, or submit to a store.

## Quick reference

| Command | Purpose |
|---|---|
| `flutter create --org com.example --platforms=android,ios,web my_app` | Scaffold a project (set org/platforms up front) |
| `flutter pub get` | Resolve deps from `pubspec.yaml` → `pubspec.lock` |
| `flutter pub upgrade [--major-versions]` | Bump deps (major-versions rewrites `pubspec.yaml`) |
| `flutter pub outdated` | Show newer versions available |
| `flutter run` / `flutter run -d <id>` | Debug run with hot reload (`r`) / restart (`R`) |
| `flutter run --release` / `--profile` | Run in release / profile mode on device |
| `flutter run --dart-define-from-file=env/dev.json` | Run injecting compile-time env |
| `flutter build apk` / `appbundle` / `ipa` / `web` | Produce a release artifact |
| `flutter test` / `flutter test test/foo_test.dart` | Run unit/widget tests |
| `flutter analyze` | Static analysis per `analysis_options.yaml` |
| `dart format .` / `dart format --set-exit-if-changed .` | Format (CI gate) |
| `flutter doctor [-v]` | Diagnose toolchain (SDKs, devices, licenses) |
| `flutter clean` | Delete `build/` + `.dart_tool/` (force full rebuild) |
| `flutter devices` / `flutter emulators` | List connected devices / emulators |
| `flutter pub run` → `dart run <pkg>:<exec>` | Run a package executable (codegen, icons, splash) |

| Generator command (current) | Reads | Writes |
|---|---|---|
| `dart run flutter_launcher_icons` | `flutter_launcher_icons:` in `pubspec.yaml` | native icon sets (Android `mipmap`, iOS `AppIcon`) |
| `dart run flutter_native_splash:create` | `flutter_native_splash:` in `pubspec.yaml` | native splash (drawable, `LaunchScreen`, web) |

## Flutter CLI essentials

```bash
flutter doctor -v          # first thing on a new machine: SDKs, signing, licenses
flutter devices            # find the -d target id (emulator-5554, chrome, macos…)
flutter run -d emulator-5554
#   r = hot reload   R = hot restart   p = paint baselines   q = quit
flutter clean && flutter pub get   # fixes most "stale build" / plugin-mismatch errors
```

`flutter pub get` runs automatically on `run`/`build`, but call it explicitly after editing
`pubspec.yaml`. `pubspec.lock` is committed for apps (pin exact resolved versions); the
caret in `pubspec.yaml` (`^9.1.0` = `>=9.1.0 <10.0.0`) is the allowed range.

## Build modes

| Mode | JIT/AOT | Asserts | Observatory/DevTools | Use for |
|---|---|---|---|---|
| **debug** (default) | JIT | on | yes | development, hot reload |
| **profile** | AOT | off | yes (perf only) | performance profiling on a real device |
| **release** | AOT | off | no | store builds; smallest + fastest |

```bash
flutter run                 # debug
flutter run --profile       # AOT, DevTools timeline — measure jank on a physical device
flutter run --release       # production behavior on device (no hot reload)
```

`kDebugMode` / `kProfileMode` / `kReleaseMode` (from `package:flutter/foundation.dart`) are
compile-time constants — guard debug-only code so it tree-shakes out of release.

## Build artifacts

```bash
# Android
flutter build apk --release                 # universal APK (sideload / direct)
flutter build apk --split-per-abi           # smaller per-ABI APKs
flutter build appbundle --release           # .aab — REQUIRED for Play Store

# iOS (needs macOS + Xcode + signing)
flutter build ipa --release                 # → build/ios/ipa/*.ipa + Xcode archive
flutter build ios --release --no-codesign   # CI archive without local certs

# Web
flutter build web --release --wasm          # CanvasKit/WASM renderer
```

Outputs land under `build/app/outputs/` (Android) and `build/ios/ipa/` (iOS).

### `--flavor` and `--dart-define`

```bash
# --flavor selects a native build variant (Android productFlavor / iOS scheme)
flutter build appbundle --flavor prod -t lib/main_prod.dart

# --dart-define injects compile-time constants (read via String.fromEnvironment)
flutter run --dart-define=API_BASE_URL=https://api.example.com --dart-define=ENV=dev

# --dart-define-from-file reads many at once from JSON or .env-style file
flutter build apk --dart-define-from-file=env/prod.json
```

```dart
// Compile-time constants — baked into the binary, available before runApp,
// and tree-shaken when unused. Prefer these over runtime .env for build-time config.
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://dev.api');
const enableLogging = bool.fromEnvironment('ENABLE_LOGGING', defaultValue: false);
```

`--dart-define` vs `flutter_dotenv`: `--dart-define` is compile-time (const, can't be
extracted from the binary as easily, no asset bundling); `dotenv` loads a runtime asset
(editable without rebuild, but shipped in the bundle — readable by anyone). **Neither is a
secret store.** True secrets stay server-side.

## Flavors / environments

Define a flavor per environment so dev/staging/prod can coexist on one device with distinct
bundle IDs and config.

**Android** (`android/app/build.gradle.kts`):
```kotlin
android {
    flavorDimensions += "env"
    productFlavors {
        create("dev")  { dimension = "env"; applicationIdSuffix = ".dev";  resValue("string", "app_name", "MyApp Dev") }
        create("prod") { dimension = "env";                                 resValue("string", "app_name", "MyApp") }
    }
}
```

**iOS**: add a Scheme + matching Build Configuration (`Debug-prod`, `Release-prod`) in Xcode,
then `flutter build ipa --flavor prod`. Per-env entry points keep `main()` thin:
```dart
// lib/main_prod.dart
void main() => bootstrap(env: Env.prod);
```

## flutter_dotenv ^6 (runtime .env asset)

`.env` is bundled as an asset and parsed at startup. Use it for **non-secret** runtime config
(base URLs, public API keys with referrer restrictions). v6 throws `NotInitializedError` if
you read before `load()`.

```yaml
# pubspec.yaml — .env MUST be declared as an asset or load() fails at runtime
flutter:
  assets:
    - .env
```

```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');   // load once, before runApp
  runApp(const MyApp());
}

// Reads (v6 API):
final url = dotenv.env['API_BASE_URL'];                 // String? (null if missing)
final must = dotenv.get('API_BASE_URL');                // String, throws if absent
final port = dotenv.getInt('PORT', fallback: 8080);     // typed getters w/ fallback
final dbg  = dotenv.getBool('DEBUG', fallback: false);
```

Add `.env` to `.gitignore`; commit a `.env.example` with empty values so the asset path
always exists for `pub get` / CI.

## flutter_native_splash ^2.4

```yaml
flutter_native_splash:
  color: "#FFFFFF"
  image: assets/splash/logo1024.png
  android: true
  ios: true
  web: false
  android_12:                 # Android 12+ uses the OS splash API — configure separately
    color: "#FFFFFF"
    image: assets/splash/logo_android12.png
```
```bash
dart run flutter_native_splash:create     # regenerate after any config change
dart run flutter_native_splash:remove     # revert to default
```
Re-run `:create` after upgrading Flutter — the generated native files can drift.

## flutter_launcher_icons ^0.14

```yaml
flutter_launcher_icons:
  android: true                # or "launcher_icon" for a custom resource name
  ios: true
  remove_alpha_ios: true       # App Store rejects icons with an alpha channel
  image_path: assets/splash/logo344.png
  min_sdk_android: 21
  background_color: "#FFFFFF"
  # adaptive_icon_background: "#FFFFFF"          # Android adaptive icon (8.0+)
  # adaptive_icon_foreground: assets/icon/fg.png
```
```bash
dart run flutter_launcher_icons             # generates mipmap/ + AppIcon.appiconset
```
Source image should be ≥1024×1024 PNG. `remove_alpha_ios: true` is mandatory for App Store.

## pubspec.yaml structure

```yaml
name: my_app
version: 1.0.0+4              # <semver>+<build>  → name=1.0.0, code/build=4
environment:
  sdk: ^3.10.3               # Dart SDK constraint

dependencies:                # ship to production
  flutter: { sdk: flutter }
  flutter_bloc: ^9.1.1

dev_dependencies:            # tooling only (tests, lints, generators)
  flutter_test: { sdk: flutter }
  flutter_lints: ^6.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/img/            # trailing slash = whole directory (non-recursive)
    - .env
  fonts:
    - family: Roboto
      fonts:
        - asset: assets/fonts/Roboto-Regular.ttf
          weight: 400
        - asset: assets/fonts/Roboto-Bold.ttf
          weight: 700
```

Asset dirs are **not recursive** — each subfolder must be listed. Tool config blocks
(`flutter_launcher_icons:`, `flutter_native_splash:`) sit at the top level, not under `flutter:`.

## Versioning

`version: x.y.z+build` →
- **Android**: `x.y.z` = `versionName` (display), `build` = `versionCode` (monotonic int Play uses to order builds).
- **iOS**: `x.y.z` = `CFBundleShortVersionString`, `build` = `CFBundleVersion`.

Increment `build` on **every** upload to a store, even for the same `x.y.z`. Override at build
time: `flutter build appbundle --build-name=1.0.1 --build-number=5`.

## analysis_options.yaml + flutter_lints ^6

```yaml
include: package:flutter_lints/flutter.yaml   # the recommended Flutter rule set

linter:
  rules:
    prefer_single_quotes: true       # enable an extra rule
    avoid_print: false               # disable one from the set

analyzer:
  exclude:
    - "**/*.g.dart"                  # generated code
    - build/**
  errors:
    invalid_annotation_target: ignore
    todo: ignore
```

`flutter_lints 6` tracks the latest `lints` core set (recommended → stricter defaults vs v5).
Suppress locally with `// ignore: <rule>` (one line) or `// ignore_for_file: <rule>` (whole
file). `flutter analyze` and `dart format --set-exit-if-changed .` are the two CI gates.

## Android native (`android/app/build.gradle.kts`)

```kotlin
android {
    namespace = "com.example.myapp"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    defaultConfig {
        applicationId = "com.example.myapp"   // unique, immutable store identity
        minSdk = flutter.minSdkVersion        // or hard-code e.g. 23 for a plugin floor
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode     // ← from pubspec version: +build
        versionName = flutter.versionName
    }

    signingConfigs { /* release { keyAlias/keyPassword/storeFile from key.properties } */ }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true            // R8/ProGuard shrink + obfuscate
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

The `isMinifyEnabled`/`proguardFiles` lines above are the **recommended** release-hardening
pattern; a fresh `flutter create` (and the reference app today) ships `release { signingConfig = … }`
with shrinking **off** and no `proguard-rules.pro`. Enable it deliberately and test the release
build, since R8 can strip reflected-over classes.

Keep `keystore` + `key.properties` out of git. ProGuard/R8: add `-keep` rules in
`proguard-rules.pro` for any class reflected over (some Firebase/plugin classes ship their own).

## iOS native

- `ios/Runner/Info.plist` — `CFBundleShortVersionString`/`CFBundleVersion` (Flutter injects
  `$(FLUTTER_BUILD_NAME)`/`$(FLUTTER_BUILD_NUMBER)`), plus **usage strings** that are mandatory
  or the app is rejected: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`.
- **Capabilities** (Signing & Capabilities in Xcode → `Runner.entitlements`): Push
  Notifications, Sign in with Apple, In-App Purchase.
- **Signing**: a Team + provisioning profile; CI uses `fastlane match` or App Store Connect API keys.
- **CocoaPods**: `ios/Podfile` declares the iOS deployment target (`platform :ios, '15.0'` in
  the reference app; must be ≥ the highest plugin floor); `pod install` runs inside `flutter build`.
  After bumping a plugin, `cd ios && pod repo update && pod install` clears stale Pods.

## CI/CD overview

> Illustrative — the reference app has **no committed `codemagic.yaml` or GitHub Actions workflow** yet;
> the snippet below is a starting template, not the repo's current pipeline.

| Tool | Strength | Notes |
|---|---|---|
| **Codemagic** | Flutter-native, easiest signing/store upload | `codemagic.yaml` at repo root; managed macOS for iOS |
| **fastlane** | Mature lane scripting, `match` cert sync, `deliver`/`supply` | run from any CI; per-platform `Fastfile` |
| **GitHub Actions** | Free for OSS, full control | needs `subosito/flutter-action`; macOS runner for iOS |

```yaml
# .github/workflows/ci.yml — analyze + test gate on every PR
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable }
      - run: flutter pub get
      - run: dart format --set-exit-if-changed .
      - run: flutter analyze
      - run: flutter test
```

**Store submission basics**: Android → upload `.aab` to Play Console (internal → closed →
production tracks); the signing key (or Play App Signing) must stay constant. iOS → archive
`.ipa`, upload via Transporter / `fastlane deliver` to App Store Connect → TestFlight →
review. Bump `+build` every upload.

## Web / desktop targets

```bash
flutter build web --release        # → build/web (static; host on any CDN / Firebase Hosting)
flutter build macos --release      # → .app under build/macos
flutter config --enable-windows-desktop --enable-linux-desktop   # opt in once
flutter build windows / linux --release
```
A target only builds if its platform folder exists; `flutter create --platforms=windows .`
adds a missing one. Plugins must declare support for the target or the build fails at link time.

## Real-world usage

Single `my_app` app (`com.example.myapp`), `version: 1.0.0+4`, SDK `^3.10.3`, all six
platform folders present (`android`, `ios`, `web`, `macos`, `linux`, `windows`) — mobile is
the shipping target. **No flavors / `--dart-define`** — environment comes entirely from a
runtime `.env` asset loaded once in `main()`:

```dart
// lib/main.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');          // BEFORE Firebase + runApp — services read it eagerly
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await _ensureAndroidNotificationChannel();    // HIGH-importance FCM channel
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  runApp(MyApp(authService: FirebaseAuthService()));
}
```

`.env` (gitignored, declared under `flutter: assets:`) holds `SERVER_URL`,
`GOOGLE_PLACES_API_KEY` (plus `WS_URL` / `MAPBOX_TOKEN` referenced in code). It is read at
**class-init time** by static services — order matters, hence `dotenv.load` is the first await:

```dart
// core/services/api_service.dart — static field evaluated on first ApiService access
class ApiService {
  ApiService._();
  static var baseUrl = dotenv.env['SERVER_URL']!;   // ! is safe only because .env is loaded first
}
// patient/consultations/.../consultation_websocket_service.dart
final wsUrlRaw = (dotenv.env['WS_URL'] ?? '').trim();   // graceful: falls back to SERVER_URL
```

Build config lives in `pubspec.yaml` (top-level, not under `flutter:`):
```yaml
flutter_launcher_icons:
  android: true
  ios: true
  remove_alpha_ios: true          # App Store requires no alpha
  image_path: assets/splash/logo344.png
  min_sdk_android: 21
  background_color: "#FFFFFF"
flutter_native_splash:
  color: "#FFFFFF"
  image: assets/splash/logo1024.png
  android: true
  ios: true
```
Regenerate after edits: `dart run flutter_launcher_icons` and `dart run flutter_native_splash:create`.

Lints use the default `flutter_lints ^6` set (`analysis_options.yaml` → `include:
package:flutter_lints/flutter.yaml`, no rule overrides). `avoid_print` is suppressed only
inline where intentional (`// ignore: avoid_print` on the FCM background-handler log).

Android uses **Kotlin-DSL** Gradle (`build.gradle.kts`): `applicationId = "com.example.myapp"`
(matches the Play package name), `minSdk = flutter.minSdkVersion`,
`versionCode`/`versionName` inherited from `flutter.*` (i.e. driven by `pubspec` `1.0.0+4`).
The actual `release` buildType wires only `signingConfig = signingConfigs.getByName("release")`
— **no `isMinifyEnabled` / no `proguardFiles`** (R8 shrinking is off, no `proguard-rules.pro`
in the repo). The minify+ProGuard block in the Android-native section above is the recommended
hardening pattern, not the current state of the reference app.

iOS (Podfile `platform :ios, '15.0'`; `IPHONEOS_DEPLOYMENT_TARGET = 15.0` for Runner)
needs Push Notifications + Sign in with Apple + In-App Purchase capabilities for
`firebase_messaging`, `sign_in_with_apple`, and `in_app_purchase` (doctor subscriptions). Two
entitlements files exist: `Runner.entitlements` (Debug/Profile — push + IAP) and
`RunnerRelease.entitlements` (Release — push + Sign in with Apple + IAP), selected per-config
via `CODE_SIGN_ENTITLEMENTS`. `aps-environment` is `development` in both — flip to `production`
before App Store submission.

## Common mistakes

| Pitfall | Fix |
|---|---|
| Reading `dotenv.env[...]` before `dotenv.load()` → `NotInitializedError` | `await dotenv.load()` as the **first** await in `main()`, before any service inits |
| `.env` works locally, null in build → forgot the asset entry | Add `.env` under `flutter: assets:` and re-run `flutter pub get` |
| Treating `.env`/`--dart-define` as a secret store | Both ship in the bundle; keep true secrets server-side |
| Store rejects build: "duplicate version code" | Increment `+build` in `version:` (or `--build-number`) every upload |
| iOS icon rejected for alpha channel | `remove_alpha_ios: true` then regenerate |
| New asset/font not showing after `pubspec` edit | Hot reload doesn't pick up asset manifest — full restart (`R`) or `flutter clean` |
| Plugin "MissingPluginException" after dep change | `flutter clean && flutter pub get`; iOS `pod install` |
| Asset subfolder not bundled | List every directory — asset paths are non-recursive |
| `--profile`/`--release` won't hot reload | Expected: only debug supports hot reload; use it for perf/prod checks |
| Android 12 splash looks wrong | Configure the separate `android_12:` block, not just top-level `color`/`image` |
| Used `flutter pub run pkg:exec` (deprecated) | Use `dart run pkg:exec` |

## See also

- [state-management.md](state-management.md) · [firebase-auth-messaging.md](firebase-core-auth.md) · [networking-http.md](networking-rest.md)
- https://docs.flutter.dev/deployment/flavors
- https://docs.flutter.dev/deployment/android
- https://pub.dev/packages/flutter_dotenv
- https://pub.dev/packages/flutter_native_splash
- https://pub.dev/packages/flutter_launcher_icons
- https://dart.dev/tools/analysis
