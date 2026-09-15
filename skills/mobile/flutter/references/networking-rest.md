# Networking & REST

## Overview
HTTP/JSON access for a production Flutter mobile app. The app talks to one AWS API Gateway REST
backend over `package:http`, wrapped in a single static `ApiService` that injects the Firebase
JWT. Every response is the same envelope `{ success, data, message }`, parsed defensively into
immutable Equatable models. This file is the canonical pattern for any new service class.

## Quick reference

| API | Signature / use |
|---|---|
| `http.get(uri, {headers})` | GET; no body (per HTTP spec, http ignores GET bodies) |
| `http.post(uri, {headers, body, encoding})` | body = `String` (jsonEncode) or `Map<String,String>` (form) |
| `http.put` / `http.patch` / `http.delete(uri, {headers, body, encoding})` | same shape as post |
| `response.statusCode` | `int` — check `>= 200 && < 300` |
| `response.body` | `String` (decoded with `response.headers` charset, default utf-8) |
| `response.bodyBytes` | `Uint8List` — use for binary / explicit `utf8.decode` |
| `response.headers` | `Map<String,String>` (lowercased keys) |
| `Uri.parse(s)` | parse base+endpoint |
| `Uri.parse(s).replace(queryParameters: {...})` | attach query string (values must be `String`/`Iterable<String>`) |
| `jsonEncode(obj)` / `jsonDecode(str)` | `dart:convert` — Map/List ↔ String |
| `future.timeout(Duration, {onTimeout})` | `dart:async` — wrap any request future |
| `ApiService.get/post/patch/put/delete(endpoint, {body})` | app wrapper, auto Bearer token |
| `ApiService.postUnauthenticated(endpoint, {body})` | public routes (webhooks, social-complete) |
| `ApiService.extractErrorMessage(body, [fallback])` | pull human message out of error envelope |

`http ^1.6` · `dart:convert` (jsonEncode/jsonDecode) · `dart:async` (timeout).

## Making requests with `package:http`

Top-level functions open and close a one-shot client per call — fine for low-frequency mobile
traffic. Always send a `String` body for JSON and set `Content-Type: application/json`; if you
pass a `Map`, http form-encodes it instead.

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

final uri = Uri.parse('https://api.example.com/patient/analyze');

final res = await http.post(
  uri,
  headers: {'Content-Type': 'application/json'},
  // WHY jsonEncode: a String body is sent verbatim; a Map would be form-encoded.
  body: jsonEncode({'imageKeys': ['a.jpg', 'b.jpg'], 'patientId': 'p1'}),
);

if (res.statusCode >= 200 && res.statusCode < 300) {
  final data = jsonDecode(res.body);
}
```

### Query params via `Uri.replace`
Never hand-concatenate query strings — `replace(queryParameters:)` percent-encodes for you.
Values must be strings, so stringify numbers/bools first.

```dart
final uri = Uri.parse('$baseUrl/doctor/consultations').replace(
  queryParameters: {
    'status': 'PENDING',
    'limit': '20',              // WHY: queryParameters rejects non-String values
    if (after != null) 'after': after, // omit nulls so they don't become "null"
  },
);
final res = await http.get(uri, headers: headers);
```

### Timeouts
http has no built-in timeout; use the `Future.timeout` extension from `dart:async`.

```dart
import 'dart:async';

try {
  final res = await http
      .get(uri, headers: headers)
      .timeout(const Duration(seconds: 20));
} on TimeoutException {
  throw Exception('La solicitud tardó demasiado. Revisa tu conexión.');
}
```

### File upload (presigned S3 PUT — the reference pattern)
The reference app does **not** multipart-POST images to API Gateway. `POST /patient/upload` returns a
presigned S3 URL per image; the app then `http.put`s the **raw bytes** straight to S3 with the
exact `Content-Type` the presign was signed for (mismatched type → 403 `SignatureDoesNotMatch`).
No `Authorization` header on the S3 PUT — the signature is in the URL.

```dart
import 'package:image_picker/image_picker.dart';

