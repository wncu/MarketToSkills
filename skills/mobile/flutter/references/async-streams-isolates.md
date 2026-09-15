# Async, Streams, Isolates & App Lifecycle

## Overview
`dart:async` is Dart's concurrency core: `Future` for one-shot async values, `Stream` for multi-value pushes, plus `Timer`, microtasks, and zones. Dart is single-threaded per isolate with an event loop — heavy CPU work blocks the UI unless pushed to another isolate via `compute()`. App lifecycle hooks (`AppLifecycleListener`, `WidgetsBindingObserver`) tell you when to reconnect sockets / pause timers. This file is the reference for everything in a production Flutter app that listens, schedules, debounces, reconnects, or runs off the main thread.

## Quick reference

| API | Purpose | Key signature / note |
|---|---|---|
| `Future<T>` | single async value | `await f`, `f.then(...).catchError(...)` |
| `Future.wait([...])` | all complete (or first error) | `eagerError: true` to fail fast; result is `List` |
| `Future.any([...])` | first to complete (value or error) wins | returns single `T` |
| `Future.delayed(d, [cb])` | resolve after duration | timer-backed; cancel by holding nothing — use `Timer` to cancel |
| `unawaited(future)` | fire-and-forget without lint | exported by `dart:async` (since Dart 2.15); `void unawaited(Future<void>?)`; suppresses `unawaited_futures` |
| `scheduleMicrotask(cb)` | run before next event | microtask queue drains fully before event queue |
| `Stream<T>` | multi-value async | single-subscription by default |
| `stream.listen(onData, {onError, onDone, cancelOnError})` | subscribe | returns `StreamSubscription` |
| `StreamController<T>()` | push into a single-sub stream | `.add`, `.addError`, `.close`, `.stream`, `.sink` |
| `StreamController<T>.broadcast()` | multi-listener | events fire whether or not anyone listens |
| `async* { yield x; }` | generator stream | `yield*` forwards a sub-stream |
| `StreamTransformer` / `.transform()` | map/filter/buffer events | also `.map`, `.where`, `.asyncMap`, `.distinct` |
| `Stream.periodic(d, [cb])` | tick stream | infinite; pair with `.take(n)` or cancel sub |
| `StreamSubscription` | handle | `.cancel()`, `.pause()`, `.resume()`, `.onData(...)` |
| `Timer(d, cb)` / `Timer.periodic(d, cb)` | one-shot / repeating | `.cancel()`, `.isActive` |
| `compute(fn, msg)` | run `fn` on a worker isolate | `fn` must be top-level/static; msg+result must be sendable |
| `AppLifecycleListener(...)` | lifecycle callbacks (Flutter 3.13+) | `onResume`, `onPause`, `onHide`, `onShow`, `onInactive`, `onDetach`, `onRestart`, `onStateChange`, `onExitRequested`; call `.dispose()` |
| `WidgetsBindingObserver` | lifecycle via mixin | `didChangeAppLifecycleState(AppLifecycleState)` |

## Future + async/await

```dart
// async marks the function; await unwraps a Future without blocking the isolate.
Future<UserProfile> loadProfile() async {
  final res = await ApiService.get('/patient/profile'); // suspends, event loop keeps running
  return UserProfile.fromJson(res['data'] as Map<String, dynamic>);
}
```

An `async` function ALWAYS returns a `Future` (even `Future<void>`). The body runs synchronously up to the first `await`, then yields to the event loop.

### Future.wait / Future.any
```dart
// Parallel fan-out: kick off all requests, then await together.
// WHY: 3 sequential awaits = sum of latencies; Future.wait = max latency.
final results = await Future.wait([
  ApiService.get('/patient/jobs'),
  ApiService.get('/patient/clinics?query=san'),
  ApiService.get('/patient/profile'),
]);
final jobs = results[0], clinics = results[1], profile = results[2];

// eagerError: surface the first failure immediately instead of waiting for the rest.
await Future.wait([a(), b()], eagerError: true);

// Future.any: first settled wins — useful for a timeout race.
final data = await Future.any([
  ApiService.get('/slow-endpoint'),
  Future.delayed(const Duration(seconds: 8))
      .then((_) => throw TimeoutException('Tardó demasiado')),
]);
```
`Future.wait` returns a `List` in input order. If any future errors (and `eagerError` is false), the combined future errors only after ALL complete — so unhandled errors in the others can still surface. Prefer per-future `.catchError` when you need partial results.

