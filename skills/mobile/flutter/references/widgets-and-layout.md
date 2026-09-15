# Widgets & Layout

## Overview
Flutter UI is a tree of immutable **widget** descriptions reconciled into a mutable **element** tree, which drives a **render** tree that does layout/paint. Understanding the constraints model and the StatelessWidget/StatefulWidget split is the foundation for everything else — layout bugs almost always reduce to "what constraints did the parent pass down". This file is the reference-app-weighted reference for composing screens.

## Quick reference

| Concern | API | Notes |
|---|---|---|
| Static UI | `StatelessWidget` | `build(context)` only; rebuilds when parent/inherited deps change |
| Stateful UI | `StatefulWidget` + `State<T>` | mutable state survives rebuilds; lifecycle below |
| Lifecycle | `initState` → `didChangeDependencies` → `build` → (`didUpdateWidget`/`setState` → `build`)* → `deactivate` → `dispose` | all override methods call `super.*()` |
| Rebuild trigger | `setState(() {...})` | only marks *this* element dirty |
| Identity | `ValueKey`, `ObjectKey`, `UniqueKey`, `GlobalKey` | preserve/move state across rebuilds |
| Sizing box | `SizedBox`, `ConstrainedBox`, `FractionallySizedBox` | tight vs loose constraints |
| Single-child layout | `Container`, `Padding`, `Center`, `Align` | `Container` = composite (padding+decoration+constraints+margin) |
| Linear layout | `Row`, `Column` | `mainAxisAlignment`, `crossAxisAlignment`, `mainAxisSize` |
| Flex children | `Expanded`, `Flexible`, `Spacer` | only inside `Row`/`Column`/`Flex` |
| Overlap | `Stack` + `Positioned` | non-positioned children sized by `StackFit`/alignment |
| Run-wrap / table | `Wrap`, `Table` | wrap to next run (`spacing`/`runSpacing`); column-aligned grid (`columnWidths`) |
| Equalize height | `IntrinsicHeight` | expensive — avoid in scroll item builders |
| Scroll (small) | `SingleChildScrollView` | whole child laid out at once |
| Scroll (long list) | `ListView.builder` / `.separated` | lazy; **the default** for card lists |
| Grid | `GridView.builder` | `SliverGridDelegateWithFixedCrossAxisCount` |
| Custom scroll | `CustomScrollView` + slivers | `SliverAppBar`, `SliverList.builder`, `SliverGrid`, `SliverToBoxAdapter`, `SliverFillRemaining`, `SliverPersistentHeader` |
| Mixed inline text | `Text.rich` + `TextSpan` | inherits `DefaultTextStyle` (unlike raw `RichText`) |
| Responsive | `MediaQuery.of`, `LayoutBuilder`, `OrientationBuilder` | size/insets/orientation |
| Notch-safe | `SafeArea` | pads for status bar / home indicator |
| Scaffold chrome | `Scaffold`, `AppBar` | `body`, `appBar`, `floatingActionButton`, `bottomNavigationBar` |
| Ink/tap | `InkWell` (ripple) vs `GestureDetector` (raw) | `InkWell` needs a `Material` ancestor |
| Float above tree | `Overlay` + `OverlayEntry` | banners, tooltips, custom popups |

## Everything is a widget — and the three trees

A widget is an **immutable** configuration object. Flutter keeps three parallel trees:

- **Widget tree** — what your `build()` returns. Cheap, thrown away and rebuilt constantly.
- **Element tree** — the long-lived "instances". An element holds a reference to its current widget and (for stateful) its `State`. Reconciliation matches new widgets to old elements by `runtimeType` + `key`.
- **Render tree** (`RenderObject`) — does layout, painting, hit-testing.

Why it matters: `setState` rebuilds the widget tree, but Flutter only updates render objects that actually changed. State lives on the **element**, not the widget — which is why a `StatefulWidget`'s fields are `final` and mutable data lives in its `State`.

```dart
// const constructors let Flutter skip rebuilding identical subtrees — use them.
const SizedBox(height: 8); // canonicalized; zero allocation on rebuild
```

## StatelessWidget vs StatefulWidget + State lifecycle

