

# Data Capture App — UX Wireframes & Navigation Flows

## Purpose

These wireframes are intentionally low-fidelity.

The goal is to:

- Align product, UX, and engineering
- Give developers a clear layout structure
- Reduce ambiguity during implementation
- Define navigation + interaction patterns early
- Keep the app intuitive and fast to use
- Ensure the architecture supports future analytics + visualization layers

This is not final visual design.

The visual design language will evolve later.

---

# 1. App Philosophy

The app must feel:

- Extremely fast
- Calm and uncluttered
- Mobile-first
- Friendly for repeated daily use
- Effortless for quick capture
- Structured without feeling "spreadsheet-like"

Primary UX goals:

1. Open app fast
2. Capture data in <5 seconds
3. Review trends easily
4. Reduce cognitive load
5. Encourage repeat usage

---

# 2. Primary Navigation Structure

Recommended architecture:

```text
Root Stack
│
├── Auth / Unlock
│
└── Main App
    │
    ├── Home
    ├── Timeline
    ├── Insights
    ├── Categories
    └── Settings
```

Recommended implementation:

- Expo Router
- Bottom tab navigation
- Stack navigation inside each tab
- Modal presentation for quick entry flows

---

# 3. App Structure Overview

## Bottom Navigation

```text
┌─────────────────────────────┐
│ Home  Timeline  +  Insights │
└─────────────────────────────┘
```

Tabs:

| Tab | Purpose |
|---|---|
| Home | Daily dashboard + quick actions |
| Timeline | Historical events/logs |
| + | Fast capture modal |
| Insights | Charts/trends/analytics |
| Settings | Categories/security/export |

---

# 4. Unlock Flow

## Locked State

```text
┌─────────────────────────┐
│                         │
│         Logo            │
│                         │
│   Enter PIN             │
│                         │
│   • • • •               │
│                         │
│  [Face ID]              │
│                         │
└─────────────────────────┘
```

Requirements:

- PIN unlock
- Biometrics
- Auto-lock timeout
- Encryption at rest
- Smooth unlock animations
- No unnecessary friction

---

# 5. Home Screen

## Purpose

The Home screen is the operational center of the app.

It should:

- Show today's status
- Surface quick capture actions
- Show recent activity
- Show reminders/patterns
- Encourage fast interaction

---

## Home Layout

```text
┌─────────────────────────┐
│ Good morning            │
│ Leon                    │
├─────────────────────────┤
│ Today's Summary         │
│                         │
│ Feeling     7/10        │
│ Sleep       6h 45m      │
│ Water       1.2L        │
├─────────────────────────┤
│ Quick Capture           │
│                         │
│ [+ Feeling]             │
│ [+ Medication]          │
│ [+ Exercise]            │
│ [+ Symptom]             │
├─────────────────────────┤
│ Recent Activity         │
│                         │
│ 09:14 Jogging           │
│ 08:22 Medication        │
│ Yesterday Feeling 6     │
└─────────────────────────┘
```

---

# 6. Quick Capture Modal

## Core UX Principle

This is the most important flow in the app.

A user should be able to:

- Open app
- Capture event
- Save

...within seconds.

---

## Capture Modal

```text
┌─────────────────────────┐
│ Add Entry               │
├─────────────────────────┤
│ What are you tracking?  │
│                         │
│ Feeling                 │
│ Medication              │
│ Exercise                │
│ Symptoms                │
│ Sleep                   │
│ Water                   │
│ Custom                  │
└─────────────────────────┘
```

Selecting a type opens the correct input component.

---

# 7. Input Component Types

## A. Numeric Scale

```text
┌─────────────────────────┐
│ Feeling                 │
├─────────────────────────┤
│ How do you feel?        │
│                         │
│ 1 2 3 4 5 6 7 8 9 10    │
│                         │
│ Selected: 7             │
│                         │
│ [Save]                  │
└─────────────────────────┘
```

Used for:

- Mood
- Energy
- Pain
- Focus
- Anxiety
- Motivation

---

## B. Multi Select

```text
┌─────────────────────────┐
│ Medication              │
├─────────────────────────┤
│ Select medication       │
│                         │
│ [Allergy pill]          │
│ [Vitamin D]             │
│ [Painkiller]            │
│                         │
│ [+ Add New]             │
│                         │
│ [Save]                  │
└─────────────────────────┘
```

---

## C. Duration Input

```text
┌─────────────────────────┐
│ Jogging                 │
├─────────────────────────┤
│ Duration                │
│                         │
│ 00 : 45                 │
│                         │
│ [Save]                  │
└─────────────────────────┘
```

---

## D. Event Counter

```text
┌─────────────────────────┐
│ Sneezing                │
├─────────────────────────┤
│ Count                   │
│                         │
│      -   12   +         │
│                         │
│ [Save]                  │
└─────────────────────────┘
```

---

# 8. Timeline Screen

## Purpose

The timeline acts like a chronological journal.

Users should quickly:

- Scan activity
- Understand patterns
- Edit entries
- Filter categories

---

## Timeline Layout

