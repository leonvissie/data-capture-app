
# Detailed Application Brief — Structured Tracking App

## Purpose

This document defines the detailed application brief, architecture direction, implementation expectations, data model, UX philosophy, and technical standards for the Structured Tracking App project.

This brief is intended for senior developers and AI-assisted development workflows (including Codex).

This document must be read together with:
.temp/foundation-standards.md

and the reference implementation/materials located in:
.temp/cinlo/

The Cinlo repo should be treated as:
- a reference implementation,
- a reusable component source,
- and a UI/UX consistency guide.

However:
- components must be reviewed before reuse and read in conjunction with guidance of foundation-standards.md,
- app-specific assumptions must be removed,
- and reusable logic/components should be promoted into the shared foundation layer.

---

# High-Level Product Vision

This app is a lightweight but powerful structured tracking and journaling application.

The primary design goals are:

- extremely low friction data capture,
- excellent UX,
- clean modern UI,
- accessibility,
- dark mode support,
- strong local-first privacy,
- structured analytics-ready data,
- reusable architecture,
- and extensibility without uncontrolled complexity.

The app must feel:
- lightweight,
- responsive,
- simple,
- intuitive,
- and highly tappable.

The app is NOT intended to feel:
- enterprise,
- spreadsheet-like,
- database-driven,
- or overly configurable.

Internally the data model may be flexible and powerful, but the user experience must remain guided and approachable.

---

# Security & Privacy Model

The app follows the same philosophy as GunCerts.

Requirements:
- local-first architecture
- encrypted local storage
- PIN lock support
- biometric unlock support
- encrypted at rest
- app lock timeout support
- no account required
- no cloud dependency initially

---

# Product Structure

The app allows users to create custom trackers/journals.

Examples:
- Sneezing tracker
- COPD journal
- Medication tracking
- Sleep tracking
- Jogging tracker
- Commute tracker
- Mood tracking
- Pain journal

Each tracker contains structured sections and typed input areas.

---

# Tracker Types

## 1. Quick Events

Examples:
- Sneezes
- Headaches
- Drinks consumed

Behavior:
- tappable event buttons
- quick timestamp capture
- optional notes

---

## 2. Timed Activities

Examples:
- Jogging
- Commute
- Sleep
- Study sessions

Behavior:
- explicit start/end buttons
- duration analytics
- count analytics
- optional notes

The app must NOT infer meaning from labels.

Action types must be explicit.

---

## 3. Structured Journals

Examples:
- COPD tracking
- Symptom journal
- Mood tracking
- Medication tracking

Behavior:
- structured sections
- scales
- selections
- notes
- typed values

---

# Data Model

Maximum structure depth:

Category
  → Section
      → Option

No further nesting.

---

## Category

Category {
  id: string
  name: string

  categoryType:
    | 'quickCount'
    | 'timedActivity'
    | 'journal'

  createdAt: string
  updatedAt: string
}

---

## Section

Section {
  id: string
  categoryId: string

  title: string

  sectionType:
    | 'count'
    | 'duration'
    | 'numericScale'
    | 'orderedScale'
    | 'singleSelect'
    | 'multiSelect'
    | 'text'

  sortOrder: number

  createdAt: string
  updatedAt: string
}

---

## Option

Option {
  id: string
  sectionId: string

  label: string

  value?: string | number

  actionType?:
    | 'count'
    | 'durationStart'
    | 'durationEnd'

  sortOrder: number

  createdAt: string
  updatedAt: string
}

---

## Entry

Entry {
  id: string

  categoryId: string

  occurredAt: string

  notes?: string

  createdAt: string
  updatedAt: string
}

---

## EntryValue

EntryValue {
  id: string

  entryId: string

  sectionId: string

  optionId?: string

  valueText?: string
  valueNumber?: number
  valueBoolean?: boolean

  actionType?:
    | 'count'
    | 'durationStart'
    | 'durationEnd'

  createdAt: string
  updatedAt: string
}

---

# Architecture

Architecture layers:

UI
↓
Feature services
↓
Repositories / secure storage
↓
Analytics/query layer
↓
Visualisation layer

---

# Data Engine

Preferred stack:

SQLite
+ repository pattern
+ encrypted local storage

Use SQLite because:
- analytics queries are important,
- grouping/filtering is required,
- joins are useful,
- and future exports/reporting will benefit.

---

# Analytics Layer

A dedicated analytics layer is required.

Charts/visualisations must NEVER query raw tables directly.

Analytics services should return normalized/chart-ready data.

Examples:

analyticsService.getCountSeries(...)
analyticsService.getDurationStats(...)
analyticsService.getScaleTrend(...)

The analytics layer must understand:
- section types,
- aggregation periods,
- grouping,
- trends,
- and durations.

---

# Shared Foundation Requirements

This project MUST follow:

dev-notes/foundation-standards.md

This includes:
- shared components,
- token usage,
- accessibility,
- modal standards,
- repository patterns,
- and coding standards.

---

# Cinlo Reference Usage

The `.temp/cinlo/` repo should be reviewed for reusable:
- components,
- layout patterns,
- theme usage,
- spacing systems,
- modal handling,
- accessibility patterns,
- and shared primitives.

Reusable components should be promoted into the shared foundation layer where appropriate.

---

# Initial Screens

## 1. App Unlock
- PIN entry
- biometric unlock
- lock timeout support

## 2. Home
- tracker/category list
- add tracker button
- settings button
- analytics shortcut

## 3. Create Tracker
- tracker type selection
- examples
- guided setup

## 4. Tracker Detail
- sections
- buttons/options
- quick capture interactions

## 5. Entry Modal
- timestamp
- notes
- save/cancel

## 6. Journal Entry Screen/Modal
- structured sections
- scales
- selections
- notes

## 7. Analytics Modal/Screen
Initial version:
- tables only
- placeholders for future graphs

## 8. Settings
- security settings
- theme settings
- lock behavior

---

# Non-Negotiable Rules

The following are prohibited:

- local hex colors
- direct SQLite access in screens
- duplicated date logic
- duplicated components
- uncontrolled nesting
- arbitrary schema builders
- feature-specific modal patterns
- missing accessibility support
- analytics querying raw UI state
- graph components querying repositories directly
- inferred behavior from labels/text
- ad hoc storage logic

---

# Long-Term Goal

The long-term objective is to create:
- a reusable structured tracking platform,
- a reusable mobile architecture foundation,
- and a highly maintainable local-first analytics-ready application framework.
