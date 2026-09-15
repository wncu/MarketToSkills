# Animations

## Overview
Flutter animations split into two families: **implicit** (set a target, the framework tweens for you — `Animated*` widgets + `TweenAnimationBuilder`) and **explicit** (you drive an `AnimationController` with a `Ticker` and decide when to `forward`/`reverse`/`repeat`). Reach for implicit first; drop to explicit only when you need orchestration (staggering, looping, gesture-driven, status callbacks) or a `*Transition` widget. Imports: `package:flutter/material.dart` re-exports everything; `package:flutter/animation.dart` + `package:flutter/widgets.dart` are the lower-level entry points.

## Quick reference

| Need | Use | Key params |
|------|-----|-----------|
| Animate size/color/padding/decoration | `AnimatedContainer` | `duration`, `curve`, all `Container` props |
| Fade in/out | `AnimatedOpacity` | `opacity` (0–1), `duration` |
| Move within a `Stack` | `AnimatedPositioned` | `left/top/right/bottom/width/height`, `duration` |
| Re-align within parent | `AnimatedAlign` | `alignment`, `duration` |
| Swap one child for another | `AnimatedSwitcher` | `duration`, `transitionBuilder`, child needs unique `Key` |
| Animate text style | `AnimatedDefaultTextStyle` | `style`, `duration` |
| One-shot tween without a controller | `TweenAnimationBuilder<T>` | `tween`, `duration`, `builder` |
| Manual control / orchestration | `AnimationController` | `vsync`, `duration`, `.forward()/.reverse()/.repeat()/.stop()` |
| Ticker for one controller | `SingleTickerProviderStateMixin` | provides `vsync: this` |
| Ticker for many controllers | `TickerProviderStateMixin` | provides `vsync: this` |
| Map controller 0–1 → values | `Tween<T>().animate(CurvedAnimation(...))` | `parent`, `curve` |
| Rebuild on each frame | `AnimatedBuilder` / `addListener` | `animation`, `builder` |
| Pre-built transitions | `FadeTransition` `SlideTransition` `ScaleTransition` `RotationTransition` `SizeTransition` | take an `Animation<T>` |
| Stagger many props on one controller | `CurvedAnimation(curve: Interval(0.0,0.5))` | `begin`/`end` 0–1 windows |
| Shared-element screen transition | `Hero` | matching `tag` on both routes |
| Custom page transition | `PageRouteBuilder` | `transitionsBuilder`, `transitionDuration` |
| Bespoke drawing | `CustomPaint` + `CustomPainter` | `painter`, `shouldRepaint` |
| List insert/remove animation | `AnimatedList` | `GlobalKey<AnimatedListState>` |
| Swipe-to-dismiss | `Dismissible` | `key`, `onDismissed`, `background` |

---

## Implicit animations

Implicit widgets interpolate automatically whenever a property you pass changes between builds. No controller, no `dispose`. They all share `duration` (required) and `curve` (default `Curves.linear`).

```dart
class _ScoreBadge extends StatelessWidget {
  const _ScoreBadge({required this.healthy});
  final bool healthy; // flips when analysis completes

  @override
  Widget build(BuildContext context) {
    // Each rebuild with a new `healthy` tweens color + size over 400ms.
    return AnimatedContainer(
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeInOut,
      width: healthy ? 120 : 80,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: healthy ? Colors.green.shade100 : Colors.red.shade100,
        borderRadius: BorderRadius.circular(healthy ? 24 : 8),
      ),
      child: const Text('ICDAS'),
    );
  }
}
```

`AnimatedOpacity`, `AnimatedPositioned` (only inside a `Stack`), `AnimatedAlign`, and `AnimatedDefaultTextStyle` follow the same shape — change the named property, get a free tween:

```dart
AnimatedOpacity(opacity: visible ? 1 : 0, duration: const Duration(milliseconds: 250), child: child);

Stack(children: [
  AnimatedPositioned(
    duration: const Duration(milliseconds: 300),
    curve: Curves.easeOut,
    left: open ? 0 : -240, top: 0, width: 240, height: 400,
    child: panel,
  ),
]);

AnimatedDefaultTextStyle(
  duration: const Duration(milliseconds: 200),
  style: TextStyle(
    fontSize: selected ? 20 : 16,
    fontWeight: selected ? FontWeight.bold : FontWeight.normal,
    color: Theme.of(context).colorScheme.primary,
  ),
  child: const Text('Urgencia'),
);
```

