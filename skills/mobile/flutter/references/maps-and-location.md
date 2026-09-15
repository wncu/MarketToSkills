# Maps & Location

## Overview
Map rendering, markers, clustering, popups, device geolocation, and address autocomplete for a production Flutter app. The reference app uses **flutter_map + OpenStreetMap tiles** (no Google Maps SDK, no billing for tiles), geolocator for "near me", and google_places_flutter for address entry. This matters whenever you show the clinic-finder map, plot doctors, or capture a patient/clinic address.

## Quick reference

| Package | Version | Key API |
|---|---|---|
| `flutter_map` | ^8.2 | `FlutterMap(options: MapOptions(...), children: [TileLayer, MarkerLayer, ...])`, `MapController` |
| `latlong2` | ^0.9 | `LatLng(lat, lng)`, `LatLngBounds` |
| `flutter_map_marker_cluster` | ^8.2 | `MarkerClusterLayerWidget(options: MarkerClusterLayerOptions(...))` |
| `flutter_map_marker_popup` | ^8.1 | `PopupMarkerLayer`, `PopupController`, `PopupScope` |
| `geolocator` | ^14.0 | `Geolocator.checkPermission/requestPermission/getCurrentPosition/distanceBetween` |
| `google_places_flutter` | ^2.1 | `GooglePlaceAutoCompleteTextField(...)` |

| flutter_map API | Purpose |
|---|---|
| `MapOptions(initialCenter, initialZoom, minZoom, maxZoom, onTap, onPositionChanged, onMapReady, interactionOptions, cameraConstraint)` | Map config + event callbacks |
| `TileLayer(urlTemplate, userAgentPackageName, tileProvider)` | Raster tiles (OSM) |
| `MarkerLayer(markers: [Marker(point, width, height, child, alignment)])` | Static markers |
| `MapController().move(center, zoom)` / `.fitCamera(CameraFit.bounds(bounds:...))` / `.camera` | Programmatic control |
| `CameraFit.bounds(bounds, padding)` / `CameraFit.coordinates(coordinates, padding)` | Fit camera to area |
| `RichAttributionWidget` / `SimpleAttributionWidget` | OSM attribution (legally required) |
| `InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate)` | Gesture control |

| geolocator API | Returns |
|---|---|
| `Geolocator.isLocationServiceEnabled()` | `Future<bool>` — GPS on? |
| `Geolocator.checkPermission()` | `Future<LocationPermission>` — no prompt |
| `Geolocator.requestPermission()` | `Future<LocationPermission>` — shows OS dialog |
| `Geolocator.getCurrentPosition(locationSettings: LocationSettings(...))` | `Future<Position>` |
| `Geolocator.getPositionStream(locationSettings:)` | `Stream<Position>` |
| `Geolocator.distanceBetween(lat1, lng1, lat2, lng2)` | `double` meters (Haversine) |
| `Geolocator.openAppSettings()` / `openLocationSettings()` | `Future<bool>` |

`LocationPermission`: `denied`, `deniedForever`, `whileInUse`, `always`, `unableToDetermine`.
`LocationAccuracy`: `lowest`, `low`, `medium`, `high`, `best`, `bestForNavigation`.

## Base map (flutter_map 8 + OpenStreetMap)

flutter_map 8.x uses `Marker(child:)` (the old `builder:` constructor is removed) and `MapOptions(initialCenter:/initialZoom:)` (old `center:/zoom:` removed). `userAgentPackageName` is mandatory for the public OSM tile server — set it to your bundle id.

