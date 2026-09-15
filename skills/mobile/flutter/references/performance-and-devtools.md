# Performance & DevTools

## Overview

Flutter renders at 60/120 fps, so each frame has a ~16ms (or ~8ms) budget split between the UI thread (build/layout/paint) and the raster thread (rasterize/composite). Jank happens when either thread blows the budget. This file covers the rebuild-reduction toolkit (`const`, scoped state, lazy lists), repaint isolation, image perf, isolates for heavy work, and the DevTools workflow to find the actual bottleneck instead of guessing. **Always profile in profile mode — debug-mode timings are meaningless.**

## Quick reference

| API / widget | What it does | Key params |
| --- | --- | --- |
| `const` constructor | Canonicalizes the widget instance → Flutter skips its rebuild + element reuse | — |
| `BlocSelector<B, S, T>` | Rebuild only when a derived value `T` changes | `selector`, `builder` |
| `BlocBuilder(buildWhen:)` | Gate rebuilds on prev/current state | `buildWhen: (prev, cur) => bool` |
| `context.select<B, T>()` | Read + subscribe to one slice of state inside a `Builder` | selector fn |
| `ListView.builder` | Lazy-builds only visible items | `itemCount`, `itemBuilder`, `itemExtent`, `cacheExtent`, `addAutomaticKeepAlives` |
| `RepaintBoundary` | Isolates a subtree into its own layer so repaints don't propagate | wraps child |
| `Image(cacheWidth:/cacheHeight:)` / `ResizeImage` | Decode image at target pixels (memory + raster win) | `cacheWidth`, `cacheHeight` |
| `precacheImage(provider, context)` | Warm the image cache before first paint | `provider`, `context`, `size?`, `onError?` |
| `compute(fn, msg)` | Run a top-level fn on a one-shot isolate | `callback`, `message`, `debugLabel?` |
| `Isolate.run(fn)` | Modern one-shot isolate (Dart 2.19+) | closure |
| `AnimatedOpacity` / `FadeInImage` | Cheap fades — avoid raw `Opacity` in animations | — |
| `debugPaintSizeEnabled` | Visualize layout boxes/padding | bool (import `rendering.dart`) |
| `debugRepaintRainbowEnabled` | Recolor layers on every repaint → spot over-painting | bool |
| `dart:developer` `Timeline` / `TimelineTask` | Emit custom timeline events | `startSync/finishSync` |

## const constructors — why they cut rebuilds

A `const` widget is canonicalized at compile time: every evaluation returns the *same* instance. When a parent rebuilds, Flutter compares the new child to the old one; for a `const` child the references are identical, so the framework short-circuits — it neither rebuilds the widget nor re-diffs its element subtree.

```dart
// BAD: a new SizedBox + Divider instance every parent rebuild → element re-diff each time.
class _Footer extends StatelessWidget {
  const _Footer();
  @override
  Widget build(BuildContext context) => Column(
        children: [SizedBox(height: 8), Divider(), Text('MyApp')],
      );
}

// GOOD: const subtrees are reference-identical across rebuilds → framework skips them.
class _Footer extends StatelessWidget {
  const _Footer();
  @override
  Widget build(BuildContext context) => const Column(
        children: [
          SizedBox(height: 8),
          Divider(),
          Text('MyApp'),
        ],
      );
}
```

`prefer_const_constructors`, `prefer_const_literals_to_create_immutables`, and `prefer_const_constructors_in_immutables` (all in `flutter_lints`) flag the missed spots. **Don't override `operator ==` on widgets to fake const-ness** — it makes element diffing O(N²).

## Scoping rebuilds (setState / Bloc)

The cheapest frame is the one you never build. Three levers, cheapest first:

1. **Push `setState` / state down.** Only the smallest subtree that visually changes should be inside the stateful widget or `BlocBuilder`. Split widgets so a spinner toggling doesn't rebuild the whole form.
2. **`const` the parts that don't change** so the rebuild walk stops at them.
3. **Select the slice, not the whole state object.**

```dart
// Rebuild ONLY when the derived bool flips, not on every AuthState emission.
BlocSelector<AuthBloc, AuthState, bool>(
  selector: (state) => state.status == FormzSubmissionStatus.inProgress,
  builder: (context, isLoading) => FilledButton(
    onPressed: isLoading ? null : () => context.read<AuthBloc>().add(const LoginSubmitted()),
    child: isLoading ? const _Spinner() : const Text('Ingresar'),
  ),
)

// Equivalent with context.select — note it MUST live under a Builder (or its own widget)
// so only that node subscribes, not the enclosing build method.
Builder(
  builder: (context) {
    final name = context.select((ProfileCubit c) => c.state.professionalName);
    return Text(name); // rebuilds only when name changes
  },
)
```

