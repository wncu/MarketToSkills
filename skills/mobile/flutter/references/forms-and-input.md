# Forms & Input

## Overview
Covers Flutter text input from the framework primitives (`Form`/`TextFormField`, `TextField`, `TextEditingController`, `FocusNode`) up to a production app's actual pattern: **formz `FormzInput` wired to a Cubit, NOT `Form`/`GlobalKey<FormState>`**. Use this when building login/signup, profile edit, numeric/clinical forms, phone+country pickers, or searchable dropdowns. The validation source of truth lives in immutable state (`pure`/`dirty`), and the UI reads `displayError` so errors only appear after a field is touched.

## Quick reference

| API / Widget | Purpose | Notes |
|---|---|---|
| `Form` + `GlobalKey<FormState>` | Imperative form with `validate()/save()/reset()` | The reference app does **not** use this — formz+Cubit instead. Documented for completeness. |
| `TextFormField` | `TextField` + built-in `validator`, `onSaved`, `autovalidateMode` | Only inside a `Form`. |
| `TextField` | Bare input, no `FormState` integration | The reference app's `TextInput` wraps this. |
| `TextEditingController` | Read/set/listen to text; **must `dispose()`** | Needed for prefill, phone field, search box. |
| `FocusNode` / `FocusScope.of(context)` | Focus control: `requestFocus()`, `unfocus()` | `FocusScope.of(context).unfocus()` dismisses keyboard. |
| `InputDecoration` | Label/hint/error/icons/borders | `errorText` non-null also turns the field red. |
| `keyboardType` | `TextInputType.{text,emailAddress,phone,number,...}` | Numeric: `TextInputType.number` or `numberWithOptions(decimal:true)`. |
| `inputFormatters` | `List<TextInputFormatter>` filter/transform keystrokes | `FilteringTextInputFormatter.digitsOnly`, `LengthLimitingTextInputFormatter(n)`. |
| `obscureText` / `onChanged` / `onSubmitted` | Password masking / live value / submit (return key) | `onChanged` drives Cubit; `onSubmitted` advances focus. |
| `FormzInput<V,E>` | `.pure()` / `.dirty()`, `validator`, `value`, `isValid`, `isPure`, `isNotValid`, `error`, `displayError` | `displayError` is null while pure → no premature error. |
| `Formz.validate(List<FormzInput>)` | `bool` — true if all inputs valid | Used in state `isValid` getter. |
| `FormzSubmissionStatus` | `initial / inProgress / success / failure / canceled` | Getters: `.isInitial`, `.isInProgress`, `.isSuccess`, `.isFailure`, `.isCanceled`, `.isInProgressOrSuccess`. |
| `DropdownButton2` / `DropdownButtonFormField2` | Styled dropdown; `DropdownSearchData` for search | `dropdown_button2 ^2.3`. |
| `country_pickers` | `countryList`, `Country{isoCode,name,phoneCode}`, `CountryPickerUtils.getDefaultFlagImage` | Used in phone input. |
| `KeyboardActions` | iOS accessory bar / Done button over numeric keyboards | `keyboard_actions ^4.2`. |

## Form + GlobalKey<FormState> + TextFormField (framework baseline)

This is the classic imperative approach. **The reference app avoids it** (state is in the Cubit, not a `FormState`), but you'll see it in framework docs and third-party widgets.

```dart
final _formKey = GlobalKey<FormState>();
String _email = '';

Form(
  key: _formKey,
  // onUserInteraction validates each field after first edit (not on every keystroke before touch)
  autovalidateMode: AutovalidateMode.onUserInteraction,
  child: Column(children: [
    TextFormField(
      decoration: const InputDecoration(labelText: 'Correo'),
      keyboardType: TextInputType.emailAddress,
      // validator returns an error string (shown) or null (valid)
      validator: (v) => (v == null || !v.contains('@')) ? 'Correo inválido' : null,
      // onSaved runs only when FormState.save() is called
      onSaved: (v) => _email = v ?? '',
    ),
    ElevatedButton(
      onPressed: () {
        // validate() runs every validator, returns aggregate bool, repaints errors
        if (_formKey.currentState!.validate()) {
          _formKey.currentState!.save(); // fires every onSaved
          // ... submit _email
        }
      },
      child: const Text('Enviar'),
    ),
  ]),
);
// _formKey.currentState!.reset(); // clears values + errors back to initial
```

`autovalidateMode`: `disabled` (validate only on `.validate()`), `onUserInteraction` (after the field is first edited — the sane default), `always` (every rebuild, shows errors immediately — usually too aggressive).

## TextField vs TextFormField, controllers, decoration