### Error handling in async
```dart
Future<void> submit() async {
  try {
    await ApiService.post('/patient/analyze', body);
  } on FirebaseAuthException catch (e) {
    // Typed catch first — narrowest wins.
    emit(state.copyWith(status: FormzSubmissionStatus.failure, error: e.message));
  } on TimeoutException {
    emit(state.copyWith(status: FormzSubmissionStatus.failure, error: 'Sin conexión'));
  } catch (e, st) {
    // Always capture the stack trace (2nd param) for logging.
    debugPrintStack(stackTrace: st);
    rethrow;
  } finally {
    // finally runs whether or not it threw — clean up here.
  }
}
```
`.then/.catchError` is the callback equivalent; prefer `try/await` for readability. A `Future` error with NO handler (no `await` in a `try`, no `.catchError`, not `unawaited`) becomes an uncaught async error reported to `FlutterError.onError` / the zone.

### Microtask vs event queue
Dart's event loop drains **all** microtasks before pulling the next **event**.

| Queue | Scheduled by | Drains |
|---|---|---|
| Microtask | `scheduleMicrotask`, `Future.value`/resolved `.then`, completing a completer | Fully, before any event |
| Event | `Timer`, `Future.delayed`, I/O, gesture/UI events, `Stream` events | One at a time |

```dart
scheduleMicrotask(() => print('A')); // microtask
Future(() => print('B'));            // event (Timer.run under the hood)
Future.microtask(() => print('C')); // microtask
print('sync');
// Output: sync, A, C, B  — microtasks (A,C) jump ahead of the event (B).
```
Don't starve the event loop: an unbounded chain of microtasks (e.g. recursive `scheduleMicrotask`) freezes rendering. Use `Timer`/`Future.delayed(Duration.zero)` to yield to events instead.

## Streams

### Single-subscription vs broadcast
- **Single-subscription** (default from `StreamController()`, `async*`, `http` byte streams): exactly one `listen()` for the stream's lifetime; buffers events until listened. Re-listening throws.
- **Broadcast** (`StreamController.broadcast()`, `.asBroadcastStream()`): any number of listeners; **fires events whether or not anyone is listening** — late subscribers miss earlier events.

```dart
// Single-sub controller: backs one consumer (e.g. a Bloc transformer source).
final ctrl = StreamController<int>();

// Broadcast: an app-wide event bus many cubits subscribe to.
final bus = StreamController<NotificationEvent>.broadcast();
```

### StreamController + StreamSubscription
```dart
final controller = StreamController<String>(
  onListen: () => debugPrint('first listener attached'),
  onCancel: () => debugPrint('last listener gone'),
);

final sub = controller.stream.listen(
  (data) => debugPrint('onData: $data'),
  onError: (Object e, StackTrace st) => debugPrint('onError: $e'),
  onDone: () => debugPrint('onDone (stream closed)'),
  cancelOnError: false, // keep listening after an error event
);

controller.add('hola');          // -> onData
controller.addError(Exception()); // -> onError (does NOT close the stream)
await controller.close();         // -> onDone, frees resources

await sub.cancel(); // ALWAYS cancel in dispose() to stop the callback + release the listener
```
`controller.sink` is the write end you hand to producers; `controller.stream` is the read end. `close()` is required to fire `onDone` and let `await for` loops finish. A `StreamSubscription` can also be `.pause()`/`.resume()`d.

**Pause semantics differ by stream type:** on a **single-subscription** stream, pausing applies backpressure — the source is asked to stop and events buffer until you resume. On a **broadcast** stream, pause is best-effort and does NOT buffer for that listener: the controller keeps firing to its other listeners, and a paused broadcast subscription **silently drops** the events delivered while paused (they are not replayed on resume). Don't rely on `pause()` for flow control on broadcast streams; if you need every event, keep the listener active or fan into a single-sub buffer.

### async* / yield
```dart
// Generator stream — pauses between yields with backpressure (respects listener pause).
Stream<int> countdown(int from) async* {
  for (var i = from; i >= 0; i--) {
    await Future.delayed(const Duration(seconds: 1));
    yield i;          // emit one event
  }
  // yield* anotherStream;  // splice in all events of a sub-stream
}
```