### AnimatedSwitcher
Cross-fades (or your custom transition) between two children. **The new child must carry a `Key` different from the old one** — otherwise Flutter sees a same-type update, not a replacement, and nothing animates. `switchInCurve`/`switchOutCurve` default to `Curves.linear`.

```dart
AnimatedSwitcher(
  duration: const Duration(milliseconds: 300),
  // Override the default FadeTransition with a scale-fade.
  transitionBuilder: (child, anim) =>
      ScaleTransition(scale: anim, child: FadeTransition(opacity: anim, child: child)),
  child: isLoading
      ? const CircularProgressIndicator(key: ValueKey('loading'))
      : Text(result, key: ValueKey(result)), // distinct key per state
);
```

### TweenAnimationBuilder
One-shot, controller-free explicit-ish animation: it owns an internal controller and re-animates from the *current* value toward the new `tween.end` whenever `end` changes. Good for "animate once on first build" (e.g. a count-up).

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: overallHealthScore), // 0.0–1.0
  duration: const Duration(milliseconds: 800),
  curve: Curves.easeOut,
  builder: (context, value, child) => LinearProgressIndicator(value: value),
);
```

### Curves
`Curves` is a catalog of `Curve` constants: `linear`, `ease`, `easeIn/Out/InOut`, `fastOutSlowIn` (Material default), `bounceOut`, `elasticOut`, `decelerate`. Use `curve.flipped` to reverse, or `Interval(begin, end, curve:)` for staggering (below).

---

## Explicit animations

### AnimationController + TickerProvider
`AnimationController` is itself an `Animation<double>` ranging `0.0 → 1.0` (or your `lowerBound`/`upperBound`). It needs a `vsync` (a `TickerProvider`) so it only ticks when the route is visible. Mix in `SingleTickerProviderStateMixin` for one controller, `TickerProviderStateMixin` for several. **Always `dispose()` the controller.**

```dart
class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 600),
  )..repeat(reverse: true); // ping-pong 0→1→0 forever

  // Map the linear 0–1 controller onto a curved 0.95–1.05 scale.
  late final Animation<double> _scale =
      Tween(begin: 0.95, end: 1.05).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut));

  @override
  void dispose() {
    _c.dispose(); // leaks a Ticker otherwise — assertion in debug
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ScaleTransition(scale: _scale, child: widget.child);
}
```

Controller methods: `forward({from})`, `reverse({from})`, `repeat({min, max, reverse, period, count})` (`count` bounds the number of cycles — omit for infinite), `stop()`, `reset()`, `animateTo(target, {duration, curve})`, `animateWith(Simulation)` (physics-driven, e.g. a `SpringSimulation`), `fling({velocity, springDescription})`. Read `.value` (current double) and `.status` (`AnimationStatus.{dismissed, forward, reverse, completed}`). `forward()`/`reverse()` return a `TickerFuture` you can `.then(...)` / `.whenComplete(...)`.

### Tween + CurvedAnimation
A `Tween<T>` maps the controller's 0–1 onto any type (`ColorTween`, `Tween<Offset>`, `RectTween`, `IntTween`, `DecorationTween`). `.animate(parent)` yields an `Animation<T>`; wrap `parent` in `CurvedAnimation` to apply easing without touching the controller's linear value. Pass `reverseCurve:` to ease the return leg differently.

`CurvedAnimation` is now disposable (it adds a status listener to its parent). For the common `Tween().animate(CurvedAnimation(parent: _c, ...))` stored in a `late final` field this is harmless — it lives as long as the controller and is collected with the `State`. But if you create `CurvedAnimation`s repeatedly (e.g. per gesture, or many short-lived ones), hold the instance and call `.dispose()` to drop the listener; `isDisposed` guards against double-dispose.

### Rebuilding: AnimatedBuilder vs addListener
Prefer `AnimatedBuilder` (or a `*Transition` widget) — it rebuilds only its `builder`, and the `child` arg lets you hoist a subtree that doesn't depend on the animation so it isn't rebuilt every frame. Use raw `addListener(() => setState(...))` only for non-widget side effects.

```dart
AnimatedBuilder(
  animation: _c,
  // `child` is built ONCE, not per frame — keep expensive subtrees here.
  child: const Icon(Icons.medical_services, size: 48),
  builder: (context, child) => Transform.rotate(angle: _c.value * 2 * math.pi, child: child),
);
```

### Transition widgets
Each takes a pre-built `Animation` and is cheaper than rebuilding via `setState`:

| Widget | Drives | Animation type |
|--------|--------|----------------|
| `FadeTransition` | `opacity` | `Animation<double>` |
| `SlideTransition` | `position` (fractional offset of own size) | `Animation<Offset>` |
| `ScaleTransition` | `scale` | `Animation<double>` |
| `RotationTransition` | `turns` (1.0 = 360°) | `Animation<double>` |
| `SizeTransition` | `sizeFactor` (collapses along `axis`) | `Animation<double>` |

```dart
SlideTransition(
  position: Tween(begin: const Offset(0, -1), end: Offset.zero)
      .animate(CurvedAnimation(parent: _c, curve: Curves.easeOut)),
  child: banner,
);
```

---

## Staggered animations

Drive several values from **one** controller, each gated to a sub-window of the 0–1 timeline via `Interval(start, end, curve:)`. This keeps everything in sync and disposes as a unit.

```dart
class _StaggeredCard extends StatefulWidget { /* ... */ }

