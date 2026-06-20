// File: app/static/js/interactions/minimap.js
/**
 * Floating minimap for fast viewport navigation.
 */

import { state } from '../state.js';
import { viewport } from '../dom.js';
import { t } from '../i18n.js?v=legend-nash-5';

const WIDTH = 196;
const HEIGHT = 138;

let wrap = null;
let canvas = null;
let ctx = null;
let viewBox = null;
let dragging = false;
let raf = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function ensureMinimap() {
  if (wrap) return;

  wrap = document.createElement('div');
  wrap.id = 'minimap';
  wrap.className = 'minimap';
  wrap.setAttribute('aria-label', t('ui.minimap'));

  canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.className = 'minimap-canvas';
  wrap.appendChild(canvas);

  viewBox = document.createElement('div');
  viewBox.className = 'minimap-viewbox';
  viewBox.setAttribute('aria-hidden', 'true');
  wrap.appendChild(viewBox);

  const caption = document.createElement('div');
  caption.className = 'minimap-caption';
  caption.textContent = t('ui.minimap');
  wrap.appendChild(caption);

  document.body.appendChild(wrap);
  ctx = canvas.getContext('2d');

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function metrics() {
  const scrollW = Math.max(1, viewport.scrollWidth);
  const scrollH = Math.max(1, viewport.scrollHeight);
  const scale = Math.min(WIDTH / scrollW, HEIGHT / scrollH);
  const mapW = scrollW * scale;
  const mapH = scrollH * scale;
  const offX = (WIDTH - mapW) / 2;
  const offY = (HEIGHT - mapH) / 2;
  return { scrollW, scrollH, scale, mapW, mapH, offX, offY };
}

function draw() {
  if (!ctx) return;
  const m = metrics();

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#19110d';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#f5ecd8';
  ctx.globalAlpha = 1;
  ctx.fillRect(m.offX, m.offY, m.mapW, m.mapH);
  ctx.globalAlpha = 1;

  drawMapTexture(m);
  drawBlocks(m);

  ctx.strokeStyle = 'rgba(74, 48, 38, 0.48)';
  ctx.lineWidth = 1;
  ctx.strokeRect(m.offX + 0.5, m.offY + 0.5, Math.max(0, m.mapW - 1), Math.max(0, m.mapH - 1));

  const w = Math.min(m.mapW, Math.max(54, viewport.clientWidth * m.scale));
  const h = Math.min(m.mapH, Math.max(54, viewport.clientHeight * m.scale));
  const centerX = m.offX + (viewport.scrollLeft + viewport.clientWidth / 2) * m.scale;
  const centerY = m.offY + (viewport.scrollTop + viewport.clientHeight / 2) * m.scale;
  const maxX = Math.max(m.offX, m.offX + m.mapW - w);
  const maxY = Math.max(m.offY, m.offY + m.mapH - h);
  const x = clamp(centerX - w / 2, m.offX, maxX);
  const y = clamp(centerY - h / 2, m.offY, maxY);

  updateViewBox(x, y, w, h);
  window.__minimapDebug = { x, y, w, h, centerX, centerY, scale: m.scale };
}

function drawMapTexture(m) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(m.offX, m.offY, m.mapW, m.mapH);
  ctx.clip();

  ctx.strokeStyle = 'rgba(74, 48, 38, 0.16)';
  ctx.lineWidth = 1;
  const step = Math.max(10, 2400 * m.scale);
  for (let x = m.offX; x <= m.offX + m.mapW; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, m.offY);
    ctx.lineTo(x, m.offY + m.mapH);
    ctx.stroke();
  }
  for (let y = m.offY; y <= m.offY + m.mapH; y += step) {
    ctx.beginPath();
    ctx.moveTo(m.offX, y);
    ctx.lineTo(m.offX + m.mapW, y);
    ctx.stroke();
  }

  ctx.restore();
}

function kindColor(kind) {
  return (
    {
      castle: '#7a4ed6',
      turret: '#4b2e93',
      city: '#f2b705',
      trap: '#15976f',
      hq: '#00a879',
      flag: '#00a879',
      resource: '#df4d3a',
      custom: '#6e6258',
    }[kind] || '#6f6252'
  );
}

function drawBlocks(m) {
  const viewRect = viewport.getBoundingClientRect();

  for (const block of state.blocks) {
    const rect = block.el?.getBoundingClientRect();
    if (!rect) continue;

    const rawX = m.offX + (rect.left - viewRect.left + viewport.scrollLeft) * m.scale;
    const rawY = m.offY + (rect.top - viewRect.top + viewport.scrollTop) * m.scale;
    const rawW = rect.width * m.scale;
    const rawH = rect.height * m.scale;
    const w = Math.max(block.kind === 'castle' ? 8 : 4, rawW);
    const h = Math.max(block.kind === 'castle' ? 8 : 4, rawH);
    const x = rawX + rawW / 2 - w / 2;
    const y = rawY + rawH / 2 - h / 2;

    ctx.fillStyle = kindColor(block.kind);
    ctx.globalAlpha = block.immutable ? 0.68 : 0.6;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
}

function scheduleDraw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    draw();
  });
}

function updateViewBox(x, y, w, h) {
  if (!viewBox || !canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const scaleX = canvasRect.width / WIDTH;
  const scaleY = canvasRect.height / HEIGHT;

  viewBox.style.transform = 'none';
  viewBox.style.left = `${canvasRect.left - wrapRect.left + x * scaleX}px`;
  viewBox.style.top = `${canvasRect.top - wrapRect.top + y * scaleY}px`;
  viewBox.style.width = `${w * scaleX}px`;
  viewBox.style.height = `${h * scaleY}px`;
}

function moveViewportFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const m = metrics();
  const canvasX = (e.clientX - rect.left) * (WIDTH / rect.width);
  const canvasY = (e.clientY - rect.top) * (HEIGHT / rect.height);
  const x = Math.max(m.offX, Math.min(canvasX, m.offX + m.mapW));
  const y = Math.max(m.offY, Math.min(canvasY, m.offY + m.mapH));
  const targetLeft = (x - m.offX) / m.scale - viewport.clientWidth / 2;
  const targetTop = (y - m.offY) / m.scale - viewport.clientHeight / 2;
  const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

  viewport.scrollLeft = Math.max(0, Math.min(targetLeft, maxLeft));
  viewport.scrollTop = Math.max(0, Math.min(targetTop, maxTop));
  scheduleDraw();
}

function onPointerDown(e) {
  dragging = true;
  canvas.setPointerCapture?.(e.pointerId);
  moveViewportFromEvent(e);
}

function onPointerMove(e) {
  if (!dragging) return;
  e.preventDefault();
  moveViewportFromEvent(e);
}

function onPointerUp(e) {
  dragging = false;
  canvas?.releasePointerCapture?.(e.pointerId);
}

export function setupMinimap() {
  ensureMinimap();
  window.__setupMinimapRan = true;
  viewport.addEventListener('scroll', scheduleDraw, { passive: true });
  window.addEventListener('resize', scheduleDraw);
  draw();
  setTimeout(draw, 100);
  scheduleDraw();
}
