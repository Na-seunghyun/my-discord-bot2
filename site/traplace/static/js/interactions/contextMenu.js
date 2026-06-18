// File: app/static/js/interactions/contextMenu.js
/**
 * Context menu interaction for blocks.
 * Allows changing font size and word wrap for town and custom blocks.
 */

import { blockByEl, toggleDistancePairBlock } from '../state.js';
import { updateBlockFont } from '../blocks.js';
import { clearDistancePairLine } from '../distancePair.js';

const menu = document.getElementById('contextMenu');
const distanceTargetBtn = document.getElementById('cmDistanceTarget');
const sizeBtns = menu.querySelectorAll('.cm-size-btn');
const fontGroup = menu.querySelector('.cm-group');
const wordWrapItem = document.getElementById('cmWordWrap');
const wordWrapInput = document.getElementById('cmWordWrapInput');

let targetBlockEl = null;
let targetBlock = null;

function selectDistanceTargetFromMenu() {
  const block = targetBlock || (targetBlockEl ? blockByEl.get(targetBlockEl) : null);
  if (!block) return;

  toggleDistancePairBlock(block);
  clearDistancePairLine();
  hideContextMenu();
}

/** Initialize context menu events. */
export function initContextMenu() {
  // Global right-click listener
  document.addEventListener('contextmenu', (e) => {
    const block = e.target.closest('.block');
    if (block) {
      const b = blockByEl.get(block);
      if (b) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, block);
      } else {
        hideContextMenu();
      }
    } else {
      hideContextMenu();
    }
  });

  // Hide on click outside
  document.addEventListener('mousedown', (e) => {
    if (!menu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Font size buttons
  sizeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);
      if (targetBlockEl && size) {
        updateBlockFont(targetBlockEl, { fontSize: size });
        updateActiveBtn(size);
      }
    });
  });

  distanceTargetBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectDistanceTargetFromMenu();
  });

  distanceTargetBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectDistanceTargetFromMenu();
  });

  // Word wrap checkbox
  wordWrapInput.addEventListener('change', () => {
    if (targetBlockEl) {
      updateBlockFont(targetBlockEl, { wordWrap: wordWrapInput.checked });
    }
  });
}

/**
 * Show the context menu at a specific position.
 * @param {number} x
 * @param {number} y
 * @param {HTMLElement} blockEl
 */
function showContextMenu(x, y, blockEl) {
  targetBlockEl = blockEl;
  const b = blockByEl.get(blockEl);
  if (!b) return;
  targetBlock = b;

  const canEditLabelStyle = b.kind === 'city' || b.kind === 'custom';

  fontGroup.style.display = canEditLabelStyle ? '' : 'none';
  wordWrapItem.style.display = canEditLabelStyle ? '' : 'none';

  if (canEditLabelStyle) {
    updateActiveBtn(b.fontSize || 14);
    wordWrapInput.checked = !!b.wordWrap;
  }

  menu.style.display = 'flex';

  // Position the menu
  const menuRect = menu.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = x;
  let top = y;

  if (x + menuRect.width > viewportW) {
    left = viewportW - menuRect.width - 10;
  }
  if (y + menuRect.height > viewportH) {
    top = viewportH - menuRect.height - 10;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/** Hide the context menu. */
function hideContextMenu() {
  menu.style.display = 'none';
  targetBlockEl = null;
  targetBlock = null;
}

/**
 * Update the active visual state of font size buttons.
 * @param {number} activeSize
 */
function updateActiveBtn(activeSize) {
  sizeBtns.forEach((btn) => {
    const s = parseInt(btn.dataset.size, 10);
    if (s === activeSize) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
