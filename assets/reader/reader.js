import { readerPreferences, readingPoint, validPosition, textSignature, isLongReading } from '../../lib/reader.mjs';

const preferenceKey = 'portfolio-reading-preferences-v1';
const positionKey = 'portfolio-reading-position:';
let dispose = () => {};
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const remove = key => { try { localStorage.removeItem(key); } catch {} };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount() {
  dispose();
  const article = document.querySelector('article.reader');
  document.body.classList.toggle('is-reading', !!article);
  if (!article) { delete document.body.dataset.readingTheme; return; }
  const controller = new AbortController(), options = { signal: controller.signal };
  const body = article.querySelector('.w-body'), toolbar = article.querySelector('.reading-tools');
  const key = positionKey + article.dataset.workId, signature = article.dataset.signature;
  const eligible = article.dataset.resume === 'true';
  const banner = article.querySelector('.reading-resume');
  let preferences = readerPreferences(read(preferenceKey));
  let timer, touched = false, restoring = true, suppress = false;
  const stored = eligible ? read(key) : null;
  const storedValid = validPosition(stored, signature);
  if (stored && !storedValid) remove(key);
  const blocks = () => [...body.children].filter(el => !el.classList.contains('footnotes'));
  const line = () => toolbar.getBoundingClientRect().bottom + 24;
  const point = () => readingPoint(blocks().map(el => ({ top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height })), line());
  function move(position) {
    const block = blocks()[position?.block];
    if (!block) return;
    const top = block.getBoundingClientRect().top + scrollY + position.fraction * block.getBoundingClientRect().height - toolbar.offsetHeight - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }
  function save() {
    if (!eligible || restoring || suppress || !article.isConnected) return;
    const rect = body.getBoundingClientRect();
    if (rect.height < innerHeight * 1.2) return;
    if (rect.top >= line() - 40 || rect.bottom < innerHeight * .8) { remove(key); return; }
    const current = point();
    if (!current) return;
    write(key, { ...current, signature, at: Date.now() });
    // Bound device-only history, without collecting content or visitor identifiers.
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(positionKey));
      keys.sort((a, b) => (read(b)?.at || 0) - (read(a)?.at || 0)).slice(50).forEach(remove);
    } catch {}
  }
  function apply() {
    document.body.dataset.readingTheme = preferences.theme;
    article.style.setProperty('--reading-size', preferences.size + 'px');
    toolbar.querySelector('output').textContent = String(preferences.size);
    toolbar.querySelector('[data-reader=smaller]').disabled = preferences.size === 16;
    toolbar.querySelector('[data-reader=larger]').disabled = preferences.size === 24;
    toolbar.querySelectorAll('[data-theme]').forEach(el => { el.checked = el.dataset.theme === preferences.theme; });
  }
  apply();
  const touch = () => { touched = true; };
  for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(name, touch, { ...options, passive: true });
  window.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(save, 250); }, { ...options, passive: true });
  window.addEventListener('pagehide', save, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); }, options);
  article.addEventListener('click', event => {
    const control = event.target.closest('[data-reader]');
    if (!control) return;
    const action = control.dataset.reader;
    if (action === 'start') {
      restoring = false; suppress = true; remove(key); banner.hidden = true;
      window.scrollTo({ top: 0, behavior: 'instant' });
      setTimeout(() => { suppress = false; }, 300);
      return;
    }
    if (action === 'dismiss') { banner.hidden = true; return; }
    const anchor = eligible && body.getBoundingClientRect().top < line() ? point() : null;
    if (action === 'smaller') preferences.size = Math.max(16, preferences.size - 2);
    if (action === 'larger') preferences.size = Math.min(24, preferences.size + 2);
    apply(); write(preferenceKey, preferences);
    if (anchor) requestAnimationFrame(() => { if (article.isConnected) move(anchor); });
  }, options);
  article.addEventListener('change', event => {
    if (!event.target.dataset.theme) return;
    preferences.theme = event.target.dataset.theme; apply(); write(preferenceKey, preferences);
  }, options);
  article.addEventListener('click', event => {
    const link = event.target.closest('[data-note-target]');
    if (!link) return;
    const target = document.getElementById(link.dataset.noteTarget);
    if (!target) return;
    event.preventDefault();
    touched = true;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'center' });
  }, options);
  const restoredImages = storedValid && !article.dataset.startAt ? blocks().slice(0, stored.block + 1).flatMap(block => [...block.querySelectorAll('img')]) : [];
  for (const img of restoredImages) {
    img.loading = 'eager';
    img.addEventListener('load', () => { if (!restoring && !touched && article.isConnected) move(stored); }, options);
  }
  const imageReady = [...body.querySelectorAll('img')].filter(img => !img.complete && img.loading !== 'lazy').map(img => new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true, ...options }); img.addEventListener('error', resolve, { once: true, ...options });
  }));
  Promise.race([Promise.all([document.fonts?.ready, ...imageReady]), new Promise(resolve => setTimeout(resolve, 1800))]).then(() => requestAnimationFrame(() => {
    if (!article.isConnected || controller.signal.aborted) return;
    const start = article.dataset.startAt && document.getElementById(article.dataset.startAt);
    if (start && !touched) { start.scrollIntoView({ block: 'start', behavior: 'instant' }); start.focus({ preventScroll: true }); }
    else if (storedValid && !touched && blocks()[stored.block]) { move(stored); banner.hidden = false; }
    restoring = false;
  }));
  dispose = () => {
    clearTimeout(timer); save(); controller.abort();
    dispose = () => {};
  };
}
window.readerView = { mount, unmount: () => dispose(), textSignature, isLongReading };
