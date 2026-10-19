---
name: Obsidian Amber
colors:
  surface: '#0d131f'
  surface-dim: '#0d131f'
  surface-bright: '#333946'
  surface-container-lowest: '#080e1a'
  surface-container-low: '#161c28'
  surface-container: '#1a202c'
  surface-container-high: '#242a37'
  surface-container-highest: '#2f3542'
  on-surface: '#dde2f3'
  on-surface-variant: '#d8c3ad'
  inverse-surface: '#dde2f3'
  inverse-on-surface: '#2a303d'
  outline: '#a08e7a'
  outline-variant: '#534434'
  surface-tint: '#ffb95f'
  primary: '#ffc174'
  on-primary: '#472a00'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#855300'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffbcb7'
  on-tertiary: '#68000a'
  tertiary-container: '#ff938c'
  on-tertiary-container: '#8d0012'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#0d131f'
  on-background: '#dde2f3'
  surface-variant: '#2f3542'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  data-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.5rem
  gutter-desktop: 0.75rem
  margin: 0.75rem
  margin-desktop: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes a high-performance, dark-mode terminal environment tailored for professional cryptocurrency traders, institutional fintech platforms, and VIP wealth managers. It projects precision, uncompromised stability, and understated luxury through a fusion of dense utilitarian architecture and refined metallic accents.

### Design Principles
- **Utilitarian Density:** Space is treated as a premium asset. Layouts prioritize rapid visual parsing, minimal cursor travel, and high information throughput without visual claustrophobia.
- **Architectural Discipline:** Built on a sharp, monolithic grid with restrained radiuses. Decorative embellishments are rejected in favor of functional micro-borders and subtle surface shifts.
- **Controlled Luminescence:** Deep obsidian backdrops recede into the canvas, allowing amber VIP highlights, emerald bull signals, and crimson bear metrics to function as precise operational alerts rather than ambient noise.

## Colors

The palette leverages a deep obsidian substrate layered with slate mid-tones to maximize contrast for dynamic financial telemetry. Amber acts as the primary signature accent for high-value actions, VIP loyalty tiering, and active trading triggers.

### Surface Hierarchy
- **Canvas Base (`#0B0E14`):** The foundational viewport floor for master layouts, global navigation frames, and gutter regions.
- **Surface Layer 1 (`#121824`):** Primary panel containers, market depth lists, order books, and analytic chart surfaces.
- **Surface Layer 2 (`#1A2234`):** Interactive inputs, nested cards, table headers, and modal overlays.
- **Surface Active / Border Subdued (`#263248`):** Micro-dividers, structural boundaries, and hover states on secondary widgets.

### Semantic & Market Status Colors
- **Primary / VIP Gold (`#F59E0B`):** Execution buttons, selected tabs, leverage sliders, badge iconography, and tier thresholds. Hover state scales to `#FBBF24`; active pressed state scales to `#D97706`.
- **Bullish / Profit Green (`#10B981`):** Upward price deltas, bid orders, long positions, and positive yield displays.
- **Bearish / Loss Red (`#EF4444`):** Downward price movements, ask orders, short positions, liquidation levels, and critical warnings.
- **Text Primary (`#F8FAFC`):** Essential numerical data, active ticker values, and key labels.
- **Text Secondary (`#94A3B8`):** Table headers, secondary metrics, timestamp markers, and inactive navigational nodes.
- **Text Muted (`#475569`):** Disabled states, order book depth gradients, and background watermark identifiers.

## Typography

Inter serves as the unified typographical engine across displays, copy, and tabular datasets. Its clean geometric build and large x-height ensure total clarity in high-density data visualizations.

### Tabular Formatting Directive
All financial listings, price ladders, market tickers, and balances must be styled with CSS open-type features enabled: `font-feature-settings: "tnum" 1, "cv05" 1, "zero" 1`. This forces proportional numbers to align into fixed-width tabular figures, preventing layout jitter during rapid real-time websocket updates.

### Scaling and Structural Usage
- **Display Figures (`headline-xl`):** Reserved for primary portfolio values, major index banners, and tier status cards.
- **Sub-headers & Terminal Titles (`headline-sm`, `headline-md`):** Used on modular terminal panels (Order Book, Depth Chart, Trade History).
- **Tabular Data (`data-mono`):** Utilized exclusively for rapid execution feeds, bid/ask ladders, order books, and leverage multiples.
- **Labels (`label-sm`, `label-md`):** Uppercase application with tracking `+0.04em` applied to table columns, contract specifications, and risk notices.

## Layout & Spacing

The interface employs a dense, multi-pane fluid grid architecture configured for complex workstation displays while collapsing efficiently into stacked modular cards for responsive touchscreens.

### Desktop Modular Architecture
The core desktop layout behaves as a zero-waste workspace. Gutters are constrained to `0.5rem` (`8px`) or `0.75rem` (`12px`) between trading terminals. Panels maximize canvas utility using CSS grid configurations:
- **Left Column (20% - 24% width):** Instrument selectors, watchlists, and live trade history.
- **Center Canvas (Fluid, min 50% width):** Candlestick charting workspace, market telemetry bars, and open position managers.
- **Right Column (24% - 28% width):** Order book depth, limit/market execution modules, and VIP balance summaries.

