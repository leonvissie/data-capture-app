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
- PrimaryButton
- SecondaryButton
- IconButton
- FloatingActionButton

## Content
- Card
- SectionHeader
- EmptyState
- InlineNotice
- ErrorState

## Forms
- TextField
- TextArea
- DateTimeField
- SelectionField

## Overlay
- AppModal
- ConfirmationDialog
- BottomSheet

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

---

# Data Capture App: Initial Architecture

## Core features

### Themes
User-defined categories/themes.

Example:
- Sneezing
- Headaches
- Medication
- Symptoms

### Theme Items
Custom buttons/actions within a theme.

Example:
- 1 sneeze
- 2 sneezes
- severe sneeze

### Entries
Timestamped captured events.

Includes:
- date/time to minute precision,
- notes,
- linked theme/item.

### Analytics
Initial version:
- modal/table view only,
- graph placeholder architecture ready for future charts.

---

# Suggested Feature Structure

```txt
features/
  themes/
  items/
  entries/
  analytics/
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

- create theme,
- create item,
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