### StreamTransformer & combinators
```dart
// Built-in transformers (lazy, chainable):
controller.stream
    .where((e) => e.isNotEmpty)        // filter
    .map((e) => e.trim())              // sync transform
    .asyncMap((e) => _enrich(e))       // async transform (awaits each)
    .distinct()                        // drop consecutive duplicates
    .listen(handle);

// Custom transformer for buffering/debounce-like logic:
final debounced = StreamTransformer<String, String>.fromBind(
  (s) => s.transform(_DebounceTransformer(const Duration(milliseconds: 300))),
);
```
There's no built-in `merge`/`combineLatest` in `dart:async` — for those reach for `package:rxdart` (`Rx.merge`, `Rx.combineLatest2`) or a broadcast `StreamController` you feed from multiple sources. The reference app keeps it dependency-light by using a broadcast controller (the `NotificationEventBus`).

### Stream.periodic
```dart
// Infinite tick stream — only emits while listened (single-sub).
final ticker = Stream.periodic(const Duration(seconds: 1), (count) => count)
    .take(60); // bound it, else it never completes
final sub = ticker.listen((s) => debugPrint('tick $s'));
```

## Timers, delays & debounce

```dart
final t = Timer(const Duration(seconds: 5), () => doThing());
final repeating = Timer.periodic(const Duration(seconds: 30), (timer) {
  if (shouldStop) timer.cancel(); // the callback receives the Timer itself
  else poll();
});
t.cancel();              // cancel before fire
debugPrint('${t.isActive}');
```

### Debounce pattern (type-ahead clinic search)
```dart
class ClinicSearchCubit extends Cubit<ClinicSearchState> {
  ClinicSearchCubit() : super(const ClinicSearchState());
  Timer? _debounce;

  void onQueryChanged(String q) {
    _debounce?.cancel(); // restart the clock on every keystroke
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _search(q);        // WHY: one request after the user stops typing, not per char
    });
  }

  Future<void> _search(String q) async {
    final res = await ApiService.get('/patient/clinics?query=$q');
    emit(state.copyWith(results: ClinicList.fromJson(res['data'])));
  }

  @override
  Future<void> close() {
    _debounce?.cancel(); // MUST cancel — a pending Timer fires after close() otherwise
    return super.close();
  }
}
```

## Isolates & compute()

The UI runs on the **main (root) isolate**. Any synchronous CPU-bound loop on it blocks frame rendering → jank. Offload to a worker isolate with `compute()`.

```dart
import 'package:flutter/foundation.dart';

// Callback MUST be top-level or static (it's sent to another isolate by reference name).
// Message + return value must be sendable (primitives, List/Map, TransferableTypedData...).
List<LatLng> _decodeClusters(String rawJson) {
  final data = jsonDecode(rawJson) as List; // heavy parse off the UI thread
  return data.map((e) => LatLng(e['lat'], e['lng'])).toList();
}

Future<List<LatLng>> parseClinics(String body) =>
    compute(_decodeClusters, body); // spins up an isolate, runs fn, returns result, tears down
```

**When to use `compute()`:** large JSON decode, image byte manipulation, crypto, big geo computations. **When NOT to:** anything touching `BuildContext`, plugins, Firebase, or platform channels — those only work on the root isolate. Network `await` does NOT block the UI (the event loop handles it), so don't isolate I/O; isolate the *parsing* if it's large.

### Isolate.run (Dart 2.19+) — closures allowed
`compute()` requires a top-level/static function. `Isolate.run` (from `dart:isolate`) runs a **closure** on a fresh isolate, so it can capture local variables — handy when the work depends on locals you'd otherwise have to bundle into the message.

```dart
import 'dart:isolate';

Future<List<LatLng>> parseClinics(String body) {
  // Closure captures `body`; runs on a throwaway isolate, returns the result, tears down.
  return Isolate.run(() {
    final data = jsonDecode(body) as List;
    return data.map((e) => LatLng(e['lat'], e['lng'])).toList();
  });
}
```

Same sendability rules apply (return value must be copyable across isolates), and the captured variables must themselves be sendable. `Isolate.run` is the lower-ceremony, modern default; `compute()` remains fine and is the Flutter-blessed wrapper.

## App lifecycle

### AppLifecycleListener (preferred, Flutter 3.13+)
Granular callbacks, no widget mixin required — ideal inside a singleton service.

