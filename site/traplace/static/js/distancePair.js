// File: app/static/js/distancePair.js
/**
 * Visual distance line for the two selected objects.
 */

import { state } from './state.js';
import { viewport } from './dom.js';

const LINE_ID = 'distancePairLine';
let lastValue = null;

function blockRectInViewport(block) {
  const rect = block.el?.getBoundingClientRect();
  if (!rect) return null;
  return rect;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function closestViewportPoints(rectA, rectB) {
  const centerA = {
    x: rectA.left + rectA.width / 2,
    y: rectA.top + rectA.height / 2,
  };
  const centerB = {
    x: rectB.left + rectB.width / 2,
    y: rectB.top + rectB.height / 2,
  };

  return {
    a: {
      x: clamp(centerB.x, rectA.left, rectA.right),
      y: clamp(centerB.y, rectA.top, rectA.bottom),
    },
    b: {
      x: clamp(centerA.x, rectB.left, rectB.right),
      y: clamp(centerA.y, rectB.top, rectB.bottom),
    },
  };
}

function getLineEl() {
  let line = document.getElementById(LINE_ID);
  if (line) return line;

  line = document.createElement('div');
  line.id = LINE_ID;
  line.className = 'distance-pair-line';

  const label = document.createElement('div');
  label.className = 'distance-pair-label';
  line.appendChild(label);

  document.body.appendChild(line);
  return line;
}

export function clearDistancePairLine() {
  lastValue = null;
  document.getElementById(LINE_ID)?.remove();
}

export function renderDistancePairLine(value = lastValue) {
  const selected = state.distancePairBlocks.filter((b) => state.blocks.includes(b));
  if (selected.length !== 2 || value == null) {
    clearDistancePairLine();
    return;
  }

  lastValue = value;

  const [from, to] = selected;
  const fromRect = blockRectInViewport(from);
  const toRect = blockRectInViewport(to);
  if (!fromRect || !toRect) {
    clearDistancePairLine();
    return;
  }

  const { a, b } = closestViewportPoints(fromRect, toRect);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const line = getLineEl();
  const label = line.querySelector('.distance-pair-label');

  line.style.left = `${a.x}px`;
  line.style.top = `${a.y}px`;
  line.style.width = `${length}px`;
  line.style.transform = `rotate(${angle}rad)`;

  if (label) {
    label.textContent = String(value);
    label.style.left = `${length / 2}px`;
    label.style.transform = `translateX(-50%) rotate(${-angle}rad)`;
  }
}

viewport?.addEventListener('scroll', () => renderDistancePairLine(), { passive: true });
window.addEventListener('resize', () => renderDistancePairLine());