final picked = await ImagePicker().pickImage(source: ImageSource.camera);
final bytes = await picked!.readAsBytes();

// presignedUrl + the Content-Type returned by /patient/upload for this key
final res = await http.put(
  Uri.parse(presignedUrl),
  headers: {'Content-Type': 'image/jpeg'}, // MUST match what was signed
  body: bytes,                              // raw Uint8List, not jsonEncode
);
if (res.statusCode != 200) {
  throw Exception('Fallo al subir la imagen (${res.statusCode})');
}
```

For a generic multipart endpoint (not used by the reference app), `http.MultipartRequest` is the tool:
`final req = http.MultipartRequest('POST', uri)..files.add(await http.MultipartFile.fromPath('file', path)); final streamed = await req.send();` — note `send()` returns a `StreamedResponse`;
use `http.Response.fromStream(streamed)` to read `.body`.

## JSON: encode / decode / models

`jsonDecode` returns `dynamic` (`Map<String,dynamic>`, `List<dynamic>`, `String`, `num`, `bool`,
`null`). Treat it as untrusted: type-check before casting. The house pattern is a manual
`fromJson` factory with null-coalescing defaults — no codegen.

```dart
class Job {
  const Job({
    required this.jobId,
    required this.status,
    required this.healthScore,
    required this.createdAt,
    required this.imageCount,
  });

  final String jobId;
  final String status;
  final double? healthScore;
  final DateTime createdAt;
  final int imageCount;