```dart
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

class ClinicMap extends StatelessWidget {
  const ClinicMap({super.key});

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: const MapOptions(
        initialCenter: LatLng(-33.4489, -70.6693), // Santiago, Chile
        initialZoom: 12,
        minZoom: 3,
        maxZoom: 18,
        // (tapPos, point): point is the LatLng tapped — use to drop a marker.
        // onTap: (tapPosition, point) => ...,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          // Required by OSM tile usage policy — identifies your app.
          userAgentPackageName: 'com.example.app',
        ),
        const MarkerLayer(
          markers: [
            Marker(
              point: LatLng(-33.4489, -70.6693),
              width: 40,
              height: 40,
              child: Icon(Icons.location_on, color: Colors.red, size: 40),
            ),
          ],
        ),
        // OSM attribution is legally required (ODbL). Don't omit.
        RichAttributionWidget(
          attributions: [
            TextSourceAttribution(
              'OpenStreetMap contributors',
              onTap: () =>
                  launchUrl(Uri.parse('https://openstreetmap.org/copyright')),
            ),
          ],
        ),
      ],
    );
  }
}
```

### MapController — move & fit camera

`MapController` must be attached before use. Either create it in `initState` and call methods after the first frame, or gate on `onMapReady`. `fitCamera` accepts a `CameraFit` (`.bounds` or `.coordinates`) and is the right tool for "zoom to show all clinics".

```dart
final _mapController = MapController();

// Center on a single point.
_mapController.move(const LatLng(-33.45, -70.66), 14);

// Fit all markers within view (e.g. after a proximity search returns results).
void fitToClinics(List<LatLng> points) {
  if (points.isEmpty) return;
  _mapController.fitCamera(
    CameraFit.coordinates(
      coordinates: points,
      padding: const EdgeInsets.all(48), // keep pins off the screen edges
    ),
  );
}

// Read current camera state.
final center = _mapController.camera.center;
final zoom = _mapController.camera.zoom;
```

`CameraFit.coordinates` (above) takes a raw `List<LatLng>`. If you already hold a `LatLngBounds` (e.g. a backend-returned bounding box, or built from a list), use `CameraFit.bounds` instead — same effect, different input:

```dart
final bounds = LatLngBounds.fromPoints(points); // or a prebuilt LatLngBounds
_mapController.fitCamera(
  CameraFit.bounds(
    bounds: bounds,
    padding: const EdgeInsets.all(48),
    // maxZoom: 16, // optional cap so a single clinic doesn't zoom too far in
  ),
);
```

Wire the controller and guard early calls:

```dart
FlutterMap(
  mapController: _mapController,
  options: MapOptions(
    onMapReady: () {
      // Safe to call _mapController.move / fitCamera from here on.
    },
  ),
  children: const [...],
);
```

### Interaction options

Disable gestures you don't want (e.g. rotation, which disorients a clinic map):

```dart
MapOptions(
  interactionOptions: InteractionOptions(
    // Everything except rotation.
    flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
  ),
);
```

## Clustering many markers

With dozens/hundreds of clinic pins, a flat `MarkerLayer` is unreadable and janky. `MarkerClusterLayerWidget` groups nearby markers into a single bubble that splits as you zoom in. It is a drop-in child of `FlutterMap` and takes the same `Marker` objects.

```dart
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';

MarkerClusterLayerWidget(
  options: MarkerClusterLayerOptions(
    maxClusterRadius: 45,          // px: markers within this radius merge
    size: const Size(40, 40),      // size of the cluster bubble
    alignment: Alignment.center,
    padding: const EdgeInsets.all(50),
    maxZoom: 15,                   // above this, clusters always split
    markers: clinicMarkers,        // List<Marker>
    // Renders the cluster bubble; markers.length is the count.
    builder: (context, markers) => Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: Theme.of(context).colorScheme.primary,
      ),
      child: Center(
        child: Text(
          markers.length.toString(),
          style: const TextStyle(color: Colors.white),
        ),
      ),
    ),
  ),
);
```

**Spiderfy & polygon hull.** When a cluster can't split further (markers share a location at `maxZoom`), tapping it "spiderfies" — fans the markers out on legs. Tapping a cluster also draws a polygon hull around its members. Both are configurable:

```dart
MarkerClusterLayerOptions(
  markers: clinicMarkers,
  builder: (context, markers) => /* bubble */ ...,
  spiderfyCluster: true,                 // default true; set false to disable the fan-out
  spiderfyCircleRadius: 40,              // radius of the spiderfy circle (px)
  spiderfySpiralDistanceMultiplier: 2,  // spacing when >circle threshold markers
  // Hull drawn around the cluster's markers when tapped:
  polygonOptions: const PolygonOptions(
    borderColor: Colors.blueAccent,
    color: Colors.black12,
    borderStrokeWidth: 3,
  ),
);
```

## Marker popups

`flutter_map_marker_popup` renders a card above a tapped marker without rebuilding the whole map. Drive it with a `PopupController`. For state to survive marker list changes, wrap the layer in a `PopupScope` (or pass a long-lived controller from your cubit).

```dart
import 'package:flutter_map_marker_popup/flutter_map_marker_popup.dart';

final _popupController = PopupController();

PopupMarkerLayer(
  options: PopupMarkerLayerOptions(
    markers: clinicMarkers,
    popupController: _popupController,
    popupDisplayOptions: PopupDisplayOptions(
      // `marker` is the tapped Marker; map it back to your clinic model.
      builder: (context, marker) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text('Clínica en ${marker.point.latitude.toStringAsFixed(4)}'),
        ),
      ),
    ),
  ),
);

// Programmatic control:
_popupController.showPopupsOnlyFor([someMarker]);
_popupController.hideAllPopups();
_popupController.togglePopup(someMarker);
```

> Cluster + popup together: pass a `popupOptions: PopupOptions(...)` to `MarkerClusterLayerOptions` instead of using a separate `PopupMarkerLayer` (the cluster package ships its own `PopupOptions`, distinct from `flutter_map_marker_popup`). Verified fields (v8.2): `popupController` (`PopupController?`), `popupBuilder` (`Widget Function(BuildContext, Marker)`, required), `popupSnap` (`PopupSnap`, default `markerTop`), `popupAnimation`, `markerTapBehavior`.

```dart
MarkerClusterLayerWidget(
  options: MarkerClusterLayerOptions(
    markers: clinicMarkers,
    builder: (context, markers) => /* cluster bubble */ ...,
    popupOptions: PopupOptions(
      popupController: _popupController,                       // PopupController
      popupBuilder: (context, marker) => Card(                // (BuildContext, Marker)
        child: Text('Clínica en ${marker.point.latitude.toStringAsFixed(4)}'),
      ),
    ),
  ),
);
```

## Geolocation (geolocator 14)

geolocator 14 takes a `LocationSettings` object on `getCurrentPosition`/`getPositionStream` (the old top-level `desiredAccuracy:` named arg is gone). Always run the full gate: service enabled → permission → request → fetch. Handle `deniedForever` by sending the user to settings — `requestPermission()` will not re-prompt once permanently denied.

```dart
import 'package:geolocator/geolocator.dart';

/// Returns the device position, or throws a localized message the UI can show.
Future<Position> getCurrentLocation() async {
  // 1. Is the GPS hardware/service on at all?
  if (!await Geolocator.isLocationServiceEnabled()) {
    await Geolocator.openLocationSettings();
    throw 'Active la ubicación del dispositivo';
  }

  // 2. Current permission (no dialog).
  var permission = await Geolocator.checkPermission();

  // 3. Ask if not yet decided.
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }

  // 4. Permanently denied → only the OS settings page can fix it.
  if (permission == LocationPermission.deniedForever) {
    await Geolocator.openAppSettings();
    throw 'Permiso de ubicación denegado permanentemente';
  }
  if (permission == LocationPermission.denied) {
    throw 'Permiso de ubicación denegado';
  }

  // 5. whileInUse / always → fetch.
  return Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 0,
    ),
  );
}
```

**Platform-specific settings & last-known position.** `LocationSettings` is the cross-platform base; for per-OS tuning pass its subclasses (both accepted by `getCurrentPosition`/`getPositionStream`). `getLastKnownPosition()` returns a cached fix instantly (or `null`) — good for painting the map before the live fetch resolves.