```dart
class WsService {
  AppLifecycleListener? _lifecycle;

  void _initLifecycle() {
    _lifecycle = AppLifecycleListener(
      onResume: _reconnect,                 // app returned to foreground & has focus
      onPause: _pauseHeartbeat,             // backgrounded (Android onPause / iOS resign)
      onDetach: dispose,                    // engine detaching — last chance to clean up
      onStateChange: (s) => debugPrint('lifecycle: $s'),
    );
  }

  void dispose() {
    _lifecycle?.dispose(); // removes the binding observer it registered
  }
}
```

`AppLifecycleState`: `detached` → `resumed` → `inactive` → `hidden` → `paused`. `onResume` fires on the transition into `resumed`; `onPause` on entering `paused`. `onHide`/`onShow` bracket `hidden`. `onExitRequested` (desktop) lets you veto exit by returning `AppExitResponse.cancel`.

### WidgetsBindingObserver (mixin alternative)
```dart
class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) WsService.instance.reconnectIfNeeded();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this); // ALWAYS remove or you leak + double-fire
    super.dispose();
  }
}
```
Use the mixin when the lifecycle concern is scoped to a widget; use `AppLifecycleListener` for app-wide services.

## Real-world usage

### WebSocket singleton: broadcast controllers + lifecycle reconnect + backoff Timer
The realtime service (`lib/core/services/ws_service.dart`-style) uses `web_socket_channel ^3.0`. It exposes two broadcast streams (events + connection status), reconnects on `onResume`, and backs off exponentially with a `Timer`.

```dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as ws_status;

enum WsConnState { disconnected, connecting, connected }

class WsService {
  WsService._();
  static final WsService instance = WsService._(); // singleton

  // Broadcast: cubits/screens subscribe independently; service has no idea who listens.
  final _events = StreamController<Map<String, dynamic>>.broadcast();
  final _status = StreamController<WsConnState>.broadcast();
  Stream<Map<String, dynamic>> get events => _events.stream;
  Stream<WsConnState> get status => _status.stream;

  WebSocketChannel? _channel;
  StreamSubscription? _channelSub;
  AppLifecycleListener? _lifecycle;
  Timer? _backoffTimer;
  int _attempt = 0;
  int _refCount = 0; // acquire()/release() reference counting

  static const _base = 'wss://your-api.example.com/<stage>';

  /// Screens call acquire() in initState, release() in dispose.
  Future<void> acquire() async {
    _refCount++;
    _lifecycle ??= AppLifecycleListener(onResume: _reconnect); // reconnect on foreground
    if (_refCount == 1) await _connect();
  }

  void release() {
    if (--_refCount <= 0) {
      _refCount = 0;
      _teardown(); // last consumer gone → close socket, free resources
    }
  }

  Future<void> _connect() async {
    _status.add(WsConnState.connecting);
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      _channel = WebSocketChannel.connect(Uri.parse('$_base?token=$token'));
      await _channel!.ready; // 3.0 handshake — throws on connect failure
      _attempt = 0;          // reset backoff on success
      _status.add(WsConnState.connected);

      _channelSub = _channel!.stream.listen(
        (raw) => _events.add(jsonDecode(raw as String) as Map<String, dynamic>),
        onError: (Object e) => _scheduleReconnect(),
        onDone: _scheduleReconnect, // server/network dropped us
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_refCount == 0) return; // nobody cares anymore
    _status.add(WsConnState.disconnected);
    _backoffTimer?.cancel();
    // Exponential backoff capped at 30s: 1,2,4,8,16,30,30...
    final delay = Duration(seconds: (1 << _attempt).clamp(1, 30));
    _attempt = (_attempt + 1).clamp(0, 5);
    _backoffTimer = Timer(delay, _connect);
  }

  Future<void> _reconnect() async {
    if (_refCount > 0 && _channel == null) await _connect();
  }

  void send(Map<String, dynamic> msg) => _channel?.sink.add(jsonEncode(msg));

  Future<void> _teardown() async {
    _backoffTimer?.cancel();
    await _channelSub?.cancel();
    await _channel?.sink.close(ws_status.goingAway);
    _channel = null;
    _status.add(WsConnState.disconnected);
  }

  Future<void> dispose() async {
    await _teardown();
    _lifecycle?.dispose();
    await _events.close();
    await _status.close();
  }
}
```