`TextField` is the low-level widget — no `FormState` coupling, you own the value. `TextFormField` is `TextField` wrapped so a parent `Form` can call its `validator`/`onSaved`. **Pick `TextField` when state lives elsewhere (Cubit/formz)** — which is the reference app's case.

```dart
final _controller = TextEditingController(text: initialValue); // prefill

@override
void dispose() {
  _controller.dispose(); // controllers and FocusNodes MUST be disposed to avoid leaks
  super.dispose();
}

TextField(
  controller: _controller,
  keyboardType: TextInputType.number,
  inputFormatters: [
    FilteringTextInputFormatter.digitsOnly, // reject non-digits at the keystroke level
    LengthLimitingTextInputFormatter(6),
  ],
  obscureText: false,
  textInputAction: TextInputAction.next, // return key says "Siguiente"
  onChanged: (v) => cubit.fieldChanged(v),       // live, every keystroke
  onSubmitted: (_) => FocusScope.of(context).nextFocus(), // return key pressed
  decoration: InputDecoration(
    labelText: 'Edad',
    hintText: 'Ej: 35',
    prefixIcon: const Icon(Icons.cake_outlined),
    errorText: state.age.displayError != null ? 'Ingrese una edad válida' : null,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
  ),
);
```

Custom `inputFormatter` (e.g. force uppercase, mask) — implement `TextInputFormatter`:

```dart
class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldV, TextEditingValue newV) =>
      newV.copyWith(text: newV.text.toUpperCase());
}
```

## FocusNode, FocusScope, keyboard dismissal

```dart
final _emailFocus = FocusNode();
final _passwordFocus = FocusNode();

// Autofocus on the first field:
TextField(focusNode: _emailFocus, autofocus: true,
  textInputAction: TextInputAction.next,
  onSubmitted: (_) => _passwordFocus.requestFocus()); // jump to next field on return

TextField(focusNode: _passwordFocus, textInputAction: TextInputAction.done,
  onSubmitted: (_) => FocusScope.of(context).unfocus()); // close keyboard

// Dismiss keyboard when tapping outside (wrap the page):
GestureDetector(
  onTap: () => FocusScope.of(context).unfocus(),
  behavior: HitTestBehavior.opaque,
  child: pageBody,
);

@override
void dispose() {
  _emailFocus.dispose();
  _passwordFocus.dispose();
  super.dispose();
}
```

## keyboard_actions (input accessory bar / Done button)

`keyboard_actions ^4.2` adds a toolbar above the keyboard — essential on iOS for numeric/decimal keyboards which have **no built-in return/done key**. Wrap the scrollable body; each `KeyboardActionsItem` binds to a `FocusNode`.

```dart
import 'package:keyboard_actions/keyboard_actions.dart';

final _amountFocus = FocusNode();

KeyboardActionsConfig _config(BuildContext context) => KeyboardActionsConfig(
  keyboardActionsPlatform: KeyboardActionsPlatform.ALL, // ALL | IOS | ANDROID
  keyboardBarColor: Colors.grey.shade200,
  nextFocus: true, // auto < > arrows between registered fields
  actions: [
    KeyboardActionsItem(
      focusNode: _amountFocus,
      toolbarButtons: [
        (node) => GestureDetector(
              onTap: () => node.unfocus(), // custom "Listo" closes keyboard
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Text('Listo', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
      ],
    ),
  ],
);

@override
Widget build(BuildContext context) => KeyboardActions(
  config: _config(context),
  child: Column(children: [
    TextField(
      focusNode: _amountFocus,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: const InputDecoration(labelText: 'Monto'),
    ),
  ]),
);
```

Note: `KeyboardActions` provides its own scroll view — don't also wrap its child in a `SingleChildScrollView`, or you get nested scroll conflicts.

## formz ^0.8 in depth

`FormzInput<Value, Error>` holds an immutable value + validation result. Two constructors:
- `.pure()` — initial, untouched. `displayError` is **always null** (suppresses errors before the user types).
- `.dirty(value)` — user-modified. `displayError == error` (errors now visible).

| Member | Meaning |
|---|---|
| `value` | current `Value` |
| `validator(Value)` | override → return `Error?` (null = valid) |
| `isValid` / `isNotValid` | `validator(value) == null` |
| `isPure` | constructed via `.pure()` |
| `error` | validator result regardless of pure/dirty |
| `displayError` | `error` if dirty, else `null` → **bind UI errorText to this** |
| `Formz.validate([a,b,c])` | `bool` — all inputs valid |

