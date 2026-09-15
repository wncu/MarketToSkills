# WebSockets & Realtime

## Overview
Realtime in Flutter means a persistent `WebSocketChannel` (`web_socket_channel ^3.0`) that streams JSON envelopes both ways. It matters for chat, live status, and presence — anything REST polling would be wasteful for. The hard parts are *not* the wire protocol: they are connection lifecycle (handshake, reconnect, app backgrounding), sharing one socket across screens, and not leaking subscriptions.

## Quick reference

| API / member | Type | Notes |
|---|---|---|
| `WebSocketChannel.connect(Uri)` | factory | Picks `IOWebSocketChannel` (mobile/desktop) or `HtmlWebSocketChannel` (web) automatically. Returns immediately — **does not block**. |
| `await channel.ready` | `Future<void>` | Completes when the handshake succeeds; throws `WebSocketChannelException` on failure. **Without it the channel looks open instantly even if the server rejected you.** |
| `channel.stream` | `Stream` | Single-subscription. `.listen(onData, onError:, onDone:, cancelOnError:)`. |
| `channel.sink.add(data)` | `void` | Send a frame. Pass `jsonEncode(map)` for JSON. |
| `channel.sink.close([code, reason])` | `Future` | Use `status.*` constants (`status.goingAway`, `status.normalClosure`). |
| `channel.closeCode` / `channel.closeReason` | `int?` / `String?` | Available after close. |
| `channel.protocol` | `String?` | Negotiated subprotocol. |
| `IOWebSocketChannel.connect(url, {protocols, headers, pingInterval, connectTimeout, customClient})` | factory | **mobile/desktop only** — lets you set auth headers + heartbeat `pingInterval`. `headers` is `Map<String, dynamic>?`. Not available on web. |
| `HtmlWebSocketChannel.connect(url, {protocols, binaryType})` | factory | **web only** — no `headers`/`pingInterval`/`connectTimeout`. `binaryType` (`BinaryType?`) picks blob vs arraybuffer for binary frames. |
| `WebSocketChannelException` | exception | Thrown by `ready`. Fields: `.message` (`String?`), `.inner` (`Object?` — the wrapped cause). |
| `import 'package:web_socket_channel/status.dart' as status;` | — | Close-code constants. |
| `AppLifecycleListener(onResume:, onPause:, onStateChange:)` | widget-less listener | Reconnect on `onResume`; remember `dispose()`. |
| `StreamController.broadcast()` | — | Fan one socket's messages out to many cubits. |

Add to `pubspec.yaml`:
```yaml
dependencies:
  web_socket_channel: ^3.0
```

## Connecting and the `ready` handshake

`WebSocketChannel.connect` returns synchronously and the channel *appears* usable immediately — but the TCP/TLS upgrade may still be in flight or may fail (bad token, 401, refused). **Always `await channel.ready`** so connection failures surface as exceptions instead of a silently-dead socket whose `stream` just calls `onDone` later.

```dart
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

Future<WebSocketChannel> openSocket(Uri url) async {
  final channel = WebSocketChannel.connect(url);
  try {
    // WHY: connect() never blocks. Without awaiting ready, a rejected
    // handshake looks like an open socket until onDone fires much later.
    await channel.ready;
  } on WebSocketChannelException catch (e) {
    // Handshake failed (e.g. 401, DNS, refused). Surface to caller.
    throw StateError('WS handshake failed: ${e.message}');
  }
  return channel;
}
```

Listening — handle all three callbacks. `stream` is **single-subscription**: you can only `.listen` once. To share, pump into a broadcast controller (see below).

```dart
final sub = channel.stream.listen(
  (raw) {
    final msg = jsonDecode(raw as String) as Map<String, dynamic>;
    _dispatch(msg);
  },
  onError: (e, st) => _scheduleReconnect(),   // network blip
  onDone: () => _scheduleReconnect(),         // server closed / dropped
  cancelOnError: false,                       // keep stream alive past a parse error
);
```

Sending and closing:

```dart
channel.sink.add(jsonEncode({'action': 'message', 'consultationId': id, 'message': text}));
await channel.sink.close(status.normalClosure); // 1000; goingAway = 1001
```