Use `StatelessWidget` when the widget renders purely from its constructor args + inherited widgets. Use `StatefulWidget` when it owns mutable state (controllers, animations, local toggles, subscriptions).

```dart
class _NotificationBanner extends StatefulWidget {
  const _NotificationBanner({required this.title, required this.onDismiss});
  final String title;
  final VoidCallback onDismiss;
  @override
  State<_NotificationBanner> createState() => _NotificationBannerState();
}

class _NotificationBannerState extends State<_NotificationBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    // One-time setup. No `context` inheritance lookups here (use didChangeDependencies).
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _ctrl.forward();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Runs after initState AND whenever an InheritedWidget this build depends on changes
    // (e.g. Theme.of/MediaQuery.of). Safe place for context-dependent init.
  }

  @override
  void didUpdateWidget(covariant _NotificationBanner old) {
    super.didUpdateWidget(old);
    // Parent rebuilt with a NEW widget config but SAME element. React to changed props,
    // e.g. restart an animation if widget.title changed. Don't blindly reset controllers.
  }

  @override
  void dispose() {
    _ctrl.dispose(); // release controllers/streams/listeners or you leak.
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
```

| Method | When | Rule |
|---|---|---|
| `createState()` | once, when widget first inserted | returns the `State` |
| `initState()` | once | call `super` first; no inherited-widget reads |
| `didChangeDependencies()` | after `initState`, then on inherited-dep change | `super`; ok to read `Theme.of`/`MediaQuery.of` |
| `build()` | every rebuild | must be pure & side-effect free |
| `didUpdateWidget(old)` | parent rebuilt same element with new config | `super`; diff `widget` vs `old` |
| `setState(fn)` | on local state change | marks element dirty → schedules `build`; never in `build`/`dispose` |
| `deactivate()` | element removed from tree (may be reinserted) | rare |
| `dispose()` | element permanently gone | `super` last; free resources |

## BuildContext semantics

`BuildContext` **is** the element. It locates a widget's position in the tree. Two gotchas:

- `Theme.of(context)`, `MediaQuery.of(context)`, `Navigator.of(context)` walk **up** from `context` looking for an ancestor. A `context` from *above* the provider/`Scaffold` won't find it → "No MaterialLocalizations found" / null errors. Fix: use a `Builder` or split into a child widget so the lookup starts below the provider.
- Don't stash a `context` and use it after an `await` without checking `mounted` — the element may be gone.

```dart
// WRONG: this `context` is above the Scaffold, so ScaffoldMessenger.of fails.
Scaffold(body: ElevatedButton(onPressed: () {/* uses outer context */}, child: ...));
// RIGHT: Builder gives a context *under* the Scaffold.
Scaffold(body: Builder(builder: (innerCtx) => ElevatedButton(
  onPressed: () => ScaffoldMessenger.of(innerCtx).showSnackBar(...), child: ...)));
```

## Keys — when you actually need them

Default reconciliation matches by `runtimeType` + position. You need a `Key` when **stateful widgets reorder/insert/remove in a list** and their state must follow the data, not the slot.

| Key | Use |
|---|---|
| `ValueKey(v)` | identity = a value (e.g. `ValueKey(job.jobId)`) — most common in lists |
| `ObjectKey(obj)` | identity = object identity (when value equality is wrong) |
| `UniqueKey()` | force a brand-new element every build (resets state, e.g. to replay an animation) |
| `GlobalKey()` | access a widget's state/size from elsewhere (`formKey.currentState!.validate()`); unique app-wide, **expensive** — don't sprinkle |

```dart
// Reorderable/filterable stateful cards: key by stable id so each card keeps its own
// scroll/animation/expanded state when the list mutates.
ListView(children: [for (final job in jobs) JobCard(key: ValueKey(job.jobId), job: job)]);
```

`GlobalKey` for an imperative navigator (the reference app uses exactly this in `main.dart`):

```dart
final _navigatorKey = GlobalKey<NavigatorState>();
MaterialApp(navigatorKey: _navigatorKey, ...);
// later, from a service / FCM handler:
final overlay = _navigatorKey.currentState?.overlay;
```

## The constraints model

> **Constraints go down. Sizes go up. Parent sets position.**