`buildWhen` is the gate when the rebuilt widget needs the full state but only on certain transitions:

```dart
BlocBuilder<ConsultationCubit, ConsultationState>(
  buildWhen: (prev, cur) => prev.status != cur.status, // ignore message-list churn
  builder: (context, state) => StatusBadge(state.status),
)
```

> `selector`/`buildWhen` compute on every emission — keep them O(1). With `Equatable` states the prev/current comparison is value-based, so identical states won't even reach `buildWhen`.

## Lists: `ListView.builder` vs `ListView`

`ListView(children: [...])` builds **every** child eagerly, even offscreen ones — fine for a handful, fatal for a feed. `ListView.builder` only builds items near the viewport.

| Param | Effect |
| --- | --- |
| `itemExtent` | Fixed item height → skips per-item layout measurement, enables instant scroll-to-offset. Huge win when all rows are the same height. |
| `prototypeItem` | Alternative to `itemExtent` when height is uniform but unknown — measures one prototype. |
| `cacheExtent` | Pixels of offscreen content to pre-build (default ~250px). Raise slightly to pre-warm fast scrolls; raising too far defeats laziness. |
| `addAutomaticKeepAlives` | Default `true`: keeps offscreen items with `KeepAlive` (e.g. forms/video) alive. Set `false` for simple cells to free memory. |
| `addRepaintBoundaries` | Default `true`: wraps each item in a `RepaintBoundary` — keep it. |

```dart
ListView.builder(
  itemCount: jobs.length,
  itemExtent: 96,        // every result card is 96px tall → no per-item layout pass
  cacheExtent: 300,
  addAutomaticKeepAlives: false, // cards are stateless → don't keep them alive offscreen
  itemBuilder: (context, i) => JobResultCard(job: jobs[i]),
)
```

## RepaintBoundary & avoiding whole-tree repaints

A `RepaintBoundary` gives its subtree a dedicated compositor layer. A repaint inside it (e.g. an animation) no longer dirties siblings/ancestors, and an unchanging boundary is cached as a texture by the raster thread.

```dart
// The banner animates 60x/sec. Without the boundary, every tick repaints the
// page behind it. With it, only the banner's own layer is re-rasterized.
RepaintBoundary(
  child: SlideTransition(position: _offset, child: const NotificationBanner()),
)
```

Use it around: continuously-animating widgets, items in long lists (already automatic), and anything sitting in front of an expensive static background. **Don't sprinkle it everywhere** — each boundary costs a layer + memory; add one where DevTools shows repaint propagation (see `debugRepaintRainbowEnabled`).

Other build()-cost rules:
- Do no allocation, parsing, sorting, or `MediaQuery`-derived math in `build()` — it runs on every rebuild. Hoist to `initState`/state.
- In `AnimatedBuilder`/`AnimatedWidget`, pass the non-animating subtree as the `child:` argument so it's built once, not per tick.
- Use `StringBuffer` over `+` for multi-part string building.

## Image performance

Decoding a 4000×3000 photo into a 100px thumbnail wastes memory and raster time. Decode at the size you'll display:

```dart
// cacheWidth/cacheHeight decode at target *pixel* resolution, not display logical size.
Image.network(
  job.thumbnailUrl,
  cacheWidth: 300, // decode at 300px wide regardless of source resolution
  fit: BoxFit.cover,
)

// Equivalent for any ImageProvider (static factory — returns the original provider
// untouched if both dims are null, so it's NOT a const expression):
final provider = ResizeImage.resizeIfNeeded(300, null, const AssetImage('assets/tooth.png'));
```

`precacheImage` warms the cache during a transition so the next screen paints instantly:

```dart
@override
void didChangeDependencies() {
  super.didChangeDependencies();
  // Warm hero images before navigating into results.
  precacheImage(NetworkImage(job.heroUrl), context);
}
```

Use `FadeInImage` (not `Image` + `Opacity`) for placeholder→image fades — it fades via a GPU fragment shader.

## Avoiding jank — the frame pipeline

A frame flows: **UI thread** (Dart `build` → `layout` → `paint`, produces a layer tree) → **raster thread** (rasterize layers → composite → GPU). Either thread over budget = jank.