class _StaggeredCardState extends State<_StaggeredCard> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  // Fade occupies the first 50% of the timeline...
  late final Animation<double> _opacity =
      CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.5, curve: Curves.easeIn));
  // ...slide-up the last 50%.
  late final Animation<Offset> _slide = Tween(begin: const Offset(0, 0.3), end: Offset.zero)
      .animate(CurvedAnimation(parent: _c, curve: const Interval(0.5, 1.0, curve: Curves.easeOut)));

  @override
  void dispose() { _c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _opacity,
        child: SlideTransition(position: _slide, child: widget.child),
      );
}
```

---

## Hero animations

Wrap the source widget and the destination widget in `Hero` with the **same `tag`**; on `Navigator.push` Flutter flies the bounded box between routes. Tags must be unique per screen.

```dart
// List screen
Hero(tag: 'job-${job.id}', child: Image.network(job.thumbUrl));
// Detail screen — identical tag
Hero(tag: 'job-${job.id}', child: Image.network(job.fullUrl, fit: BoxFit.cover));
```

For non-image heroes wrap children in `Material(type: MaterialType.transparency)` to avoid text/ink artifacts during flight.

**`flightShuttleBuilder`** — override the widget rendered *during* the flight (the default reparents the destination `Hero.child`). Signature: `(flightContext, animation, flightDirection, fromHeroContext, toHeroContext) → Widget`. `flightDirection` is `HeroFlightDirection.push` or `.pop`; pick the source or destination subtree accordingly.

```dart
Hero(
  tag: 'job-${job.id}',
  flightShuttleBuilder: (flightCtx, animation, direction, fromCtx, toCtx) {
    // Render the destination hero's subtree during the whole flight.
    final hero = (direction == HeroFlightDirection.push ? toCtx : fromCtx).widget as Hero;
    return hero.child;
  },
  child: Image.network(job.thumbUrl),
);
```

**Radial hero** — to expand a circle into a rectangle, supply `createRectTween: (begin, end) => MaterialRectCenterArcTween(begin: begin, end: end)` (arcs the rect's center along a curved path instead of a straight line) and clip the shuttle (e.g. `ClipOval`/`ClipRRect` animated by `animation`). `createRectTween` defaults to a straight `MaterialRectArcTween`.

---

## Page route transitions

`PageRouteBuilder` gives you `transitionsBuilder(context, animation, secondaryAnimation, child)` where `animation` runs 0→1 on push, 1→0 on pop. `secondaryAnimation` reflects the *next* route covering this one.

```dart
Route<T> slideUpRoute<T>(Widget page) => PageRouteBuilder<T>(
      transitionDuration: const Duration(milliseconds: 300),
      pageBuilder: (_, __, ___) => page,
      transitionsBuilder: (_, animation, __, child) => SlideTransition(
        position: Tween(begin: const Offset(0, 1), end: Offset.zero)
            .animate(CurvedAnimation(parent: animation, curve: Curves.easeOut)),
        child: child,
      ),
    );