## Auth: query param vs headers

| Approach | Works on web? | Notes |
|---|---|---|
| `?token=<JWT>` query param | ✅ | The only portable way. Browsers' `WebSocket` API forbids custom headers, so query-param auth is the cross-platform default. Token ends up in server access logs — keep it short-lived. |
| `IOWebSocketChannel(headers: {...})` | ❌ (mobile/desktop only) | Cleaner (`Authorization: Bearer`) but unavailable on web. |

Query-param auth (portable — the reference app uses this) via `Uri.replace` so the scheme flips correctly:

```dart
Uri buildWsUri(String httpBase, String token) {
  final base = Uri.parse(httpBase); // e.g. https://api.example.com/development
  return base.replace(
    // WHY: ws over http, wss over https — must match origin's TLS.
    scheme: base.scheme == 'https' ? 'wss' : 'ws',
    queryParameters: {...base.queryParameters, 'token': token},
  );
}
```

Header auth (mobile/desktop only) — note the explicit `IOWebSocketChannel` import:

```dart
import 'package:web_socket_channel/io.dart';

final channel = IOWebSocketChannel.connect(
  Uri.parse('wss://api.example.com/development'),
  headers: {'Authorization': 'Bearer $jwt'}, // throws/ignored on web — guard with kIsWeb
  pingInterval: const Duration(seconds: 20), // server-driven heartbeat, see below
);
```

**Web vs mobile channel differences.** `WebSocketChannel.connect(uri)` is the portable entry point and dispatches to the right implementation, so prefer it unless you need platform-only params. Going direct to a subclass forks your code by platform:
- `IOWebSocketChannel.connect` (mobile/desktop) takes `protocols`, `headers`, `pingInterval`, `connectTimeout`, `customClient`.
- `HtmlWebSocketChannel.connect` (web) takes only `protocols` and `binaryType` — **no `headers`, no `pingInterval`, no `connectTimeout`**. The browser `WebSocket` API simply doesn't expose them, which is why query-param auth + an app-level heartbeat (below) are the cross-platform choice.

## JSON envelopes + action dispatch

Standardize every frame as `{ action, ...payload }` and route by `action`. Keep decoding defensive — a malformed frame must not kill the listener.

```dart
void _dispatch(Map<String, dynamic> msg) {
  switch (msg['action'] as String?) {
    case 'message':
      _events.add(ChatEvent.message(msg['consultationId'], msg['message']));
    case 'consultation_accepted':
      _events.add(ChatEvent.accepted(msg['consultationId']));
    case 'error':
      _events.add(ChatEvent.error(msg['error']?['message'] ?? 'Error'));
    default:
      // Unknown action — ignore, don't throw (forward compat with backend).
  }
}
```

## Reconnection: exponential backoff + jitter + max attempts

A dropped socket (`onDone`/`onError`) should reconnect with backoff so a flapping network or a restarting server doesn't hammer the backend. Cap attempts so a permanently-down server doesn't loop forever, and add jitter so N clients don't reconnect in lockstep.

```dart
import 'dart:async';
import 'dart:math';

const _baseBackoff = Duration(seconds: 1);
const _maxBackoff = Duration(seconds: 30);
const _maxReconnectAttempts = 8;

int _attempts = 0;
Timer? _reconnectTimer;
bool _manuallyClosed = false; // suppress reconnect on intentional disconnect

void _scheduleReconnect() {
  if (_manuallyClosed) return;
  if (_attempts >= _maxReconnectAttempts) {
    _status.add(WsStatus.failed); // give up — let UI show "reconnect" button
    return;
  }
  // Exponential: base * 2^attempt, clamped to max.
  final expMs = _baseBackoff.inMilliseconds * pow(2, _attempts).toInt();
  final cappedMs = min(expMs, _maxBackoff.inMilliseconds);
  // Full jitter: random in [0, capped] — avoids thundering-herd reconnects.
  final delayMs = Random().nextInt(cappedMs + 1);
  _attempts++;
  _reconnectTimer?.cancel();
  _reconnectTimer = Timer(Duration(milliseconds: delayMs), _connect);
}

// On a SUCCESSFUL ready handshake, reset the counter:
void _onConnected() {
  _attempts = 0;
  _status.add(WsStatus.connected);
}
```

