# Foundation Development Standards & Implementation Strategy

## Purpose

This document defines the required development standards, architecture principles, reusable UI/component strategy, and implementation rules for all mobile app projects.

The goal is to:
- reduce repeated fixes,
- improve maintainability,
- improve consistency across apps,
- reduce onboarding time for new developers,
- ensure accessibility/dark mode/supportability from day one,
- and prevent architecture drift over time.

These standards apply to all contributors and all projects unless explicitly overridden.

---

# Core Principles

## 1. Shared-first development

Before creating:
- a new component,
- helper,
- modal,
- storage pattern,
- hook,
- layout,
- or utility,

the developer MUST first check whether a reusable/shared implementation already exists.

If an existing implementation exists:
- use it,
- extend it generically if needed,
- or improve the shared version.

Do NOT create local duplicates of:
- buttons,
- cards,
- icon buttons,
- headers,
- modals,
- form fields,
- spacing systems,
- date helpers,
- typography styles,
- accessibility helpers,
- or semantic colour handling.

---

## 2. Thin screens only

Screens/routes should:
- compose UI,
- coordinate feature hooks/services,
- handle navigation.

Screens should NOT contain:
- persistence logic,
- business rules,
- policy resolution,
- complex effect chains,
- formatting logic,
- validation logic,
- inclusion logic,
- or duplicated helper logic.

Move those concerns into:
- services,
- hooks,
- selectors,
- repositories,
- validators,
- or shared utilities.

---

## 3. Design system enforcement

All apps must use shared design tokens.

No local:
- hex colours,
- spacing literals,
- radius literals,
- typography literals,
- semantic colours,
- shadows,
- or sizing systems.

Everything must come from theme tokens.

---

# Shared Theme & Design Tokens

## Existing colour scheme

The existing app colour system should be reused across projects unless intentionally rebranded.

Canonical source of truth for company apps:
- `src/foundation/theme/colors.ts`

All app themes must derive from this canonical palette/token system unless a documented rebrand exception is approved.

## Functional vs Brand Colour Layers (Mandatory)

To support multiple future app brands without breaking accessibility/compliance, colour tokens must be split into two layers:

1. Functional UI tokens (required)
- file: `src/foundation/theme/colors.ts`
- purpose: readable, accessible working colours for:
  - surfaces,
  - text,
  - borders/dividers,
  - semantic status states,
  - high-contrast interactive defaults.

2. Brand expression tokens (optional, app-specific)
- file: `src/foundation/theme/brandColors.ts` (or `brand.ts`)
- purpose: brand accents, gradients, glows, decorative colour systems.

Rules:
- Functional tokens must remain stable and accessibility-first across apps.
- Brand tokens may vary per app/product brand.
- Feature screens must not bypass functional tokens with raw brand values.
- Brand tokens must be consumed through shared foundation components/helpers, not ad hoc per-screen styling.
- Rebranding should primarily require brand token updates, not component rewrites.

Primary palette:

- Primary Teal: `#0E9384`
- Primary Dark Teal: `#0B7569`
- Accent Blue: `#2563EB`

Neutral palette:
- `#0F172A`
- `#1E293B`
- `#334155`
- `#64748B`
- `#CBD5E1`
- `#E2E8F0`
- `#F8FAFC`
- `#FFFFFF`

Semantic states:
- Success
- Warning
- Error
- Info

must be centrally defined and tokenised.

No feature-level semantic colour choices.

## Colour Accessibility & High Contrast (Mandatory)

All apps must be colour-blind-friendly and high-contrast-compatible in both light and dark mode.

Required:
- colour meaning must never rely on hue alone (always pair with text/icon/shape/state),
- interactive and textual contrast must meet at least WCAG AA targets in both light and dark modes,
- semantic state colours (success/warning/error/info) must remain distinguishable for common colour-vision deficiencies,
- shared components must expose a high-contrast-friendly visual treatment using foundation tokens,
- token changes in `src/foundation/theme/colors.ts` must be validated against both normal and colour-vision-deficiency viewing conditions,
- no feature-level overrides that reduce contrast or semantic distinguishability.
- brand gradients/accent colours must not replace functional text/surface/semantic tokens for critical UX states.

