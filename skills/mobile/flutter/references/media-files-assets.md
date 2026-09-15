# Media, Files & Assets

## Overview
Camera/gallery capture (`image_picker`), arbitrary file selection (`file_picker`), vector rendering (`flutter_svg`), bundled assets + fonts (`pubspec.yaml`), network images with caching, deep links (`url_launcher`), and uploading bytes via multipart or presigned-URL PUT. This is the layer between the device's media stores and the backend — get the platform permission setup right or pickers silently fail in release builds.

## Quick reference

| Package | Version | Primary entrypoint | Returns |
|---|---|---|---|
| `image_picker` | ^1.2 | `ImagePicker().pickImage / pickMultiImage / pickVideo` | `XFile?` / `List<XFile>` |
| `file_picker` | ^10.3 | `FilePicker.platform.pickFiles(...)` | `FilePickerResult?` (`.files`, `.paths`) |
| `flutter_svg` | ^2.2 | `SvgPicture.asset / .network / .string` | `Widget` |
| `url_launcher` | ^6.3 | `launchUrl(uri, mode:)`, `canLaunchUrl(uri)` | `Future<bool>` |
| (framework) | — | `Image.asset / .network`, `AssetImage`, `precacheImage` | `Widget` / `Future<void>` |

| `image_picker` param | Type | Notes |
|---|---|---|
| `source` | `ImageSource.camera` / `.gallery` | required on `pickImage`/`pickVideo` |
| `imageQuality` | `int?` 0–100 | JPEG recompression; null = original |
| `maxWidth` / `maxHeight` | `double?` | downscale preserving aspect ratio |
| `requestFullMetadata` | `bool` (iOS) | false skips `NSPhotoLibraryUsageDescription` prompt |

| `file_picker` param | Type | Default | Notes |
|---|---|---|---|
| `type` | `FileType` | `.any` | `any`/`media`/`image`/`video`/`audio`/`custom` |
| `allowedExtensions` | `List<String>?` | — | **only** with `type: FileType.custom`; no leading dot |
| `allowMultiple` | `bool` | `false` | |
| `withData` | `bool` | `false` | load `.bytes` into memory (required on web) |
| `withReadStream` | `bool` | `false` | stream large files instead of buffering |

| `LaunchMode` | Use for |
|---|---|
| `platformDefault` | let OS decide |
| `externalApplication` | open in browser / dialer / mail app (most common for `https`, `tel`, `mailto`, `wa.me`) |
| `inAppBrowserView` | SFSafariViewController / Chrome Custom Tab |
| `inAppWebView` | embedded WebView inside your app |

`inAppBrowserView` / `inAppWebView` are mobile-only; on desktop/web a requested mode that the platform can't honor **automatically falls back** to a supported one (so an `inAppWebView` call on Windows/macOS/Linux opens externally). If silent fallback would break UX, gate on `supportsLaunchMode(mode)` first.

## image_picker — camera & gallery

`pickImage` returns a single `XFile?` (null if the user cancels); `pickMultiImage` returns a possibly-empty `List<XFile>`. An `XFile` is a cross-platform file handle — use `.path` on mobile/desktop and `.readAsBytes()` everywhere (the only option that works on web).

```dart
final picker = ImagePicker();

// Single camera shot, downscaled + recompressed to keep the upload small.
final XFile? shot = await picker.pickImage(
  source: ImageSource.camera,
  imageQuality: 85,   // recompress; clinical images don't need lossless
  maxWidth: 2000,     // cap longest edge — Bedrock doesn't need 4032px
);
if (shot == null) return; // user cancelled

// Multi-select from gallery (no source arg — always the photo library).
final List<XFile> picks = await picker.pickMultiImage(imageQuality: 85);

// Bytes are the portable representation (web has no real file path).
final Uint8List bytes = await shot.readAsBytes();
```

`pickVideo(source:, maxDuration:)` returns an `XFile?` pointing at the recorded/picked clip.

**Platform setup (mandatory — pickers no-op without these):**

```xml
<!-- ios/Runner/Info.plist -->
<key>NSCameraUsageDescription</key>
<string>Esta app necesita la cámara para capturar imágenes.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Esta app necesita acceso a tus fotos.</string>
<key>NSMicrophoneUsageDescription</key>   <!-- only if pickVideo records -->
<string>Necesario para grabar video.</string>
```

Android needs no manifest entry for basic pick/capture (the plugin uses the system picker). Set `requestFullMetadata: false` on iOS to skip the photo-library permission prompt when you only need pixels, not EXIF/location.

### LostDataResponse (Android only)

On low-memory Android the OS can kill your `Activity` while the camera app is foregrounded, so the picked file never reaches your `await`. Recover it at startup:

```dart
Future<List<XFile>> _recoverLostImages() async {
  final LostDataResponse response = await ImagePicker().retrieveLostData();
  if (response.isEmpty) return const [];
  if (response.exception != null) {
    // Pick failed before the kill; surface or log it.
    return const [];
  }
  // response.file (single) or response.files (multi) survived the restart.
  return response.files ?? (response.file != null ? [response.file!] : const []);
}
```

Call this once when the capture screen mounts. No-op on iOS/web (`response.isEmpty` is true).

## file_picker — arbitrary documents

```dart
final FilePickerResult? result = await FilePicker.platform.pickFiles(
  type: FileType.custom,
  allowedExtensions: ['pdf', 'jpg', 'png'], // NO dots; requires FileType.custom
  allowMultiple: true,
  withData: false, // keep memory low — read paths lazily on mobile
);
if (result == null) return; // cancelled

for (final PlatformFile f in result.files) {
  f.name;       // "certificado.pdf"
  f.size;       // bytes (int)
  f.extension;  // "pdf"
  f.path;       // device path (null on web / when withReadStream)
  f.bytes;      // Uint8List? — only populated when withData: true (always on web)
}
```

Pitfalls: `allowedExtensions` throws unless `type: FileType.custom`; on **web** `path` is always null so you must pass `withData: true` and use `.bytes`. For multi-GB files use `withReadStream: true` and consume `f.readStream`.

> **v10 image compression:** `allowCompression` is **deprecated** in v10 in favor of `compressionQuality` (`int` 0–100; `0` = no compression, the v10 default). Only affects images. Note that `FilePicker.platform.pickFiles(...)` (instance accessor) is the v10 form — v11 moved to static `FilePicker.pickFiles(...)`, so keep the `^10.3` pin if you depend on the `.platform` call.

## flutter_svg — vector assets & icons

v2 replaced the v1 `color:` param with **`colorFilter:`**. Tint with `ColorFilter.mode(color, BlendMode.srcIn)`.

```dart
// Asset SVG (decorative — keeps its own colors).
SvgPicture.asset(
  'assets/img/patient/home/banners/b2_bg_stars.svg',
  fit: BoxFit.cover,
);

// Tinted icon: srcIn paints the SVG's alpha with the given color.
SvgPicture.asset(
  'assets/icons/tooth.svg',
  width: 24,
  height: 24,
  colorFilter: const ColorFilter.mode(Color(0xFF1565C0), BlendMode.srcIn),
);

// Network with a loading placeholder.
SvgPicture.network(
  'https://cdn.example.com/badge.svg',
  placeholderBuilder: (_) => const SizedBox(
    width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2),
  ),
);

// Inline string (icon constants stored in code).
SvgPicture.string('<svg ...>...</svg>');
```

SVGs declared as asset paths (`assets/...svg`) must still appear under `flutter: assets:` in `pubspec.yaml`. SVG sizing is intrinsic; constrain with `width`/`height`/`fit` or wrap in `SizedBox`.

## Assets, fonts & images in pubspec

```yaml
flutter:
  uses-material-design: true
  assets:
    - assets/img/                       # whole directory (non-recursive — list subdirs explicitly)
    - assets/img/patient/
    - assets/img/doctor/
    - .env                              # flutter_dotenv reads this as an asset

  fonts:
    - family: Roboto
      fonts:
        - asset: assets/fonts/Roboto-Regular.ttf
          weight: 400
        - asset: assets/fonts/Roboto-Bold.ttf
          weight: 700
        - asset: assets/fonts/Roboto-Italic.ttf
          weight: 400
          style: italic
```

Asset directory entries are **not recursive** — each subfolder must be listed. Declaring a folder includes its resolution variants automatically.

**Resolution-aware variants:** place `image.png`, `2.0x/image.png`, `3.0x/image.png` next to each other; declare only the base path. Flutter picks the variant matching `devicePixelRatio`.

```dart
Image.asset('assets/img/doctor/avatar.png', width: 64);       // auto-resolves @2x/@3x
const AssetImage('assets/img/patient/logo.png');              // ImageProvider form

// Decode into the image cache before navigating so the next screen has no flash.
await precacheImage(const AssetImage('assets/img/splash.png'), context);
```

## Network images & caching

```dart
Image.network(
  url,
  fit: BoxFit.cover,
  loadingBuilder: (context, child, progress) {
    if (progress == null) return child; // fully loaded
    return const Center(child: CircularProgressIndicator());
  },
  errorBuilder: (context, error, stack) =>
      const Icon(Icons.broken_image, color: Colors.grey),
);
```

`Image.network` caches only in memory (cleared on restart). For disk-cached, deduplicated loads use **`cached_network_image`**:

