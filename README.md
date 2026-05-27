# Data Capture App

Foundation-first Expo app for structured local-first tracking.

## Standards

- No direct SQLite or storage access in screens.
- Shared tokens/primitives only for visual styling.
- Accessibility and dark mode from day one.
- App security uses 6-digit PIN, optional biometrics, and lockouts.
- Category/Section/Option/Entry/EntryValue is the canonical model.

## Commands

- `npm run lint`
- `npm run format`
- `npm run typecheck`
- `npm run test`

## FSC Pre-Commit Checklist

Before creating a commit/PR, confirm:

- Shared components reused; no duplicated UI primitives
- No local colour/spacing/font literals
- Accessibility + dark mode verified
- No direct DB/storage calls in screens
- No unsafe debug logging (dev-only logging gated by `appConfig.features.showDevTools`)
- Screen/header/modal scaffolding uses shared foundation patterns
- `npm run lint`, `npm run typecheck`, and `npm run test` pass