```dart
// Cached fix first (may be null) → fast initial render.
final Position? last = await Geolocator.getLastKnownPosition();

// Android-specific tuning.
const androidSettings = AndroidSettings(
  accuracy: LocationAccuracy.high,
  distanceFilter: 0,
  forceLocationManager: false,
  intervalDuration: Duration(seconds: 5),
  // Only needed for background updates (the reference app does NOT use this):
  // foregroundNotificationConfig: ForegroundNotificationConfig(
  //   notificationTitle: 'MyApp', notificationText: 'Buscando clínicas cercanas'),
);

// iOS-specific tuning.
const appleSettings = AppleSettings(
  accuracy: LocationAccuracy.high,
  activityType: ActivityType.fitness,
  distanceFilter: 0,
  pauseLocationUpdatesAutomatically: true,
  showBackgroundLocationIndicator: false,
);

final position = await Geolocator.getCurrentPosition(
  locationSettings: defaultTargetPlatform == TargetPlatform.android
      ? androidSettings
      : appleSettings,
);
```

Distance (meters) between the user and a clinic, for "near me" sorting — no network call:

```dart
final meters = Geolocator.distanceBetween(
  user.latitude, user.longitude,
  clinic.latitude, clinic.longitude,
);
final km = meters / 1000;
```

> The backend already runs the authoritative proximity query (geohash GSI). Use client-side `distanceBetween` only for display labels and local re-sorting of the returned list — not as the source of truth.

### Platform setup

**Android** (`android/app/src/main/AndroidManifest.xml`, inside `<manifest>`):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```
`compileSdk 35` is required by geolocator 14.

**iOS** (`ios/Runner/Info.plist`) — Spanish strings shown to the patient:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Esta app usa tu ubicación para mostrar clínicas dentales cercanas.</string>
```
Only add `NSLocationAlwaysAndWhenInUseUsageDescription` / `UIBackgroundModes:location` if you genuinely need background updates (the reference app does not — while-in-use is enough).

## Address autocomplete (google_places_flutter 2)

Used for typing a clinic/patient address and resolving it to coordinates. The API key is a **Places API** key (this still uses Google billing even though map tiles are OSM). `isLatLngRequired: true` makes `getPlaceDetailWithLatLng` fire with `prediction.lat` / `prediction.lng` populated.

```dart
import 'package:google_places_flutter/google_places_flutter.dart';
import 'package:google_places_flutter/model/prediction.dart';

GooglePlaceAutoCompleteTextField(
  textEditingController: _addressController,
  googleAPIKey: dotenv.env['GOOGLE_PLACES_API_KEY']!,
  inputDecoration: const InputDecoration(
    hintText: 'Buscar dirección',
    border: OutlineInputBorder(),
  ),
  debounceTime: 600,        // ms before hitting the API
  countries: const ['cl'],  // restrict to Chile
  isLatLngRequired: true,
  // Fires with coordinates after selection (lat/lng are Strings).
  getPlaceDetailWithLatLng: (Prediction prediction) {
    final lat = double.parse(prediction.lat!);
    final lng = double.parse(prediction.lng!);
    context.read<ClinicSearchCubit>().setCenter(LatLng(lat, lng));
  },
  // Fires immediately on tap (no coords yet) — sync the text field.
  itemClick: (Prediction prediction) {
    _addressController.text = prediction.description ?? '';
    _addressController.selection = TextSelection.fromPosition(
      TextPosition(offset: _addressController.text.length),
    );
  },
  itemBuilder: (context, index, Prediction prediction) => Padding(
    padding: const EdgeInsets.all(10),
    child: Row(
      children: [
        const Icon(Icons.location_on),
        const SizedBox(width: 8),
        Expanded(child: Text(prediction.description ?? '')),
      ],
    ),
  ),
  seperatedBuilder: const Divider(),
  isCrossBtnShown: true,
);
```

## Real-world usage

The clinic-finder screen is the only map in the app. Pattern (`lib/features/clinics/`):