| Symptom in DevTools | Likely cause |
| --- | --- |
| Tall **UI** (blue) bars | Expensive `build()`, big synchronous work, deep rebuild, intrinsic layout passes |
| Tall **raster** (green) bars | `saveLayer` (Opacity/ShaderMask/ClipPath), too many layers, large images, shadows |
| Dark-red bars (first run) | Shader compilation jank — historically a Skia problem; **Impeller eliminates it** by precompiling shaders at engine-build time (see below) |

`saveLayer` allocates an offscreen buffer and forces a GPU render-target switch — the most common raster-jank source. It's triggered by `Opacity`, `ShaderMask`, `ColorFilter`, `ClipPath`/`ClipRRect` with anti-alias-with-save-layer, and `BackdropFilter`. Prefer: semi-transparent `Color` over `Opacity`; `AnimatedOpacity` over animated `Opacity`; `borderRadius` on the decoration over `ClipRRect`; pre-clipped assets over runtime clipping.

**Intrinsic passes** (a second layout walk) come from uniform sizing (`IntrinsicHeight`, `Table`, columns asking every child its natural size). Give items a fixed `itemExtent`/size instead. Enable **Track layouts** in DevTools and look for `$runtimeType intrinsics` events.

### Impeller vs Skia (shader jank)

Flutter has moved off Skia for mobile. As of **Flutter 3.27**, Impeller is the **default and only** renderer on iOS, and the **default on Android** (Vulkan on API 29+, automatic OpenGLES fallback on older/Vulkan-less devices). Web still uses Skia (CanvasKit / Skwasm); macOS/desktop migration is in progress.

