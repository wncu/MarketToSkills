# Theming & Material 3

## Overview
Theming centralizes color, typography, shape, and component styling so widgets read tokens from `Theme.of(context)` instead of hardcoding values. Material 3 (`useMaterial3: true`) is the modern default in current Flutter — it changes elevation (tonal/surface-tint instead of drop shadows), default components (`NavigationBar` over `BottomNavigationBar`), and the color model (a 45-slot `ColorScheme` derived from a seed). The reference app uses a single light Material 3 theme plus `AppColors`/`AppGradients` constant classes — gradients are not expressible in `ColorScheme`, so they live in their own class and never inline.

## Quick reference

| API / Widget | Purpose |
|---|---|
| `ThemeData(useMaterial3: true, ...)` | Root theme object. M3 is default in recent SDKs; set explicitly for clarity. |
| `ColorScheme.fromSeed(seedColor:, brightness:)` | Generate a full 45-color scheme from one seed color. |
| `ColorScheme(brightness:, primary:, ...)` | Hand-author every role (rare; prefer `fromSeed`). |
| `Theme.of(context).colorScheme.primary` | Read a color role at build time (rebuilds on theme change). |
| `Theme.of(context).textTheme.titleLarge` | Read a type token. |
| `ThemeExtension<T>` | Add custom tokens (brand colors, spacing) the SDK doesn't model. |
| `TextTheme(...)` | 15 M3 text styles: `displayLarge`…`bodySmall`…`labelSmall`. |
| `AppBarTheme` / `AppBarThemeData` | AppBar defaults (color, elevation, `surfaceTintColor`). |
| `InputDecorationTheme` | Global `TextField`/`TextFormField` borders, fill, padding. |
| `FilledButtonThemeData` / `ElevatedButtonThemeData` / `OutlinedButtonThemeData` / `TextButtonThemeData` | Per-button-type styling via `ButtonStyle`. |
| `CardThemeData` | Card defaults (was `CardTheme` pre-3.29 — see Common mistakes). |
| `NavigationBarThemeData` | M3 bottom nav (the M3 successor to `BottomNavigationBar`). |
| `BottomNavigationBarThemeData` | M2-style bottom nav (still valid; the reference app rolls a custom one). |
| `MaterialApp(theme:, darkTheme:, themeMode:)` | Wire light/dark themes + selection mode. |
| `ColorScheme.brightness` / `ThemeData.brightness` | Light vs dark. |
| `WidgetStateProperty.resolveWith((states) => ...)` | State-dependent styling (hovered/pressed/disabled). Renamed from `MaterialStateProperty`. |
| `LinearGradient` / `BoxDecoration(gradient:)` | Gradients (not part of `ColorScheme`). |
| `CupertinoApp` / `CupertinoTheme` | iOS-flavored theming for Cupertino widgets. |

## ThemeData + ColorScheme

`ColorScheme.fromSeed` is the canonical entry point: give it one brand color and it derives a tonally consistent set of 45 roles. Override individual roles by passing them after the seed.

```dart
final colorScheme = ColorScheme.fromSeed(
  seedColor: const Color(0xFF0688D3),
  brightness: Brightness.light,
  // Overrides win over the generated palette. Use sparingly — they break
  // the tonal harmony fromSeed guarantees.
  primary: const Color(0xFF0688D3),
);

final theme = ThemeData(
  useMaterial3: true, // M3: elevation tint, NavigationBar, new ColorScheme math
  colorScheme: colorScheme,
  scaffoldBackgroundColor: const Color(0xFFF5F7FA),
);
```

**Color roles** (the ones you reach for most):

| Role | Use for | Paired "on" role |
|---|---|---|
| `primary` | Main brand actions (FAB, filled buttons) | `onPrimary` (text/icon on primary) |
| `secondary` | Less-prominent accents, chips | `onSecondary` |
| `tertiary` | Contrasting accents | `onTertiary` |
| `surface` | Cards, sheets, app bars (M3 unified `background` into `surface`) | `onSurface` |
| `surfaceContainerHighest` | Subtle fills (replaces deprecated `surfaceVariant`) | `onSurfaceVariant` |
| `error` | Error states/borders | `onError` |
| `outline` / `outlineVariant` | Borders, dividers | — |