```dart
import 'package:formz/formz.dart';

enum EmailValidationError { invalid }

class Email extends FormzInput<String, EmailValidationError> {
  const Email.pure() : super.pure('');
  const Email.dirty([super.value = '']) : super.dirty();

  static final RegExp _re = RegExp(r'^[\w.!#$%&*+/=?^_`{|}~-]+@[\w-]+(?:\.[\w-]+)*$');

  @override
  EmailValidationError? validator(String? value) =>
      _re.hasMatch(value ?? '') ? null : EmailValidationError.invalid;
}

// Cross-field validation: confirmed password depends on the password value.
enum ConfirmedPasswordValidationError { invalid }

class ConfirmedPassword extends FormzInput<String, ConfirmedPasswordValidationError> {
  const ConfirmedPassword.pure({this.password = ''}) : super.pure('');
  const ConfirmedPassword.dirty({required this.password, String value = ''})
      : super.dirty(value);
  final String password; // injected from state on every copyWith

  @override
  ConfirmedPasswordValidationError? validator(String? value) =>
      password == value ? null : ConfirmedPasswordValidationError.invalid;
}
```

`FormzSubmissionStatus` tracks the async submit lifecycle on your state:

```dart
status.isInitial;            // never submitted
status.isInProgress;         // show spinner, disable button
status.isSuccess;            // navigate away / show success
status.isFailure;            // show error, allow retry
status.isCanceled;           // submission aborted (e.g. user backed out)
status.isInProgressOrSuccess; // keep button disabled (prevents double-submit)
```

## Wiring formz to a Cubit + TextField.onChanged

The reference app's idiom: every keystroke calls a Cubit method that emits a new immutable state with the field rebuilt as `.dirty(value)`. The UI reads `displayError` and `status` via `context.select` for granular rebuilds.

```dart
// state — semantic copy helpers instead of a generic copyWith
final class LoginState extends Equatable {
  const LoginState() : this._();
  const LoginState._({
    this.email = const Email.pure(),
    this.password = const Password.pure(),
    this.status = FormzSubmissionStatus.initial,
  });
  final Email email;
  final Password password;
  final FormzSubmissionStatus status;

  LoginState withEmail(String v) => LoginState._(email: Email.dirty(v), password: password);
  LoginState withInProgress() =>
      LoginState._(email: email, password: password, status: FormzSubmissionStatus.inProgress);

  bool get isValid => Formz.validate([email, password]); // gate the submit button
  @override
  List<Object?> get props => [email, password, status];
}

// cubit
class LoginCubit extends Cubit<LoginState> {
  LoginCubit(this._auth) : super(const LoginState());
  final FirebaseAuthService _auth;

  void emailChanged(String v) => emit(state.withEmail(v));

  Future<void> submit() async {
    if (!state.isValid) return;           // never submit an invalid form
    emit(state.withInProgress());
    try {
      await _auth.logIn(email: state.email.value, password: state.password.value);
      emit(state.withSuccess());
    } catch (_) {
      emit(state.withFailure());          // FormzSubmissionStatus.failure → retry allowed
    }
  }
}

// widget — context.select rebuilds only when displayError changes
final displayError = context.select((LoginCubit c) => c.state.email.displayError);
TextField(
  onChanged: context.read<LoginCubit>().emailChanged,
  decoration: InputDecoration(
    errorText: displayError != null ? 'Correo inválido' : null, // shown only when dirty
  ),
);
```

## dropdown_button2 (styled + searchable)

`DropdownButtonFormField2<T>` integrates with a `Form` (has `validator`); `DropdownButton2<T>` is the standalone version. Both take `buttonStyleData` / `dropdownStyleData` / `menuItemStyleData` and a `dropdownSearchData` for type-ahead filtering.

```dart
import 'package:dropdown_button2/dropdown_button2.dart';

final _searchCtrl = TextEditingController();
String? _selected;

