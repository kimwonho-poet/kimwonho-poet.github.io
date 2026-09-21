import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { readContent, replaceContent } from "../lib/content.mjs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const script = readFileSync(new URL("assets/home-motion/scene.js", root), "utf8");
const css = readFileSync(new URL("assets/home-motion/scene.css", root), "utf8");

function fixture({ reduced = false, fail = false, delayed = false, storageThrows = false, savedPause = null } = {}) {
  const store = new Map(savedPause === null ? [] : [["home-motion-paused", savedPause]]);
  const pending = [];
  const images = [];
  function target(extra = {}) {
    return Object.assign(new EventTarget(), extra);
  }
  const preference = target({ matches: reduced });
  const button = target({ hidden: true, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } });
  const classes = new Set(["scene-shell"]);
  const shell = {
    classList: { add: c => classes.add(c), toggle: (c, yes) => yes ? classes.add(c) : classes.delete(c) },
    querySelector: () => button
  };
  const background = { src: "field.png" };
  const scene = { closest: () => shell, querySelector: () => background };
  const document = target({ hidden: false, currentScript: { src: "https://example.test/assets/home-motion/scene.js?v=2" }, getElementById: () => scene });
  let observer;
  const window = {};
  runInNewContext(script, {
    window, document, URL, AbortController, matchMedia: () => preference,
    sessionStorage: {
      getItem(k) { if (storageThrows) throw Error("blocked"); return store.get(k) ?? null; },
      setItem(k, v) { if (storageThrows) throw Error("blocked"); store.set(k, v); },
      removeItem: k => store.delete(k)
    },
    Image: class {
      constructor() { images.push(this); }
      decode() {
        if (fail) return Promise.reject(Error("missing image"));
        return delayed ? new Promise(resolve => pending.push(resolve)) : Promise.resolve();
      }
    },
    IntersectionObserver: class {
      constructor(callback) { observer = this; this.callback = callback; }
      observe() {}
      disconnect() { this.disconnected = true; }
    }
  });
  return { window, document, preference, button, classes, background, pending, images, scene, get observer() { return observer; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("existing public content and editor remain unchanged", () => {
  const original = execFileSync("git", ["show", "0a27c2d4b37fd27dc0a70672b9c9a6fc9522877e:index.html"], { cwd: root, encoding: "utf8" });
  const content = source => {
    const data = readContent(source);
    for (const section of ["works", "about", "profile"]) source = replaceContent(source, section, data[section]);
    return source.slice(source.indexOf("const SITE ="), source.indexOf("const SEC ="));
  };
  assert.equal(content(html), content(original));
  const editor = readFileSync(new URL("atelier-x7k2.html", root), "utf8");
  assert.equal(editor, execFileSync("git", ["show", "0a27c2d4b37fd27dc0a70672b9c9a6fc9522877e:atelier-x7k2.html"], { cwd: root, encoding: "utf8" }));
  for (const marker of [/const WORKS = \[[\s\S]*?\]; \/\* WORKS 끝 \*\//, /const ABOUT = \{[\s\S]*?\}; \/\* ABOUT 끝 \*\//]) {
    assert.ok(marker.test(html));
  }
});
test("both optimized assets exist and total less than 600 KB", () => {
  let bytes = 0;
  for (const name of ["landscape.webp", "sprites.webp"]) {
    const url = new URL("assets/home-motion/" + name, root);
    assert.equal(readFileSync(url).subarray(8, 12).toString(), "WEBP");
    bytes += statSync(url).size;
  }
  assert.ok(bytes < 600000);
});
test("six navigation targets and four sprite poses are preserved", () => {
  for (const key of ["about", "poem", "prose", "research", "guest", "youtube"]) {
    assert.ok(css.includes(".actor-" + key));
    assert.ok(html.includes('key: "' + key + '"'));
  }
  assert.ok(css.includes("33.333333%"));
  assert.ok(css.includes("66.666667%"));
  assert.ok(css.includes("prefers-reduced-motion:reduce"));
});
test("assets load before fallback is replaced and motion starts", async () => {
  const f = fixture({ delayed: true });
  assert.equal(f.background.src, "field.png");
  assert.ok(f.button.hidden);
  f.pending.forEach(resolve => resolve());
  await flush();
  assert.ok(f.background.src.endsWith("/landscape.webp"));
  assert.ok(f.classes.has("is-playing"));
  assert.equal(f.button.hidden, false);
});
test("pause and resume work, and leaving removes the old listener", async () => {
  const f = fixture();
  await flush();
  f.button.dispatchEvent(new Event("click"));
  assert.ok(f.classes.has("is-paused"));
  assert.equal(f.button.attributes["aria-label"], "애니메이션 재생");
  f.button.dispatchEvent(new Event("click"));
  assert.ok(f.classes.has("is-playing"));
  f.button.dispatchEvent(new Event("click"));
  f.window.homeMotion.mount(null);
  assert.ok(f.observer.disconnected);
  f.button.dispatchEvent(new Event("click"));
  assert.ok(f.classes.has("is-paused"), "disposed click listener must not run");
});
test("home autoplays even when the system reduced motion preference is enabled", async () => {
  const f = fixture({ reduced: true });
  await flush();
  assert.ok(f.classes.has("is-playing"));
  assert.ok(f.classes.has("motion-requested"));
  assert.equal(f.button.attributes["aria-label"], "애니메이션 일시 정지");
  f.button.dispatchEvent(new Event("click"));
  assert.ok(f.classes.has("is-paused"));
});
test("legacy stored pause does not prevent automatic playback on a fresh load", async () => {
  const f = fixture({ savedPause: "true", reduced: true });
  await flush();
  assert.ok(f.classes.has("is-playing"));
  assert.ok(!f.classes.has("is-paused"));
});
test("returning home starts playing again without downloading assets twice", async () => {
  const f = fixture();
  await flush();
  f.button.dispatchEvent(new Event("click"));
  assert.ok(f.classes.has("is-paused"));
  f.window.homeMotion.mount(null);
  f.window.homeMotion.mount(f.scene);
  await flush();
  assert.ok(f.classes.has("is-playing"));
  assert.ok(!f.classes.has("is-paused"));
  assert.equal(f.images.length, 2);
});
test("manual pause survives tab visibility changes within the current visit", async () => {
  const f = fixture();
  await flush();
  f.button.dispatchEvent(new Event("click"));
  f.document.hidden = true;
  f.document.dispatchEvent(new Event("visibilitychange"));
  f.document.hidden = false;
  f.document.dispatchEvent(new Event("visibilitychange"));
  assert.ok(f.classes.has("is-paused"));
  assert.ok(!f.classes.has("is-playing"));
});
test("hidden tabs and offscreen home suspend animation", async () => {
  const f = fixture();
  await flush();
  f.document.hidden = true;
  f.document.dispatchEvent(new Event("visibilitychange"));
  assert.ok(!f.classes.has("is-playing"));
  f.document.hidden = false;
  f.document.dispatchEvent(new Event("visibilitychange"));
  assert.ok(f.classes.has("is-playing"));
  f.observer.callback([{ isIntersecting: false }]);
  assert.ok(!f.classes.has("is-playing"));
  f.observer.callback([{ isIntersecting: true }]);
  assert.ok(f.classes.has("is-playing"));
});
test("failed assets retain the original image and hide unavailable playback", async () => {
  const f = fixture({ fail: true });
  await flush();
  assert.equal(f.background.src, "field.png");
  assert.ok(f.button.hidden);
  assert.ok(!f.classes.has("scene-ready"));
});
test("leaving before decoding finishes does not activate a detached scene", async () => {
  const f = fixture({ delayed: true });
  f.window.homeMotion.mount(null);
  f.pending.forEach(resolve => resolve());
  await flush();
  assert.ok(f.observer.disconnected);
  assert.ok(!f.classes.has("scene-ready"));
});
test("blocked browser storage does not break playback", async () => {
  const f = fixture({ storageThrows: true });
  await flush();
  assert.ok(f.classes.has("is-playing"));
  f.button.dispatchEvent(new Event("click"));
  assert.ok(f.classes.has("is-paused"));
});