> M3 deprecated `background`/`onBackground` (use `surface`/`onSurface`) and `surfaceVariant` (use `surfaceContainerHighest`), both after v3.18. `ColorScheme.fromSeed` also accepts `dynamicSchemeVariant` (default `DynamicSchemeVariant.tonalSpot`) and `contrastLevel` (-1.0…1.0) for accessibility tuning.

> **OS wallpaper colors (Material You):** the `dynamic_color` package exposes `DynamicColorBuilder` → `(lightDynamic, darkDynamic)`, which you feed to `ColorScheme.fromSeed`'s `dynamicSchemeVariant`/override path on Android 12+ (falls back to your seed elsewhere). The reference app deliberately does **not** use it — the brand requires a fixed `0xFF0688D3` seed, so wallpaper-derived theming is out of scope.

### Reading the theme
```dart
@override
Widget build(BuildContext context) {
  final cs = Theme.of(context).colorScheme;
  final tt = Theme.of(context).textTheme;
  // Theme.of registers a dependency → this widget rebuilds if the theme changes
  // (e.g. light↔dark). Never cache it across builds.
  return Text('Análisis listo', style: tt.titleMedium?.copyWith(color: cs.primary));
}
```

## ThemeExtension for custom tokens

`ColorScheme` can't hold brand-specific tokens (gradients, premium amber, custom spacing). `ThemeExtension` adds typed tokens that participate in theme lerp (smooth light↔dark transitions). You must implement `copyWith` and `lerp`.

```dart
@immutable
class BrandTokens extends ThemeExtension<BrandTokens> {
  const BrandTokens({required this.premium, required this.cardRadius});

  final Color premium;
  final double cardRadius;

  @override
  BrandTokens copyWith({Color? premium, double? cardRadius}) => BrandTokens(
        premium: premium ?? this.premium,
        cardRadius: cardRadius ?? this.cardRadius,
      );

  @override
  BrandTokens lerp(ThemeExtension<BrandTokens>? other, double t) {
    if (other is! BrandTokens) return this;
    return BrandTokens(
      premium: Color.lerp(premium, other.premium, t)!,
      cardRadius: lerpDouble(cardRadius, other.cardRadius, t)!,
    );
  }
}

// Register on ThemeData:
ThemeData(extensions: const [BrandTokens(premium: Color(0xFFF4B400), cardRadius: 12)]);

// Read it:
final premium = Theme.of(context).extension<BrandTokens>()!.premium;
```

> The reference app opts for plain `static const` classes (`AppColors`, `AppGradients`) instead of `ThemeExtension`. That's a deliberate trade-off: simpler and tree-shakeable, but tokens are NOT theme-aware (no automatic dark-mode swap). Fine here because the app ships a single light theme.

## TextTheme + typography + custom fontFamily

M3 defines 15 named styles across `display`/`headline`/`title`/`body`/`label` × `Large`/`Medium`/`Small`. Set `fontFamily` once on `ThemeData` to apply a custom font everywhere; override individual slots in `textTheme`.

```dart
ThemeData(
  fontFamily: 'Roboto', // applies to every TextStyle that doesn't set its own family
  textTheme: const TextTheme(
    // height is a multiplier of fontSize; 20/16 == 1.25 line-height
    labelLarge: TextStyle(fontSize: 16, height: 20 / 16, fontWeight: FontWeight.w600),
    titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
  ),
);
```

Register the font in `pubspec.yaml` (assets) — `fontFamily: 'Roboto'` matches the `family:` declared there:
```yaml
flutter:
  fonts:
    - family: Roboto
      fonts:
        - asset: assets/fonts/Roboto-Regular.ttf
        - asset: assets/fonts/Roboto-SemiBold.ttf
          weight: 600
```

## Component themes

Style a component type once on `ThemeData` so every instance inherits it. Button themes wrap a `ButtonStyle`; use `WidgetStateProperty.resolveWith` for state-dependent values.