When state is communicated (for example error/success/warning):
- use at least two channels:
  - colour + label text, or
  - colour + icon, or
  - colour + shape/border pattern.

This requirement applies to:
- buttons,
- pills/chips,
- notices/banners,
- form validation states,
- charts/legends,
- and all modal/dialog status messaging.

## Brand Token Usage Boundaries

Brand tokens are allowed for:
- hero/marketing-style visual accents,
- decorative backgrounds,
- non-critical chart accents (with secondary differentiators).

Brand tokens are not allowed as sole styling for:
- body text contrast surfaces,
- form field readability states,
- destructive/confirmation semantics,
- critical status communication,
- lock/auth/security decision states.

If brand tokens are applied in functional UI:
- functional contrast requirements still take precedence,
- semantic clarity must remain intact in light and dark mode,
- and colour-blind-safe differentiation must still pass.

---

# Accessibility Requirements (Mandatory)

Accessibility is not optional and must exist from day one.

All interactive controls must support:
- accessibility labels,
- accessibility hints,
- accessibility roles/states,
- minimum touch targets,
- screen reader compatibility,
- sufficient contrast,
- dark mode support.

Accessibility support must be implemented in shared primitives so it is inherited automatically.

---

# Dark Mode Requirements

Dark mode support is mandatory from project start.

Requirements:
- no hardcoded colours,
- all surfaces use theme tokens,
- all overlays/modals/cards/buttons use semantic tokens,
- all text contrast must remain AA compliant.

---

# Shared Component Strategy

## Existing Cinlo components

Existing reusable components from Cinlo must be reviewed before creating new components.

Each existing component should be classified as:

### A. Reuse as-is
Reusable immediately.

### B. Reuse with generalisation
Needs app-specific assumptions removed.

### C. App-specific
Do not reuse.

### D. Replace
Existing implementation should be redesigned.

---

# Shared Foundation Structure

All reusable/shared code should live in a foundation layer.

Suggested structure:

```txt
src/
  foundation/
    components/
      buttons/
      cards/
      forms/
      layout/
      modals/
      feedback/
      navigation/

    theme/
      colors.ts
      spacing.ts
      typography.ts
      radii.ts
      shadows.ts
      semantic.ts

    lib/
      accessibility/
      dateTime/
      formatting/
      validation/
      logger/

    services/
      dialogs/
      storage/
      navigation/

    hooks/

  features/
```

---

# Required Shared Primitives

These should exist before feature work begins:

## Layout
- AppScreen
- AppScrollScreen
- AppModalScreen
- StickyHeaderLayout

## Buttons
- Button (single shared base API)
- IconButton
- FloatingActionButton
- RoundIconButton

## Button System Contract (Mandatory)

All apps must use one shared foundation `Button` primitive with controlled variants/tokens.

Required `Button` API surface:
- `variant`: `solid | outline | ghost | soft`
- `size`: `sm | md | lg`
- `shape`: `pill | rounded`
- `tone`: foundation colour tone key from `src/foundation/theme/colors.ts`
- `selected`, `disabled`, `loading` states

Variant definitions:
- `solid`: `background = tone.base`, `border = tone.base` (or transparent), `text = tone.onBase`
- `outline`: `background = transparent|surface`, `border = tone.border`, `text = tone.base`
- `ghost`: `background = transparent`, `border = transparent`, `text = tone.base`
- `soft`: `background = tone.surface` (or `tone.background`), `border = tone.border`, `text = tone.base`

### Token Slot Overrides (Allowed, Guarded)

Buttons may expose optional slot overrides for advanced usage:
- `backgroundToken`
- `pressedBackgroundToken`
- `borderToken`
- `textToken`

Rules:
- overrides must reference approved foundation token keys only,
- raw hex/rgb values are forbidden in feature code and shared button usage,
- defaults must still be computed from `variant + tone`,
- overrides are for edge cases; they must not replace the standard variant system.

### Guardrails

- Do not create route-level button clones.
- Do not add feature-specific button components for style-only differences.
- If a visual tweak is requested (height/padding/radius/pressed state), update button tokens/variants in foundation.
- Keep semantic clarity: destructive actions should default to warning/error tones, even when overrides are used.
- Ensure all variant+tone combinations used by product flows meet contrast requirements in light and dark mode.

