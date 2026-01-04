# Cell Data Attributes

TPL tables include rich metadata on each data cell via HTML attributes. These enable tooltips, programmatic cell selection, and interactive features.

## Quick Overview

Every data cell in a TPL table includes two attributes:

```html
<td title="Education: HS, Gender: Female → Income Sum"
    data-cell="education=HS|gender=Female">
  45,678
</td>
```

| Attribute | Purpose | Format |
|-----------|---------|--------|
| `title` | Human-readable tooltip | `Dimension: Value, ... → Aggregate` |
| `data-cell` | Machine-readable path | `dimension=value\|dimension=value\|...` |

## The `title` Attribute

The `title` attribute provides a human-readable description shown as a native browser tooltip on hover. It includes:

1. **Row dimensions** - Listed first with their values
2. **Column dimensions** - Listed after row dimensions
3. **Aggregate name** - Shown after an arrow (→)

### Format

```
Row Dimension: Value, Row Dimension: Value, Col Dimension: Value → Aggregate Label
```

### Examples

| Query | Cell | Title |
|-------|------|-------|
| `ROWS state COLS year * n` | California, 2020 | `State: California, Year: 2020 → Count` |
| `ROWS occupation * gender COLS education * income.sum` | Sales, Female, College | `Occupation: Sales, Gender: Female, Education: College → Income Sum` |

### Dimension Name Formatting

Dimension names are automatically formatted for readability:
- `snake_case` → `Snake Case`
- `camelCase` → `Camel Case`
- Underscores become spaces
- First letter capitalized

## The `data-cell` Attribute

The `data-cell` attribute provides a machine-readable identifier for each cell. It's used for:

- Programmatic cell selection (JavaScript)
- Test automation
- Data extraction
- Interactive features

### Format

```
dimension1=value1|dimension2=value2|dimension3=value3
```

- Dimensions are **sorted alphabetically** by name
- Values are pipe-separated (`|`)
- Special characters are HTML-escaped

### Examples

| Dimensions | data-cell Value |
|------------|-----------------|
| state=CA, year=2020 | `state=CA\|year=2020` |
| education=HS, gender=Female, occupation=Sales | `education=HS\|gender=Female\|occupation=Sales` |

## Using Data Attributes in JavaScript

### Finding Cells by Path

```javascript
// Find a specific cell
const cell = document.querySelector('[data-cell="state=CA|year=2020"]');

// Get cell value
const value = cell?.textContent;

// Get human-readable description
const description = cell?.getAttribute('title');
```

### Finding All Cells Matching a Dimension

```javascript
// All cells for California
const caCells = document.querySelectorAll('[data-cell*="state=CA"]');

// All cells for 2020
const cells2020 = document.querySelectorAll('[data-cell*="year=2020"]');
```

### Parsing the Cell Path

```javascript
function parseCellPath(dataCell) {
  const parts = dataCell.split('|');
  const dimensions = new Map();

  for (const part of parts) {
    const [dim, value] = part.split('=');
    dimensions.set(dim, value);
  }

  return dimensions;
}

// Usage
const cell = document.querySelector('[data-cell]');
const dims = parseCellPath(cell.dataset.cell);
console.log(dims.get('state'));  // "CA"
console.log(dims.get('year'));   // "2020"
```

## Interactive Popover Example

The native browser tooltip is basic. Here's how to create a richer popover:

```javascript
// Add this to your page after TPL tables render
function initCellPopovers() {
  const popover = document.createElement('div');
  popover.className = 'tpl-cell-popover';
  popover.style.cssText = `
    position: fixed;
    background: #1f2937;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 1000;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(popover);

  document.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('[data-cell]');
    if (!cell) {
      popover.style.opacity = '0';
      return;
    }

    const title = cell.getAttribute('title');
    if (title) {
      popover.innerHTML = formatPopoverContent(title);
      popover.style.opacity = '1';

      const rect = cell.getBoundingClientRect();
      popover.style.left = `${rect.left}px`;
      popover.style.top = `${rect.bottom + 8}px`;
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (!e.target.closest('[data-cell]')) return;
    popover.style.opacity = '0';
  });
}

function formatPopoverContent(title) {
  // Parse "Dim: Val, Dim: Val → Aggregate"
  const [dims, agg] = title.split(' → ');
  const pairs = dims.split(', ');

  let html = '<div style="display:grid;gap:4px;">';
  for (const pair of pairs) {
    const [dim, val] = pair.split(': ');
    html += `<div><span style="color:#9ca3af">${dim}:</span> <strong>${val}</strong></div>`;
  }
  if (agg) {
    html += `<div style="border-top:1px solid #374151;margin-top:4px;padding-top:4px;color:#60a5fa">${agg}</div>`;
  }
  html += '</div>';
  return html;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initCellPopovers);
```

## CSS for Custom Tooltips

If you want to disable native tooltips and use custom ones:

```css
/* Hide native tooltips on cells */
.tpl-table [data-cell] {
  /* Remove title from DOM access but keep the data */
}

/* Or use CSS-only tooltips */
.tpl-table [data-cell]:hover::after {
  content: attr(title);
  position: absolute;
  background: #1f2937;
  color: white;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 100;
  transform: translateY(100%);
  margin-top: 4px;
}
```

## Test Utilities

TPL includes helper functions for testing. These parse data attributes to find cells programmatically:

```typescript
import { parseCellPath, findCell, findAllCells } from 'tplm-lang/renderer/test-utils';

// Parse a data-cell attribute
const dims = parseCellPath('state=CA|year=2020');
// Map { 'state' => 'CA', 'year' => '2020' }

// Find a cell in HTML string
const cell = findCell(html, { state: 'CA', year: '2020' });
// Returns: { value: '1,234', path: 'state=CA|year=2020', title: '...' }

// Find all matching cells
const cells = findAllCells(html, { state: 'CA' });
// Returns array of all California cells
```

## Summary

| Feature | Attribute | Use Case |
|---------|-----------|----------|
| Human tooltip | `title` | Quick visual inspection |
| Machine path | `data-cell` | JavaScript selection, testing |
| Value lookup | `textContent` | Reading cell values |

Both attributes are automatically generated - no configuration needed. They work with all TPL features including totals, nested dimensions, and multiple aggregates.
