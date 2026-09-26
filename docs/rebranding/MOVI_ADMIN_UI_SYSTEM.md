# MOVI Admin UI system

## Scope

This system applies only below `/admin`. It unifies the existing Admin interface without changing routes, authorization, data contracts, workflows, APIs, database objects or public pages. The redesigned Admin Dashboard remains the visual reference and retains its dedicated layout.

## Shell and hierarchy

`src/app/admin/layout.tsx` owns the persistent theme-aware shell and sticky top bar. The Dashboard link is the sole hierarchy-level return control. Internal pages should start with a clear page title, an optional short operational subtitle and the page actions; redundant parent breadcrumbs or back arrows are not part of the system.

The content column is capped at 72rem, uses 16px desktop side padding and 12px on narrow screens, and leaves enough space below the last control. Headings use high contrast and compact tracking. Supporting copy uses `--admin-muted` and should remain short.

## Tokens

The scoped variables live in `src/app/admin/admin-ui.css`:

- canvas: `--admin-bg` and `--admin-canvas`;
- elevated surfaces: `--admin-surface`, `--admin-surface-2` and `--admin-surface-3`;
- borders: `--admin-border` and `--admin-border-strong`;
- text: `--admin-text`, `--admin-muted` and `--admin-subtle`;
- fields: `--admin-input-bg`, `--admin-input-border` and `--admin-placeholder`;
- semantic states: danger, warning, success and info background/border/text triplets;
- contextual accent: `--admin-accent`, `--admin-accent-strong`, `--admin-accent-soft`, `--admin-accent-border`, `--admin-accent-text` and `--admin-accent-rgb`.

The values are deliberately scoped below `.admin-ui`, so public and customer pages keep their existing visual language.

## Macro-area accents

`AdminAreaScope` derives the macro-area from the current pathname and sets `data-admin-area`:

| Area | Routes | Accent |
| --- | --- | --- |
| Daily operations | requests, players, communications | cyan |
| Competitions | tournaments, circuits, Monday League | blue/purple |
| Community and content | Padelleria, partners | plum |
| Loyalty and commerce | MoviBack, Store, Store orders/economics | gold |
| Control and administration | staff users, identity/access checks | neutral slate |

The accent is for focus, selected filters and primary emphasis. It does not encode business status. Success, warning and error states keep green, amber and red semantics.

## Theme architecture

The Admin supports the exact preferences `light`, `dark` and `system`. `AdminAreaScope` is the theme boundary; it exposes `data-admin-theme-mode` for the preference and `data-admin-theme` for the resolved light/dark result. All theme selectors are scoped below `.admin-ui`, so the public and customer application cannot inherit Admin colors.

The default is `system`. The preference is stored in local storage under the versioned key `movi-admin-theme-v1`. Missing, unavailable or invalid values resolve to `system`; no profile field or database object is involved.

The small bootstrap script at the start of the Admin layout reads and resolves the preference before the Admin shell is painted. It changes only the Admin wrapper and uses hydration suppression on that boundary, avoiding both a wrong-theme flash and a React mismatch. `AdminThemeSelector` then owns the interactive state.

When the preference is `system`, a `prefers-color-scheme` listener updates the resolved theme live. Manual `light` and `dark` choices ignore OS changes. Leaving the Admin is safe because all tokens and selectors remain under `.admin-ui`.

## Light and dark tokens

Light mode uses an off-white canvas, white primary surfaces, cool-gray secondary surfaces, dark navy text, visible gray borders and modest shadows. Fields remain white with dark text and placeholders that retain sufficient contrast. The macro accents use darker variants for text and actions.

Dark mode keeps the deep navy canvas and translucent slate surfaces. Muted copy, placeholders and nested borders are brighter than the original implementation, while selected states retain restrained accent fills. Neither theme uses the macro accent as a full-page background.

The top-bar selector exposes three labeled toggle buttons: Chiaro, Scuro and Sistema. Each has an icon, tooltip, accessible label and `aria-pressed` state. Labels collapse on narrow screens while the accessible names remain intact.

## Contrast and readability rules

Light mode is a complete visual mode, not a light shell around dark workflow panels. Page backgrounds use the off-white canvas, primary panels use `--admin-surface`, nested neutral blocks use `--admin-surface-2`, and all legacy dark gradients must be converted at the scoped specialist-page boundary. Primary copy uses `--admin-text`; explanatory copy, labels, table headings and empty states use `--admin-muted`. `--admin-subtle` is reserved for tertiary metadata and disabled controls, never essential instructions.