  // Defensive: every field tolerates wrong/missing types from the backend.
  static Job fromJson(Map<String, dynamic> json) {
    return Job(
      jobId: (json['jobId'] as String?) ?? '',
      status: (json['status'] as String?) ?? '',
      // num covers int OR double; .toDouble() normalizes. Stays null if absent.
      healthScore: (json['overallHealthScore'] as num?)?.toDouble(),
      // tryParse never throws on bad ISO strings; epoch-0 is a safe sentinel.
      createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      imageCount: (json['imageCount'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'jobId': jobId,
        'status': status,
        'overallHealthScore': healthScore,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'imageCount': imageCount,
      };
}
```

### Defensive parsing rules
- **Numbers:** always read as `num?` then `.toInt()` / `.toDouble()` — JSON `5` decodes to `int`,
  `5.0` to `double`; casting `int as double` throws.
- **Dates:** `DateTime.tryParse(...) ?? sentinel` — backend sends ISO-8601 UTC (`...Z`). Call
  `.toLocal()` only at display time.
- **Lists:** guard with `is List`, then `whereType<Map>()` to skip malformed rows.

```dart
final raw = json['consultations'];
final items = (raw is List)
    ? raw
        .whereType<Map>()                          // drop non-object entries
        .map((m) => ConsultationSummary.fromJson(m.cast<String, dynamic>()))
        .where((c) => c.consultationId.isNotEmpty) // drop empties
        .toList()
    : <ConsultationSummary>[];
```

### Nested objects
Resolve each nested map the same way before constructing the parent.

```dart
final rawProfile = json['patientProfile'];
final profile = rawProfile is Map
    ? PatientProfile.fromJson(rawProfile.cast<String, dynamic>())
    : null;
```

## Error handling

Two failure layers: transport/status (`statusCode` outside 2xx) and envelope
(`success != true`). Both surface a Spanish message extracted from the body.

```dart
final res = await ApiService.patch('/doctor/consultations/$id/complete');

// Layer 1 — HTTP status.
if (res.statusCode < 200 || res.statusCode >= 300) {
  throw Exception(ApiService.extractErrorMessage(res.body));
}

// Layer 2 — envelope shape + success flag.
final decoded = jsonDecode(res.body);
if (decoded is! Map<String, dynamic> || decoded['success'] != true) {
  throw Exception(
    ApiService.extractErrorMessage(res.body, 'Error completando consulta'),
  );
}
final data = decoded['data'] as Map<String, dynamic>;
```

### Typed exceptions (optional, for status-specific UI)
When the caller must branch on the status (e.g. 401 → re-login, 409 → conflict banner), throw a
typed exception instead of a bare `Exception`.

```dart
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  bool get isAuth => statusCode == 401 || statusCode == 403;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

// In a cubit:
try {
  await service.doThing();
} on ApiException catch (e) {
  if (e.isAuth) emit(state.copyWith(status: FormzSubmissionStatus.failure, needsLogin: true));
  else emit(state.copyWith(status: FormzSubmissionStatus.failure, error: e.message));
} on TimeoutException {
  emit(state.copyWith(status: FormzSubmissionStatus.failure, error: 'Sin conexión'));
}
```

### Cancellation & retries (brief)
- **Cancellation:** top-level `http.*` calls aren't cancelable. For true cancellation, hold a
  `http.Client()`, and call `client.close()` to abort in-flight requests (e.g. in
  `Cubit.close()`). Or guard with `if (isClosed) return;` before `emit`.
- **Retries:** wrap a `http.Client` in `RetryClient` from `package:http/retry.dart`. Defaults:
  `retries: 3`, retry **only** on HTTP `503` (the default `when` checks `statusCode == 503`),
  and a backoff that waits 500ms before the first retry then ×1.5 each subsequent retry. It does
  **not** retry thrown errors (connection drops) unless you pass `whenError`. Keep retries
  idempotent — never auto-retry a non-idempotent `POST` that may double-charge or double-create.

```dart
import 'package:http/retry.dart';
// Default: 3 retries, 503 only, 500ms × 1.5 backoff. GET/PUT/DELETE safe; be careful with POST.
final client = RetryClient(http.Client());

// To also retry on transient connection errors, opt in explicitly:
final hardened = RetryClient(
  http.Client(),
  retries: 3,
  whenError: (error, _) => error is SocketException, // import 'dart:io'
);
```

## Real-world usage

The whole app routes through one static `ApiService` (`lib/core/services/api_service.dart`).
Private-ish by convention; all methods are static. `baseUrl` comes from `flutter_dotenv`, the
Bearer token from `FirebaseAuth`.

```dart
import 'dart:convert';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';

class ApiService {
  static var baseUrl = dotenv.env['SERVER_URL']!;

  // Fresh token per call — getIdToken() auto-refreshes if expired.
  static Future<Map<String, String>> _headers() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    return {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };
  }

  // GET maps `body` → query params (values stringified).
  static Future<http.Response> get(String endpoint, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$baseUrl$endpoint').replace(
      queryParameters: body?.map((k, v) => MapEntry(k, v.toString())),
    );
    return http.get(uri, headers: await _headers());
  }

  static Future<http.Response> post(String endpoint, {dynamic body}) async =>
      http.post(Uri.parse('$baseUrl$endpoint'), headers: await _headers(), body: body);

  static Future<http.Response> patch(String endpoint, {dynamic body}) async =>
      http.patch(Uri.parse('$baseUrl$endpoint'), headers: await _headers(), body: body);

  static Future<http.Response> put(String endpoint, {dynamic body}) async =>
      http.put(Uri.parse('$baseUrl$endpoint'), headers: await _headers(), body: body);

  static Future<http.Response> delete(String endpoint, {dynamic body}) async =>
      http.delete(Uri.parse('$baseUrl$endpoint'), headers: await _headers(), body: body);

  // Public routes (webhooks, /auth/social-complete) — no Authorization header.
  static Future<http.Response> postUnauthenticated(String endpoint, {dynamic body}) async =>
      http.post(Uri.parse('$baseUrl$endpoint'),
          headers: {'Content-Type': 'application/json'}, body: body);

  // Pulls a human message out of the error envelope: message → error(.message) → detail.
  static String extractErrorMessage(String body, [String fallback = 'Error del servidor']) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        final msg = decoded['message'];
        if (msg is String && msg.trim().isNotEmpty) return msg.trim();
        final err = decoded['error'];
        if (err is String && err.trim().isNotEmpty) return err.trim();
        if (err is Map<String, dynamic>) {
          final m = err['message'];
          if (m is String && m.trim().isNotEmpty) return m.trim();
        }
        final detail = decoded['detail'];
        if (detail is String && detail.trim().isNotEmpty) return detail.trim();
      }
    } catch (_) {}
    return fallback;
  }
}
```

> Note: the live file still has `print()` debug lines in `get`; strip those when adding new
> methods — tokens must never hit logs (PHI / HIPAA). Callers pass `jsonEncode(map)` as `body`
> themselves (the wrapper does not encode for you on post/put/patch/delete).

### A real service (envelope parse + Model.fromJson)
Feature services are static-method classes with a private ctor, one per feature
(`lib/features/<feature>/services/`). They own all `success`/`data` unwrapping so cubits stay
thin.

```dart
class DoctorConsultationsService {
  DoctorConsultationsService._();