### Button Accessibility Validation Matrix (Mandatory)

For every `variant x tone` combination used in product flows, validate:
- text/background contrast at rest state meets WCAG AA,
- pressed state remains contrast-safe and visually distinct,
- disabled state remains legible and clearly non-interactive,
- selected state (where applicable) is distinguishable without relying on colour alone.

Validation process:
- run this matrix for light and dark mode,
- run checks under common colour-vision-deficiency simulation,
- document approved combinations in foundation button docs,
- block PRs introducing unvalidated combinations in production flows.

### Usage Rules

- Use `solid` for primary call-to-action on the screen.
- Use `outline` for secondary supporting actions.
- Use `ghost` for low-emphasis text actions.
- Use `soft` for selected chips/options and low-harshness alerting actions.
- Use `size` tokens (`sm/md/lg`) for height adjustments, never local minHeight literals.
- Use `shape` tokens for consistency (`pill` for chips/inline actions, `rounded` for cards/option buttons where appropriate).

### Implementation Rule

`PrimaryButton`, `SecondaryButton`, and `DestructiveButton` (if retained) must be thin wrappers around the shared base `Button` only.  
No duplicated style logic across wrappers is allowed.

## Round Icon Button Contract (Mandatory)

All apps must use one shared foundation `RoundIconButton` primitive with a centralized icon-type registry.

Required API surface:
- `buttonType` from shared `roundIconButtonTypes` registry
- `size`: `sm | md | lg` (optional numeric override allowed for controlled edge cases)
- `disabled`, optional `loading`
- `floating` (default `false`)
- token-slot overrides via a single `tokens` object (`background`, `pressedBackground`, `icon`, `border`)

Rules:
- no route-level icon glyph strings for round action buttons,
- icon presets/tone defaults must be resolved centrally from registry mapping,
- visual metrics (size, border width, floating elevation) must come from component tokens,
- no hardcoded hex/rgb values in shared round-icon implementation or usage.

Floating guardrail:
- `floating` is restricted to overlay contexts (for example media/card overlay actions),
- do not use floating round icon buttons in standard header/form/row action layouts,
- prefer a shared wrapper (`FloatingRoundIconButton`) for approved floating usage.

## Content
- Card
- Divider
- SectionHeader
- EmptyState
- InlineNotice
- ErrorState

Divider normalization:
- all visual section dividers must use shared `Divider` foundation component,
- divider spacing must use semantic shared sizes (`sm` | `md` | `lg`),
- do not implement ad hoc border-line + margin divider patterns in screens/features.

## Forms
- TextField
- TextArea
- DateTimeField
- SelectionField

## Overlay
- AppModal
- ConfirmationDialog
- BottomSheet

## Screen Scaffolding Blueprint (Mandatory)

Every new screen/route must follow the shared scaffolding blueprint.

Screens MUST use foundation layout primitives:
- `AppScreen` for static layouts
- `AppScrollScreen` for scrolling layouts
- `AppModalScreen` for full-screen modals

Feature screens must NOT render their own:
- `SafeAreaView`,
- ad hoc root wrappers,
- or route-level spacing systems.

This ensures:
- safe area consistency,
- consistent top/bottom rhythm,
- and global layout behavior without per-screen rework.

## Header Contract (Mandatory)

All top-level screens must use a shared header pattern from foundation.

Header spacing, typography, and action placement (back/add/settings/etc.) must be controlled by shared components/tokens.

Feature screens must NOT hand-place:
- title baselines,
- icon button offsets,
- custom header paddings,
- or one-off title rows.

If a new header pattern is required:
- extend the shared header component,
- do not create a local route-specific header layout.

## Modal/Sheet Contract (Mandatory)

All overlays must use shared shells:
- `AppModal`
- `ConfirmationDialog`
- `BottomSheet`

No per-feature modal shell duplication is allowed.

Modal safe-area handling, header spacing, close action placement, and body/footer padding must be standardized in shared primitives.

## Component Tokenization Contract (Mandatory)

Shared UI components must be implemented with token layers:

1. global tokens (`spacing`, `typography`, `radii`, colour/tone tokens)
2. component tokens (`componentMetrics.<componentName>.*`)
3. component implementation referencing only tokenized values

No raw layout literals in shared UI components for:
- spacing,
- sizing,
- typography,
- corner radius,
- semantic colour decisions.

When a UX tweak is requested (for example “increase gap above PIN dots”):
- the expected implementation is a token change,
- not per-screen style edits.

## Accessibility-by-default Contract

Accessibility must be built into shared primitives so screens inherit it automatically.

Shared components must provide:
- minimum touch targets,
- accessibility role/state defaults,
- sensible labels/hints for controls where possible,
- contrast-safe token usage in light/dark modes.

Screens should only provide custom accessibility text when context-specific.

## New Screen Template Rule

When adding a new tab/screen/route:
- start from shared scaffold,
- use shared header contract,
- use shared button/content/form primitives,
- and avoid local style systems.

Any exception must be documented in the PR with reason and follow-up plan.

---

# Storage & Data Rules

## No direct database access in screens

Screens must NEVER:
- call SQLite directly,
- perform raw persistence,
- manipulate repositories directly.

Use:
- repositories,
- feature services,
- or hooks.

---

# Validation Contract (Mandatory)

All user-input flows must use a shared validation contract and shared UI patterns.

## Shared Types

Use one shared issue model from foundation validation:
- `ValidationIssue`
- `severity`: `warning` | `blocking`
- optional `fieldId`
- optional `anchor`

## Severity Rules

- `blocking` issues must prevent submit/finalise.
- `warning` issues may allow continue depending on flow policy.
- the same `fieldId` may emit different severities in different contexts/rule thresholds.

## Submit Gate

All submit/finalise actions must use a shared gate helper to resolve:
- proceed,
- continue with warnings,
- or blocked.

Do not duplicate this decision tree in feature screens.

## Anchor/Focus Behavior

Validation issues should include `anchor`/`fieldId` when actionable.

Shared anchor/focus helpers must be used to:
- focus the first invalid field where possible,
- otherwise scroll to the first actionable section anchor.

Field reveal rules:
- register field layout positions via shared validation reveal helpers,
- scroll the first invalid field into view before focus,
- and do not implement route-level custom scroll math for validation.

## Shared Validation UI

Warning/blocker summaries must use shared foundation components (for example a shared validation summary/warning card), not ad hoc per-screen alert formatting.

Rules:
- use non-colour cues in addition to colour,
- provide clear actionable copy,
- keep warning vs blocker treatments visually distinct.

## Warning Confirmation Submit Flow (Mandatory)

Warning-only validation states must not silently proceed to save.

All form save/finalise actions must use shared submit orchestration that enforces:
- `blocked`: do not save; reveal/focus first actionable blocking field,
- `continue_with_warnings`: show shared warning confirmation dialog,
- `proceed`: execute save.

Warning confirmation dialog requirements:
- include summary title/message,
- include warning items list when warnings exist,
- expose explicit actions equivalent to:
  - `Continue anyway`
  - `Review fields`

If user selects review/cancel in warning confirmation:
- do not save,
- reveal/focus first warning anchor/field.

Screens must not implement warning-confirm save logic ad hoc; use shared foundation helper/service contracts.

## Implementation Structure

Validation logic must live in feature validation modules (`features/*/validation/*`) and return shared `ValidationIssue[]`.

Screens may orchestrate when validation is run, but must not own duplicated rule implementations.

---

## Repository pattern

All persistence must go through repositories/services.

Example:

```txt
features/
  entries/
    repositories/
    services/
    hooks/
```

This is required even for small apps.

---

## Migration-ready schemas

All local storage schemas must:
- support migrations,
- support versioning,
- avoid destructive assumptions.

Even if cloud sync is not planned initially.

---

# Date & Time Rules

Only one shared date/time toolkit may exist.

No duplicated:
- formatting,
- parsing,
- masking,
- now-helpers,
- timezone handling,
- relative date logic.

All date handling must use shared utilities.

---

# Modal & Dialog Rules

No direct:
- Alert.alert,
- ad hoc modal layouts,
- inconsistent safe-area handling.

