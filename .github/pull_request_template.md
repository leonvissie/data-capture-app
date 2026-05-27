## Summary

- 

## FSC Checklist (Required)

- [ ] Shared components reused where appropriate
- [ ] No duplicated UI primitives introduced
- [ ] No local colour/spacing/font literals
- [ ] Accessibility included (labels, roles, tap targets, focus behavior where needed)
- [ ] Dark mode verified
- [ ] No direct DB/storage calls in screens
- [ ] No duplicate helper logic
- [ ] Shared components improved generically where appropriate
- [ ] Tests added/updated where required
- [ ] No unsafe debug logging
- [ ] New/updated screens use shared screen scaffolding
- [ ] Header pattern uses shared foundation contract (no local header layout)
- [ ] Modal/sheet UX uses shared overlay shells only
- [ ] Shared UI tweaks are token-driven (not route-level formatting)
- [ ] Dev-only UI/logging is gated by `appConfig.features.showDevTools`

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test -- --ci`