  static Future<DoctorConsultationDetail> fetchConsultationDetail({
    required String consultationId,
  }) async {
    final id = consultationId.trim();
    if (id.isEmpty) throw Exception('consultationId inválido');

    final res = await ApiService.get('/doctor/consultations/$id');
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(ApiService.extractErrorMessage(res.body));
    }

    final decoded = jsonDecode(res.body);
    if (decoded is! Map<String, dynamic>) {
      throw Exception('Respuesta inválida del servidor');
    }
    if (decoded['success'] != true) {
      throw Exception(ApiService.extractErrorMessage(res.body, 'Error obteniendo detalle'));
    }

    final data = decoded['data'];
    if (data is! Map<String, dynamic>) {
      throw Exception('Respuesta inválida del servidor');
    }

    final raw = data['consultation'];
    if (raw is! Map) throw Exception('Respuesta inválida del servidor');
    return DoctorConsultationDetail(
      consultation: DoctorConsultation.fromJson(raw.cast<String, dynamic>()),
    );
  }
}
```

### Cursor pagination over REST
List endpoints use bidirectional cursors. Request `?limit=&after=|before=` (mutually
exclusive); response carries `data.pagination.{afterCursor, beforeCursor, pageSize}`. The
service returns a `Page` value object; the cubit appends on `loadMore`.

```dart
// --- service ---
static Future<ConsultationsPage> fetchConsultations({
  required String status, required int limit, String? after, String? before,
}) async {
  final res = await ApiService.get('/doctor/consultations', body: {
    if (status.toLowerCase() != 'all') 'status': status,
    'limit': limit,
    if (after != null && after.isNotEmpty) 'after': after,
    if (before != null && before.isNotEmpty) 'before': before,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw Exception(ApiService.extractErrorMessage(res.body));
  }
  final decoded = jsonDecode(res.body);
  if (decoded is! Map<String, dynamic> || decoded['success'] != true) {
    throw Exception(ApiService.extractErrorMessage(res.body, 'Error obteniendo consultas'));
  }
  final data = decoded['data'] as Map<String, dynamic>;
  final rawList = data['consultations'];
  final items = (rawList is List)
      ? rawList.whereType<Map>()
          .map((m) => ConsultationSummary.fromJson(m.cast<String, dynamic>()))
          .toList()
      : <ConsultationSummary>[];
  final p = (data['pagination'] is Map)
      ? (data['pagination'] as Map).cast<String, dynamic>() : <String, dynamic>{};
  return ConsultationsPage(
    consultations: items,
    afterCursor: p['afterCursor'] as String?,
    beforeCursor: p['beforeCursor'] as String?,
    pageSize: (p['pageSize'] as num?)?.toInt() ?? limit,
  );
}

// --- cubit: loadMore appends the next page ---
Future<void> loadMore() async {
  if (state.status == FormzSubmissionStatus.inProgress || !state.hasMore) return;
  emit(state.copyWith(status: FormzSubmissionStatus.inProgress));
  try {
    final page = await DoctorConsultationsService.fetchConsultations(
      status: state.filter, limit: 20, after: state.nextCursor, // afterCursor of last page
    );
    emit(state.copyWith(
      status: FormzSubmissionStatus.success,
      items: [...state.items, ...page.consultations],
      nextCursor: page.afterCursor,
      hasMore: page.afterCursor != null,   // null afterCursor ⇒ no more pages
    ));
  } catch (e) {
    emit(state.copyWith(status: FormzSubmissionStatus.failure, error: e.toString()));
  }
}
```

> Legacy: the patient jobs endpoint historically used a `lastKey` param instead of
> `after`/`before` — treat `lastKey` as the forward cursor when touching that screen, and migrate
> to `after`/`before` when you do.

### `dio` as an alternative (brief)
`dio ^5` adds interceptors, built-in timeouts/cancel-tokens, and `onSendProgress` for uploads.
**The reference app deliberately uses `http`** — no dio dependency. Only reach for dio if you need
upload progress bars or a request/response interceptor pipeline; otherwise stay on `http` +
`ApiService` for consistency.

## Common mistakes

| Pitfall | Fix |
|---|---|
| Passing a `Map` as `body` for JSON | `jsonEncode(map)` — a raw Map is form-encoded, breaking the API |
| `json['count'] as double` throws on `int` | read `as num?` then `.toDouble()` / `.toInt()` |
| `DateTime.parse` throws on bad/empty string | `DateTime.tryParse(s) ?? sentinel` |
| Non-String values in `queryParameters` | stringify (`v.toString()` / `'$limit'`) |
| `after`/`before` sent together | mutually exclusive — send one; omit nulls |
| Trusting `decoded` is a `Map` | `if (decoded is! Map<String,dynamic>)` guard before indexing |
| Only checking `statusCode`, ignoring `success:false` | check both layers (status **and** envelope flag) |
| Showing `e.toString()` raw to users | use `ApiService.extractErrorMessage(body, fallback)` |
| Reusing an expired token | call `getIdToken()` per request (auto-refreshes) — don't cache it |
| Auto-retrying a `POST /analyze` | retry only idempotent verbs; non-idempotent POST can double-create |
| `emit` after `await` on a closed cubit | guard `if (isClosed) return;` before emit |
| `print(token)` left in service | strip — tokens are PHI-adjacent, never log |
| `jsonEncode(bytes)` / wrong `Content-Type` on presigned S3 PUT | send raw `Uint8List` as `body` with the **exact** signed `Content-Type` (else 403 `SignatureDoesNotMatch`) |
| Reading `MultipartRequest.send()` result as `.body` | it returns a `StreamedResponse`; wrap with `http.Response.fromStream(...)` first |

## See also
- [state-management.md](state-management.md) — cubits consuming these services, `FormzSubmissionStatus`, `copyWith`
- [websockets-realtime.md](websockets-realtime.md) — `web_socket_channel` chat, `?token=` JWT auth
- [firebase-auth.md](firebase-core-auth.md) — `getIdToken()`, `FirebaseAuthException`, auth streams
- [models-serialization.md](networking-rest.md) — Equatable models, `fromJson`/`toJson` deep-dive
- http package — https://pub.dev/packages/http (v1.6)
- `RetryClient` — https://pub.dev/documentation/http/latest/retry/RetryClient-class.html
- `MultipartRequest` / `MultipartFile` — https://pub.dev/documentation/http/latest/http/MultipartRequest-class.html
- `image_picker` — https://pub.dev/packages/image_picker
- `dart:convert` (json) — https://api.dart.dev/stable/dart-convert/dart-convert-library.html
- `Uri.replace` — https://api.dart.dev/stable/dart-core/Uri/replace.html