Navigator.of(context).push(slideUpRoute(const AnalysisDetailScreen()));
```

---

## CustomPainter / CustomPaint (brief)

For shapes the widget tree can't express (gauges, graphs, ICDAS arch diagrams), pair `CustomPaint(painter: ...)` with a `CustomPainter`. Animate by passing an `Animation` as the painter's `repaint` arg (cheapest — repaints without rebuilding) or feeding it `controller.value`.

```dart
class ArcGaugePainter extends CustomPainter {
  ArcGaugePainter(this.progress) : super(repaint: null); // pass an Animation here to auto-repaint
  final double progress; // 0–1
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.stroke..strokeWidth = 8..color = Colors.teal;
    canvas.drawArc(Offset.zero & size, -math.pi / 2, 2 * math.pi * progress, false, paint);
  }
  @override
  bool shouldRepaint(ArcGaugePainter old) => old.progress != progress; // skip identical frames
}
```

---

## Physics & list widgets

### Physics-based simulations
For motion that obeys real dynamics rather than a fixed `duration` (settle-after-drag, spring-back), drive the controller with a `Simulation` via `animateWith` instead of `forward`/`animateTo`:

```dart
void _settle(double velocity) {
  const spring = SpringDescription(mass: 1, stiffness: 180, damping: 22);
  // SpringSimulation drives _c.value from its current value toward 1.0 (the rest target).
  _c.animateWith(SpringSimulation(spring, _c.value, 1.0, velocity));
}
```

`fling({velocity, springDescription})` is the shorthand for the common "release a drag" case (it builds a critically-damped `SpringSimulation` internally). `Dismissible` and `Slidable`-style swipes use this physics under the hood.

### AnimatedList
Animates inserts/removals. Mutate via a `GlobalKey<AnimatedListState>` and **mirror every change in your backing list** in the same frame.

```dart
final _listKey = GlobalKey<AnimatedListState>();
final _messages = <ChatMessage>[];

void _add(ChatMessage m) {
  _messages.insert(0, m);
  _listKey.currentState!.insertItem(0, duration: const Duration(milliseconds: 250));
}

AnimatedList(
  key: _listKey,
  reverse: true,
  initialItemCount: _messages.length,
  itemBuilder: (context, i, animation) =>
      SizeTransition(sizeFactor: animation, child: _Bubble(_messages[i])),
);
```

### Dismissible
Swipe-to-remove with built-in fling physics. `key` is mandatory; remove the item from your data source inside `onDismissed`.

```dart
Dismissible(
  key: ValueKey(consultation.id),
  direction: DismissDirection.endToStart,
  background: Container(color: Colors.red, alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: 16), child: const Icon(Icons.delete, color: Colors.white)),
  confirmDismiss: (_) async => await _confirm(context), // gate destructive ops
  onDismissed: (_) => context.read<ConsultationsCubit>().cancel(consultation.id),
  child: ConsultationTile(consultation),
);
```

---

## Performance

| Rule | Why |
|------|-----|
| Animate cheap properties (`opacity`, `transform`, `color`) over layout (`width`, `padding`) | Transform/opacity skip layout; resizing relayouts the subtree every frame |
| Prefer `*Transition` / `AnimatedBuilder` over `setState` in a listener | Rebuilds only the builder, not the whole `State.build` |
| Pass static subtrees via the `child:` arg of `AnimatedBuilder`/`TweenAnimationBuilder` | Built once, reused each frame |
| Wrap a continuously-animating subtree in `RepaintBoundary` | Isolates its layer so repaints don't dirty siblings |
| Always `dispose()` controllers; gate with `vsync` | Leaked `Ticker`s keep animating off-screen and trip a debug assertion |
| Use `const` on non-animating children | Skips rebuild entirely |

```dart
RepaintBoundary(
  child: AnimatedBuilder(animation: _spin, builder: (_, child) => Transform.rotate(angle: _spin.value, child: child), child: logo),
);
```

---

## Real-world usage

The reference app shows transient toast-style alerts (FCM events relayed through the `NotificationEventBus`) via an **Overlay-injected banner** that slides down from the top and slides back up on dismiss. It uses a single explicit controller with `SingleTickerProviderStateMixin`, a `Tween<Offset>` driving a `SlideTransition`, and chains the exit animation's future to remove the `OverlayEntry`. This is the canonical explicit-animation pattern in the codebase — copy-adapt it for any imperative, self-removing overlay UI.

```dart
class NotificationBanner extends StatefulWidget {
  const NotificationBanner({super.key, required this.message, required this.onDismissed});
  final String message;
  final VoidCallback onDismissed; // called after the slide-out completes (removes the OverlayEntry)

  @override
  State<NotificationBanner> createState() => _NotificationBannerState();
}