```dart
ThemeData(
  appBarTheme: AppBarTheme(
    backgroundColor: Colors.white,
    foregroundColor: const Color(0xFF07394F),
    // M3 tints app bars with surfaceTint on scroll; kill it for flat brand bars:
    surfaceTintColor: Colors.transparent,
    centerTitle: false,
    elevation: 2,
    titleTextStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
  ),

  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.all(16),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: Color(0xFFE2E2E2)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: Color(0xFF0688D3), width: 1.5),
    ),
  ),

  filledButtonTheme: FilledButtonThemeData(
    style: ButtonStyle(
      minimumSize: WidgetStateProperty.all(const Size(0, 44)),
      backgroundColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.disabled)
            ? const Color(0xFFBAC3C8)
            : const Color(0xFF0688D3),
      ),
      foregroundColor: WidgetStateProperty.all(Colors.white),
      shape: WidgetStateProperty.all(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
  ),

  cardTheme: const CardThemeData( // NOTE: CardThemeData, not CardTheme (post-3.29)
    elevation: 1,
    margin: EdgeInsets.symmetric(vertical: 6),
  ),
);
```

**M3 NavigationBar** (the modern bottom nav) is themed via `NavigationBarThemeData`:
```dart
NavigationBarThemeData(
  height: 72,
  backgroundColor: Colors.white,
  indicatorColor: const Color(0xFF0688D3).withValues(alpha: 0.12),
  labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12)),
);
// Used by:  NavigationBar(selectedIndex: i, onDestinationSelected: ..., destinations: [
//   NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Inicio'),
// ])
```
The M2 equivalent `BottomNavigationBarThemeData` (for `BottomNavigationBar`) still works; the reference app uses neither and rolls a custom widget (below).

## Dark mode

Provide two `ThemeData` objects and a `themeMode`. Each theme's `ColorScheme.brightness` must match its intent — don't reuse a light scheme in `darkTheme`.

```dart
MaterialApp(
  theme: ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.light),
  ),
  darkTheme: ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark),
  ),
  themeMode: ThemeMode.system, // .light | .dark | .system (follows OS toggle)
);
```
Branch on brightness inside widgets when needed: `Theme.of(context).brightness == Brightness.dark`.

## MaterialApp wiring

```dart
MaterialApp(
  title: 'My App',
  theme: buildAppTheme(),          // single source of truth
  debugShowCheckedModeBanner: false,
  home: const SplashPage(),
);
```
Keep the theme builder in one file (`lib/core/theme.dart`) and import it; never inline a `ThemeData` literal in `MaterialApp` for a real app.

**Router constructors carry the same theme args.** `theme` / `darkTheme` / `themeMode` live on `MaterialApp` itself, so they wire identically whether you use `MaterialApp(home:)`, `MaterialApp.router(routerConfig:)` (go_router), or a custom `Navigator` built by `flow_builder` (as in the reference app). Theming is orthogonal to routing — only the `home:`/`routerConfig:`/`builder:` arg changes:
```dart
MaterialApp.router(
  theme: buildAppTheme(),
  routerConfig: appRouter,         // go_router instance
);
// The reference app wraps a FlowBuilder under the same MaterialApp(theme:) — theme args are unchanged.
```

## Cupertino (brief) + adaptive widgets

`CupertinoApp` + `CupertinoTheme` give iOS-native look for Cupertino widgets. Most apps stay on `MaterialApp` and opt into platform-adaptive constructors where it matters.

```dart
CupertinoApp(
  theme: const CupertinoThemeData(
    primaryColor: Color(0xFF0688D3),
    brightness: Brightness.light,
  ),
  home: const CupertinoPageScaffold(child: Center(child: Text('Hola'))),
);

// Adaptive widgets render Cupertino on iOS/macOS, Material elsewhere — within a MaterialApp:
Switch.adaptive(value: on, onChanged: (_) {});
CircularProgressIndicator.adaptive();
showAdaptiveDialog(context: context, builder: (_) => const AlertDialog(/* ... */));
Icon(Icons.share); // or use Theme.of(context).platform to branch manually
```

## Gradients, BoxDecoration, constant classes

`ColorScheme` has no gradient slot, so gradients live in `BoxDecoration` / `ShapeDecoration` and are best centralized in a constants class.

