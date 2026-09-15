# Firebase Cloud Messaging & Local Notifications

## Overview
Push notifications in Flutter use two cooperating packages: `firebase_messaging` (token mgmt, permission, message handlers — foreground/background/terminated) and `flutter_local_notifications` (renders a visible banner for *data-only* messages and creates the Android channel pushes route through). FCM does NOT auto-display a system notification for foreground or data-only messages — you display those yourself. This matters because the reference app sends **data-only** payloads (`data["type"]`) so it can route in-app and render a custom overlay banner instead of the OS banner.

## Quick reference

| API | Signature / value | Notes |
|---|---|---|
| `FirebaseMessaging.instance` | singleton | entry point |
| `requestPermission(...)` | `→ Future<NotificationSettings>` | named bools: `alert, badge, sound, provisional, announcement, carPlay, criticalAlert`. iOS shows dialog; Android 13+ POST_NOTIFICATIONS |
| `getNotificationSettings()` | `→ Future<NotificationSettings>` | read current status without prompting |
| `settings.authorizationStatus` | `AuthorizationStatus` | `authorized` / `denied` / `notDetermined` / `provisional` |
| `getToken({vapidKey})` | `→ Future<String?>` | `vapidKey` web-only; null possible |
| `onTokenRefresh` | `Stream<String>` | re-post to backend on rotation |
| `getAPNSToken()` | `→ Future<String?>` | **iOS/macOS only** — throws/`MissingPluginException` on Android |
| `FirebaseMessaging.onMessage` | `Stream<RemoteMessage>` | app foreground |
| `FirebaseMessaging.onMessageOpenedApp` | `Stream<RemoteMessage>` | tap while backgrounded |
| `getInitialMessage()` | `→ Future<RemoteMessage?>` | tap that cold-launched (terminated) |
| `FirebaseMessaging.onBackgroundMessage(handler)` | top-level fn | needs `@pragma('vm:entry-point')` |
| `setForegroundNotificationPresentationOptions(...)` | `alert, badge, sound` bools | iOS only; `alert:false` suppresses native banner |
| `RemoteMessage` | `.notification` (`RemoteNotification?`), `.data` (`Map<String,dynamic>`) | route on `data['type']` |

| flutter_local_notifications (v22) | Signature | Notes |
|---|---|---|
| `FlutterLocalNotificationsPlugin()` | ctor | one instance app-wide |
| `.initialize(settings:, onDidReceiveNotificationResponse:)` | **named params (v20+)** | `InitializationSettings(android:, iOS:)` |
| `AndroidInitializationSettings('icon')` | drawable name | e.g. `'@mipmap/ic_launcher'` |
| `DarwinInitializationSettings(...)` | `requestAlertPermission` etc. | iOS/macOS init |
| `AndroidNotificationChannel(id, name, importance:)` | `Importance.high` | **create before any push** |
| `.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(ch)` | | channel registration |
| `.show(id:, title:, body:, notificationDetails:, payload:)` | **named params (v20+)** | render local banner |

> Version gotcha: **v20.0.0 moved `initialize()` and `show()` from positional to named parameters**. v21 raised mins (Flutter 3.38.1 / Dart 3.10 / Android API 24 / iOS 13). Code written against v16-19 docs will not compile on v22.

## Platform setup

**iOS / macOS** (required for *any* delivery):
1. Apple Developer → create an **APNs Auth Key (.p8)**, upload to Firebase Console → Project Settings → Cloud Messaging.
2. Xcode → target → Signing & Capabilities → add **Push Notifications** and **Background Modes → Remote notifications**.
3. APNs token must be available before `getToken()` resolves on iOS. Use `getAPNSToken()` to confirm — but only on Apple platforms.

**Android:**
1. `google-services.json` in `android/app/`, Google Services Gradle plugin applied.
2. Android 13+ (API 33) requires runtime `POST_NOTIFICATIONS` — `requestPermission()` triggers it.
3. A notification channel (`Importance.high`) must exist or heads-up banners are silently downgraded.
4. **Core-library desugaring** (`android/app/build.gradle`): `flutter_local_notifications` v19+ requires `coreLibraryDesugaringEnabled true`, `compileOptions { sourceCompatibility/targetCompatibility VERSION_1_8 }`, and `coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'` in `dependencies`. **Only strictly needed for `zonedSchedule()`** (scheduled notifications use `java.time`). The reference app shows notifications immediately via `show()`, so desugaring is a build prerequisite but not exercised at runtime.