Dark mode keeps the existing navy hierarchy while replacing source-level light-theme navy text with `--admin-text`. KPI values, status values, table content and modal titles must inherit the active text token. Muted text must remain brighter than decorative borders, and a nested panel must remain distinguishable from both its parent and the page canvas.

Practical contrast checks apply to normal, hover, focus, selected and disabled states. Selected tabs need a visible surface and border as well as text; badges always include a readable label; warnings use the semantic warning triplet; and focus uses the shared three-pixel halo. Disabled controls may reduce emphasis but their label must remain legible.

Forbidden combinations include white or translucent-white text on a white panel, navy text on a navy panel, pale accent text on an off-white canvas, low-opacity placeholder text that disappears in a field, and translucent dark cards retained inside Light mode. Hard-coded legacy colors should be mapped through the shared compatibility layer or replaced with semantic tokens instead of duplicated page-specific palettes.

## Reusable primitives

`src/components/admin/AdminPrimitives.tsx` provides:

- `AdminPageHeader` for title, subtitle and actions;
- `AdminPanel` for the standard bordered surface;
- `AdminBadge` for compact neutral or semantic metadata;
- `AdminNotice` for informational and semantic feedback;
- `AdminEmptyState` for zero-result views.

Existing complex screens can adopt these gradually. The compatibility rules in `admin-ui.css`, plus the shared Padelleria and Customer Hub CSS modules, align older screens without changing their component or data flow.

## Controls and states

Primary actions use the current area accent and its theme-aware `--admin-on-accent` text. Secondary actions use the secondary surface and a visible border. Destructive actions remain red and should require the workflow's existing confirmation. Disabled controls lower contrast without becoming illegible and use a blocked cursor.

Inputs, selects and textareas use the active theme's field surface, strong border and a four-pixel accent focus halo. Labels remain visible; placeholders are supporting hints only. Filter groups wrap on desktop and remain touch-sized on mobile. Selected filters use an accent-tinted surface and must also expose state through `aria-pressed` or `aria-selected`.

Tables use the primary surface, muted uppercase headers and subtle row separators. At narrow widths, existing responsive card/list transformations are preserved. Do not force large operational tables into a compressed fixed-width grid.

Badges communicate metadata and workflow state through text plus color. Alerts use `role="alert"` for failures that require attention; loading and passive updates use status semantics. Empty states are bordered, concise and do not invent actions.

## Accessibility and responsive rules

All interactive elements receive a three-pixel focus-visible halo derived from the current area. Text, placeholders, disabled states and primary controls target WCAG AA-style contrast in both themes. Controls keep a practical minimum touch height, and mobile fields remain 16px to avoid browser zoom. At 390px the theme labels collapse to three icons, the reward and logout actions remain accessible icons, action groups wrap, and page padding reduces without horizontal overflow. Reduced-motion preferences suppress decorative motion.

## Specialist screens

Tournament run/registration, circuit detail, Monday League operations, MoviBack fulfillment, Store product/economics/order tools, communications, duplicate resolution and player detail retain their workflow-specific layouts. The shared shell, tokens, focus treatment and area accent provide consistency around them. Future work should replace local surfaces with primitives only when it can preserve every state, confirmation, table column and operator action.

Legacy specialist roots use `admin-specialist-page` together with their domain class. The compatibility layer recognizes both compact and browser-normalized inline `rgba()` serialization, converts neutral dark surfaces in Light mode, and keeps competition or loyalty accents intact. Monday League additionally uses `admin-monday-page` so its originally light-native panels and values remain readable in Dark mode. Customer Hub keeps its compact CSS-module layout with explicit Light variants for headers, badges, matching facts and contextual blocks.

## Contribution checklist

1. Keep the page under the Admin layout and select the correct macro route mapping.
2. Start with `AdminPageHeader`; use the primitives before adding another local card or notice style.
3. Use semantic status tones independently of the macro accent.
4. Verify keyboard focus, loading, empty, error, success and disabled states.
5. Verify desktop and 390px layouts without horizontal overflow.
6. Do not add local hierarchy back arrows; the fixed Dashboard control provides the return path.
7. Use semantic tokens instead of new fixed light/dark colors, and verify both manual themes plus System mode.