## Reference counting: one socket, many screens

Multiple screens (chat list, chat detail) may need the same socket. Open it on the *first* `acquire()` and tear it down only on the *last* `release()`. This avoids N parallel sockets and avoids a screen closing the socket another screen still needs.

```dart
int _refCount = 0;

Future<void> acquire() async {
  _refCount++;
  if (_refCount == 1) {
    _manuallyClosed = false;
    await _connect(); // first consumer opens the socket
  }
}

void release() {
  if (_refCount == 0) return;
  _refCount--;
  if (_refCount == 0) {
    _disconnect(); // last consumer closes it
  }
}
```

## AppLifecycleListener: reconnect on resume

iOS/Android suspend sockets when the app backgrounds; the OS may silently drop the connection. Reconnect on `onResume`. `AppLifecycleListener` needs no widget — create it in your service and `dispose()` it.

```dart
import 'package:flutter/widgets.dart';

late final AppLifecycleListener _lifecycle;

void _initLifecycle() {
  _lifecycle = AppLifecycleListener(
    onResume: () {
      // WHY: backgrounding can silently kill the socket; reconnect when
      // the user comes back — but only if someone still needs it.
      if (_refCount > 0 && !_isConnected) {
        _attempts = 0; // resume is a fresh start, not a retry
        _connect();
      }
    },
  );
}

void disposeService() {
  _lifecycle.dispose(); // remove the WidgetsBinding observer
}
```

## Broadcast StreamControllers: fan out to cubits

`channel.stream` is single-subscription, but several cubits may want the same events. Pipe the socket into a `StreamController.broadcast()` and expose its `.stream`. Keep a second broadcast controller for connection status so the UI can show a "reconnecting…" banner.

```dart
final _events = StreamController<ChatEvent>.broadcast();
final _status = StreamController<WsStatus>.broadcast();

Stream<ChatEvent> get events => _events.stream;   // many cubits subscribe
Stream<WsStatus> get status => _status.stream;
```

A cubit subscribes and **must cancel** in `close()`:

```dart
class ChatCubit extends Cubit<ChatState> {
  ChatCubit(this._ws) : super(const ChatState.initial()) {
    _ws.acquire();
    _sub = _ws.events.listen(_onEvent); // broadcast: safe to have many
  }
  final ConsultationWebSocketService _ws;
  late final StreamSubscription _sub;

  @override
  Future<void> close() {
    _sub.cancel();  // WHY: leaked sub keeps cubit alive + double-handles events
    _ws.release();  // drop our ref so the socket can close
    return super.close();
  }
}
```

## Heartbeat / ping

Idle TCP connections get reaped by NAT/load balancers. Two options:
- **Mobile/desktop:** pass `pingInterval:` to `IOWebSocketChannel.connect` — the runtime sends protocol-level pings automatically. Simplest.
- **Cross-platform / app-level:** send a `{'action': 'ping'}` envelope on a `Timer.periodic` and treat a missing `pong` within a window as a dead socket (force reconnect). Needed on web (no `pingInterval`).

```dart
Timer? _heartbeat;
void _startHeartbeat() {
  _heartbeat = Timer.periodic(const Duration(seconds: 25), (_) {
    if (_isConnected) channel.sink.add(jsonEncode({'action': 'ping'}));
  });
}
```

## Real-world usage

A production app's WebSocket (`wss://your-api.example.com/<stage>`) carries patient↔doctor chat. The mobile app uses a **singleton `ConsultationWebSocketService`** with ref-counting, backoff reconnect, lifecycle-aware resume, and broadcast fan-out — the canonical pattern for this codebase.

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as ws_status;

enum WsStatus { disconnected, connecting, connected, failed }

class ConsultationWebSocketService {
  ConsultationWebSocketService._() {
    _lifecycle = AppLifecycleListener(onResume: _onResume);
  }
  // Singleton — every screen/cubit shares this one socket.
  static final ConsultationWebSocketService instance =
      ConsultationWebSocketService._();