### unawaited() for fire-and-forget push init
```dart
import 'dart:async'; // exports unawaited

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // WHY: FCM token registration must not block first frame; we don't await it,
  // but unawaited() documents intent and silences `unawaited_futures` lint.
  unawaited(_initPush());

  runApp(const MyApp());
}

Future<void> _initPush() async {
  await FirebaseMessaging.instance.requestPermission();
  final token = await FirebaseMessaging.instance.getToken();
  if (token != null) await ApiService.post('/patient/device-token', {'token': token});
}
```

### NotificationEventBus: broadcast bus decoupling FCM from cubits
```dart
class NotificationEventBus {
  NotificationEventBus._();
  static final NotificationEventBus instance = NotificationEventBus._();
  final _ctrl = StreamController<NotificationEvent>.broadcast();
  Stream<NotificationEvent> get stream => _ctrl.stream;

  // FCM onMessage handler pushes here; ConsultationCubit / banner overlay listen.
  void emit(NotificationEvent e) => _ctrl.add(e);
  void dispose() => _ctrl.close();
}
```

### Cancelling subscriptions in dispose (Cubit/Bloc + State)
```dart
class ChatCubit extends Cubit<ChatState> {
  ChatCubit() : super(const ChatState()) {
    _sub = WsService.instance.events
        .where((e) => e['type'] == 'new_message')      // filter on the stream
        .listen((e) => emit(state.copyWith(messages: [...state.messages, Message.fromJson(e)])));
  }
  late final StreamSubscription _sub;

  @override
  Future<void> close() {
    _sub.cancel();          // STOP the callback before the cubit is gone
    return super.close();
  }
}
```

## Common mistakes

| Pitfall | Fix |
|---|---|
| `StreamSubscription` never cancelled → memory leak + setState-after-dispose | `_sub.cancel()` in `dispose()`/`close()`; store every sub |
| Calling `listen()` twice on a single-subscription stream → throws | Use `.broadcast()` controller or `.asBroadcastStream()` |
| Broadcast stream listener attached late, misses earlier events | Replay last value yourself, or use `BehaviorSubject` (rxdart) |
| Forgetting `await controller.close()` → `onDone`/`await for` never fires | Close controllers in teardown; close before disposing owner |
| `compute()` callback is a closure/instance method → "Illegal argument in isolate message" | Make it top-level or `static`; pass only sendable data |
| Heavy `jsonDecode` on UI isolate → dropped frames | `compute(parseFn, body)` for large payloads only (not network I/O) |
| `Timer.periodic` keeps firing after screen closed | `timer.cancel()` in `dispose`; null-check the field |
| Debounce `Timer` fires after `close()` → emit on closed cubit | `_debounce?.cancel()` in `close()` |
| Unawaited Future throws → uncaught async error / silent failure | `await` it, add `.catchError`, or wrap with `unawaited()` only when truly fire-and-forget |
| `WidgetsBindingObserver` added but not removed → double callbacks + leak | `removeObserver(this)` in `dispose()` |
| Assuming `Future.wait` errors are caught per-future | They aren't; non-first failures may surface late. Wrap each future or use `eagerError` |
| Recursive `scheduleMicrotask` starves rendering | Yield with `Timer`/`Future.delayed(Duration.zero)` |
| `await channel.ready` skipped → first `sink.add` lost on slow connect | Always `await channel.ready` (web_socket_channel 3.x) before sending |

## See also
- [state-management.md](state-management.md) — Cubit/Bloc lifecycle, where subscriptions live and get cancelled
- [networking-http.md](networking-rest.md) — `ApiService` static client, Firebase JWT injection, `{success,data,message}` envelope
- [firebase-auth-messaging.md](firebase-core-auth.md) — `authStateChanges`/`userChanges` streams, FCM background handler, `NotificationEventBus`
- [websockets-realtime.md](websockets-realtime.md) — full WS singleton, acquire/release ref counting, reconnect details
- Dart streams tour: https://dart.dev/libraries/async/using-streams
- Dart futures / error handling: https://dart.dev/libraries/async/async-await
- Isolates / concurrency: https://dart.dev/language/concurrency
- AppLifecycleListener: https://api.flutter.dev/flutter/widgets/AppLifecycleListener-class.html
- web_socket_channel (`ready`, `connect`): https://pub.dev/packages/web_socket_channel