class _NotificationBannerState extends State<NotificationBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );

  // Start fully above the screen (offset is a fraction of the banner's own height)
  // and slide to its resting position.
  late final Animation<Offset> _offset = Tween<Offset>(
    begin: const Offset(0, -1.5),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));

  @override
  void initState() {
    super.initState();
    _controller.forward(); // slide in on mount
  }

  Future<void> _dismiss() async {
    // Reverse the slide, then tell the caller to remove us from the Overlay.
    await _controller.reverse();
    if (mounted) widget.onDismissed();
  }

  @override
  void dispose() {
    _controller.dispose(); // mandatory — Ticker leak otherwise
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SlideTransition(
        position: _offset,
        child: GestureDetector(
          onTap: _dismiss, // tap-to-dismiss
          child: Material(
            elevation: 6,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(widget.message), // Spanish UI string, e.g. "Análisis listo"
            ),
          ),
        ),
      ),
    );
  }
}
```

Insertion site (a static `core/widgets` service builds the `OverlayEntry` and wires `onDismissed` to `entry.remove()`):

```dart
void showBanner(BuildContext context, String message) {
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => Positioned(
      top: 0, left: 12, right: 12,
      child: NotificationBanner(message: message, onDismissed: () => entry.remove()),
    ),
  );
  Overlay.of(context).insert(entry);
}
```

Notes for this codebase:
- Only `dispose` the controller you own; the banner is short-lived so there's no `AnimatedBuilder`/`RepaintBoundary` needed (one cheap `SlideTransition`).
- For list-based animated UI (chat, consultations) prefer `AnimatedSwitcher`/`AnimatedList` with stable keys derived from model `id` — models are `Equatable`, so `ValueKey(model.id)` is safe.
- Auto-dismiss can be added by racing `_controller.forward()` with a `Future.delayed(...).then((_) => _dismiss())`; guard every async continuation with `if (mounted)`.

---

## Common mistakes

| Pitfall | Fix |
|---------|-----|
| `AnimatedSwitcher` doesn't animate | Give each child a distinct `Key` (`ValueKey`) so Flutter sees a replacement |
| Forgetting `_controller.dispose()` | Always dispose in `State.dispose`; use `SingleTickerProviderStateMixin` for `vsync` |
| Using `TickerProviderStateMixin` for one controller | Use `SingleTickerProviderStateMixin` (asserts you keep exactly one) |
| `setState` in `addListener` for every frame | Use `AnimatedBuilder` or a `*Transition` widget instead |
| Animating `width`/`height`/`padding` in a hot loop | Animate `Transform`/opacity; relayout per frame is the #1 jank source |
| Calling `forward()` before `vsync` is ready | Trigger in `initState` after the controller is constructed, never in the constructor body of a non-`late` field |
| `Dismissible`/`AnimatedList` without a `key` / out-of-sync backing list | Provide a unique `key`; mutate the data list in the same call as `insertItem`/`removeItem` |
| Reusing a `Tween` instance passed to `TweenAnimationBuilder` | The builder mutates it — create a fresh `Tween` inline, don't store it |
| Heavy widget rebuilt every frame inside `AnimatedBuilder.builder` | Hoist it into the `child:` arg (built once) |
| `Hero` with duplicate `tag` on the same screen | Tags must be unique per route; derive from a model id |
| Async `await _controller.reverse()` then touching `context` | Guard with `if (mounted)` after every `await` |

---

## See also
- [state-management.md](state-management.md) — driving animations from Cubit/Bloc state changes
- [navigation.md](navigation-and-routing.md) — Hero + `PageRouteBuilder` alongside `flow_builder` routing
- [widgets-layout.md](widgets-and-layout.md) — `Stack`/`Align`/`Transform` that the `Animated*` variants wrap
- [performance.md](performance-and-devtools.md) — `RepaintBoundary`, frame budget, profiling jank
- https://docs.flutter.dev/ui/animations — animations overview & decision guide
- https://docs.flutter.dev/ui/animations/tutorial — explicit controller/Tween/AnimatedBuilder tutorial
- https://docs.flutter.dev/ui/animations/hero-animations — Hero standard & radial
- https://api.flutter.dev/flutter/widgets/HeroFlightShuttleBuilder.html — flightShuttleBuilder signature (flightContext, animation, flightDirection, fromHeroContext, toHeroContext)
- https://api.flutter.dev/flutter/animation/CurvedAnimation-class.html — dispose()/isDisposed listener cleanup
- https://api.flutter.dev/flutter/animation/AnimationController/repeat.html — repeat({min, max, reverse, period, count})
- https://api.flutter.dev/flutter/widgets/AnimatedSwitcher-class.html — keying requirement & transitionBuilder
- https://api.flutter.dev/flutter/widgets/TweenAnimationBuilder-class.html — tween-ownership behavior