```dart
class AppGradients {
  static const LinearGradient buttonPrimary = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0688D3), Color(0xFF03466D)],
    stops: [0.24, 1.0], // stops must be ascending and align 1:1 with colors
  );
}

// Apply via Container/Ink decoration (NOT `color:` — gradient and color are mutually exclusive):
Container(
  decoration: const BoxDecoration(
    gradient: AppGradients.buttonPrimary,
    borderRadius: BorderRadius.all(Radius.circular(10)),
  ),
);

// Gradient TEXT/ICONS need a ShaderMask (gradients can't paint glyphs directly):
ShaderMask(
  blendMode: BlendMode.srcIn,
  shaderCallback: (bounds) => AppGradients.buttonPrimary.createShader(
    Rect.fromLTWH(0, 0, bounds.width, bounds.height),
  ),
  child: const Icon(Icons.home, color: Colors.white), // child color is the mask source
);
```

## Material 3 vs Material 2 — what actually changes

| Aspect | Material 2 | Material 3 (`useMaterial3: true`) |
|---|---|---|
| Elevation | Drop shadows | Surface **tint** overlay (`surfaceTint`) + reduced shadow |
| Bottom nav | `BottomNavigationBar` | `NavigationBar` + `NavigationDestination` |
| Color model | `primary`, `accent`, `background` | 45-role `ColorScheme`; `background`→`surface` |
| Buttons | `RaisedButton`/`FlatButton` (removed) | `FilledButton`, `ElevatedButton`, `OutlinedButton`, `TextButton` |
| App bar | Flat color | Tints with `surfaceTint` on scroll (kill via `surfaceTintColor: Colors.transparent`) |
| FAB / shapes | Smaller radii | Larger default corner radii, new shape system |
| Typography | M2 `TextTheme` names | M3 `display/headline/title/body/label` scale |

## Real-world usage

Single light Material 3 theme. `AppColors` and `AppGradients` are `static const` classes — **never inline `Color(0xFF...)` in widgets**; reference the token. The brand seed is `0xFF0688D3`.

```dart
// lib/core/theme.dart  (excerpt of the real file)
class AppColors {
  static const Color primary = Color(0xFF0688D3);
  static const Color primaryDark = Color(0xFF03466D);
  static const Color backgroundLight = Color(0xFFF5F7FA);
  static const Color error = Color(0xFFD32F2F);
  static const Color gray = Color(0xFF6E7C84);
  static const Color disabled = Color(0xFFBAC3C8);
  static const Color stroke = Color(0xFFE2E2E2);
  static const Color premium = Color(0xFFF4B400); // amber — verified/premium badge
}

class AppGradients {
  static const LinearGradient buttonPrimary = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [AppColors.primary, AppColors.primaryDark],
    stops: [0.24, 1.0],
  );
}

final theme = ThemeData(
  useMaterial3: true,
  fontFamily: 'Roboto',
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    primary: AppColors.primary, // pin exact brand blue over the generated tone
  ),
  scaffoldBackgroundColor: AppColors.backgroundLight,
  appBarTheme: AppBarTheme(
    backgroundColor: AppColors.white,
    foregroundColor: AppColors.darkBlue,
    surfaceTintColor: Colors.transparent, // flat brand bar, no M3 scroll tint
    elevation: 2,
    shadowColor: Colors.black.withValues(alpha: 0.10), // .withValues, not deprecated .withOpacity
  ),
  // Global input style → every TextField/FormzInput field is consistent without per-field decoration.
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: AppColors.white,
    contentPadding: const EdgeInsets.all(16),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: AppColors.stroke),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
    ),
  ),
  // FilledButton/Outlined/Text themes use WidgetStateProperty.resolveWith for disabled states.
);
```

**`AppGradientButton`** (`lib/core/form_widgets/`) — gradient fill + ripple via `Ink` + `InkWell`, pulling the label style from `Theme.of(context).textTheme.labelLarge`:
```dart
SizedBox(
  width: double.infinity,
  height: 44,
  child: Material(
    color: Colors.transparent,
    child: Ink(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        gradient: enabled ? AppGradients.buttonPrimary : null,
        color: enabled ? null : AppColors.disabled, // gradient XOR color
      ),
      child: InkWell(onTap: onPressed, /* ... */),
    ),
  ),
);
```