### Breakpoint Matrix
- **Desktop Pro (`>= 1440px`):** Full 3-column customizable workspace with persistent high-density panels.
- **Desktop Standard (`1024px - 1439px`):** 2-column layout; Order history transitions to collapsed lower trays.
- **Tablet (`768px - 1023px`):** Order book and execution slip dock into horizontal split views; market charts enter tabbed modes.
- **Mobile (`< 768px`):** Single-column stacked stream. Trading execution transitions into a sticky bottom trade panel with drawer overlays. Margin shrinks to `0.75rem`.

## Elevation & Depth

This system avoids floating cloud shadows, replacing them with sharp, low-contrast structural outlines and tonal surface layering. This keeps the interface crisp and prevents glow bleed on OLED displays.

### Layering Rules
- **Level 0 (Floor `#0B0E14`):** Canvas backdrop, terminal gutters, global system tray.
- **Level 1 (Panels `#121824`):** Trading modules, order book blocks, table wrappers. Delineated by a `1px` continuous border of `rgba(255, 255, 255, 0.07)`.
- **Level 2 (In-Panel Surfaces `#1A2234`):** Form controls, dropdown selectors, filter chips, table rows on hover. Border: `1px solid rgba(255, 255, 255, 0.12)`.
- **Level 3 (Overlays & Dialogs `#1A2234`):** Contextual popovers, confirmation modals, leverage sliders. Dropshadow is razor-thin: `0 4px 20px rgba(0, 0, 0, 0.75)`, paired with a perimeter highlight of `1px solid rgba(245, 158, 11, 0.25)` for active trading confirmations.

## Shapes

The design system operates at roundedness level `1` (Soft, 4px foundational radius). This preserves a precise, institutional feel suited for financial tables and terminal toolbars.

### Corner Radii Guidelines
- **Core Structural Units (Inputs, Buttons, Tabs, Dropdowns):** `4px` (`0.25rem`). Maintains visual firmness and keeps click-targets clearly defined.
- **Panels & Terminal Windows:** `4px` (`0.25rem`) to `8px` (`0.5rem`). Outer borders stay crisp without roundness bleeding into content corners.
- **Badges, Status Dots, and VIP Pills:** Specialized application of full pills (`9999px`) is allowed strictly on VIP tags, micro status chips, and tag counters to distinguish them from actionable buttons.

## Components

### Buttons
- **Primary / VIP Action:** Background `#F59E0B`, text `#0B0E14`, font weight 600, border-radius `4px`. Hover state: `#FBBF24`. Focused state: 2px offset outline `#F59E0B`. Used for "Deposit", "Buy / Long", and primary conversions.
- **Bullish Action:** Background `#10B981`, text `#FFFFFF`, border-radius `4px`. Dedicated to long/buy order execution.
- **Bearish Action:** Background `#EF4444`, text `#FFFFFF`, border-radius `4px`. Dedicated to short/sell order execution.
- **Secondary / Ghost:** Background `rgba(255, 255, 255, 0.04)`, border `1px solid rgba(255, 255, 255, 0.1)`, text `#F8FAFC`. Hover: `rgba(255, 255, 255, 0.08)`.

### Input Fields
- Built on Surface Level 2 (`#1A2234`) with a default border `1px solid rgba(255, 255, 255, 0.1)`. Height: `36px` for dense data entry; `42px` for primary swap forms.
- Right-aligned tabular numeric inputs with integrated token tickers (e.g., `USDT`, `BTC`) fixed on the right margin in `#94A3B8`.
- Focus state triggers an immediate crisp transition to `1px solid #F59E0B` without blurred glow envelopes.

### Data Tables & Order Books
- **Header:** Height `28px`, background `#0B0E14`, font: `label-sm` in `#94A3B8`, text uppercase.
- **Rows:** Alternating subtle hover state `#1A2234`. Padding: `4px 8px`. Height: `24px` for high-density order depth; `36px` for standard transaction logs.
- **Depth Visualizer Bars:** Horizontal bar indicators behind numeric cells use `rgba(16, 185, 129, 0.12)` for buy pressure and `rgba(239, 68, 68, 0.12)` for sell walls.

### Cards & VIP Reward Panels
- **Standard Card:** Background `#121824`, border `1px solid rgba(255, 255, 255, 0.07)`, padding `space-md` or `space-lg`.
- **VIP Tier Card:** Gradient background derived from `linear-gradient(135deg, #1A2234 0%, #121824 100%)` with a `1px` border gradient from `#F59E0B` (30% opacity) down to `#263248` (10% opacity). Includes an amber status badge and gold micro-accents for fee discounts and volume tiers.

### Chips & Badges
- **Trading Indicators:** Background `rgba(16, 185, 129, 0.12)`, text `#10B981` for positive percentage changes; `rgba(239, 68, 68, 0.12)`, text `#EF4444` for negative delta. Padding: `2px 6px`, border-radius `4px`.
- **VIP Status Badges:** Background `rgba(245, 158, 11, 0.15)`, text `#F59E0B`, border `1px solid rgba(245, 158, 11, 0.3)`. Text weight 600, border-radius `9999px`.

### Checkboxes & Segmented Controls
- **Segmented Timeframe Switches (1m, 15m, 1H, 1D):** Enclosed inside a `#0B0E14` track. Active item is surfaced on `#1A2234` with text `#F8FAFC` and radius `4px`.
- **Checkboxes:** Base `14px x 14px`, border `1px solid rgba(255, 255, 255, 0.2)`, background `#121824`. Selected state: Solid fill `#F59E0B` with dark `#0B0E14` check icon.