(() => {
  "use strict";
  const assets = new URL(".", document.currentScript.src);
  let dispose = () => {};
  let loaded;

  function loadAssets() {
    if (!loaded) {
      loaded = Promise.all(["landscape.webp", "sprites.webp"].map(async name => {
        const image = new Image();
        image.src = new URL(name, assets).href;
        await image.decode();
        return image;
      })).catch(error => {
        loaded = undefined;
        throw error;
      });
    }
    return loaded;
  }

  function mount(scene) {
    dispose();
    dispose = () => {};
    if (!scene) return;
    const shell = scene.closest(".scene-shell");
    const button = shell.querySelector(".scene-toggle");
    const abort = new AbortController();
    const options = { signal: abort.signal };
    let active = true;
    let visible = true;
    let ready = false;
    // Each home entry starts playing; pause is limited to the current visit.
    let userPaused = false;
    shell.classList.add("motion-requested");

    function sync() {
      const paused = userPaused;
      shell.classList.toggle("is-paused", paused);
      shell.classList.toggle("is-playing", ready && !paused && visible && !document.hidden);
      const label = paused ? "애니메이션 재생" : "애니메이션 일시 정지";
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    button.addEventListener("click", () => {
      userPaused = !userPaused;
      sync();
    }, options);
    document.addEventListener("visibilitychange", sync, options);
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 });
    observer.observe(scene);
    sync();
    loadAssets().then(([background]) => {
      if (!active) return;
      const image = scene.querySelector(".bg");
      image.src = background.src;
      image.alt = "푸른 하늘과 꽃이 핀 들판";
      ready = true;
      shell.classList.add("scene-ready");
      button.hidden = false;
      sync();
    }).catch(() => {
      // The original illustration and its navigation remain usable offline or on error.
    });
    dispose = () => {
      active = false;
      abort.abort();
      observer.disconnect();
    };
  }
  window.homeMotion = { mount };
  mount(document.getElementById("scene"));
})();
