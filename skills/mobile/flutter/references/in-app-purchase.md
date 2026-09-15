# In-App Purchases & Subscriptions

## Overview
`in_app_purchase ^3.x` is Flutter's storefront-independent IAP plugin (Apple App Store + Google Play). It surfaces a single `purchaseStream` you listen to for *all* purchase events (user-initiated, store-initiated, restored, and uncompleted purchases from previous launches). The client never decides entitlement — it forwards the receipt/JWS to a backend that verifies it with Apple/Google and is the source of truth. In the reference app this is **doctor-side subscriptions only**; the patient app is permanently free.

## Quick reference

| API | Signature / returns | Notes |
|---|---|---|
| `InAppPurchase.instance` | singleton | entry point for everything |
| `isAvailable()` | `Future<bool>` | store reachable? gate UI on this |
| `queryProductDetails(Set<String> ids)` | `Future<ProductDetailsResponse>` | `.productDetails`, `.notFoundIDs`, `.error` |
| `purchaseStream` | `Stream<List<PurchaseDetails>>` | broadcast; **subscribe before runApp** |
| `buyNonConsumable({required PurchaseParam purchaseParam})` | `Future<bool>` | subscriptions + entitlements use this |
| `buyConsumable({required PurchaseParam purchaseParam, bool autoConsume = true})` | `Future<bool>` | one-shot items only |
| `completePurchase(PurchaseDetails)` | `Future<void>` | **mandatory** after delivery; throws `PurchaseException` |
| `restorePurchases({String? applicationUserName})` | `Future<void>` | results arrive on `purchaseStream` as `restored` |
| `PurchaseParam` | `{required ProductDetails productDetails, String? applicationUserName}` | base param |
| `GooglePlayPurchaseParam` | `+ ChangeSubscriptionParam? changeSubscriptionParam` | upgrade/downgrade |
| `ProductDetailsResponse` | `{ productDetails, notFoundIDs, error }` | check `notFoundIDs` always |
| `ProductDetails` | `id, title, description, price, rawPrice, currencyCode` | platform-agnostic |
| `PurchaseDetails` | `productID, status, error, verificationData, pendingCompletePurchase, transactionDate, purchaseID` | |
| `PurchaseVerificationData` | `localVerificationData, serverVerificationData, source` | **send `serverVerificationData` to backend** |
| `PurchaseStatus` | `pending \| purchased \| error \| restored \| canceled` | enum on `.status` |

**Federated plugins** (pulled in transitively, imported only for platform casts): `in_app_purchase_storekit` (iOS/macOS, StoreKit 2 by default on iOS 13+), `in_app_purchase_android` (Google Play Billing).

## Setup

`pubspec.yaml`:
```yaml
dependencies:
  in_app_purchase: ^3.2.0
```

**Android** — `minSdkVersion 24+`. Create products in **Play Console → Monetize → Subscriptions** (each subscription has *base plans* and *offers*; the product id you query is the subscription id). Add license testers under **Setup → License testing** so they buy without being charged. Billing v5+ is bundled by the plugin.

**iOS** — iOS 13+. Create products in **App Store Connect → Subscriptions**, grouped into a **subscription group** (StoreKit enforces one active subscription per group, which is how upgrades/downgrades work — no explicit "change" call). Add **Sandbox testers** under **Users and Access → Sandbox**. StoreKit 2 is the default backend on iOS; the plugin still exposes the same Dart API.

> Query product ids must match the store ids exactly. Anything misconfigured/unapproved comes back in `notFoundIDs`, not as an error.

## Initialize: load products & listen early

Subscribe to `purchaseStream` as early as possible (before `runApp`) so you never miss store-initiated or previously-uncompleted purchases. The stream is a broadcast stream — one subscription, cancel on dispose.

```dart
class IapService {
  IapService._();
  static final IapService instance = IapService._();

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  static const Set<String> _productIds = {
    'app_doctor_monthly',
    'app_doctor_yearly',
  };

  List<ProductDetails> products = [];

  Future<void> init(void Function(List<PurchaseDetails>) onUpdate) async {
    // Listen FIRST — pending/restored purchases from a prior session flush here.
    _sub = _iap.purchaseStream.listen(
      onUpdate,
      onError: (e) => debugPrint('purchaseStream error: $e'),
      // Stream errors do NOT close the subscription; keep listening.
    );

    if (!await _iap.isAvailable()) return; // store unreachable -> hide paywall

    final ProductDetailsResponse resp = await _iap.queryProductDetails(_productIds);
    if (resp.error != null) {
      debugPrint('queryProductDetails: ${resp.error}');
    }
    if (resp.notFoundIDs.isNotEmpty) {
      // Misconfigured / not-yet-approved store products. Not an exception.
      debugPrint('Not found: ${resp.notFoundIDs}');
    }
    products = resp.productDetails;
  }

  void dispose() => _sub?.cancel();
}
```