- **Tiles:** `TileLayer` with OSM `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and `userAgentPackageName: 'com.example.app'`. **No Google Maps SDK** — keeps the iOS/Android build free of the Maps SDK and its billing.
- **"Near me":** a Cubit (`ClinicSearchCubit` extending `Cubit`, state extends `Equatable` with `FormzSubmissionStatus`) calls the geolocation gate above, then hits the backend proximity endpoint via the static `ApiService` (which injects the Firebase JWT). The backend's geohash GSI returns clinics; the cubit stores them as immutable models.
- **Markers + clustering:** each approved doctor/clinic → a `Marker(point: LatLng(clinic.lat, clinic.lng), child: ...)`, fed into `MarkerClusterLayerWidget` so dense city areas stay legible.
- **Fit camera:** after results load, `mapController.fitCamera(CameraFit.coordinates(coordinates: points, padding: EdgeInsets.all(48)))` frames all results.
- **Local sort label:** `Geolocator.distanceBetween` computes the "a X km" badge per clinic card; the backend remains the source of truth for which clinics matched.
- **Address autocomplete:** `GooglePlaceAutoCompleteTextField` with `googleAPIKey: dotenv.env['GOOGLE_PLACES_API_KEY']!` (loaded from the `.env` bundled as a Flutter asset via `flutter_dotenv`), `countries: ['cl']`, `isLatLngRequired: true`. On selection, `getPlaceDetailWithLatLng` recenters the map cubit.
- **latlong2** `LatLng` is the shared coordinate type across flutter_map, the cluster layer, and the geolocation-derived center.
- **State:** map state lives in the Cubit (`copyWith`, semantic getters `isLoading`/`isValid`), never in widget `setState`. The `MapController` is created once and disposed with the view.

## Common mistakes

| Pitfall | Fix |
|---|---|
| `Marker(builder: ...)` — compile error in v8 | Use `Marker(child: widget)` (the `builder` constructor was removed) |
| `MapOptions(center:, zoom:)` | Renamed to `initialCenter:` / `initialZoom:` in v8 |
| OSM tiles 403 / blocked | Set a real `userAgentPackageName` (your bundle id); never leave the example value |
| Omitting OSM attribution | Legally required (ODbL) — add `RichAttributionWidget` with the copyright link |
| `getCurrentPosition(desiredAccuracy: ...)` | geolocator 14 takes `locationSettings: LocationSettings(accuracy: ...)` |
| Calling `requestPermission()` again after `deniedForever` | It won't re-prompt — call `openAppSettings()` instead |
| Skipping `isLocationServiceEnabled()` | Permission can be granted while GPS is off → fetch hangs/throws; gate on both |
| Calling `mapController.move` before the map mounts | Guard with `onMapReady`, or call after first frame |
| Hundreds of flat markers → jank | Use `MarkerClusterLayerWidget`, not a giant `MarkerLayer` |
| Expecting `prediction.lat` as a `double` | google_places returns lat/lng as `String?` — `double.parse(prediction.lat!)` |
| Assuming OSM tiles = free Google APIs too | Places autocomplete still bills against the Google Places API key |
| Hardcoding the Places key | Load from `dotenv.env['GOOGLE_PLACES_API_KEY']` (`.env` asset) |

## See also

- [state-management.md](state-management.md) — Cubit holding map/search state
- [networking.md](networking-rest.md) — `ApiService` for the proximity endpoint + JWT injection
- [forms.md](forms-and-input.md) — formz inputs alongside the address autocomplete field
- [config-and-build.md](tooling-build-deploy.md) — `flutter_dotenv` `.env` asset for the Places key
- flutter_map docs: https://docs.fleaflet.dev/ (layers, programmatic-interaction, attribution-layer)
- geolocator: https://pub.dev/packages/geolocator
- flutter_map_marker_cluster: https://pub.dev/packages/flutter_map_marker_cluster
- flutter_map_marker_popup: https://pub.dev/packages/flutter_map_marker_popup
- google_places_flutter: https://pub.dev/packages/google_places_flutter
- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/