DropdownButtonFormField2<String>(
  isExpanded: true,
  value: _selected,
  hint: const Text('Selecciona una especialidad'),
  items: especialidades
      .map((e) => DropdownMenuItem(value: e, child: Text(e)))
      .toList(),
  onChanged: (v) => setState(() => _selected = v),
  buttonStyleData: const ButtonStyleData(height: 52, padding: EdgeInsets.only(right: 8)),
  dropdownStyleData: DropdownStyleData(
    maxHeight: 280,
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(8)),
  ),
  menuItemStyleData: const MenuItemStyleData(height: 44),
  // --- searchable type-ahead ---
  dropdownSearchData: DropdownSearchData(
    searchController: _searchCtrl,
    searchInnerWidgetHeight: 56,
    searchInnerWidget: Padding(
      padding: const EdgeInsets.all(8),
      child: TextFormField(
        controller: _searchCtrl,
        decoration: const InputDecoration(hintText: 'Buscar...', isDense: true),
      ),
    ),
    searchMatchFn: (item, q) =>
        (item.value as String).toLowerCase().contains(q.toLowerCase()),
  ),
  // clear the query when the menu closes so the next open starts fresh
  onMenuStateChange: (isOpen) { if (!isOpen) _searchCtrl.clear(); },
);
```

> **Version pin warning (`dropdown_button2 ^2.3.9`):** the code above is the **2.3.x** API. In **3.x** the API changed and the snippet will not compile unchanged: `items` takes `DropdownItem<T>` (not `DropdownMenuItem`), `value:` is replaced by `valueListenable: ValueNotifier<T?>`, and `DropdownSearchData` renames `searchInnerWidget`/`searchInnerWidgetHeight` → `searchBarWidget`/`searchBarWidgetHeight`. `searchController`, `searchMatchFn`, `buttonStyleData`/`dropdownStyleData`/`menuItemStyleData`, and `onMenuStateChange` persist across the major bump. If you upgrade past 2.3, migrate these members. (Verified against pub.dev docs for 2.3.9 and latest.)

## country_pickers usage

`country_pickers ^3.0` ships a `countryList` of `Country{isoCode, name, phoneCode}` plus `CountryPickerUtils.getDefaultFlagImage(country)`. The reference app feeds that list into a `DropdownButtonFormField2<Country>` rather than the package's own dialog (gives consistent styling). Default selection is Chile (`isoCode == 'CL'`).

```dart
import 'package:country_pickers/country.dart';
import 'package:country_pickers/countries.dart';       // countryList
import 'package:country_pickers/country_pickers.dart';  // CountryPickerUtils

late Country _selected = countryList.firstWhere(
  (c) => c.isoCode == 'CL',
  orElse: () => countryList.first,
);