> **Web (VAPID):** out of scope here — the reference app targets iOS/Android. If you add web, `getToken(vapidKey: ...)` requires a Web Push certificate key pair from Firebase Console → Cloud Messaging, and a `firebase-messaging-sw.js` service worker. `flutter_local_notifications` does not support web.

## Permission flow

```dart
final messaging = FirebaseMessaging.instance;

// Only prompt when the user hasn't decided — re-prompting a denied user does nothing on iOS.
final current = await messaging.getNotificationSettings();
if (current.authorizationStatus == AuthorizationStatus.notDetermined) {
  final settings = await messaging.requestPermission(
    alert: true,
    badge: true,
    sound: true,
  );
  if (settings.authorizationStatus == AuthorizationStatus.denied) return;
}
```

## Token lifecycle

```dart
// Initial token → POST to backend so it can target this device.
final token = await messaging.getToken();
if (token != null) await _sendTokenToBackend(token);

// FCM rotates tokens (app restore, reinstall, clear-data). Persist every refresh.
messaging.onTokenRefresh.listen(_sendTokenToBackend);
```

### FCM token vs Firebase installation ID (`firebase_app_installations ^0.4`)

Two different identifiers — don't confuse them:

| | `getToken()` (firebase_messaging) | `FirebaseInstallations.instance.getId()` (firebase_app_installations) |
|---|---|---|
| Identifies | **this app install's push endpoint** | **this app installation** (analytics, Remote Config, A/B) |
| Used for | sending a push to the device | per-install identity; not addressable for push |
| Rotates | on restore / reinstall / clear-data | stable per install; `delete()` forces a new one |

```dart
// firebase_app_installations ^0.4 — surface: getId(), getToken(), delete(), onIdChange
final installId = await FirebaseInstallations.instance.getId();
```

**The reference app routes on the FCM token, not the installation ID** — the backend stores `getToken()` output in `fcmTokens` and fans out via `notifyUser()`. The installation ID is only relevant if you later wire Remote Config / A/B targeting; it is **not** a substitute for the FCM token when sending a push.

## Message handlers — the four entry points

There are four distinct delivery paths depending on app state. Register all of them; missing one means lost or non-routable notifications.

```dart
// 1. TERMINATED — must be a TOP-LEVEL function (separate isolate), so re-init Firebase.
@pragma('vm:entry-point') // prevents tree-shaking the entry point in release builds
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(); // background isolate has no app context
  // Keep light: no UI here. Optionally show a local notification.
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  // 2. Register the background handler BEFORE runApp.
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // 3. FOREGROUND — app open & visible.
  FirebaseMessaging.onMessage.listen((m) => _route(m));

  // 4. BACKGROUND TAP — user taps a tray notification, app resumes.
  FirebaseMessaging.onMessageOpenedApp.listen((m) => _route(m));

  // 5. TERMINATED TAP — notification cold-launched the app.
  final initial = await FirebaseMessaging.instance.getInitialMessage();
  if (initial != null) _route(initial);

  runApp(const MyApp());
}
```

| State | Handler | Runs in |
|---|---|---|
| Foreground | `onMessage` | main isolate |
| Background (no tap) | `onBackgroundMessage` | **separate isolate** (re-init Firebase) |
| Background → tap | `onMessageOpenedApp` | main isolate |
| Terminated → tap | `getInitialMessage()` | main isolate, once at launch |

## Routing by `data["type"]`

The backend sends data-only payloads with a `type` discriminator. Switch on it — never on `notification.title`.

```dart
void _route(RemoteMessage m) {
  switch (m.data['type']) {
    case 'analysis_complete':   /* open job m.data['jobId'] */ break;
    case 'new_consultation':
    case 'consultation_accepted':
    case 'new_message':         /* open consultation m.data['consultationId'] */ break;
  }
}
```

## Data-only vs notification messages (delivery behavior)

| Payload | Foreground | Background | Terminated |
|---|---|---|---|
| `notification` (+optional data) | `onMessage` (no auto-banner unless `setForegroundNotificationPresentationOptions(alert:true)`) | OS shows tray banner; tap → `onMessageOpenedApp` | OS shows tray banner; tap → `getInitialMessage` |
| **data-only** | `onMessage` | `onBackgroundMessage` (no auto-banner — display it yourself) | `onBackgroundMessage`; **no tray banner** unless you render one |

