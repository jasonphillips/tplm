/**
 * Cell Popover
 *
 * Creates a nicer popover for TPL table cells that shows dimension
 * information from the data-cell and title attributes.
 */

let popover: HTMLDivElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize the cell popover system.
 * Uses event delegation so it works with dynamically rendered tables.
 */
export function initCellPopover(): void {
  // Only run in browser
  if (typeof document === 'undefined') return;

  // Create popover element if it doesn't exist
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'tpl-cell-popover';
    document.body.appendChild(popover);
  }

  // Use event delegation on the document
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
}

function handleMouseOver(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const cell = target.closest('[data-cell]') as HTMLElement | null;

  if (!cell || !popover) return;

  // Clear any pending hide
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // Get the title attribute (contains dimension info)
  const title = cell.getAttribute('title');
  if (!title) return;

  // Parse and format the content
  const content = formatPopoverContent(title);
  popover.innerHTML = content;

  // Position the popover
  const rect = cell.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();

  // Default: below the cell
  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2;

  // Adjust if it would go off screen
  if (top + popoverRect.height > window.innerHeight) {
    top = rect.top - popoverRect.height - 8;
  }

  // Center horizontally but keep on screen
  left = Math.max(10, Math.min(left, window.innerWidth - popoverRect.width / 2 - 10));

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.transform = 'translateX(-50%)';
  popover.classList.add('visible');

  // Temporarily remove title to prevent native tooltip
  cell.dataset.originalTitle = title;
  cell.removeAttribute('title');
}

function handleMouseOut(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const cell = target.closest('[data-cell]') as HTMLElement | null;

  if (!cell || !popover) return;

  // Restore the title attribute
  if (cell.dataset.originalTitle) {
    cell.setAttribute('title', cell.dataset.originalTitle);
    delete cell.dataset.originalTitle;
  }

  // Delay hiding to allow moving to adjacent cells smoothly
  hideTimeout = setTimeout(() => {
    popover?.classList.remove('visible');
  }, 100);
}

function formatPopoverContent(title: string): string {
  // Parse "Dim: Val, Dim: Val -> Aggregate" or "Dim: Val, Dim: Val"
  // The arrow might be -> or unicode arrow
  const arrowMatch = title.match(/\s*(?:->|→)\s*/);
  let dimsStr = title;
  let aggregate = '';

  if (arrowMatch) {
    const parts = title.split(arrowMatch[0]);
    dimsStr = parts[0];
    aggregate = parts[1] || '';
  }

  // Parse dimension pairs
  const pairs = dimsStr.split(/,\s*/);

  let html = '<div class="popover-dimensions">';

  for (const pair of pairs) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) continue;

    const dim = pair.substring(0, colonIndex).trim();
    const val = pair.substring(colonIndex + 1).trim();

    html += `
      <div class="popover-dim">
        <span class="dim-name">${escapeHtml(dim)}</span>
        <span class="dim-value">${escapeHtml(val)}</span>
      </div>
    `;
  }

  html += '</div>';

  if (aggregate) {
    html += `<div class="popover-aggregate">${escapeHtml(aggregate)}</div>`;
  }

  return html;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Cleanup the popover system (for HMR)
 */
export function destroyCellPopover(): void {
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);

  if (popover && popover.parentNode) {
    popover.parentNode.removeChild(popover);
    popover = null;
  }

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}
