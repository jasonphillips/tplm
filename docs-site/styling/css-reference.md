# CSS Reference

TPL generates semantic HTML tables with CSS classes that let you fully customize the appearance.

## Quick Start

### Using the Default Stylesheet

TPL provides a default stylesheet you can import:

```typescript
// In your JavaScript/TypeScript
import 'tplm-lang/renderer/tpl-table.css';
```

Or link directly in HTML:

```html
<link rel="stylesheet" href="node_modules/tplm-lang/packages/renderer/tpl-table.css">
```

### Customizing with CSS Variables

The easiest way to customize is by overriding CSS custom properties:

```css
:root {
  --tpl-header-bg: #1e40af;        /* Header background */
  --tpl-header-text: white;         /* Header text color */
  --tpl-total-cell-bg: #fef3c7;    /* Total cell highlight */
}
```

## HTML Structure

TPL generates standard HTML tables:

```html
<table class="tpl-table">
  <thead>
    <tr>
      <th class="tpl-corner">...</th>           <!-- Corner cells -->
      <th>Column Header</th>
      <th class="total-col">Total</th>          <!-- Total column -->
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Row Value</td>                        <!-- Row dimension -->
      <td>123,456</td>                          <!-- Data cell -->
      <td class="total-col">789,012</td>        <!-- Total column cell -->
    </tr>
    <tr class="total-row">                      <!-- Total row -->
      <td>Total</td>
      <td class="total-col">Grand Total</td>    <!-- Grand total -->
    </tr>
  </tbody>
</table>
```

## CSS Classes Reference

### Table Container

| Class | Element | Description |
|-------|---------|-------------|
| `.tpl-table` | `<table>` | Main table container. Customizable via `tableClass` option. |

### Corner Area (Top-Left)

The corner area spans the columns used for row headers. With multi-level column headers, corner cells appear in each header row.

| Class | Element | Description |
|-------|---------|-------------|
| `.tpl-corner` | `<th>` | Empty corner cell. Should have solid background to prevent row striping from showing through. |
| `.tpl-corner-label` | `<th>` | Corner cell containing a dimension label. Appears in the last header row. |

### Column Headers

| Class | Element | Description |
|-------|---------|-------------|
| `.total-col` | `<th>`, `<td>` | Total column (from `ALL` on column axis). Applied to both header and data cells. |
| `.sibling-label` | `<th>` | Concatenation group label (from `\|` operator creating separate sections). |

### Row Headers & Data

| Class | Element | Description |
|-------|---------|-------------|
| `.tpl-row-header` | `<td>` | Row header cell (dimension value on left side). |
| `.tpl-row-dim` | `<td>` | Row dimension value in data area. |
| `.tpl-cell` | `<td>` | Data cell containing an aggregate value. |

### Total Rows

| Class | Element | Description |
|-------|---------|-------------|
| `.total-row` | `<tr>` | Total row (from `ALL` on row axis). |
| `.total-row .total-col` | `<td>` | Grand total cell (intersection of row and column totals). |

## CSS Custom Properties

Override these variables to customize colors:

```css
:root {
  /* Header colors */
  --tpl-header-bg: #e8ecf1;           /* Column header background */
  --tpl-header-text: #374151;         /* Column header text */
  --tpl-header-border: #cbd5e1;       /* Header border color */

  /* Row headers (left side) */
  --tpl-row-header-bg: #f1f5f9;       /* Row header background */
  --tpl-row-header-text: #374151;     /* Row header text */

  /* Data area */
  --tpl-row-alt-bg: rgba(0,0,0,0.015); /* Alternating row stripe */
  --tpl-cell-bg: transparent;          /* Default cell background */

  /* Totals */
  --tpl-total-header-bg: #dbeafe;     /* Total column header */
  --tpl-total-cell-bg: rgba(59,130,246,0.06);   /* Total column cells */
  --tpl-total-row-bg: rgba(34,197,94,0.06);     /* Total row cells */
  --tpl-grand-total-bg: rgba(234,179,8,0.1);    /* Grand total cell */

  /* Corner area */
  --tpl-corner-bg: white;             /* Empty corner background */

  /* Borders */
  --tpl-border-color: #e2e8f0;        /* All borders */
}
```

## Example Customizations

### Minimal Style

```css
.tpl-table {
  --tpl-header-bg: transparent;
  --tpl-row-header-bg: transparent;
  --tpl-row-alt-bg: transparent;
  --tpl-border-color: #ddd;
}

.tpl-table th {
  border-bottom: 2px solid #333;
}
```

### Corporate Blue Theme

```css
.tpl-table {
  --tpl-header-bg: #1e3a5f;
  --tpl-header-text: white;
  --tpl-row-header-bg: #f0f4f8;
  --tpl-total-header-bg: #0d47a1;
  --tpl-total-cell-bg: rgba(13, 71, 161, 0.08);
}
```

### High Contrast

```css
.tpl-table {
  --tpl-header-bg: #000;
  --tpl-header-text: #fff;
  --tpl-row-alt-bg: #f5f5f5;
  --tpl-border-color: #000;
}

.tpl-table th,
.tpl-table td {
  border-width: 2px;
}
```

### Print-Friendly

```css
@media print {
  .tpl-table {
    --tpl-header-bg: white;
    --tpl-header-text: black;
    --tpl-row-alt-bg: transparent;
    --tpl-total-cell-bg: #f0f0f0;
    font-size: 10pt;
  }

  .tpl-table th,
  .tpl-table td {
    border: 1px solid #999;
  }
}
```

## Targeting Specific Elements

### By Position

```css
/* First row header column */
.tpl-table tbody tr td:first-child {
  font-weight: bold;
}

/* Last data column (often the total) */
.tpl-table tbody tr td:last-child {
  border-left: 2px solid #333;
}
```

### By Content Type

```css
/* Total rows - make them stand out */
.tpl-table .total-row {
  border-top: 2px solid #333;
}

/* Grand total - extra emphasis */
.tpl-table .total-row .total-col {
  font-size: 1.1em;
}
```

## Render Options

You can customize the table class when rendering:

```typescript
import { renderGridToHTML } from 'tplm-lang';

const html = renderGridToHTML(grid, {
  tableClass: 'my-custom-table tpl-table',  // Add your own classes
  showDimensionLabels: true,                 // Show labels in corner
});
```

## Full Default Stylesheet

The complete default stylesheet is available at:
- **npm**: `tplm-lang/packages/renderer/tpl-table.css`
- **GitHub**: [packages/renderer/tpl-table.css](https://github.com/jasonphillips/tplm/blob/main/packages/renderer/tpl-table.css)

You can copy this file and modify it for your needs.