All dialogs/modals must use shared:
- modal shells,
- dialog services,
- layout patterns.

Exception (narrow):
- native/system alerts may be used only for OS-level permission/system-linking flows where shared modal shells are unsuitable.
- any exception must include a short code comment and PR note explaining why shared dialog service was not appropriate.

---

# Logging Rules

Use shared logger utilities only.

No stray:
- console.log,
- debug traces,
- temporary logging.

Production-safe logging only.

---

# Testing & Tooling Requirements

These must exist before meaningful feature work:

## Mandatory scripts
- lint
- format
- typecheck
- test

## Required tooling
- ESLint
- Prettier
- TypeScript strict mode

## CI checks
Every PR should pass:
- lint
- typecheck
- tests

---

# Expo & Platform Config Rules

## Android edge-to-edge (Android 16+)

Android 16 makes edge-to-edge mandatory.

For Expo apps:
- do NOT set `android.edgeToEdgeEnabled` in `app.json` or `app.config.*`,
- remove legacy `edgeToEdgeEnabled` entries from templates,
- and rely on default platform behavior plus safe-area/layout handling in shared primitives.

This avoids `EDGE_TO_EDGE_PLUGIN` warnings during native runs/builds.

## Expo Router + iOS Pods baseline (mandatory)

When using Expo Router / React Navigation, the following native dependencies MUST be installed before first native prebuild/run:
- `expo-linking`
- `react-native-screens`
- `react-native-gesture-handler`
- `react-native-safe-area-context`

Without these, iOS pod install may fail with errors like:
- `Unable to find a specification for RNScreens depended upon by ExpoHead`

Use:
- `npx expo install expo-linking react-native-screens react-native-gesture-handler react-native-safe-area-context`

Then run:
- `npx expo run:ios` (preferred) or `cd ios && pod install --repo-update`

This dependency check should be treated as part of foundation setup, not feature work.

## Native readiness checklist (before first iOS run)

Before first `npx expo run:ios`, verify:
- required Expo Router native deps are present in `package.json`,
- `app.json` has no deprecated platform flags (for example `android.edgeToEdgeEnabled`),
- JS dependencies are installed (`npm install`),
- and only then run native prebuild/build.

## Expo SDK 56 baseline and reliability rules

For active Expo SDK line projects, enforce the following at foundation setup time:

- use Expo-managed version installs for native packages (`npx expo install ...`), not ad hoc `npm install` version pinning,
- run `npx expo install --fix` after adding/upgrading native modules,
- keep `expo`, `react-native`, and Expo package versions aligned to the same SDK line,
- run iOS builds via `npx expo run:ios` (preferred) instead of manually driving Xcode/CocoaPods first,
- if iOS native compile errors reference missing RN/Fabric/Yoga headers, run a full native reset:
  - `npx expo prebuild --clean`
  - `npx expo run:ios`

Version policy:
- do not hard-code exact SDK/RN/React/Node/Xcode numbers in this standards document,
- verify current supported versions against official Expo docs at bootstrap/upgrade time,
- record the resolved toolchain in repo-specific docs (`README` or setup docs) and lockfiles,
- treat these checks as preconditions before debugging app-level code.

## Launch & Splash Build Approach (Mandatory)

All apps must follow a shared splash initialization approach to avoid per-project drift.

Requirements:
- include `expo-splash-screen` in project dependencies,
- include `expo-splash-screen` in Expo plugins/config when required by SDK behavior,
- call splash `preventAutoHide` during app bootstrap,
- hide splash only after foundation bootstrap readiness criteria are met (storage/auth/bootstrap state),
- keep splash hide policy centralized in shared root/bootstrap flow (not in feature screens),
- if platform behavior differs, platform-specific timing/handling must still be implemented in shared bootstrap/root layout code.

Rules:
- do not hide splash from route-level feature screens,
- do not duplicate splash timing logic across multiple files/features,
- do not couple splash readiness to feature-specific data loading.

This ensures consistent app startup behavior, predictable launch UX, and reusable foundation bootstrapping across all apps.

## Dev Tools Gating Contract (Mandatory)

Development-only UI/routes/features must be controlled through app config flags, not ad hoc checks.