## Buying a subscription

Subscriptions and non-consumable entitlements both use `buyNonConsumable`. The `Future<bool>` only reports whether the request was *submitted* — the real result lands on `purchaseStream`.

```dart
Future<void> buy(ProductDetails product) async {
  // applicationUserName lets the store dedupe; pass your stable app user id.
  final param = PurchaseParam(
    productDetails: product,
    applicationUserName: FirebaseAuth.instance.currentUser?.uid,
  );
  await InAppPurchase.instance.buyNonConsumable(purchaseParam: param);
  // Do NOT grant access here. Wait for PurchaseStatus.purchased on the stream.
}
```

## The purchase stream handler (the heart of it)

Every status flows through one listener. The contract: verify server-side on `purchased`/`restored`, then **always** call `completePurchase` when `pendingCompletePurchase` is true — even on `error`/`canceled` — or the transaction stays queued and replays on every launch (and iOS keeps prompting).

```dart
Future<void> _onPurchaseUpdate(List<PurchaseDetails> purchases) async {
  for (final p in purchases) {
    switch (p.status) {
      case PurchaseStatus.pending:
        _showPendingUI(); // e.g. "Ask to Buy" parental approval, slow card
        break;
      case PurchaseStatus.error:
        _showError(p.error?.message ?? 'Error de compra');
        break;
      case PurchaseStatus.canceled:
        _dismissPaywallLoading();
        break;
      case PurchaseStatus.purchased:
      case PurchaseStatus.restored:
        final ok = await _verifyOnBackend(p); // <- source of truth
        if (ok) {
          _refreshPremiumState();
        } else {
          _showError('No se pudo validar la suscripción');
        }
        break;
    }

    // ALWAYS finish queued transactions, regardless of status.
    if (p.pendingCompletePurchase) {
      await InAppPurchase.instance.completePurchase(p);
    }
  }
}
```

`completePurchase` throws `PurchaseException` on failure — inspect `errorCode` to decide retry-now vs retry-later vs fix-config. Never call it on a `pending` purchase (throws).

## Server-side receipt verification (never trust the client)