```dart
CachedNetworkImage(
  imageUrl: url,
  placeholder: (_, __) => const CircularProgressIndicator(),
  errorWidget: (_, __, ___) => const Icon(Icons.broken_image),
);
```

`cached_network_image ^3.x` keys its disk cache on the **full URL**. Presigned/CloudFront URLs change their query signature every request, so each load is a cache miss — cache the underlying `ApiService` bytes (or strip the volatile query) rather than relying on `CachedNetworkImage` for short-lived signed URLs. Custom eviction/TTL goes through a `cacheManager:` (a `flutter_cache_manager` `BaseCacheManager`).

For OAC/CloudFront image URLs that require an `Authorization` header, pass `headers:` to `Image.network` (or fetch bytes via `ApiService` and use `Image.memory`).

## url_launcher — external links

`launchUrl` returns `false` if nothing handled the URL. Prefer just attempting the launch and reacting to the `false` result over gating on `canLaunchUrl` (which needs manifest declarations and can give false negatives).

```dart
// HTTPS in the system browser.
final ok = await launchUrl(
  Uri.parse('https://example.com/terminos'),
  mode: LaunchMode.externalApplication,
);
if (!ok) showError('No se pudo abrir el enlace');

// Phone dialer.
await launchUrl(Uri(scheme: 'tel', path: '+56912345678'));

// Email with subject (build via Uri to URL-encode correctly).
await launchUrl(Uri(
  scheme: 'mailto',
  path: 'soporte@example.com',
  query: 'subject=Consulta', // Uri encodes spaces/&
));

// WhatsApp deep link.
await launchUrl(Uri.parse('https://wa.me/56912345678'),
    mode: LaunchMode.externalApplication);
```

**Setup for `canLaunchUrl` (only if you call it):**

```xml
<!-- android/app/src/main/AndroidManifest.xml — inside <manifest>, sibling of <application> -->
<queries>
  <intent><action android:name="android.intent.action.VIEW"/>
    <data android:scheme="https"/></intent>
  <intent><action android:name="android.intent.action.DIAL"/>
    <data android:scheme="tel"/></intent>
  <intent><action android:name="android.intent.action.SENDTO"/>
    <data android:scheme="mailto"/></intent>
</queries>
```
```xml
<!-- ios/Runner/Info.plist -->
<key>LSApplicationQueriesSchemes</key>
<array><string>https</string><string>tel</string><string>mailto</string></array>
```

## File uploads: multipart vs presigned PUT

