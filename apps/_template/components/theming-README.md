# Theming and visual identity per app

The platform ships shared primitives (`StatCard`, `EmptyState`, `PageHeader`, `ThemeProvider`, `ThemeToggle`) so apps don't redo the same UI plumbing. But each app should have its own **visual identity** so portfolio readers see distinct products, not 6 cloned demos.

What's shared, what's per-app:

| Shared (don't override per app)            | Per-app (always pick)                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| Component APIs and behaviour               | Brand color (primary)                                       |
| Layout primitives (cards, badges, dialogs) | Logo + lucide icon for header                               |
| Theme variable shape                       | Tagline / wordmark                                          |
| Dark mode toggle                           | Sidebar items + ordering                                    |
| StatCard structure                         | Dashboard composition                                       |
| EmptyState pattern                         | Domain-specific widgets (BookingCalendar, ChatThread, etc.) |

## Pick a brand color

The primary color drives the sidebar accent, primary buttons, focus ring, and Chart-1. Set it in `apps/web/app/globals.css` as an OKLCH value.

Examples for the OGP product set:

| App                        | Color              | OKLCH                  |
| -------------------------- | ------------------ | ---------------------- |
| Armoury (frontline safety) | Safety orange      | `oklch(0.62 0.21 35)`  |
| HAS (health appointments)  | Healthcare teal    | `oklch(0.62 0.14 200)` |
| ScamShield (alerts)        | Alert red          | `oklch(0.58 0.22 25)`  |
| KampungSpirit (community)  | Warm gold          | `oklch(0.72 0.16 80)`  |
| ActiveSG (sports)          | Energetic green    | `oklch(0.65 0.18 145)` |
| Postman (gov comms)        | Trust blue         | `oklch(0.55 0.18 250)` |
| TEALS (traffic)            | Authoritative navy | `oklch(0.45 0.15 250)` |

Pick once per app. Override `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`, `--sidebar-ring`, `--chart-1` in both `:root` and `.dark` blocks.

## Pick a sidebar identity

Each app's sidebar shows a small icon + the app name + a tagline:

```tsx
<div className="flex items-center gap-2 px-2 py-3">
  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
    <Shield className="h-4 w-4" /> {/* Pick a different lucide icon per app */}
  </div>
  <div className="flex flex-col">
    <span className="text-sm font-semibold">Armoury</span> {/* App name */}
    <span className="text-xs text-muted-foreground">Frontline ops</span> {/* Tagline */}
  </div>
</div>
```

Suggested icon per app:

- Armoury → `Shield`
- HAS → `CalendarHeart`
- ScamShield → `ShieldAlert`
- KampungSpirit → `HandHeart`
- ActiveSG → `Trophy` or `Dumbbell`
- Postman → `Send`
- TEALS → `Car`

## Pick a layout shell

Most apps benefit from the sidebar pattern in `AppSidebar.tsx`. Some don't.

| Layout                                             | Use when                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Sidebar** (admin-heavy apps)                     | Many sections, persistent user state, internal tool feel. Armoury, TEALS, ActiveSG admin.   |
| **Top-nav** (citizen-facing wizards)               | Linear flow, mobile-first, marketing-style hero. HAS booking, ScamShield report submission. |
| **Hybrid** (sidebar for admin, top-nav for public) | Apps with both admin and public surfaces. Postman, ActiveSG.                                |

Don't force the sidebar everywhere. The point of the platform is _consistent primitives_, not _identical layouts_.

## Pick dashboard composition

`StatCard` is universal but what cards each app shows is per-app:

| App        | Dashboard cards                                                         |
| ---------- | ----------------------------------------------------------------------- |
| Armoury    | Total submissions, Last 14d, Compliance %, Open issues                  |
| HAS        | Today's appointments, No-show rate, Slot utilisation, Upcoming clinics  |
| ScamShield | Reports/day, Classifier confidence, Resolved/unresolved, Top scam types |
| ActiveSG   | Active bookings, Revenue this month, Programme fill rate, No-show rate  |
| Postman    | Emails sent today, Open rate, Bounce rate, Active campaigns             |

Same `StatCard` primitive, different data, different story.

## What this gets you

Six apps that **feel like a family** (same components, same interactions, same dark mode toggle, same empty states) but **read as distinct products** (different colors, layouts, icons, taglines, dashboard cards). That's the right portfolio signal: "I designed a platform AND distinct products on top of it."