1. A parent passes a `BoxConstraints` (`minWidth, maxWidth, minHeight, maxHeight`) to each child.
2. Each child picks its own size **within** those constraints and reports it up.
3. The parent positions each child. **A widget cannot know or choose its own on-screen position** — the parent decides.

- **Tight** constraints: `min == max` on an axis → child is forced to an exact size (`SizedBox.expand()`, a `Container` with explicit `width`/`height` under tight parent).
- **Loose** constraints: `min == 0` → child may be any size up to `max` (`Center`, `Align`, `UnconstrainedBox` loosen).

This explains classic surprises: `Container(width: 100)` inside a tight parent may be ignored; `Center` re-loosens so the child can shrink to its content.

```dart
ConstrainedBox(
  constraints: const BoxConstraints(maxWidth: 480), // cap width on tablets/web
  child: Card(child: ...),
);
// width/height on SizedBox imposes a TIGHT constraint on its child:
const SizedBox(width: 40, height: 40, child: Icon(Icons.location_on));
```

## Layout widgets

```dart
Column(
  mainAxisSize: MainAxisSize.min,            // shrink-wrap height (default = max)
  mainAxisAlignment: MainAxisAlignment.start, // vertical distribution
  crossAxisAlignment: CrossAxisAlignment.start, // horizontal alignment of children
  children: [
    Text('Dr. Pérez', style: Theme.of(context).textTheme.titleMedium),
    const SizedBox(height: 4),
    Row(children: [
      const Icon(Icons.star, size: 16),
      const SizedBox(width: 4),
      const Text('4.8'),
      const Spacer(),                  // eats remaining main-axis space (= Expanded(flex:1, SizedBox))
      Text('A 1.2 km'),
    ]),
  ],
);
```

- `Expanded(child:)` = `Flexible(fit: FlexFit.tight)` — child **must** fill its share. `Flexible(fit: FlexFit.loose)` — child may be smaller. `flex:` weights the split.
- `Container` is sugar: it composes `Padding` + `Align`/constraints + `DecoratedBox` + `Transform` + margin. If you only need one of those, use the specific widget (cheaper, clearer).
- `Stack`/`Positioned`: non-positioned children are sized per `StackFit` and aligned via `alignment`; `Positioned` pins by edges.
- `Wrap`: like `Row` but wraps to a new run when out of space — ideal for chips/tags.
- `Table`: column-aligned grid with fixed/flex/intrinsic column widths.
- `IntrinsicHeight`/`IntrinsicWidth`: force children to a common cross size by pre-measuring — **O(n²)-ish**, never use per item in a `builder`.

```dart
// Wrap: chips flow to the next run when the row fills up. spacing = gap between
// items in a run; runSpacing = gap between runs (vertical here).
Wrap(
  spacing: 8,
  runSpacing: 8,
  crossAxisAlignment: WrapCrossAlignment.center,
  children: [
    for (final tag in finding.surfaces) Chip(label: Text(tag)),
  ],
);

// Table: fixed label column + flexible value column, vertically centered.
Table(
  columnWidths: const {
    0: IntrinsicColumnWidth(),   // shrink to widest label
    1: FlexColumnWidth(),        // value takes remaining width
  },
  defaultVerticalAlignment: TableCellVerticalAlignment.middle,
  children: [
    TableRow(children: [
      const Text('Diente'),
      Text(finding.tooth, textAlign: TextAlign.right),
    ]),
    TableRow(children: [
      const Text('ICDAS'),
      Text('${finding.icdas}', textAlign: TextAlign.right),
    ]),
  ],
);
```

## Scrolling

```dart
// Long, homogeneous, lazily-built list — THE default for cards.
ListView.separated(
  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
  itemCount: items.length,
  separatorBuilder: (_, __) => const SizedBox(height: 12),
  itemBuilder: (context, i) => JobCard(item: items[i]),
);

// Short form-like content that may overflow on small screens / with keyboard up.
SingleChildScrollView(child: Column(children: [...]));

// Grid.
GridView.builder(
  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.4),
  itemCount: clinics.length,
  itemBuilder: (context, i) => ClinicTile(clinics[i]),
);

// Collapsing header + lazy list in ONE scroll view.
CustomScrollView(slivers: [
  SliverAppBar(pinned: true, expandedHeight: 180, flexibleSpace: FlexibleSpaceBar(title: Text('Mis análisis'))),
  // SliverToBoxAdapter: drop a plain (non-sliver) box widget into a sliver list.
  const SliverToBoxAdapter(child: _SummaryHeader()),
  SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    sliver: SliverList.builder(itemCount: jobs.length, itemBuilder: (c, i) => JobCard(item: jobs[i])),
  ),
]);
```