`PurchaseDetails.verificationData.serverVerificationData` is the token your backend forwards to Apple/Google:
- **iOS** — StoreKit 2 JWS signed transaction (verify against Apple's App Store Server API).
- **Android** — Play purchase token (verify via Google Play Developer API `purchases.subscriptionsv2.get`).

`verificationData.source` is `'app_store'` or `'google_play'`. The client must never decide entitlement from `localVerificationData` — it is forgeable.

```dart
Future<bool> _verifyOnBackend(PurchaseDetails p) async {
  final platform = p.verificationData.source == 'app_store' ? 'ios' : 'android';
  final res = await ApiService.post('/subscriptions/verify', {
    'platform': platform,                              // 'ios' | 'android'
    'receiptData': p.verificationData.serverVerificationData,
    'productId': p.productID,
  });
  return res['success'] == true && res['data']?['isPremiumActive'] == true;
}
```

## Subscriptions: auto-renew, base plans, groups

- **Auto-renew** is handled entirely by the stores. Renewals do *not* reliably re-emit on `purchaseStream` while the app is open — never gate the live "is premium" flag on the stream. Read entitlement from your backend (`/subscriptions/status`), which learns of renewals/cancellations/grace via store-to-server webhooks.
- **Android base plans & offers** — one subscription product id can have multiple base plans (monthly/yearly) and promotional offers. Each is identified by an **offer token**; to buy a *specific* base plan/offer you must pass that token to `GooglePlayPurchaseParam(offerToken: ...)`. `queryProductDetails` returns one `GooglePlayProductDetails` per offer (its `.offerToken` getter resolves the right token), so most apps just `buyNonConsumable` the matching `ProductDetails`. To pick by hand:
  ```dart
  import 'package:in_app_purchase_android/in_app_purchase_android.dart';

  if (product is GooglePlayProductDetails) {
    // ProductDetailsWrapper.subscriptionOfferDetails -> base plans + offer tokens
    final offers = product.productDetails.subscriptionOfferDetails;
    final String? offerToken = offers?[selectedOfferIndex].offerIdToken;

    final param = GooglePlayPurchaseParam(
      productDetails: product,
      applicationUserName: FirebaseAuth.instance.currentUser?.uid,
      offerToken: offerToken, // null -> Play picks the default offer
    );
    await InAppPurchase.instance.buyNonConsumable(purchaseParam: param);
  }
  ```
- **iOS subscription groups** — products in the same group are mutually exclusive; buying a different tier *is* the upgrade/downgrade (no `ChangeSubscriptionParam`). The group id lives on different properties per StoreKit backend:
  ```dart
  import 'package:in_app_purchase_storekit/in_app_purchase_storekit.dart';
  // StoreKit 2 (default on iOS) — store_kit_2_wrappers
  if (product is AppStoreProduct2Details) {
    final SK2Product sk2 = product.sk2Product;
    print(sk2.subscription?.subscriptionGroupID); // group id
  }
  // StoreKit 1 fallback — store_kit_wrappers
  if (product is AppStoreProductDetails) {
    print(product.skProduct.subscriptionGroupIdentifier);
  }
  ```

## Upgrades / downgrades (Android only API)

Android needs the old purchase + a replacement mode. iOS does it implicitly through the subscription group.

```dart
import 'package:in_app_purchase_android/in_app_purchase_android.dart';

final param = GooglePlayPurchaseParam(
  productDetails: yearlyProduct,
  changeSubscriptionParam: ChangeSubscriptionParam(
    oldPurchaseDetails: currentMonthlyPurchase,
    replacementMode: ReplacementMode.withTimeProration, // credit unused time
  ),
);
await InAppPurchase.instance.buyNonConsumable(purchaseParam: param);
```

## Restoring purchases

On reinstall / new device the user has no local transactions. Call `restorePurchases()`; results arrive on `purchaseStream` with `PurchaseStatus.restored`. Run it on a "Restaurar compras" button and optionally once after login.

```dart
await InAppPurchase.instance.restorePurchases();
// Each restored entitlement -> stream -> _verifyOnBackend -> completePurchase.
```

## Pending purchases

`PurchaseStatus.pending` means the store hasn't finished (iOS "Ask to Buy" approval, slow/declined card, Play deferred payment). Show a non-blocking "compra pendiente" state. The same purchase re-emits as `purchased` or `error` later — possibly after an app restart, which is why early stream subscription matters.

## Real-world usage

Doctor-side only. The patient app never imports IAP. Backend (`/subscriptions/verify`, `/subscriptions/status`) is the single source of truth via `isPremiumActive(sub)`; the app only mirrors it. Service is a static-method singleton matching the codebase's service convention; entitlement changes are broadcast through the existing `NotificationEventBus`-style pattern so cubits stay decoupled.

```dart
// lib/features/subscriptions/services/subscription_service.dart
class SubscriptionService {
  SubscriptionService._();
  static final SubscriptionService instance = SubscriptionService._();

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  // Mirror of the BACKEND truth, never derived from the stream alone.
  final _premium = StreamController<bool>.broadcast();
  Stream<bool> get premiumChanges => _premium.stream;

  static const Set<String> _ids = {
    'app_doctor_monthly',
    'app_doctor_yearly',
  };
  List<ProductDetails> products = [];

  Future<void> init() async {
    _sub = _iap.purchaseStream.listen(_onUpdate, onError: (e) {
      debugPrint('IAP stream error: $e');
    });
    if (!await _iap.isAvailable()) return;

    final resp = await _iap.queryProductDetails(_ids);
    if (resp.notFoundIDs.isNotEmpty) {
      debugPrint('IAP productos no encontrados: ${resp.notFoundIDs}');
    }
    products = resp.productDetails;

    // Source of truth on launch: ask the backend, not the device.
    await refreshStatus();
  }

  Future<void> buy(ProductDetails product) async {
    final param = PurchaseParam(
      productDetails: product,
      applicationUserName: FirebaseAuth.instance.currentUser?.uid,
    );
    await _iap.buyNonConsumable(purchaseParam: param);
  }

  Future<void> restore() => _iap.restorePurchases();

  Future<void> _onUpdate(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      if (p.status == PurchaseStatus.purchased ||
          p.status == PurchaseStatus.restored) {
        await _verify(p); // POST /subscriptions/verify -> backend decides
      } else if (p.status == PurchaseStatus.error) {
        debugPrint('IAP error: ${p.error?.message}');
      }
      // Always close the loop or the transaction replays every launch.
      if (p.pendingCompletePurchase) {
        await _iap.completePurchase(p);
      }
    }
  }

  Future<void> _verify(PurchaseDetails p) async {
    final platform = p.verificationData.source == 'app_store' ? 'ios' : 'android';
    // ApiService auto-injects the Firebase JWT; envelope: { success, data, message }.
    final res = await ApiService.post('/subscriptions/verify', {
      'platform': platform,
      'receiptData': p.verificationData.serverVerificationData,
    });
    final active = res['data']?['isPremiumActive'] == true;
    _premium.add(active);
  }

  // GET /subscriptions/status — the only flag the app gates premium UI on.
  Future<bool> refreshStatus() async {
    final res = await ApiService.get('/subscriptions/status');
    final active = res['data']?['isPremiumActive'] == true;
    _premium.add(active);
    return active;
  }

  void dispose() {
    _sub?.cancel();
    _premium.close();
  }
}
```

A `SubscriptionCubit` (Cubit, since this is request/response not a long-lived stream from the SDK) wraps `SubscriptionService`, exposes `FormzSubmissionStatus` while buying, and listens to `premiumChanges`. Backend status values map to entitlement: `active`, `cancelled` (until `expiresAt`), `grace_period` → premium; `expired` → not. The app reads only `isPremiumActive` — it never recomputes that from receipts.

> Contract reminder (from backend `.claude`): `/subscriptions/verify` body is `platform` (`ios`/`android`) + `receiptData`, **not** the old `source`/`verificationData` spec fields. Webhooks at `/webhooks/apple` + `/webhooks/google` keep the backend in sync on renewal/cancel/grace, so `/subscriptions/status` stays correct without the app being open.
>
> ⚠️ **Shape caveat:** the IAP `/subscriptions/verify` + `/subscriptions/status` endpoints are **not** in `docs/openapi.yaml` (which still documents only the deprecated MercadoPago `/subscriptions`, `/subscriptions/me`, `/subscriptions/{id}/cancel`). The `isPremiumActive` boolean is the contract the mobile app gates on (`isPremiumActive(sub)` in `lambda/shared/payments/feature-gate.ts`); the rest of the `data` object (e.g. `status`, `expiresAt`) is inferred from backend `.claude` docs, not a frozen spec — confirm the exact field set with the backend before relying on anything beyond `isPremiumActive`.

## Testing

| Platform | How |
|---|---|
| iOS | **Sandbox testers** (App Store Connect → Users and Access → Sandbox). Sign out of prod Apple ID on device; sandbox prompts at purchase. Renewals are accelerated (e.g. a month = minutes). StoreKit `.storekit` config file enables simulator testing without a sandbox account. |
| Android | **License testers** (Play Console → Setup → License testing) + app uploaded to an internal/closed track. Testers buy with "test card, always approves". |
| Both | Verify the full loop: pending → purchased → backend verify → `completePurchase`. Force-quit mid-purchase to confirm the transaction replays on relaunch and is finished. |

## Common mistakes

| Pitfall | Fix |
|---|---|
| Granting premium in the `buy()` callback / from the `bool` return | Only grant after `PurchaseStatus.purchased` on the stream **and** backend verification. |
| Trusting `localVerificationData` for entitlement | Send `serverVerificationData` to the backend; backend verifies with Apple/Google. |
| Forgetting `completePurchase` (or skipping it on error/cancel) | Always finish when `pendingCompletePurchase` is true — else transactions replay every launch and iOS re-prompts. |
| Subscribing to `purchaseStream` after `runApp` / inside a screen | Subscribe before `runApp`; otherwise you miss store-initiated and prior-session purchases. |
| Treating `notFoundIDs` as a crash/error | It's normal for misconfigured/unapproved ids; log and continue with what loaded. |
| Gating live premium state on the stream (renewals don't re-emit reliably) | Read `isPremiumActive` from `/subscriptions/status`; backend learns renewals via store webhooks. |
| Calling `completePurchase` on a `pending` purchase | Throws — only complete `purchased`/`restored`. |
| Using `buyConsumable` for a subscription | Subscriptions/entitlements use `buyNonConsumable`. |
| Assuming Android-style `ChangeSubscriptionParam` works on iOS | iOS upgrades/downgrades happen implicitly via the subscription group; the change param is Google Play only. |
| No "Restaurar compras" button | Required for App Store review; restore replays entitlements on reinstall. |

## See also
- [networking.md](networking-rest.md) — `ApiService` static client + `{ success, data, message }` envelope used by `/subscriptions/verify`.
- [state-management.md](state-management.md) — Cubit + `FormzSubmissionStatus` for the purchase flow.
- [firebase-auth.md](firebase-core-auth.md) — `applicationUserName` = Firebase uid; JWT injection on verify calls.
- in_app_purchase: https://pub.dev/packages/in_app_purchase
- API docs (PurchaseStatus, PurchaseDetails, completePurchase): https://pub.dev/documentation/in_app_purchase/latest/
- in_app_purchase_storekit (iOS, StoreKit 2): https://pub.dev/packages/in_app_purchase_storekit
- in_app_purchase_android (base plans/offers, ChangeSubscriptionParam): https://pub.dev/packages/in_app_purchase_android