Key consequence: **data-only messages never show a system banner on their own.** If you want the user to see something while backgrounded, the background handler must call `flutter_local_notifications`. Data-only also gives full control (custom in-app banner, routing) which is why the reference app uses it.

## Suppressing the iOS native banner

```dart
// iOS only — with alert:false the OS won't draw its banner while foregrounded,
// freeing you to render a custom overlay. No-op on Android.
await FirebaseMessaging.instance
    .setForegroundNotificationPresentationOptions(alert: false, badge: true, sound: false);
```

## flutter_local_notifications (v22) — channel + show

The Android channel must exist before a high-importance push arrives, or heads-up display is downgraded to silent. v22 uses **named parameters**.

```dart
final _local = FlutterLocalNotificationsPlugin();

const _channel = AndroidNotificationChannel(
  'default_channel',          // id — must match notification details
  'Notificaciones',              // user-visible name (Settings)
  importance: Importance.high,   // heads-up banner + sound
);

Future<void> initLocalNotifications() async {
  await _local.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(), // request perms via firebase_messaging instead
    ),
    onDidReceiveNotificationResponse: (resp) {
      // resp.payload carries the JSON we passed to show().
    },
  );

  // Create the channel exactly once. Channel settings are IMMUTABLE after first
  // creation — to change importance you must change the id or reinstall the app.
  await _local
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(_channel);
}

Future<void> showLocal(RemoteMessage m) async {
  final n = m.notification;
  await _local.show(
    id: m.hashCode,
    title: n?.title ?? m.data['title'] as String?,
    body: n?.body ?? m.data['body'] as String?,
    notificationDetails: const NotificationDetails(
      android: AndroidNotificationDetails(
        'default_channel',     // MUST equal the created channel id
        'Notificaciones',
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(),
    ),
    payload: jsonEncode(m.data),
  );
}
```

## Decoupling events to the app via an event bus

FCM callbacks fire before any widget/cubit may be mounted. Push parsed events onto a broadcast stream; cubits subscribe and react. This avoids `BuildContext`/navigator coupling in the messaging layer.

```dart
class NotificationEventBus {
  NotificationEventBus._();
  static final instance = NotificationEventBus._();
  final _controller = StreamController<NotificationEvent>.broadcast();
  Stream<NotificationEvent> get stream => _controller.stream;
  void emit(NotificationEvent e) => _controller.add(e);
}
```

## Real-world usage

The reference app is data-only end-to-end: the backend (`notifyUser()`) sends `{type, jobId|consultationId}`. The mobile app suppresses the iOS native banner, renders its own animated overlay, and fans events out through `NotificationEventBus` so cubits stay decoupled. Token registration goes to `/profile/fcm-token` via `ProfileCubit`.

**`main.dart` — background handler + bootstrap:**

```dart
// Top-level: runs in its own isolate when a push arrives while backgrounded/terminated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(); // background isolate is cold — must re-init
  // Intentionally light: routing happens on tap (onMessageOpenedApp / getInitialMessage).
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');
  await Firebase.initializeApp();

  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  await _ensureAndroidNotificationChannel();
  await _initMessaging();

  runApp(const App());
}

// Channel MUST exist before the first push or Android silences heads-up display.
final _local = FlutterLocalNotificationsPlugin();
Future<void> _ensureAndroidNotificationChannel() async {
  const channel = AndroidNotificationChannel(
    'default_channel',
    'Notificaciones',
    importance: Importance.high,
  );
  await _local.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    ),
  );
  await _local
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);
}

Future<void> _initMessaging() async {
  final messaging = FirebaseMessaging.instance;

  // Prompt only when undecided.
  final settings = await messaging.getNotificationSettings();
  if (settings.authorizationStatus == AuthorizationStatus.notDetermined) {
    await messaging.requestPermission(alert: true, badge: true, sound: true);
  }

  // getAPNSToken is iOS/macOS-only — guard against Android MissingPluginException.
  try {
    final apns = await messaging.getAPNSToken(); // null until APNs registers
    if (apns == null) debugPrint('APNs token not ready yet');
  } catch (_) {
    // Android: plugin channel absent — expected, ignore.
  }

  // Suppress iOS native foreground banner; we draw our own overlay instead.
  await messaging.setForegroundNotificationPresentationOptions(
    alert: false, badge: true, sound: false,
  );

  // Register token with backend; keep it fresh on rotation.
  final token = await messaging.getToken();
  if (token != null) await ProfileCubit.updateFcmToken(token);
  messaging.onTokenRefresh.listen(ProfileCubit.updateFcmToken);

  // Foreground: dispatch to the bus (cubits + overlay banner react).
  FirebaseMessaging.onMessage.listen(_dispatchNotificationEvent);
  // Background tap: route to the relevant screen.
  FirebaseMessaging.onMessageOpenedApp.listen(_dispatchNotificationEvent);
  // Terminated tap: handle the launch message once.
  final initial = await messaging.getInitialMessage();
  if (initial != null) _dispatchNotificationEvent(initial);
}

// Maps the backend's data["type"] discriminator → typed bus events.
void _dispatchNotificationEvent(RemoteMessage m) {
  final type = m.data['type'] as String?;
  switch (type) {
    case 'analysis_complete':
      NotificationEventBus.instance.emit(
        AnalysisCompleteEvent(jobId: m.data['jobId'] as String));
      break;
    case 'new_consultation':
    case 'consultation_accepted':
    case 'consultation_completed':
    case 'consultation_expired':
    case 'consultation_cancelled':
    case 'new_message':
      NotificationEventBus.instance.emit(
        ConsultationEvent(type: type!, consultationId: m.data['consultationId'] as String));
      break;
  }
  // In foreground, also raise the custom overlay banner (AnimationController + SlideTransition).
}
```