Why it matters for jank: Skia compiled shaders lazily at runtime, producing the "first-run" dark-red frames (worst on the first animation/transition after launch). The old fix was bundling an SkSL warm-up file (`--bundle-sksl-path`). **Impeller precompiles its (small, fixed) shader set at engine-build time, so that class of jank is gone** — the SkSL warm-up workflow is deprecated and does nothing under Impeller. If you still see shader-style first-run jank, confirm which renderer is active (an Impeller app won't have it) rather than reaching for SkSL.

To A/B test or work around an Impeller-specific rendering bug, force the legacy backend with `flutter run --no-enable-impeller` (or `io.flutter.embedding.android.EnableImpeller=false` in `AndroidManifest.xml`); not available on iOS, where Skia has been removed.

## Isolates / compute for heavy work

Dart is single-threaded per isolate; any CPU-bound work (JSON parse of a huge payload, image manipulation, crypto) on the UI isolate stalls frames. Offload to a background isolate:

```dart
// Top-level or static function — closures with captured state can't cross the boundary in compute().
List<Finding> _parseFindings(String body) =>
    (jsonDecode(body) as List).map((j) => Finding.fromJson(j)).toList();

// Older API, works on all SDKs the app targets:
final findings = await compute(_parseFindings, responseBody);

// Modern equivalent (Dart 2.19+), allows a closure:
final findings = await Isolate.run(() => _parseFindings(responseBody));
```

Rules: arguments and results must be sendable across the isolate boundary — no `BuildContext`, no platform-channel objects, no open sockets/`Stream`s. Sendable = primitives, `String`, `List`/`Map`/`Set` of sendables, most plain data classes, `SendPort`, and `TransferableTypedData`. Under the current (group-based) isolate model the message is **deep-copied**, except `TransferableTypedData`, which moves the byte buffer with **zero copy** — wrap big image/binary blobs in it to avoid duplicating megabytes:

```dart
// Zero-copy hand-off of a large byte buffer into the isolate.
final transferable = TransferableTypedData.fromList([bigBytes]); // Uint8List(s)
final result = await Isolate.run(() {
  final bytes = transferable.materialize().asUint8List(); // consumes it; one-shot
  return _decodeAndProcess(bytes);
});
```

`compute()`/`Isolate.run()` are one-shot. For a long-lived worker that streams results back, spawn a raw `Isolate` and pass a `ReceivePort().sendPort` so the worker can `send(...)` multiple messages — but for parse-once payloads like this app's, `Isolate.run` is the right tool. Spawning an isolate costs ~1ms + memory, so only offload work measured in tens of ms+; sub-ms parses are cheaper on the main isolate.

## DevTools workflow

Launch: `flutter run --profile` then open DevTools (printed URL / IDE button). Key views:

| View | Use it to | Notes |
| --- | --- | --- |
| **Flutter Inspector** | Find the widget under a pixel, see the tree, spot misplaced layout | "Select widget mode"; **Track widget rebuilds** highlights widgets rebuilding per frame (rebuild counts) — hunt red/high counts |
| **Performance → Flutter Frames** | Spot janky frames (red), see UI vs raster split per frame | Each bar = one frame; click a janky bar for the **Frame Analysis** hints |
| **Performance → Timeline Events** | See build/layout/paint events + your custom `Timeline` events | Enable **Enhance Tracing**: Track Widget Builds / Track Layouts / Track Paints |
| **CPU Profiler** | Flame chart of Dart method self/total time | Record around the slow interaction; "Method table" for hot functions |
| **Memory** | Heap snapshots, allocation tracing, leak detection | Diff snapshots before/after a flow to find retained objects; **Trace Instances** for allocation call stacks (see `leak_tracker` note below) |
| **Network** | Inspect HTTP + WebSocket traffic, timings, payloads | Confirms backend latency vs client jank |

Rendering toggles (Inspector or `flutter run` keys): **Repaint Rainbow** (`debugRepaintRainbowEnabled`) recolors a layer each time it repaints — a constantly-cycling region is over-painting; **Slow Animations** to eyeball transitions; **Highlight Oversized Images** flags images decoded larger than displayed (your cue for `cacheWidth`).

**Leak detection via `leak_tracker`.** Flutter ships the `leak_tracker` package and `flutter_test` uses it: it watches disposable objects and reports two main leak kinds — **not-disposed** (a `Disposable`/`ChangeNotifier` was GC'd without `dispose()` being called) and (experimental) **not-GCed** (an object should have been collected but is still retained). In a `testWidgets` test it surfaces leaks at test teardown; for a running app, the **Memory** view's snapshot diff + retaining-path analysis is how you chase the same retained objects manually. Practical triggers in a production app: an `AnimationController`/`TextEditingController`/`StreamSubscription` (e.g. the FCM `NotificationEventBus` listener) not cancelled in `dispose()`.

Custom timeline spans from `dart:developer`:

```dart
import 'dart:developer';

Future<Job> analyze() async {
  final task = TimelineTask()..start('analyze-upload');
  try {
    return await ApiService.post('/patient/analyze', body);
  } finally {
    task.finish(); // shows as a span in the Timeline Events tab
  }
}
```

## Build modes & profiling

| Mode | Command | Asserts / debug banner | JIT/AOT | Use for |
| --- | --- | --- | --- | --- |
| Debug | `flutter run` | on | JIT | Hot reload, development. **Never** trust its perf numbers. |
| Profile | `flutter run --profile` | off | AOT | All performance measurement + DevTools. Service extensions stay available. |
| Release | `flutter build apk/ipa --release` | off | AOT | Shipping. No DevTools/observatory. |

Profile mode is mandatory for DevTools timing because debug mode adds assertions and runs unoptimized JIT code; a frame "janky" in debug may be fine in release and vice versa. Profile mode is unavailable on emulators/simulators — use a physical device.

## Reducing app size

- `--split-debug-info=<dir>` strips Dart symbol info into a separate file (smaller binary; symbolize crashes later with `flutter symbolize`). Pair with `--obfuscate` for release.
- **Tree shaking** is automatic in release/AOT: unused code and (for `MaterialIcons`) unused glyphs are dropped — don't defeat it by constructing icons dynamically from codepoints.
- **Deferred loading** (`import '...' deferred as x;` + `await x.loadLibrary()`) splits rarely-used features into separate load units. Biggest win on **web** (lazily downloaded chunks). On **Android** it maps to *deferred components* (Play Feature Delivery): the deferred Dart units ship as split-AOT in separate `.so`/feature modules that Play installs on demand — extra setup (`deferred-components` in `pubspec.yaml`, `flutter build appbundle`, the dynamic-feature Gradle module). On **iOS** there is no app-thinning equivalent — `loadLibrary()` resolves immediately and the code is already in the binary, so it gives no size win. Heavy, rarely-hit flows (e.g. doctor onboarding) are candidates on web/Android.
- Analyze with `flutter build apk --analyze-size` (also `appbundle`/`ios`) to print a breakdown + emit a JSON you can open in DevTools' app-size tool. Add `--target-platform=android-arm64` to scope the report to one ABI.

```bash
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
```

## Real-world usage

A production Flutter app (Flutter `^3.10`, Material 3, bloc `^9.1`) applies these patterns concretely:

- **`const` everywhere, enforced by lints.** `flutter_lints ^6.0` flags every missable `const`; the immutable `Equatable` states + static `Page.route()/page()` factories mean most widget subtrees are `const` and skip rebuilds for free.
- **`ListView.builder` for every paginated card list** (job history, clinic search, consultation list) — backed by cursor pagination (`after`/`before`/`lastKey`). Cards are uniform height, so set `itemExtent` and `addAutomaticKeepAlives: false` since the cards are stateless.
- **`BlocSelector` / `context.select` to scope rebuilds.** Select only `AuthBloc` *status* (not the whole `AuthState`) so the login button's spinner toggle doesn't rebuild the form. Cubits drive almost everything (Bloc only for the Firebase `authStateChanges` stream); `FormzSubmissionStatus` on state + semantic getters (`isLoading`, `isValid`) make selectors trivial and O(1).

  ```dart
  BlocSelector<AuthBloc, AuthState, FormzSubmissionStatus>(
    selector: (s) => s.status,
    builder: (context, status) => status.isInProgress
        ? const _SubmitSpinner()
        : const _SubmitButton(),
  )
  ```

- **Image downscale before S3 upload.** Photos from `image_picker ^1.2` are downscaled (via `maxWidth`/`maxHeight` on `pickImage`, and `cacheWidth` for preview thumbnails) before the presigned-URL upload — smaller payloads, faster uploads, and no oversized-image raster jank in the preview grid.
- **`RepaintBoundary` around the animated notification banner.** The custom overlay banner (driven by `AnimationController` + `SlideTransition`, fed by the `NotificationEventBus` broadcast stream that decouples FCM events from cubits) is wrapped in a `RepaintBoundary` so its 60fps slide-in re-rasterizes only its own layer, never the screen behind it.

## Common mistakes

| Pitfall | Fix |
| --- | --- |
| Measuring perf in debug mode | Use `flutter run --profile` on a physical device |
| `ListView(children: [...])` for a long/paginated list | `ListView.builder` with `itemCount`/`itemBuilder` |
| Whole page rebuilds when one value changes | `BlocSelector`/`context.select`/`buildWhen`; push state down; `const` subtrees |
| Raw `Opacity` animating | `AnimatedOpacity` / `FadeInImage` (avoids per-frame `saveLayer`) |
| Full-res images in small widgets | `cacheWidth`/`cacheHeight` or `ResizeImage`; downscale before upload |
| Heavy JSON/crypto on UI isolate → dropped frames | `compute()` / `Isolate.run()` (top-level fn, sendable args) |
| `RepaintBoundary` on everything | Add only where Repaint Rainbow shows propagation; each costs a layer |
| Override `==` on a widget to skip rebuilds | Use `const` + push state down; `==` override → O(N²) diffing |
| Work (parse/sort/MediaQuery math) inside `build()` | Hoist to `initState`/state; `build()` runs every rebuild |
| `IntrinsicHeight`/uniform sizing causing double layout | Fixed `itemExtent`/size; check "Track layouts" for `intrinsics` events |
| Shipping with debug symbols inflating size | `--obfuscate --split-debug-info=...`; let tree-shaking run |

## See also

- [state-management.md](state-management.md) — Cubit/Bloc, `BlocSelector`, `buildWhen`, Equatable states
- [widgets-and-layout.md](widgets-and-layout.md) — const subtrees, RepaintBoundary, layout/intrinsics
- [lists-and-pagination.md](networking-rest.md) — `ListView.builder` + cursor pagination
- [animations.md](animations.md) — `AnimationController`, `SlideTransition`, the notification banner
- https://docs.flutter.dev/perf/best-practices
- https://docs.flutter.dev/perf/rendering-performance
- https://docs.flutter.dev/tools/devtools/performance
- https://docs.flutter.dev/tools/devtools/inspector
- https://docs.flutter.dev/tools/devtools/memory — Memory view, snapshot diff, leak detection
- https://docs.flutter.dev/perf/impeller — Impeller default-renderer status per platform
- https://docs.flutter.dev/perf/app-size — `--analyze-size`, deferred components
- https://api.flutter.dev/flutter/widgets/precacheImage.html
- https://api.flutter.dev/flutter/dart-isolate/Isolate/run.html — `Isolate.run` (Dart 2.19+)