A `CustomScrollView` only accepts **slivers**, not box widgets. The common sliver building blocks:

| Sliver | Use |
|---|---|
| `SliverAppBar` | collapsing/pinned/floating app bar; `pinned`, `floating`, `expandedHeight`, `flexibleSpace` |
| `SliverList.builder` / `.separated` | lazy linear list (sliver form of `ListView.builder`/`.separated`) |
| `SliverGrid.builder` | lazy grid with a `gridDelegate` |
| `SliverToBoxAdapter` | wrap a single ordinary box widget (header, banner) as a sliver |
| `SliverFillRemaining` | child fills the leftover viewport space — empty states / "no results" art at the end of a short list |
| `SliverPadding` | pad a sliver (you can't wrap a sliver in `Padding`) |
| `SliverPersistentHeader` | custom header that pins/floats; needs a `SliverPersistentHeaderDelegate` (`minExtent`, `maxExtent`, `build`, `shouldRebuild`) — use when `SliverAppBar` doesn't fit |

**ListView-inside-Column pitfall:** a `Column` gives its children *unbounded* height on the main axis, but `ListView` wants to be infinitely tall → "RenderFlex/unbounded height" crash. Fixes: wrap the list in `Expanded` (give it a bounded slice), or set `shrinkWrap: true` + `physics: NeverScrollableScrollPhysics()` for short non-scrolling lists (don't shrinkWrap large lists — it defeats laziness).

```dart
Column(children: [
  const _Header(),
  Expanded(child: ListView.builder(itemCount: n, itemBuilder: ...)), // bounded → ok
]);
```

## Responsive

```dart
final media = MediaQuery.of(context);
final isWide = media.size.width >= 600;       // tablet / web breakpoint
final topInset = media.padding.top;           // status-bar / notch height

LayoutBuilder(builder: (context, constraints) {
  // constraints from the PARENT — react to the actual box, not the whole screen.
  return constraints.maxWidth >= 600 ? const _TwoColumn() : const _SingleColumn();
});

OrientationBuilder(builder: (context, o) =>
  GridView.count(crossAxisCount: o == Orientation.portrait ? 2 : 4, children: [...]));

FractionallySizedBox(widthFactor: 0.9, child: ...); // 90% of incoming max width
```

Prefer `LayoutBuilder` (local box) over `MediaQuery.size` (whole window) when laying out a sub-region. `MediaQuery.of(context)` rebuilds the widget on every metric change (keyboard, rotation) — for granular rebuilds use `MediaQuery.sizeOf(context)` / `MediaQuery.paddingOf(context)`.

## Common UI widgets

```dart
Scaffold(
  appBar: AppBar(title: const Text('Buscar clínica')),
  backgroundColor: Colors.white,
  body: SafeArea(bottom: false, child: ...),
);

// Tappable card: Material provides the ink surface, InkWell paints the ripple.
Material(
  color: Colors.white,
  borderRadius: BorderRadius.circular(14),
  child: InkWell(
    onTap: () => Navigator.of(context).pop(clinic),
    borderRadius: BorderRadius.circular(14), // clip ripple to the rounded shape
    child: Padding(padding: const EdgeInsets.all(14), child: Row(children: [...])),
  ),
);
```

- `InkWell` needs a `Material` ancestor; for visuals-free gesture handling (drag, long-press, no ripple) use `GestureDetector`.
- `Image.asset` / `Image.network`; set `fit: BoxFit.cover|contain|fitWidth`.
- `Text` + `TextStyle`; `maxLines` + `overflow: TextOverflow.ellipsis` to clamp. `RichText`/`Text.rich` with `TextSpan` for mixed styles inline.
- Color alpha is `color.withValues(alpha: 0.13)` in current Flutter (`.withOpacity` is deprecated).

```dart
// Mixed inline styles in one paragraph. Prefer Text.rich over the raw RichText
// widget — Text.rich inherits DefaultTextStyle, RichText does not (so RichText
// renders unstyled unless you pass a full style). Nested spans inherit the parent
// span's style; a TapGestureRecognizer makes a span tappable.
Text.rich(
  TextSpan(
    style: Theme.of(context).textTheme.bodyMedium,   // base style for all children
    children: [
      const TextSpan(text: 'Diente '),
      TextSpan(text: finding.tooth, style: const TextStyle(fontWeight: FontWeight.bold)),
      const TextSpan(text: ' — ICDAS '),
      TextSpan(
        text: '${finding.icdas}',
        style: TextStyle(color: AppColors.severity(finding.icdas)),
      ),
    ],
  ),
  maxLines: 2,
  overflow: TextOverflow.ellipsis,
);
```

## Overlay + OverlayEntry

`Overlay` is a stack that floats above the route content (the `Navigator` hosts one). Insert an `OverlayEntry` to draw a banner/tooltip/popup independent of the page tree; remove it when done.

```dart
final overlay = navigatorKey.currentState?.overlay; // or Overlay.of(context)
late OverlayEntry entry;
entry = OverlayEntry(builder: (_) => _BannerWidget(onDismiss: () => entry.remove()));
overlay!.insert(entry);
```

The entry's builder gets a fresh context under the overlay; it can be a `StatefulWidget` with its own animation. Always `entry.remove()` exactly once (guard with a `removed` bool).

## Real-world usage

**1. `Scaffold` + `AppBackground` gradient/asset wrapper** (`core/widgets/app_background.dart`). `AppBackground` is a `Stack(fit: StackFit.expand)` that paints a base color, an optional full-bleed asset, then the child — used as the `Scaffold.body`:

```dart
return Scaffold(
  extendBodyBehindAppBar: true,
  body: AppBackground(
    assetPath: 'assets/img/patient/home/bg.png',
    child: SafeArea(child: ...),  // SafeArea INSIDE so chrome respects the notch
  ),
);
```

**2. `ListView.separated`/`.builder` for job / clinic / consultation cards** with pull-to-refresh + scroll-based pagination (real pattern from `doctor_home_page.dart`):

```dart
RefreshIndicator(
  onRefresh: () => context.read<DoctorConsultationsCubit>().fetchInitial(),
  child: NotificationListener<ScrollNotification>(
    onNotification: (n) {
      // Cursor pagination (after/before) — fetch next page near the bottom.
      if (!state.isLoadingMore && state.hasMore && n.metrics.extentAfter < 240) {
        context.read<DoctorConsultationsCubit>().fetchMore();
      }
      return false; // let the notification keep bubbling
    },
    child: ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(), // refresh works even when short
      itemCount: visible.length + (state.isLoadingMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, i) => i >= visible.length
          ? const Center(child: CircularProgressIndicator())
          : _ConsultationCard(consultation: visible[i]),
    ),
  ),
);
```

Each card is `Material` + `InkWell` (rounded ripple) over a `Container` with `Border.all(color: AppColors.stroke)`, an avatar circle, and an `Expanded(Column(...))` of `Text` with `maxLines`/`ellipsis` — see `patient_clinics_search_page.dart`.

**3. `Overlay` + `OverlayEntry` foreground notification banner** (`main.dart`). On a foreground FCM `RemoteMessage`, insert a top banner via the global navigator's overlay. The banner is a `StatefulWidget` with `SingleTickerProviderStateMixin`, slides in with `SlideTransition` + `AnimationController`, auto-dismisses after 4 s, and removes its own entry:

```dart
final overlay = _navigatorKey.currentState?.overlay;
if (overlay == null) return;
var removed = false;
late final OverlayEntry entry;
void remove() { if (!removed) { removed = true; entry.remove(); } }
entry = OverlayEntry(builder: (_) => _NotificationBanner(title: title, body: body, onDismiss: remove));
overlay.insert(entry);
```

```dart
// inside _NotificationBannerState.build — positioned under the status bar, slides from top:
final topPadding = MediaQuery.of(context).padding.top;     // (4) SafeArea/MediaQuery insets
return Positioned(top: topPadding + 8, left: 16, right: 16,
  child: SlideTransition(position: _slide,                 // Tween Offset(0,-1.5)→zero
    child: Material(color: Colors.transparent, child: GestureDetector(onTap: _dismiss,
      child: Container(/* white rounded card + boxShadow withValues(alpha: 0.13) */)))));
```

The banner only handles presentation; the actual routing is decoupled — `_dispatchNotificationEvent` pushes typed events onto a `NotificationEventBus` (broadcast `StreamController`) that cubits listen to.

**4. `SafeArea` / `MediaQuery` padding.** App-bar-less search/list screens use `SafeArea(bottom: false, child: Column(...))` so the top inset is respected but the list can run to the device edge; the overlay banner reads `MediaQuery.of(context).padding.top` to clear the notch. Use `MediaQuery.of(context).size.height * 0.5` for empty-state art sizing (as in `doctor_home_page.dart`).

## Common mistakes

| Pitfall | Fix |
|---|---|
| "RenderFlex children have non-zero flex but incoming height is unbounded" (`ListView` in `Column`) | Wrap list in `Expanded`, or `shrinkWrap:true`+`NeverScrollableScrollPhysics` for short lists |
| `Container(width:...)` ignored | Parent passed **tight** constraints; wrap in `Center`/`Align` to re-loosen, or use `ConstrainedBox` |
| `Theme.of`/`Scaffold.of`/`Navigator.of` returns null or throws | `context` is above the provider; insert a `Builder` or split a child widget |
| State resets when list reorders/filters | Add `key: ValueKey(item.id)` to the stateful list items |
| `Expanded`/`Flexible` "must be inside Flex" error | Only valid inside `Row`/`Column`/`Flex` — not in `Stack`/`SingleChildScrollView` |
| Using `context` after `await` | Guard with `if (!mounted) return;` before touching `context`/`setState` |
| Leaked controllers / streams | Dispose every `AnimationController`/`StreamSubscription`/`TextEditingController` in `dispose()` |
| Whole screen rebuilds on keyboard show | Use `MediaQuery.sizeOf`/`paddingOf` (granular) instead of `MediaQuery.of` |
| `withOpacity` deprecation warning | Use `color.withValues(alpha: x)` |
| `OverlayEntry` removed twice → exception | Guard removal with a `removed` bool flag |
| `IntrinsicHeight` in a `builder` → jank | Restructure to fixed/flex sizes; intrinsics pre-measure every item |
| `setState` called in `build`/after `dispose` | Only call while mounted and outside `build` |

## See also
- [state-management.md](state-management.md) — Cubit/Bloc that feed these widgets (`BlocBuilder`/`BlocListener`, `context.read/select`)
- [navigation-and-routing.md](navigation-and-routing.md) — `flow_builder`, `static route()/page()` factories, `Navigator.push`
- [theming-material3.md](theming-material3.md) — Material 3 `ThemeData`, `AppColors`, `TextTheme`
- [animations.md](animations.md) — `AnimationController` + `SlideTransition` (the overlay banner)
- https://docs.flutter.dev/ui/layout/constraints — "constraints go down, sizes go up"
- https://api.flutter.dev/flutter/widgets/State-class.html — State lifecycle
- https://docs.flutter.dev/ui/layout — layout widget catalog
- https://docs.flutter.dev/cookbook/lists/floating-app-bar — `CustomScrollView` + slivers
- https://api.flutter.dev/flutter/widgets/SliverToBoxAdapter-class.html — box widgets inside a sliver list
- https://api.flutter.dev/flutter/widgets/Table-class.html — `Table` + `columnWidths`/`TableRow`
- https://api.flutter.dev/flutter/widgets/Text/Text.rich.html — `Text.rich` + `TextSpan`
- https://api.flutter.dev/flutter/dart-ui/Color/withValues.html — `Color.withValues` (replaces deprecated `withOpacity`)
- https://api.flutter.dev/flutter/widgets/Overlay-class.html — Overlay/OverlayEntry