```text
┌─────────────────────────┐
│ Timeline                │
├─────────────────────────┤
│ Today                   │
│                         │
│ 09:14  Jogging 45m      │
│ 08:22  Allergy Pill     │
│ 07:30  Feeling 7/10     │
│                         │
│ Yesterday               │
│                         │
│ 20:15  Water 500ml      │
│ 18:00  Gym              │
└─────────────────────────┘
```

Interaction:

- Tap to edit
- Swipe to delete
- Long press for bulk actions
- Pull to refresh

---

# 9. Insights Screen

## Purpose

This becomes the analytics layer.

Must support:

- Trends
- Correlations
- Patterns
- Heatmaps
- Comparisons
- Time-based filtering

---

## Insights Layout

```text
┌─────────────────────────┐
│ Insights                │
├─────────────────────────┤
│ Feeling Trend           │
│                         │
│     Graph Area          │
│                         │
├─────────────────────────┤
│ Correlations            │
│                         │
│ Sleep ↑ Mood ↑          │
│ Exercise ↑ Energy ↑     │
├─────────────────────────┤
│ Filters                 │
│ 7D 30D 90D 1Y           │
└─────────────────────────┘
```

Important:

The data layer must be designed early to support this.

Do NOT build the capture engine without considering future analytics.

---

# 10. Categories Management

## Purpose

Users must be able to create custom tracking systems.

Examples:

- Mood
- Medication
- Supplements
- Symptoms
- Exercise
- Habits
- Food
- Sleep
- Productivity
- Custom metrics

---

## Categories Screen

```text
┌─────────────────────────┐
│ Categories              │
├─────────────────────────┤
│ Feeling        Scale    │
│ Medication     Select   │
│ Water          Number   │
│ Exercise       Duration │
│                         │
│ [+ New Category]        │
└─────────────────────────┘
```

---

# 11. Create Category Flow

## Step 1 — Name

```text
Category Name
[________________]
```

## Step 2 — Type

```text
Choose Input Type

○ Numeric Scale
○ Multi Select
○ Duration
○ Counter
○ Text
○ Boolean
○ Measurement
```

## Step 3 — Configuration

Examples:

### Scale

```text
Min: 1
Max: 10
```

### Duration

```text
Unit:
○ Minutes
○ Hours
```

### Measurement

```text
Unit: ml
```

---

# 12. Entry Detail Screen

```text
┌─────────────────────────┐
│ Feeling                 │
├─────────────────────────┤
│ Value: 7                │
│                         │
│ Date: Today             │
│ Time: 07:30             │
│                         │
│ Notes                   │
│ _____________________   │
│                         │
│ [Save Changes]          │
└─────────────────────────┘
```

---

# 13. Settings Screen

## Sections

```text
Account
Security
Categories
Notifications
Export
Backup
Appearance
About
```

---

## Security Section

```text
PIN Enabled        ON
Biometrics         ON
Auto-lock          5 mins
Export Protection  ON
```

---

# 14. Export Flow

## Export Modal

```text
┌─────────────────────────┐
│ Export Data             │
├─────────────────────────┤
│ Format                  │
│ ○ CSV                   │
│ ○ JSON                  │
│                         │
│ Date Range              │
│ [Last 30 Days ▼]        │
│                         │
│ [Export]                │
└─────────────────────────┘
```

---

# 15. UX Guidelines

## Navigation

- Bottom tabs only for primary destinations
- Avoid deep nesting
- Avoid hidden gestures for critical flows
- Back navigation must feel predictable

---

## Interaction Design

Prefer:

- Large tap targets
- Single-purpose screens
- Minimal typing
- Smart defaults
- One-thumb operation
- Fast animations

Avoid:

- Dense forms
- Multi-column mobile layouts
- Complex menus
- Excessive confirmations
- Overly technical terminology

---

# 16. Design Language Direction

Target feeling:

- Calm
- Premium
- Modern
- Minimal
- Data-focused
- Trustworthy

Visual references:

- Apple Health
- Linear
- Arc Browser
- Stripe
- Oura
- Headspace

---

# 17. Technical Notes For Developers

## Important

The app architecture must support:

- Flexible schemas
- Dynamic categories
- Offline-first storage
- Encryption at rest
- Fast querying
- Future analytics
- Time-series aggregation
- Data visualization
- CSV/JSON export

---

## Recommended Stack

| Layer | Recommendation |
|---|---|
| Framework | Expo + React Native |
| Navigation | Expo Router |
| State | Zustand |
| Local DB | SQLite |
| Charts | Victory Native or Skia-based charts |
| Forms | React Hook Form |
| Validation | Zod |
| Animations | Reanimated |
| Secure Storage | Expo Secure Store |

---

# 18. Future Enhancements

Potential future additions:

- AI insights
- Correlation engine
- Smart reminders
- Wearable integrations
- Health integrations
- Apple Health / Google Fit sync
- Voice entry
- Widgets
- Home screen quick actions
- Advanced dashboards
- Cloud sync
- Multi-device sync

These should influence architecture decisions now.

---

# 19. MVP Focus

The MVP should focus on:

1. Secure local-first architecture
2. Fast capture flows
3. Dynamic category engine
4. Timeline/history
5. Basic insights
6. Export capability
7. Excellent UX

Do not overcomplicate v1.

The quality of the UX is more important than the quantity of features.