DropdownButtonFormField2<Country>(
  isExpanded: true,
  value: _selected,
  items: countryList
      .map((c) => DropdownMenuItem(
            value: c,
            child: Row(children: [
              CountryPickerUtils.getDefaultFlagImage(c),
              const SizedBox(width: 8),
              Expanded(child: Text('+${c.phoneCode} ${c.name}')),
            ]),
          ))
      .toList(),
  // collapse the button to just the flag once selected
  selectedItemBuilder: (_) => countryList
      .map((c) => Align(
            alignment: Alignment.centerLeft,
            child: CountryPickerUtils.getDefaultFlagImage(c),
          ))
      .toList(),
  onChanged: (c) => setState(() => _selected = c!),
);
// Compose the E.164 number: '+${_selected.phoneCode}$localDigits'
```

Alternatively the package's built-in searchable dialog: `showDialog(context: ..., builder: (_) => CountryPickerDialog(isSearchable: true, onValuePicked: (Country c) => ...))`.

## Validation UX — show errors only when dirty/touched

The whole point of `pure`/`dirty`: a field starts `pure`, so `displayError` is `null` and the user doesn't see "Campo requerido" before they've typed anything. The first `onChanged` flips it to `.dirty(value)`, and only then does `displayError` surface the validator result. **Bind UI error text to `displayError`, never to `error`** — `error` would show on a blank untouched field. For the submit button, gate on `Formz.validate([...])` (or the state's `isValid` getter), not on `displayError`, so the button stays disabled until the whole form is genuinely valid.

## Real-world usage

The reference app uses **formz + Cubit exclusively — no `Form`/`GlobalKey<FormState>`**. Inputs live in `lib/core/form_inputs/` (`email.dart`, `password.dart`, `confirmed_password.dart`), reusable widgets in `lib/core/form_widgets/` (`text_input.dart`, `phone_input.dart`, `app_checkbox.dart`).

**1. FormzInput classes** (`lib/core/form_inputs/email.dart`): a one-error enum + `.pure()`/`.dirty()` + regex `validator`. Note `password.dart`'s `validator` currently returns `null` (always valid) — verify before relying on client-side password strength; enforcement is server-side.

**2. State with formz inputs + `isValid` getter + semantic copy helpers** (`lib/features/login/cubit/login_state.dart`) — instead of a generic `copyWith`, it exposes `withEmail`, `withPassword`, `withSubmissionInProgress/Success/Failure`, and:
```dart
bool get isValid => Formz.validate([email, password]);
```

**3. Cubit translates UI events to dirty inputs** (`lib/features/login/cubit/login_cubit.dart`):
```dart
void emailChanged(String email) => emit(state.withEmail(email));   // → Email.dirty(email)
Future<void> logInWithCredentials() async {
  if (!state.isValid) return;
  emit(state.withSubmissionInProgress());
  try { ...; emit(state.withSubmissionSuccess()); }
  on FirebaseAuthException catch (e) { emit(state.withSubmissionFailure(firebaseAuthErrorMessageEs(e))); }
}
```

**4. The `TextInput` core widget** (`lib/core/form_widgets/text_input.dart`) is a `TextField` wrapper with `label`/`hint`/`errorText`/`leadingIcon`/`suffixIcon`/`obscureText`. It draws its own error row below the field and sets `InputDecoration(error: errorText != null ? SizedBox() : null)` to suppress the default error widget while still turning the border red. Field widgets read formz state with `context.select`:
```dart
final displayError = context.select((LoginCubit c) => c.state.email.displayError);
return TextInput(
  onChanged: (v) {
    context.read<LoginViewCubit>().dismissError(); // clear the server-error banner on edit
    context.read<LoginCubit>().emailChanged(v);
  },
  errorText: displayError != null ? 'Correo inválido' : null, // only when dirty
);
```
The submit button gates on `status.isInProgress` + `isValid`, both via `context.select`, showing a `CircularProgressIndicator` while `inProgress`. A separate `LoginViewCubit` holds view-only concerns (password obscure toggle, dismissible server-error banner) — keep transient UI flags out of the formz Cubit.

**5. `country_pickers` in phone input** (`lib/core/form_widgets/phone_input.dart`): a `StatefulWidget` using `countryList` + `CountryPickerUtils.getDefaultFlagImage` inside a `DropdownButtonFormField2<Country>` (flag-only when collapsed via `selectedItemBuilder`), default `CL`, with a local `TextEditingController` for the number. It parses an incoming `+<code><number>` string back into country+local (`_countryFromValue` picks the longest matching `phoneCode`) and emits `'+${selectedCountry.phoneCode}$local'` on every change. Controller is disposed in `dispose()`.

**6. `keyboard_actions`** (`^4.2.1`, a declared dependency) is the intended pattern for numeric/decimal forms (no iOS return key). Wrap the body in `KeyboardActions` with a `KeyboardActionsItem(focusNode:)` per numeric field and a "Listo" toolbar button — see the keyboard_actions section above. (Not yet wired in any screen as of this writing — apply it when adding numeric clinical inputs.)

## Common mistakes

| Pitfall | Fix |
|---|---|
| Binding `errorText` to `input.error` | Bind to `input.displayError` — `error` shows on untouched pure fields. |
| Errors flash before the user types | Construct inputs `.pure()` initially; only `.dirty(v)` on `onChanged`. |
| Forgetting to `dispose()` `TextEditingController`/`FocusNode` | Dispose in `State.dispose()` — leaks + "used after dispose" crashes. |
| Submit button enabled on invalid form | Gate `onPressed` on `Formz.validate([...])` / `state.isValid`. |
| Double-submit (button tapped twice) | Disable while `status.isInProgressOrSuccess`. |
| Numeric keyboard has no Done key on iOS | Add `keyboard_actions` toolbar with a Done/"Listo" button. |
| `keyboardType: number` still lets in letters (some keyboards) | Add `inputFormatters: [FilteringTextInputFormatter.digitsOnly]`. |
| Wrapping `KeyboardActions` child in another scroll view | `KeyboardActions` scrolls itself; don't nest a `SingleChildScrollView`. |
| Stale search results when reopening dropdown | Clear `searchController` in `onMenuStateChange` when `!isOpen`. |
| Cross-field validator (confirm password) stale | Re-inject the dependency (`password:`) into the `.dirty()` ctor on every state copy. |
| Putting view-only flags (obscure toggle) in the formz Cubit | Use a separate view Cubit so form rebuilds aren't triggered by UI toggles. |

## See also
- [state-management.md](state-management.md) — Cubit, `copyWith`, `context.select`, Equatable.
- [navigation.md](navigation-and-routing.md) — flow_builder page factories used after submit success.
- [firebase-auth.md](firebase-core-auth.md) — `FirebaseAuthException` → Spanish messages on submit failure.
- [networking.md](networking-rest.md) — posting validated form data via `ApiService`.
- formz: https://pub.dev/packages/formz · https://github.com/VeryGoodOpenSource/formz
- Flutter forms: https://docs.flutter.dev/cookbook/forms/validation
- `TextEditingController` / `TextField`: https://api.flutter.dev/flutter/material/TextField-class.html
- keyboard_actions: https://pub.dev/packages/keyboard_actions
- dropdown_button2: https://pub.dev/packages/dropdown_button2 · country_pickers: https://pub.dev/packages/country_pickers
