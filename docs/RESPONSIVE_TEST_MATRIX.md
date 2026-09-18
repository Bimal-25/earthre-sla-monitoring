# Responsive Acceptance Matrix

The supplied device catalogue contains phones, foldables, iPads and tablets with widely different **physical** pixel resolutions. Browser layout is therefore validated using representative **CSS viewport sizes**, not raw panel resolution.

## Required viewports

| Viewport | Class | Acceptance focus |
|---:|---|---|
| 320×568 | minimum fallback | no page overflow; one-column cards/forms |
| 360×800 | small Android | upload touch targets; filters stack |
| 375×812 | iPhone class | header wrapping; log record cards |
| 390×844 | modern iPhone | one-column KPI/log records remain readable |
| 412×915 | modern Android | service and log mobile record cards |
| 480×900 | large phone/foldable | balanced two-column KPI/quality layout |
| 540×720 | foldable/large phone | two-column KPIs; readable mobile log cards |
| 768×1024 | tablet portrait | 2×2 KPI grid; service/log responsive cards |
| 820×1180 | iPad portrait | tablet density and stacked header |
| 1023×768 | breakpoint boundary | tablet behavior remains intact |
| 1024×768 | tablet landscape/small laptop | desktop header, four KPIs, desktop tables |
| 1180×820 | large tablet | service/log density |
| 1280×800 | laptop | full dashboard hierarchy |
| 1366×768 | common Windows laptop | viewport-height efficiency |
| 1440×900 | desktop | full operational tables |
| 1920×1080 | large desktop | max-width prevents over-stretching |
| 2560×1440 | wide display | restrained content width and typography |

## Final log behavior

The semantic table markup is preserved for accessibility, while CSS changes presentation by viewport:

```text
>= 1024 CSS px    desktop operational table
<= 1023 CSS px    two-column observation record cards
<= 560 CSS px     one-column observation record cards
```

This avoids presenting a phone user with only the first one or two columns of a very wide table.

## Acceptance checks at every viewport

- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- no clipped controls or off-screen action buttons
- no page-level horizontal scrolling
- mobile/tablet log records show every field without horizontal dragging
- desktop operational tables remain aligned and readable
- no text smaller than the defined readable scale
- date controls remain usable
- upload file selection remains keyboard/touch operable
- focus indicators remain visible
- summary collapse control remains reachable
- long filenames truncate instead of widening the page
- service IDs and request IDs do not break layout
- Previous/Next controls remain reachable at the bottom of the logs section
- mobile bottom spacing keeps final pagination controls clear of the viewport edge

## Verified manual smoke matrix

The final Phase 3 interaction pass confirmed:

- dashboard restoration
- collapse/expand
- single-date filter
- date-range filter
- latest-day shortcut
- entire-upload shortcut
- service filter
- rows-per-page
- Next/Previous cursor navigation
- identical-file re-upload
- invalid-upload recovery
- keyboard navigation
- 414px mobile layout
- 768px tablet layout
- desktop layout
- clean runtime console during normal use