Required config flags:
- `appConfig.features.showDevTools` (boolean): controls whether dev UI/routes are exposed and whether debug/info logging is enabled.

When `showDevTools` is `false`:
- do not render Dev sections in Settings or other feature screens,
- do not register dev-only routes in the root navigator,
- and guard dev-only screens with redirect fallback to a non-dev route (defense in depth).

Rules:
- do not rely solely on `__DEV__` checks for gating shared app behavior,
- keep dev-feature gating centralized in `appConfig`,
- all dev labs/playgrounds/debug tools must follow this contract.

---

# PR / Code Review Checklist

Every PR must confirm:

- [ ] Shared components reused where appropriate
- [ ] No duplicated UI primitives introduced
- [ ] No local colour/spacing/font literals
- [ ] Accessibility included
- [ ] Dark mode verified
- [ ] No direct DB/storage calls in screens
- [ ] No duplicate helper logic
- [ ] Shared components improved generically where appropriate
- [ ] Tests added/updated where required
- [ ] No unsafe debug logging
- [ ] New/updated screens use mandatory shared screen scaffolding
- [ ] Header pattern uses shared foundation contract (no local header layout)
- [ ] Modal/sheet UX uses shared overlay shells only
- [ ] Shared UI tweaks are token-driven (not route-level formatting)
- [ ] Shared components include accessibility defaults where applicable

---

# Data Capture App: Initial Architecture

## Canonical Domain Model

All data-capture apps must use the canonical model:
- Category
- Section
- Option
- Entry
- EntryValue

Model notes:
- `Category` is the top-level tracker/container.
- `Section` groups related options within a category.
- `Option` defines selectable/capturable units inside a section.
- `Entry` is the captured event/timestamp container.
- `EntryValue` stores captured values linked to an entry + option (and supports extensibility for value types).

Do not introduce legacy parallel naming models (for example theme/item) in foundation standards or new feature schemas.

---

# Suggested Feature Structure

```txt
features/
  categories/
  entries/
  analytics/
  capture/
  settings/
```

---

# Implementation Strategy

## Phase 1 — Foundation
Build:
- theme tokens,
- shared primitives,
- modal/dialog system,
- repositories,
- accessibility helpers,
- date toolkit,
- storage setup,
- lint/typecheck/test tooling.

No feature work before this is stable.

---

## Phase 2 — Vertical Slice
Implement one complete flow:

- create category,
- create section/option,
- capture entry,
- edit timestamp,
- add notes,
- view entries table.

This validates:
- architecture,
- navigation,
- persistence,
- modal strategy,
- theming,
- dark mode,
- accessibility.

---

## Phase 3 — Expand
Add:
- analytics,
- filtering,
- export,
- graphs,
- sync,
- notifications,
- etc.

Only after foundation patterns are stable.

---

# Non-Negotiable Rules

The following are prohibited:

- local hex colours,
- direct SQLite in screens,
- duplicated helpers,
- ad hoc modal layouts,
- duplicated buttons/cards/forms,
- feature-specific semantic colours,
- missing accessibility metadata,
- duplicated date logic,
- uncontrolled screen growth,
- bypassing shared components without documented reason.

---

# Long-Term Goal

The long-term objective is to create a reusable mobile application foundation that:
- accelerates future app development,
- reduces bugs,
- improves maintainability,
- standardises UX,
- standardises accessibility,
- standardises theming,
- and enables multiple developers to work consistently across projects.

---

# Terminology Convention

Standards prose uses British English (`colour`, `theming`, etc.) for documentation consistency.

Code/API naming follows implementation and ecosystem conventions (for example `backgroundColor`, `colorKey`, `borderColor`) and must not be renamed for prose consistency.

---

# Home/Capture Contract (3-Tab IA)

When the app uses the 3-tab layout (`Insights`, `Capture`, `Settings`), Capture/Home must follow this contract:

- optional tutorial CTA at top, controlled by persisted preference,
- primary category creation CTA,
- category list/cards for launching capture flows,
- optional filter/sort/search controls via shared overlay shell.

The tutorial CTA must not be forced:
- users can hide it from Home,
- users can re-enable it from Settings.

## Home Preferences (Mandatory)