  static const _wsBase =
      'wss://your-api.example.com/<stage>';
  static const _baseBackoff = Duration(seconds: 1);
  static const _maxBackoff = Duration(seconds: 30);
  static const _maxReconnectAttempts = 8;

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  late final AppLifecycleListener _lifecycle;
  Timer? _reconnectTimer;

  int _refCount = 0;
  int _attempts = 0;
  bool _manuallyClosed = false;
  bool _isConnected = false;
  String? _token;

  final _events = StreamController<Map<String, dynamic>>.broadcast();
  final _status = StreamController<WsStatus>.broadcast();
  Stream<Map<String, dynamic>> get events => _events.stream;
  Stream<WsStatus> get status => _status.stream;

  // ---- ref counting: first acquire connects, last release disconnects ----
  Future<void> acquire(String jwt) async {
    _token = jwt;
    _refCount++;
    if (_refCount == 1) {
      _manuallyClosed = false;
      await _connect();
    }
  }

  void release() {
    if (_refCount == 0) return;
    _refCount--;
    if (_refCount == 0) _disconnect();
  }

  Future<void> _connect() async {
    if (_token == null) return;
    _status.add(WsStatus.connecting);

    // Uri.replace keeps the path + adds ?token=JWT; scheme already wss.
    final uri = Uri.parse(_wsBase).replace(
      queryParameters: {'token': _token!},
    );
    final channel = WebSocketChannel.connect(uri);
    try {
      await channel.ready; // WHY: AppSync/API-GW rejects bad tokens here, not later.
    } catch (_) {
      _isConnected = false;
      _scheduleReconnect();
      return;
    }

    _channel = channel;
    _isConnected = true;
    _attempts = 0; // reset backoff on a clean handshake
    _status.add(WsStatus.connected);

    _sub = channel.stream.listen(
      (raw) {
        try {
          _events.add(jsonDecode(raw as String) as Map<String, dynamic>);
        } catch (_) {/* drop malformed frame, keep stream alive */}
      },
      onError: (_) => _onDrop(),
      onDone: _onDrop,
      cancelOnError: false,
    );
  }

  void _onDrop() {
    _isConnected = false;
    _status.add(WsStatus.disconnected);
    _sub?.cancel();
    if (!_manuallyClosed && _refCount > 0) _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_manuallyClosed || _refCount == 0) return;
    if (_attempts >= _maxReconnectAttempts) {
      _status.add(WsStatus.failed);
      return;
    }
    final expMs = _baseBackoff.inMilliseconds * pow(2, _attempts).toInt();
    final cappedMs = min(expMs, _maxBackoff.inMilliseconds);
    final delayMs = Random().nextInt(cappedMs + 1); // full jitter
    _attempts++;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(milliseconds: delayMs), _connect);
  }

  void _onResume() {
    // Resume: socket may have been silently dropped while backgrounded.
    if (_refCount > 0 && !_isConnected) {
      _attempts = 0;
      _connect();
    }
  }

  // Send a chat message: { action: "message", consultationId, message }.
  void sendMessage(String consultationId, String message) {
    _channel?.sink.add(jsonEncode({
      'action': 'message',
      'consultationId': consultationId,
      'message': message,
    }));
  }

  void _disconnect() {
    _manuallyClosed = true;
    _reconnectTimer?.cancel();
    _sub?.cancel();
    _channel?.sink.close(ws_status.normalClosure);
    _channel = null;
    _isConnected = false;
    _status.add(WsStatus.disconnected);
  }

  // Logout: kill the socket regardless of ref count + clear token.
  void forceDisconnectAndReset() {
    _refCount = 0;
    _attempts = 0;
    _token = null;
    _disconnect();
  }
}
```

Usage from a chat cubit (mirrors the cubit pattern above):

```dart
// On entering the chat screen:
await ConsultationWebSocketService.instance.acquire(await user.getIdToken());
_sub = ConsultationWebSocketService.instance.events.listen(_onWsEvent);