**Presigned-URL PUT (the reference app's pattern):** the backend returns a short-lived S3 URL; you `PUT` the raw bytes with the matching `Content-Type`. No auth header on the PUT — the signature is in the URL.

```dart
final bytes = await xfile.readAsBytes();
final res = await http.put(
  Uri.parse(presignedUrl),
  headers: {'Content-Type': 'image/jpeg'}, // MUST match what the backend signed
  body: bytes,
);
if (res.statusCode < 200 || res.statusCode >= 300) {
  throw Exception('Upload falló (HTTP ${res.statusCode})');
}
```

**Multipart (`multipart/form-data`)** — when posting straight to your own API:

```dart
final req = http.MultipartRequest('POST', Uri.parse('$base/upload'))
  ..headers['Authorization'] = 'Bearer $jwt'
  ..fields['consultationId'] = id
  ..files.add(await http.MultipartFile.fromPath('file', xfile.path));
// On web (no path) use fromBytes:
// ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: name));
final streamed = await req.send();
final res = await http.Response.fromStream(streamed);
```

## Real-world usage

A production Flutter app (image_picker ^1.2.1, file_picker ^10.3.2, flutter_svg ^2.2.3, url_launcher ^6.3.2) uses **presigned-URL PUT**, never multipart, for clinical images.

**Capture (`analysis_page.dart`):** a bottom-sheet offers camera vs gallery; camera → single `pickImage`, gallery → `pickMultiImage`. Picked `XFile`s accumulate in a Cubit state list (`List<XFile>`):

```dart
final picker = ImagePicker();
List<XFile> picked;
try {
  if (option == AnalysisImageSourceOption.camera) {
    final file = await picker.pickImage(source: ImageSource.camera);
    picked = file != null ? [file] : <XFile>[];
  } else {
    picked = await picker.pickMultiImage();
  }
} catch (e) {
  if (!context.mounted) return;
  showErrorDialog(context, e, title: 'No se pudo abrir la galería/cámara');
  return;
}
```

**Validate + upload (`image_validation_service.dart`, static class):** base64-encodes each `XFile` (`base64Encode(await f.readAsBytes())`) with a content-type derived from the path extension, POSTs to `/patient/upload` via the singleton `ApiService` (auto-injects the Firebase JWT). The backend's Haiku validator returns per-image `{isOralCavity, qualityScore, observation}` plus `presignedUrls`. The service then PUTs accepted images to S3:

```dart
for (final p in presignedUploads) {
  final bytes = await files[p.imageIndex].readAsBytes();
  final res = await http.put(
    Uri.parse(p.presignedUrl),
    headers: {'Content-Type': _contentTypeForPath(files[p.imageIndex].path)},
    body: bytes,
  );
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw Exception('Error subiendo imagen ${p.imageIndex + 1} (HTTP ${res.statusCode})');
  }
}
```

`_contentTypeForPath` maps `.png→image/png`, `.webp→image/webp`, `.heic→image/heic`, default `image/jpeg`. Rejected images (`isOralCavity == false` or `qualityScore < 60`) surface a Spanish reason from `observation`. The API envelope here is double-nested: `{ success, data: { success, presignedUrls | validations, message } }`.

**SVG — two distinct mechanisms:**
- `flutter_svg` `SvgPicture.asset` renders **decorative banner backgrounds** (`assets/img/patient/home/banners/b2_bg_stars.svg`, `fit: BoxFit.cover`) — full-color art that keeps its palette.
- **Inline icon constants** live in `lib/core/icons/app_svg_icons.dart` as `static const String` SVG markup using `fill="currentColor"`, rendered via **`iconify_flutter`'s `Iconify(AppSvgIcons.x, color:)`** — `Iconify` accepts a `color:` and applies it to the icon, so monochrome (`currentColor`/single-fill) markup tints to that color. Use `flutter_svg` for asset art, `Iconify` for tintable inline icons.

**Fonts:** Roboto is declared in `pubspec.yaml` with **all weights 100–900 plus italics** (`Roboto-Thin` 100 … `Roboto-Black` 900), so `FontWeight.w100`–`w900` resolve to bundled files. Material 3 theme (`lib/core/theme.dart`) sets `fontFamily: 'Roboto'`.

**url_launcher (`patient_help_support_page.dart`):** `mailto:` via `Uri(scheme: 'mailto', path: email)` and WhatsApp via `Uri.parse('https://wa.me/$number')`, both with `LaunchMode.externalApplication`; on a `false` return it shows `showErrorDialog`. `job_completed_view.dart` opens external clinical links the same way.

**Assets layout:** `assets/img/patient/`, `assets/img/patient/home/banners/`, `assets/img/doctor/`, `assets/fonts/`, and `.env` (read by `flutter_dotenv`) — each subdirectory listed explicitly under `flutter: assets:`.

## Common mistakes

| Pitfall | Fix |
|---|---|
| Picker silently does nothing in release | Add `NS*UsageDescription` keys (iOS) / verify system picker availability; check `pickImage` didn't return null from cancel |
| `xfile.path` is null/crashes on web | Use `xfile.readAsBytes()`; for `file_picker` set `withData: true` and read `.bytes` |
| `allowedExtensions` throws | Only valid with `type: FileType.custom`; pass extensions without leading dots |
| `flutter_svg` v1 `color:` not compiling | Replaced by `colorFilter: ColorFilter.mode(c, BlendMode.srcIn)` in v2 |
| Presigned PUT returns 403 | `Content-Type` header must exactly match what the backend signed |
| Lost camera shot on Android | Call `retrieveLostData()` at capture-screen startup |
| Asset not found at runtime | Declare it (or its folder) under `flutter: assets:`; folders aren't recursive |
| `canLaunchUrl` returns false despite a valid app | Add `<queries>` (Android) / `LSApplicationQueriesSchemes` (iOS), or skip the check and react to `launchUrl`'s bool |
| Network image flashes / re-downloads | Use `cached_network_image` (disk cache) instead of `Image.network` |
| Huge uploads OOM the app | `imageQuality`/`maxWidth` on capture; `withReadStream` for big files |

## See also
- [networking-http.md](networking-rest.md) — `ApiService` JWT injection, API envelope, multipart helpers
- [state-management.md](state-management.md) — Cubit holding `List<XFile>` capture state
- [forms-validation.md](forms-and-input.md) — file/document fields in doctor registration
- [theming-material3.md](theming-material3.md) — registering the Roboto font family in `ThemeData`
- image_picker: https://pub.dev/packages/image_picker
- file_picker `pickFiles` API: https://pub.dev/documentation/file_picker/latest/file_picker/FilePicker-class.html
- flutter_svg (colorFilter): https://pub.dev/packages/flutter_svg
- url_launcher (LaunchMode, queries setup): https://pub.dev/packages/url_launcher
- Flutter assets & images: https://docs.flutter.dev/ui/assets/assets-and-images