**`AppBottomNavBar`** (`lib/core/widgets/`) — a custom nav bar (not `NavigationBar`/`BottomNavigationBar`). Active items get the gradient applied to icon + label via a `ShaderMask` with `BlendMode.srcIn`; inactive items are flat `AppColors.disabled`:
```dart
ShaderMask(
  blendMode: BlendMode.srcIn,
  shaderCallback: (bounds) => AppGradients.buttonPrimary.createShader(
    Rect.fromLTWH(0, 0, bounds.width, bounds.height),
  ),
  child: Iconify(activeIcon, size: 32, color: Colors.white),
);
```
Index is driven by `HomeNavCubit` (bloc) and `onTap` calls back into it. Icons come from `iconify_flutter`, not Material `Icons`.

## Common mistakes

| Pitfall | Fix |
|---|---|
| `cardTheme: CardTheme(...)` fails to compile on current SDK | Use `CardThemeData(...)`. Post-3.29 the `*Theme` widget types were split from `*ThemeData`; `ThemeData.cardTheme` (also `tabBarTheme`, `dialogTheme`) now take the `…ThemeData` form. `CardTheme` is now a widget that takes `data: CardThemeData`. |
| Assuming **every** `*Theme` was split (e.g. `appBarTheme: AppBarTheme(...)`) | `ThemeData.appBarTheme` is typed `AppBarThemeData`, but `AppBarTheme(...)` (and `InputDecorationTheme(...)`) keep a backward-compatible constructor that still assigns cleanly — so the examples above compile. Only some (notably `CardTheme`, `TabBarTheme`, `DialogTheme`) lost the direct-assignment path. When unsure, write the `*ThemeData` form. |
| `MaterialStateProperty` / `MaterialState` "deprecated" | Renamed to `WidgetStateProperty` / `WidgetState`. Same API. |
| `color.withOpacity(0.1)` deprecation warning | Use `color.withValues(alpha: 0.1)` (precision-safe; `withOpacity` deprecated). |
| Inlining `Color(0xFF0688D3)` in widgets | Reference `AppColors.primary`. Single source of truth, greppable, swappable. |
| Setting both `gradient:` and `color:` on `BoxDecoration` | They're mutually exclusive — `color` is ignored / asserts. Pick one. |
| Using `colorScheme.background` / `surfaceVariant` | Deprecated. Use `surface` / `surfaceContainerHighest`. |
| App bar shows a purple-ish tint when scrolled | M3 `surfaceTint`. Set `surfaceTintColor: Colors.transparent` (or a brand color) in `AppBarTheme`. |
| Gradient on `Text`/`Icon` directly | Not supported — wrap in `ShaderMask` with `BlendMode.srcIn`. |
| Caching `Theme.of(context)` outside `build` | It registers an `InheritedWidget` dependency; reading it stale skips theme-change rebuilds. Read it inside `build`. |
| `darkTheme` reusing a light `ColorScheme` | Build a second scheme with `brightness: Brightness.dark`. |
| Expecting `NavigationBar` from `BottomNavigationBarTheme` | M3 `NavigationBar` reads `NavigationBarThemeData`; the M2 `BottomNavigationBar` reads `BottomNavigationBarThemeData`. Different widgets, different theme objects. |

## See also
- [state-management.md](state-management.md) — `HomeNavCubit` drives the nav bar selected index.
- [forms-validation.md](forms-and-input.md) — `InputDecorationTheme` styles all formz-backed fields.
- [widgets-layout.md](widgets-and-layout.md) — `BoxDecoration`, `ShaderMask`, `Ink`/`InkWell` mechanics.
- [ThemeData (api.flutter.dev)](https://api.flutter.dev/flutter/material/ThemeData-class.html)
- [ColorScheme.fromSeed (api.flutter.dev)](https://api.flutter.dev/flutter/material/ColorScheme/ColorScheme.fromSeed.html)
- [Material 3 migration guide (docs.flutter.dev)](https://docs.flutter.dev/release/breaking-changes/material-3-migration)
- [ThemeExtension (api.flutter.dev)](https://api.flutter.dev/flutter/material/ThemeExtension-class.html)
- [Cupertino theming (docs.flutter.dev)](https://docs.flutter.dev/ui/widgets/cupertino)