**Token registration (`ProfileCubit.updateFcmToken`)** posts to the backend via the static `ApiService` (auto-injects the Firebase JWT). Backend stores it in `fcmTokens` on the user profile and fans out via `notifyUser()`:

```dart
static Future<void> updateFcmToken(String token) async {
  await ApiService.post('/profile/fcm-token', body: {'fcmToken': token});
}
```

**Custom overlay banner:** an `OverlayEntry` with an `AnimationController` + `SlideTransition` slides a Material 3 card in from the top, auto-dismisses after a few seconds, and on tap emits the same routing event. This replaces the suppressed iOS native banner and gives consistent cross-platform UX.

## Common mistakes

| Pitfall | Fix |
|---|---|
| Calling `getAPNSToken()` on Android | Wrap in `try/catch` — it throws `MissingPluginException`; only meaningful on iOS/macOS |
| Background handler is a class method / closure | Must be **top-level** with `@pragma('vm:entry-point')`, and call `Firebase.initializeApp()` inside |
| Expecting a banner from data-only messages while backgrounded | Render it yourself via `flutter_local_notifications` in the background handler |
| Using v16-19 positional `initialize(settings)` / `show(id, title, ...)` | v20+ requires **named** params: `initialize(settings: ...)`, `show(id:, title:, ...)` |
| Channel created after the first push, or id mismatch | Create the `Importance.high` channel at startup; channel id in `AndroidNotificationDetails` must equal the created channel's id |
| Changing channel importance and expecting it to apply | Android channel settings are immutable after first create — change the channel **id** (or reinstall) |
| Re-prompting permission after `denied` | iOS won't re-show the dialog; check `getNotificationSettings()` first and deep-link to OS Settings instead |
| iOS native banner + custom overlay both showing | `setForegroundNotificationPresentationOptions(alert: false)` to suppress the native one |
| Token not refreshed → silent delivery failure | Always also listen to `onTokenRefresh`, not just the one-time `getToken()` |
| Routing on `notification.title` | Route on `data['type']`; data-only messages have no `notification` object |
| Missing `POST_NOTIFICATIONS` on Android 13+ | `requestPermission()` triggers it; ensure `compileSdk`/manifest permission present |

## See also
- [firebase-auth.md](firebase-core-auth.md) — JWT used by `ApiService` and token-posting calls
- [state-management.md](state-management.md) — Cubit pattern (`ProfileCubit`), event-bus → cubit wiring
- [networking-http.md](networking-rest.md) — static `ApiService` envelope `{success, data, message}`
- [websockets.md](websockets-realtime.md) — the other realtime channel (chat); FCM covers push when WS is closed
- https://firebase.flutter.dev/docs/messaging/usage/ — FlutterFire messaging handlers & permission API
- https://pub.dev/packages/firebase_messaging — package page / API (v16.x; latest 16.4.0)
- https://pub.dev/packages/firebase_app_installations — installation ID API (v0.4.x; FCM-token vs install-ID distinction)
- https://pub.dev/packages/flutter_local_notifications/changelog — v20 named-param + v21 SDK-min breaking changes
- https://firebase.google.com/docs/cloud-messaging/concept-options — notification vs data payload delivery semantics