// On leaving:
_sub.cancel();
ConsultationWebSocketService.instance.release();

// On logout (auth bloc):
ConsultationWebSocketService.instance.forceDisconnectAndReset();
```

Notes specific to the reference app:
- **Auth is query-param only** (`?token=JWT`) — works on web and matches the API Gateway `$connect` authorizer (`?token=` query). The JWT comes from `FirebaseAuth.instance.currentUser?.getIdToken()`; refresh it before each `acquire` since tokens expire ~1h.
- **`forceDisconnectAndReset()` on logout** is mandatory — otherwise a backgrounded reconnect could fire with a stale token after the user signed out.
- The doctor **auto-accepts** a consultation on their first `{action:"message"}` (backend conditional update). The client just sends the envelope; the `consultation_accepted` event arrives back over the same socket.
- Pair this with the `NotificationEventBus` (FCM) for events that arrive while the socket is closed — see [firebase-messaging.md](firebase-messaging-fcm.md).

## Common mistakes

| Pitfall | Fix |
|---|---|
| Not `await`-ing `channel.ready` | Always await it; a rejected handshake otherwise looks open until `onDone` fires later. |
| Custom headers on web | Web `WebSocket` forbids headers → use `?token=` query param for cross-platform auth. |
| Subscribing to `channel.stream` twice | It's single-subscription. Pump into a `StreamController.broadcast()` and let cubits subscribe to that. |
| Leaking `StreamSubscription` in cubits | `cancel()` in `Cubit.close()`; a live sub keeps the cubit (and socket) alive and double-handles events. |
| Reconnect loop with no cap / no jitter | Cap with `_maxReconnectAttempts`, add full jitter `Random().nextInt(capped)` to avoid thundering herd. |
| Each screen opening its own socket | Ref-count `acquire()`/`release()`; open on first, close on last. |
| Not reconnecting after background | `AppLifecycleListener(onResume:)` → reconnect if `_refCount > 0 && !_isConnected`. |
| Socket survives logout with stale JWT | `forceDisconnectAndReset()` zeroes ref count, clears token, suppresses reconnect. |
| Forgetting `_manuallyClosed` flag | Intentional `close()` triggers `onDone` → reconnect storm. Guard reconnect with the flag. |
| `dispose()` the channel but not the `AppLifecycleListener` | Call `_lifecycle.dispose()` too, or the `WidgetsBinding` observer leaks. |
| Using a hardcoded `Uri` scheme | Use `Uri.replace(scheme: https→wss / http→ws)` so dev/prev/prod origins flip TLS correctly. |
| Throwing on an unknown `action` | Default-case ignore unknown actions for forward-compat with backend additions. |

## See also
- [state-management.md](state-management.md) — Cubit lifecycle, `close()`, subscription cleanup
- [firebase-messaging.md](firebase-messaging-fcm.md) — FCM for events while the socket is closed; `NotificationEventBus`
- [networking-http.md](networking-rest.md) — `ApiService` JWT injection (same Firebase `getIdToken`)
- [web_socket_channel ^3.x](https://pub.dev/packages/web_socket_channel) (pub.dev, v3.0.3)
- [Flutter cookbook: WebSockets](https://docs.flutter.dev/cookbook/networking/web-sockets)
- [IOWebSocketChannel.connect API](https://pub.dev/documentation/web_socket_channel/latest/io/IOWebSocketChannel/IOWebSocketChannel.connect.html)
- [HtmlWebSocketChannel API](https://pub.dev/documentation/web_socket_channel/latest/html/HtmlWebSocketChannel-class.html) (web-only constructor params)
- [WebSocketChannelException API](https://pub.dev/documentation/web_socket_channel/latest/web_socket_channel/WebSocketChannelException-class.html) (`.message`, `.inner`)
- [AppLifecycleListener API](https://api.flutter.dev/flutter/widgets/AppLifecycleListener-class.html)
- Server-side API Gateway WebSocket routes (`$connect` JWT auth via `?token=`, `$disconnect`, `message`) — backend-owned; see `aws-backend/docs/WEBSOCKET_ARCHITECTURE.md`.
