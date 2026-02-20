# Niyam Retail UI/UX Guidelines

## Core Principles

### 1. Progressive Disclosure
*   **Overview First**: Show high-level metrics and lists initially.
*   **Drill Down**: Allow users to click row items to reveal detailed forms or histories.
*   **Avoid Clutter**: Hide advanced settings behind "Advanced" toggles or separate tabs.

### 2. Contextual Assistance
*   **Inline Help**: Use tooltips (?) for complex fields like "Tax Class" or "SKU Formula".
*   **Empty States**: When a list is empty, provide a call-to-action (e.g., "No customers found. Create one?").
*   **Video Tutorials**: Embed short 30s clips for complex workflows (e.g., "How to split a payment").

### 3. Efficiency & Speed
*   **Keyboard First**: Support hotkeys for common POS actions (F1 = Cash, F5 = Search).
*   **Bulk Operations**: Allow selecting multiple rows for "Batch Archive" or "Print Labels".
*   **Instant Search**: Global search bar (CMD+K) should find products, orders, or customers instantly.

### 4. Visual Feedback
*   **Save States**: Show "Saving..." -> "Saved" indicators; don't block the UI.
*   **Error Recovery**: Highlight specific invalid fields with clear instructions on how to fix.
*   **Undo/Redo**: Provide a "Toast" notification with an Undo button for destructive actions (Archive/Delete).

### 5. Accessibility & Inclusivity
*   **Contrast**: Ensure text meets WCAG AA standards.
*   **Screen Readers**: All form inputs must have labels; icons must have `aria-label`.
*   **Touch Targets**: Buttons must be at least 44x44px for tablet usage.
*   **Dark Mode**: System should auto-detect OS preference or allow manual toggle.

## Component Standards

### Forms
*   **Labels**: Top-aligned for mobile responsiveness.
*   **Validation**: Real-time validation (don't wait for submit).
*   **Defaults**: Pre-fill smart defaults (e.g., "Today" for date, "Cash" for tender).

### Data Tables
*   **Sticky Headers**: Keep column names visible while scrolling.
*   **Pagination**: Use "Load More" for infinite feel or standard pagination for reporting.
*   **Filtering**: Faceted search on the left or filter chips on top.

### Dashboards
*   **Key Metrics**: Top row "Scorecards" (Total Sales, Open Orders).
*   **Charts**: Interactive tooltips on hover; drill-down on click.
*   **Refresh**: Auto-refresh data every 60s or provide a manual refresh button.

## Mobile Specifics (Store Ops App)
*   **Thumb Zone**: Place primary actions (Scan, Confirm) in the bottom 30% of the screen.
*   **Haptics**: Use vibration feedback for successful scans or errors.
*   **Offline Mode**: Clearly indicate when data is unsynced; queue changes locally.