Persist Home display controls in `user_prefs`:
- `show_home_tutorial_cta` (boolean),
- `home_category_filter` (`all` | `quickCount` | `timedActivity` | `journal`),
- `home_category_sort` (`recent` | `name`).

These fields must be migration-safe and defaulted for backward compatibility.

## Category Type Semantics (Mandatory)

Category type enums are storage contracts and must remain stable in v1:
- `quickCount`
- `timedActivity`
- `journal`

User-facing labels may evolve, but meaning must be explicit and consistent:
- `quickCount` = single-value measurement capture (for example counts or numeric readings),
- `timedActivity` = duration/time capture,
- `journal` = multi-field or narrative capture.

For `quickCount` categories:
- unit must be defined at category setup (for example `mm`, `inch`, `mmHg`, `C`, `F`),
- capture flow must ask for value only and use the predefined category unit,
- and unit/type must be locked once entries exist (name remains editable).

For `timedActivity` categories:
- capture must follow a single active interval model (`start` then `end`),
- only one open interval per category is allowed at a time,
- start/end points must be stored via `entry_values.action_type` using:
  - `durationStart`
  - `durationEnd`
- end must be later than start and must pass shared date/time validation rules.

## Capture Flow Composition Contract (Mandatory)

For multi-type capture surfaces (for example `quickCount`, `timedActivity`, `journal`), route screens must remain orchestration-only.

Required structure:
- route screen = loader + navigation + shared submit orchestration wiring only,
- per-type UI/interaction blocks must live in dedicated shared feature components (for example `*CaptureFlow` components),
- per-type validation rules must live in `features/*/validation/*` modules,
- per-type persistence operations must live in repositories/services and be consumed through a feature hook/service/controller.

Prohibited in route screens:
- inlined type-specific rule sets,
- duplicated per-type form rendering branches with repeated primitives,
- direct repository write/read branching per type.

Goal:
- adding a new capture type (for example `journal`) should require a new type flow module + validator + persistence adapter, with minimal route-screen changes.

## Entry Location Contract (Mandatory)

Location must be implemented as a shared global foundation capability (not per-screen logic):
- one entry maps to zero-or-one location (`entries.location_id` nullable),
- locations are reusable global records,
- location creation is deduplicated by normalized value (case-insensitive),
- and selection UI must not preselect any location state by default.

Shared UI requirements:
- use shared `EntryLocationField` and shared picker modal flow,
- show up to 5 inline location pills plus `+` when more exist,
- include `None` inline option, but only as an explicit user choice (not default selected),
- support second-tap deselect behavior for location pills,
- include add-location text input under pills (create-or-reuse without duplicate prompt),
- include sort action in header row (same modal entry point as `+`).

Validation requirements:
- save must block until the user explicitly chooses a location pill, explicitly chooses `None`, or enters a valid new location value.

Sort requirements:
- default sort: `recency`,
- supported sorts: `recency`, `usage` (entry count), `A-Z`, `Z-A`,
- persist location sort preference in `user_prefs`.

Interactive sort stability requirements:
- sorted interactive lists must use UI-first selection state (local state updates immediately on tap),
- async list refreshes must be race-safe (request sequencing/token or equivalent),
- stale async responses must be discarded and must not overwrite newer UI state,
- and persisted preference hydration must not re-apply mid-interaction in a way that causes selection flicker.

Rules:
- do not rename stored enum values without a migration plan,
- keep UX copy aligned across create-category, filters, tutorials, cards, and capture flows,
- and document enum-to-label mapping in one shared foundation resolver/map.

## Category Tone Mapping (Mandatory)

Category types must use shared, stable tone mapping so colour intent remains consistent across:
- category creation controls,
- category cards/list rows,
- capture flow headers/cards.

Rules:
- define mapping in one shared foundation resolver/map,
- do not hardcode per-screen category colours,
- and keep mappings accessibility-safe in light and dark mode.

## Theme Mode Preference (Mandatory)

Apps must support `System`, `Light`, and `Dark` mode from Settings.

Rules:
- persist mode in `user_prefs.preferred_theme_mode`,
- apply persisted mode during bootstrap (before normal app interaction),
- and route all theme changes through shared theme provider/hooks (no per-screen colour mode state).
