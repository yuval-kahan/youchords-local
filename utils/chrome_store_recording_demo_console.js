(() => {
  if (window.__ycStoreRecordingDemoStop) {
    window.__ycStoreRecordingDemoStop();
  }

  function readScriptConfig() {
    const rawConfig = document.currentScript?.dataset?.ycRecordingDemoConfig;
    if (!rawConfig) return {};

    try {
      const parsed = JSON.parse(rawConfig);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn("[YouChords demo] could not parse script config", error);
      return {};
    }
  }

  const userConfig = {
    ...(window.__YC_RECORDING_DEMO_CONFIG || {}),
    ...readScriptConfig(),
  };
  const config = {
    autoStart: false,
    moveMs: 760,
    waitMs: 620,
    longWaitMs: 1050,
    typeMs: 115,
    countdownSeconds: 10,
    countdownShowZero: true,
    afterPauseWaitMs: 220,
    panelPreviewWaitMs: 720,
    bubblesEnabled: true,
    bubbleMinMs: 1150,
    bubbleMaxMs: 2300,
    bubbleMsPerWord: 140,
    bubbleGapMs: 120,
    hideYouTubePageElements: false,
    ...userConfig,
  };

  let stopped = false;
  let cursor = null;
  let cursorStyle = null;
  let startButton = null;
  let countdownOverlay = null;
  let carouselArrowTile = null;
  let carouselArrowTileIndex = null;
  let primaryPositionDemoState = null;
  let activeBubble = null;
  const cleanupFns = [];

  const log = (...args) => console.log("[YouChords demo]", ...args);
  const warn = (...args) => console.warn("[YouChords demo]", ...args);

  const sleep = (ms) =>
    new Promise((resolve) => {
      const cleanup = () => clearTimeout(timeout);
      const timeout = setTimeout(() => {
        const index = cleanupFns.indexOf(cleanup);
        if (index !== -1) cleanupFns.splice(index, 1);
        resolve();
      }, ms);
      cleanupFns.push(cleanup);
    });

  function stop() {
    stopped = true;
    cleanupFns.splice(0).forEach((fn) => {
      try {
        fn();
      } catch (error) {
        warn("cleanup failed", error);
      }
    });
    document
      .querySelector(".html5-video-player")
      ?.classList.remove("yc-recording-demo-force-controls");
    setCarouselHover(false);
    cursor?.remove();
    cursorStyle?.remove();
    startButton?.remove();
    countdownOverlay?.remove();
    hideBubble(true);
    document
      .querySelectorAll(".yc-recording-demo-action-tile")
      .forEach((tile) => tile.classList.remove("yc-recording-demo-action-tile"));
    cursor = null;
    cursorStyle = null;
    startButton = null;
    countdownOverlay = null;
    carouselArrowTile = null;
    carouselArrowTileIndex = null;
    activeBubble = null;
    log("stopped");
  }

  window.__ycStoreRecordingDemoStop = stop;

  function createSvgElement(tagName, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attributes).forEach(([name, value]) => {
      node.setAttribute(name, value);
    });
    return node;
  }

  function createCursorSvg() {
    const svg = createSvgElement("svg", {
      viewBox: "0 0 36 36",
      "aria-hidden": "true",
    });

    svg.appendChild(
      createSvgElement("path", {
        d: "M6 4L28 20.5L18.2 22.2L23.2 32.2L18.8 34L13.8 24L6 30V4Z",
        fill: "#f7f7f7",
        stroke: "#111",
        "stroke-width": "2.25",
        "stroke-linejoin": "round",
      })
    );
    svg.appendChild(
      createSvgElement("path", {
        d: "M9.2 9.3L21.8 18.8L15.6 19.9L19.6 28L18.6 28.4L14.4 20.1L9.2 24.1V9.3Z",
        fill: "#ffffff",
        opacity: "0.9",
      })
    );

    return svg;
  }

  function ensureDemoStyle() {
    cursorStyle = document.createElement("style");
    cursorStyle.id = "yc-recording-demo-style";
    cursorStyle.textContent = `
      #yc-recording-cursor {
        position: fixed;
        left: 0;
        top: 0;
        width: 34px;
        height: 34px;
        z-index: 2147483647;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(48vw, 52vh, 0);
        transition: opacity 180ms ease, filter 120ms ease;
        filter: drop-shadow(0 3px 7px rgba(0, 0, 0, 0.45));
      }

      #yc-recording-cursor svg {
        display: block;
        width: 34px;
        height: 34px;
      }

      #yc-recording-cursor.is-clicking {
        filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0.25));
      }

      .yc-recording-demo-force-controls .ytp-chrome-bottom,
      .yc-recording-demo-force-controls .ytp-gradient-bottom {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      ${
        config.hideYouTubePageElements
          ? `
      #secondary,
      #avatar-btn,
      ytd-watch-metadata ytd-menu-renderer {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      `
          : ""
      }

      .yc-recording-click-ring {
        position: fixed;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(29, 161, 242, 0.95);
        border-radius: 999px;
        pointer-events: none;
        z-index: 2147483646;
        transform: translate(-50%, -50%) scale(0.5);
        animation: yc-recording-click-ring 520ms ease-out forwards;
      }

      @keyframes yc-recording-click-ring {
        to {
          opacity: 0;
          transform: translate(-50%, -50%) scale(2.9);
        }
      }

      #yc-recording-bubble {
        position: fixed;
        left: -9999px;
        top: -9999px;
        z-index: 2147483647;
        max-width: 238px;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 2px solid rgba(255, 255, 255, 0.92);
        border-radius: 13px;
        background: rgba(12, 13, 16, 0.94);
        color: #fff;
        font: 700 13px/1.28 Arial, sans-serif;
        letter-spacing: 0;
        text-align: left;
        pointer-events: none;
        opacity: 0;
        transform: scale(0.96);
        transform-origin: var(--yc-bubble-origin, 50% 50%);
        transition: opacity 160ms ease, transform 160ms ease;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36);
      }

      #yc-recording-bubble.is-visible {
        opacity: 1;
        transform: scale(1);
      }

      #yc-recording-bubble .yc-recording-bubble-text {
        position: relative;
        z-index: 1;
      }

      #yc-recording-bubble .yc-recording-bubble-tail {
        position: absolute;
        width: 14px;
        height: 14px;
        border-right: 2px solid rgba(255, 255, 255, 0.92);
        border-bottom: 2px solid rgba(255, 255, 255, 0.92);
        background: rgba(12, 13, 16, 0.94);
        transform: rotate(45deg);
      }

      #yc-recording-bubble[data-placement="top"] {
        --yc-bubble-origin: var(--yc-bubble-tail-x, 50%) 100%;
      }

      #yc-recording-bubble[data-placement="top"] .yc-recording-bubble-tail {
        left: var(--yc-bubble-tail-x, 50%);
        bottom: -8px;
        margin-left: -7px;
      }

      #yc-recording-bubble[data-placement="bottom"] {
        --yc-bubble-origin: var(--yc-bubble-tail-x, 50%) 0%;
      }

      #yc-recording-bubble[data-placement="bottom"] .yc-recording-bubble-tail {
        left: var(--yc-bubble-tail-x, 50%);
        top: -8px;
        margin-left: -7px;
        transform: rotate(225deg);
      }

      #yc-recording-bubble[data-placement="left"] {
        --yc-bubble-origin: 100% var(--yc-bubble-tail-y, 50%);
      }

      #yc-recording-bubble[data-placement="left"] .yc-recording-bubble-tail {
        right: -8px;
        top: var(--yc-bubble-tail-y, 50%);
        margin-top: -7px;
        transform: rotate(-45deg);
      }

      #yc-recording-bubble[data-placement="right"] {
        --yc-bubble-origin: 0% var(--yc-bubble-tail-y, 50%);
      }

      #yc-recording-bubble[data-placement="right"] .yc-recording-bubble-tail {
        left: -8px;
        top: var(--yc-bubble-tail-y, 50%);
        margin-top: -7px;
        transform: rotate(135deg);
      }

      .html5-video-player.yc-recording-demo-carousel-hover .yc-carousel-info-btn,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-carousel-edits-btn,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-carousel-size-btn,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-carousel-options-btn,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-carousel-mode-switch,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-dice-carousel,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-capo-carousel,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-capo-icon,
      .html5-video-player.yc-recording-demo-carousel-hover .yc-capo-fret-number,
      .html5-video-player.yc-recording-demo-carousel-hover .chord-arrows-counter,
      .html5-video-player.yc-recording-demo-carousel-hover .global-position-globe,
      .html5-video-player.yc-recording-demo-carousel-hover .chord-arrow-left,
      .html5-video-player.yc-recording-demo-carousel-hover .chord-arrow-right,
      .html5-video-player.yc-recording-demo-carousel-hover .chord-position-counter,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-carousel-info-btn,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-carousel-edits-btn,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-carousel-size-btn,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-carousel-options-btn,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-carousel-mode-switch,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-dice-carousel,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .yc-capo-carousel,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .chord-arrows-counter,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .global-position-globe,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .chord-arrow-left,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .chord-arrow-right,
      .html5-video-player.ytp-autohide.yc-recording-demo-carousel-hover .chord-position-counter,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-carousel-info-btn,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-carousel-edits-btn,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-carousel-size-btn,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-carousel-options-btn,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-carousel-mode-switch,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-dice-carousel,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-capo-carousel,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-capo-icon,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .yc-capo-fret-number,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .chord-arrows-counter,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .global-position-globe,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .chord-arrow-left,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .chord-arrow-right,
      .yc-root-wrapper.yc-recording-demo-carousel-hover .chord-position-counter {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      .yc-recording-demo-carousel-hover .yc-chord-tile svg .chord-arrows-counter,
      .yc-recording-demo-carousel-hover .yc-chord-tile svg .chord-arrow-left,
      .yc-recording-demo-carousel-hover .yc-chord-tile svg .chord-arrow-right,
      .yc-recording-demo-carousel-hover .yc-chord-tile svg .chord-position-counter {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      body.yc-recording-demo-carousel-hover
        .html5-video-player:not(:hover)
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrows-counter,
      body.yc-recording-demo-carousel-hover
        .html5-video-player:not(:hover)
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-left,
      body.yc-recording-demo-carousel-hover
        .html5-video-player:not(:hover)
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-right,
      body.yc-recording-demo-carousel-hover
        .html5-video-player:not(:hover)
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-position-counter,
      body.yc-recording-demo-carousel-hover
        .html5-video-player.ytp-autohide
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrows-counter,
      body.yc-recording-demo-carousel-hover
        .html5-video-player.ytp-autohide
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-left,
      body.yc-recording-demo-carousel-hover
        .html5-video-player.ytp-autohide
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-right,
      body.yc-recording-demo-carousel-hover
        .html5-video-player.ytp-autohide
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-position-counter,
      body.yc-recording-demo-carousel-hover
        .yc-root-wrapper
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrows-counter,
      body.yc-recording-demo-carousel-hover
        .yc-root-wrapper
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-left,
      body.yc-recording-demo-carousel-hover
        .yc-root-wrapper
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-right,
      body.yc-recording-demo-carousel-hover
        .yc-root-wrapper
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-position-counter {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      body.yc-recording-demo-carousel-hover
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-left,
      body.yc-recording-demo-carousel-hover
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-arrow-right {
        fill: #555 !important;
      }

      body.yc-recording-demo-carousel-hover
        .yc-chord-carousel
        .yc-chord-tile
        svg
        .chord-position-counter {
        fill: #000 !important;
      }

      .yc-chord-tile.yc-recording-demo-action-tile .yc-chord-actions {
        display: flex !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      #yc-recording-start-demo {
        position: fixed;
        left: 50%;
        top: 50%;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        border: 0;
        border-radius: 12px;
        padding: 14px 22px;
        background: linear-gradient(135deg, #18c964, #1292ff);
        color: #fff;
        font: 700 15px/1.2 Arial, sans-serif;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        cursor: pointer;
      }

      #yc-recording-start-demo:hover {
        filter: brightness(1.08);
      }

      #yc-recording-start-demo:disabled {
        cursor: default;
        opacity: 0.82;
      }

      #yc-recording-countdown {
        position: fixed;
        left: 50%;
        top: 50%;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        min-width: 180px;
        padding: 20px 24px;
        border-radius: 16px;
        background: rgba(10, 10, 12, 0.88);
        color: #fff;
        text-align: center;
        font-family: Arial, sans-serif;
        box-shadow: 0 16px 42px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(8px);
        pointer-events: none;
      }

      #yc-recording-countdown .yc-countdown-label {
        font-size: 13px;
        font-weight: 700;
        opacity: 0.82;
        margin-bottom: 6px;
      }

      #yc-recording-countdown .yc-countdown-number {
        font-size: 64px;
        font-weight: 800;
        line-height: 1;
      }
    `;
    document.documentElement.appendChild(cursorStyle);

    cursor = document.createElement("div");
    cursor.id = "yc-recording-cursor";
    cursor.appendChild(createCursorSvg());
    document.body.appendChild(cursor);

    document
      .querySelector(".html5-video-player")
      ?.classList.add("yc-recording-demo-force-controls");
  }

  function waitForStartButtonClick() {
    startButton = document.createElement("button");
    startButton.id = "yc-recording-start-demo";
    startButton.type = "button";
    startButton.textContent = "Start YouChords Recording Demo";
    document.body.appendChild(startButton);

    return new Promise((resolve) => {
      const onClick = () => {
        startButton.disabled = true;
        startButton.textContent = "Starting...";
        startButton.removeEventListener("click", onClick);
        setTimeout(() => {
          startButton?.remove();
          startButton = null;
        }, 180);
        resolve();
      };

      startButton.addEventListener("click", onClick);
      cleanupFns.push(() => startButton?.removeEventListener("click", onClick));
    });
  }

  async function runStartCountdown() {
    const seconds = Math.max(0, Number(config.countdownSeconds) || 0);
    if (!seconds) return;

    countdownOverlay = document.createElement("div");
    countdownOverlay.id = "yc-recording-countdown";
    const labelEl = document.createElement("div");
    labelEl.className = "yc-countdown-label";
    labelEl.textContent = "Recording starts in";

    const numberEl = document.createElement("div");
    numberEl.className = "yc-countdown-number";
    numberEl.textContent = String(seconds);

    countdownOverlay.appendChild(labelEl);
    countdownOverlay.appendChild(numberEl);
    document.body.appendChild(countdownOverlay);
    positionCountdownOverlay();

    const finalValue = config.countdownShowZero === false ? 1 : 0;
    for (let value = seconds; value >= finalValue; value -= 1) {
      assertRunning();
      positionCountdownOverlay();
      if (numberEl) numberEl.textContent = String(value);
      await sleep(value === 0 ? 500 : 1000);
    }

    countdownOverlay?.remove();
    countdownOverlay = null;
  }

  function positionCountdownOverlay() {
    if (!countdownOverlay) return;

    const viewportBounds = getViewportBounds();
    const playerBounds = getDemoPlayerBounds();
    const bounds = playerBounds
      ? rectIntersection(playerBounds, viewportBounds)
      : viewportBounds;
    const usableBounds = rectArea(bounds) > 1000 ? bounds : viewportBounds;

    const centerX = clamp(
      usableBounds.left + usableBounds.width / 2,
      12,
      window.innerWidth - 12
    );
    const centerY = clamp(
      usableBounds.top + usableBounds.height / 2,
      12,
      window.innerHeight - 12
    );

    countdownOverlay.style.left = `${centerX}px`;
    countdownOverlay.style.top = `${centerY}px`;
  }

  async function restartAndPlayVideo() {
    const video = document.querySelector("video");
    if (!video) {
      warn("video element was not found");
      return;
    }

    try {
      video.currentTime = 0;
    } catch (error) {
      warn("could not reset video time", error);
    }

    try {
      const playResult = video.play();
      if (playResult?.then) await playResult;
    } catch (error) {
      warn("video play was blocked or failed", error);
    }

    await sleep(700);
  }

  function assertRunning() {
    if (stopped) {
      throw new Error("Recording demo was stopped.");
    }
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function firstVisible(selector, root = document) {
    return Array.from(root.querySelectorAll(selector)).find(isVisible) || null;
  }

  function rectIntersection(rect, bounds) {
    const left = Math.max(rect.left, bounds.left);
    const top = Math.max(rect.top, bounds.top);
    const right = Math.min(rect.right, bounds.right);
    const bottom = Math.min(rect.bottom, bounds.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return { left, top, right, bottom, width, height };
  }

  function rectArea(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function rectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function isPointInRect(point, rect, margin = 0) {
    return (
      point.x >= rect.left + margin &&
      point.x <= rect.right - margin &&
      point.y >= rect.top + margin &&
      point.y <= rect.bottom - margin
    );
  }

  function getViewportBounds() {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function getDemoPlayerBounds() {
    const candidates = [
      document.querySelector(".html5-video-player"),
      document.querySelector("#movie_player"),
      document.querySelector("video"),
    ];

    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      const rect = candidate.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) return rect;
    }

    return null;
  }

  function getDemoClickableVideoBounds() {
    const viewportBounds = getViewportBounds();
    const playerBounds = getDemoPlayerBounds();
    if (!playerBounds) return viewportBounds;

    const bounds = rectIntersection(playerBounds, viewportBounds);
    return rectArea(bounds) > 1000 ? bounds : null;
  }

  function isElementInsideDemoVideo(el, minVisibleRatio = 0.62) {
    if (!isVisible(el)) return false;

    const rect = el.getBoundingClientRect();
    const area = rectArea(rect);
    if (area <= 0) return false;

    const bounds = getDemoClickableVideoBounds();
    if (!bounds) return false;
    const intersection = rectIntersection(rect, bounds);
    const visibleRatio = rectArea(intersection) / area;
    return (
      visibleRatio >= minVisibleRatio &&
      isPointInRect(rectCenter(rect), bounds, 4)
    );
  }

  function findByText(selector, text, options = {}) {
    const expected = String(text).trim().toLowerCase();
    return (
      Array.from(document.querySelectorAll(selector)).find((el) => {
        if (!isVisible(el)) return false;
        const actual = (el.textContent || "").trim().toLowerCase();
        return options.exact ? actual === expected : actual.includes(expected);
      }) || null
    );
  }

  function carouselFirstVisible(selector) {
    const carousel = firstVisible(".yc-chord-carousel");
    const wrapper = firstVisible(".yc-root-wrapper");
    return (
      (carousel ? firstVisible(selector, carousel) : null) ||
      (wrapper ? firstVisible(selector, wrapper) : null) ||
      firstVisible(selector)
    );
  }

  function parsePositionCounter(counter) {
    const match = (counter?.textContent || "").trim().match(/^(\d+)\/(\d+)$/);
    if (!match) return null;
    return {
      currentPosition: parseInt(match[1], 10) - 1,
      totalPositions: parseInt(match[2], 10),
    };
  }

  function getCarouselTileIndex(tile) {
    const raw = tile?.getAttribute?.("data-index");
    return raw == null || raw === "" ? null : String(raw);
  }

  function getCarouselTileByIndex(index) {
    if (index == null) return null;
    const safeIndex = String(index);
    const carousel = firstVisible(".yc-chord-carousel");
    const candidates = Array.from(
      carousel?.querySelectorAll(`.yc-chord-tile[data-index="${safeIndex}"]`) ||
        document.querySelectorAll(`.yc-chord-carousel .yc-chord-tile[data-index="${safeIndex}"]`)
    );
    return candidates.find(isVisible) || null;
  }

  function hasUsableCarouselPositionControls(tile) {
    if (!tile || !isVisible(tile)) return false;
    if (!firstVisible(".chord-arrow-left", tile)) return false;
    if (!firstVisible(".chord-arrow-right", tile)) return false;
    const info = parsePositionCounter(firstVisible(".chord-position-counter", tile));
    return Boolean(info && info.totalPositions > 1);
  }

  function hasUsableCarouselDemoTile(tile) {
    return hasUsableCarouselPositionControls(tile) && isElementInsideDemoVideo(tile);
  }

  function carouselTileCenterScore(tile) {
    const boundsCenter = rectCenter(getDemoClickableVideoBounds() || getViewportBounds());
    const tileCenter = rectCenter(tile.getBoundingClientRect());
    return Math.hypot(tileCenter.x - boundsCenter.x, tileCenter.y - boundsCenter.y);
  }

  function getCarouselTileClickPointElement(tile) {
    if (!tile) return null;
    const candidates = Array.from(tile.querySelectorAll("svg, canvas"));
    return candidates.find((el) => isElementInsideDemoVideo(el, 0.5)) || tile;
  }

  function getCarouselArrowDemoTile() {
    if (
      carouselArrowTile &&
      carouselArrowTile.isConnected &&
      hasUsableCarouselDemoTile(carouselArrowTile)
    ) {
      return carouselArrowTile;
    }

    const indexedTile = getCarouselTileByIndex(carouselArrowTileIndex);
    if (hasUsableCarouselDemoTile(indexedTile)) {
      carouselArrowTile = indexedTile;
      return carouselArrowTile;
    }

    const carousel = firstVisible(".yc-chord-carousel");
    const tiles = Array.from(
      carousel?.querySelectorAll(".yc-chord-tile") ||
        document.querySelectorAll(".yc-chord-carousel .yc-chord-tile")
    ).filter(hasUsableCarouselDemoTile);

    carouselArrowTile =
      tiles.find((tile) => tile.classList.contains("active")) ||
      tiles.sort((a, b) => carouselTileCenterScore(a) - carouselTileCenterScore(b))[0] ||
      null;
    carouselArrowTileIndex = getCarouselTileIndex(carouselArrowTile);

    return carouselArrowTile;
  }

  function carouselTileVisible(selector) {
    const tile = getCarouselArrowDemoTile();
    return (tile ? firstVisible(selector, tile) : null) || carouselFirstVisible(selector);
  }

  function carouselLeftArrow() {
    return carouselTileVisible(".yc-chord-tile svg .chord-arrow-left, .chord-arrow-left");
  }

  function carouselRightArrow() {
    return carouselTileVisible(".yc-chord-tile svg .chord-arrow-right, .chord-arrow-right");
  }

  function carouselPositionCounter() {
    return carouselTileVisible(".yc-chord-tile svg .chord-position-counter, .chord-position-counter");
  }

  function getCarouselPositionInfo() {
    const counter = carouselPositionCounter();
    if (!counter) return null;

    const parsed = parsePositionCounter(counter);
    if (!parsed) return null;

    return {
      counter,
      tile: getCarouselArrowDemoTile(),
      currentPosition: parsed.currentPosition,
      totalPositions: parsed.totalPositions,
    };
  }

  async function waitFor(target, timeoutMs = 8000, label = "target") {
    const startedAt = performance.now();
    while (!stopped && performance.now() - startedAt < timeoutMs) {
      const found =
        typeof target === "string" ? firstVisible(target) : target();
      if (found) return found;
      await sleep(80);
    }
    warn(`Skipped: ${label} was not found`);
    return null;
  }

  function centerOf(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(window.innerWidth - 6, Math.max(6, rect.left + rect.width / 2)),
      y: Math.min(window.innerHeight - 6, Math.max(6, rect.top + rect.height / 2)),
    };
  }

  function currentCursorPoint() {
    if (!cursor) return { x: window.innerWidth * 0.48, y: window.innerHeight * 0.52 };
    const match = cursor.style.transform.match(
      /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/
    );
    if (!match) return { x: window.innerWidth * 0.48, y: window.innerHeight * 0.52 };
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function dispatchMouse(type, x, y, directTarget = null) {
    const target = directTarget || document.elementFromPoint(x, y) || document.body;
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window,
        button: 0,
        buttons: type === "mousedown" ? 1 : 0,
      })
    );
  }

  async function moveToPoint(x, y, duration = config.moveMs) {
    assertRunning();
    const start = currentCursorPoint();
    const startedAt = performance.now();

    await new Promise((resolve) => {
      const step = () => {
        if (stopped) return resolve();
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        const eased = easeInOutCubic(progress);
        const nextX = start.x + (x - start.x) * eased;
        const nextY = start.y + (y - start.y) * eased;
        cursor.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
        dispatchMouse("mousemove", nextX, nextY);
        if (progress >= 1) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  async function moveTo(el, duration) {
    const point = centerOf(el);
    await moveToPoint(point.x, point.y, duration);
    return point;
  }

  function clickRing(x, y) {
    const ring = document.createElement("div");
    ring.className = "yc-recording-click-ring";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 560);
  }

  const bubbleMessagesByLabel = new Map([
    ["Guitar Tuner", "Tune your guitar without leaving YouTube."],
    ["close Guitar Tuner", "Back to the song."],
    ["Chord Explorer", "Search any chord and learn its shapes."],
    ["search input", "Type a chord name to explore it."],
    ["C7 result", "Open this chord diagram."],
    ["Fret Number +1", "Show fret numbers on the diagram."],
    ["Fret Number 2nd", "Try another fret-number display."],
    ["Fret Number None", "Hide fret numbers for a cleaner view."],
    ["next Chord Explorer page", "See more ways to play the chord."],
    ["close Chord Explorer", "Return to the video."],
    ["Subtitle & Chords", "Open transcript and chords together."],
    ["Preview off", "Toggle chord preview on the video."],
    ["Preview on", "Bring the chord preview back."],
    ["MINI on/off", "Switch the compact chord overlay."],
    ["MINI back", "Restore the mini chord view."],
    ["close Subtitle & Chords panel", "Close the transcript panel."],
    ["Chords carousel", "Follow chords as the song plays."],
    ["R mode", "R: Regular Chord mode for beginners."],
    ["R mode back", "Back to Regular mode."],
    ["H mode", "H: Harmonic mode for intermediate players."],
    ["H+ mode", "H+: Harmonic+ mode for advanced players."],
    ["Info open", "View extra chord information."],
    ["Chord Edits open", "Review your chord edits."],
    ["A size", "Adjust the chord card size."],
    ["Display Options", "Fine-tune chord diagrams and subtitle timing."],
    ["close Display Options", "Close display options."],
    ["Random Positions", "Shuffle chord positions with Random."],
    ["Random Positions off", "Turn Random positions back off."],
    ["Capo", "Turn capo transposition on."],
    ["Capo number", "Choose the capo fret."],
    ["Capo fret 3", "Apply capo fret 3."],
    ["Capo fret 1", "Return capo to fret 1."],
    ["Capo off", "Turn capo transposition off."],
    ["select carousel chord card", "Select this chord card."],
    ["position right arrow", "Try another chord position."],
    ["position left arrow", "Go back to the previous position."],
    ["position right arrow for global demo", "Pick a position to save globally."],
    [
      "position counter global on",
      "Global: save this chord position for all songs.",
    ],
    [
      "position counter global off",
      "Global: remove this saved position from all songs.",
    ],
    ["position left arrow back", "Return to the original position."],
    ["card Edit open", "Replace this chord."],
    [
      "card Timing open",
      "Adjust this chord's timing if it is too short or too long.",
    ],
    ["card Delete open", "Remove this chord from the song."],
    ["close Chords carousel", "Close the chord carousel."],
    ["Subtitles", "Show synced subtitles over the video."],
    ["close Subtitles", "Hide subtitles."],
    ["Settings", "Customize the YouChords experience."],
    ["close Settings", "Close settings."],
  ]);

  function bubbleTextForLabel(label) {
    return bubbleMessagesByLabel.get(label) || null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function bubbleReadMs(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    const minMs = Math.max(0, Number(config.bubbleMinMs) || 0);
    const maxMs = Math.max(minMs, Number(config.bubbleMaxMs) || minMs);
    const msPerWord = Math.max(0, Number(config.bubbleMsPerWord) || 0);
    return clamp(650 + words * msPerWord, minMs, maxMs);
  }

  function hideBubble(immediate = false) {
    if (!activeBubble) return;

    const bubble = activeBubble;
    activeBubble = null;
    bubble.classList.remove("is-visible");

    if (immediate) {
      bubble.remove();
      return;
    }

    const timeout = setTimeout(() => bubble.remove(), 180);
    cleanupFns.push(() => clearTimeout(timeout));
  }

  function ensureBubble() {
    if (activeBubble?.isConnected) return activeBubble;

    activeBubble = document.createElement("div");
    activeBubble.id = "yc-recording-bubble";
    const textEl = document.createElement("div");
    textEl.className = "yc-recording-bubble-text";
    const tailEl = document.createElement("div");
    tailEl.className = "yc-recording-bubble-tail";
    activeBubble.appendChild(textEl);
    activeBubble.appendChild(tailEl);
    document.body.appendChild(activeBubble);
    return activeBubble;
  }

  function showBubbleNear(el, text) {
    if (!el || !isVisible(el)) return false;

    hideBubble(true);

    const bubble = ensureBubble();
    const textEl = bubble.querySelector(".yc-recording-bubble-text");
    if (textEl) textEl.textContent = text;

    bubble.classList.remove("is-visible");
    bubble.style.visibility = "hidden";
    bubble.style.left = "0px";
    bubble.style.top = "0px";
    bubble.style.removeProperty("--yc-bubble-tail-x");
    bubble.style.removeProperty("--yc-bubble-tail-y");

    const targetRect = el.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const bubbleWidth = bubbleRect.width;
    const bubbleHeight = bubbleRect.height;
    const margin = 10;
    const gap = 14;
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;

    const fitsTop = targetRect.top >= bubbleHeight + gap + margin;
    const fitsBottom =
      window.innerHeight - targetRect.bottom >= bubbleHeight + gap + margin;
    const fitsRight =
      window.innerWidth - targetRect.right >= bubbleWidth + gap + margin;
    const placement = fitsTop ? "top" : fitsBottom ? "bottom" : fitsRight ? "right" : "left";

    let left = centerX - bubbleWidth / 2;
    let top = targetRect.top - bubbleHeight - gap;

    if (placement === "bottom") {
      top = targetRect.bottom + gap;
    } else if (placement === "right") {
      left = targetRect.right + gap;
      top = centerY - bubbleHeight / 2;
    } else if (placement === "left") {
      left = targetRect.left - bubbleWidth - gap;
      top = centerY - bubbleHeight / 2;
    }

    const maxLeft = Math.max(margin, window.innerWidth - bubbleWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - bubbleHeight - margin);
    left = clamp(left, margin, maxLeft);
    top = clamp(top, margin, maxTop);

    bubble.dataset.placement = placement;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;

    if (placement === "top" || placement === "bottom") {
      const tailX = clamp(centerX - left, 22, bubbleWidth - 22);
      bubble.style.setProperty("--yc-bubble-tail-x", `${tailX}px`);
    } else {
      const tailY = clamp(centerY - top, 22, bubbleHeight - 22);
      bubble.style.setProperty("--yc-bubble-tail-y", `${tailY}px`);
    }

    bubble.style.visibility = "visible";
    bubble.getBoundingClientRect();
    bubble.classList.add("is-visible");
    return true;
  }

  async function showBubbleForClick(el, label) {
    if (!config.bubblesEnabled) return;

    const text = bubbleTextForLabel(label);
    if (!text || !showBubbleNear(el, text)) return;

    await sleep(bubbleReadMs(text));
    hideBubble();
    await sleep(config.bubbleGapMs);
  }

  function setCarouselHover(active) {
    const shouldEnable = Boolean(active);
    document.body?.classList.toggle("yc-recording-demo-carousel-hover", shouldEnable);
    setPrimaryPositionDemo(shouldEnable);
    document.querySelectorAll(".html5-video-player").forEach((player) => {
      player.classList.toggle("yc-recording-demo-carousel-hover", shouldEnable);
      player.classList.toggle("yc-tour-carousel-hover", shouldEnable);
      player.classList.toggle("yc-carousel-controls-locked", shouldEnable);
    });
    document.querySelectorAll(".yc-root-wrapper").forEach((wrapper) => {
      wrapper.classList.toggle("yc-recording-demo-carousel-hover", shouldEnable);
      wrapper.classList.toggle("yc-tour-carousel-hover", shouldEnable);
    });
  }

  function setPrimaryPositionDemo(active) {
    if (active) {
      if (!primaryPositionDemoState) {
        primaryPositionDemoState = {
          primaryEnabled: window.primaryChordPositionEnabled,
          globeEnabled: window.globeIconEnabled,
          blackArrowsEnabled: window.blackArrowsEnabled,
          blackPositionNumberEnabled: window.blackPositionNumberEnabled,
          primaryClass: document.body?.classList.contains("yc-primary-chord-position-enabled"),
          globeClass: document.body?.classList.contains("yc-globe-icon-enabled"),
          blackArrowsClass: document.body?.classList.contains("yc-black-arrows-enabled"),
          blackPositionNumberClass: document.body?.classList.contains("yc-black-position-number-enabled"),
        };
      }

      window.primaryChordPositionEnabled = true;
      window.globeIconEnabled = true;
      window.blackArrowsEnabled = true;
      window.blackPositionNumberEnabled = true;
      document.body?.classList.add(
        "yc-primary-chord-position-enabled",
        "yc-globe-icon-enabled",
        "yc-black-arrows-enabled",
        "yc-black-position-number-enabled"
      );

      try {
        window.setupPositionCounterListeners?.(true);
      } catch (error) {
        warn("could not enable position counter listener", error);
      }
      return;
    }

    if (!primaryPositionDemoState) return;

    window.primaryChordPositionEnabled = primaryPositionDemoState.primaryEnabled;
    window.globeIconEnabled = primaryPositionDemoState.globeEnabled;
    window.blackArrowsEnabled = primaryPositionDemoState.blackArrowsEnabled;
    window.blackPositionNumberEnabled = primaryPositionDemoState.blackPositionNumberEnabled;
    document.body?.classList.toggle(
      "yc-primary-chord-position-enabled",
      Boolean(primaryPositionDemoState.primaryClass)
    );
    document.body?.classList.toggle(
      "yc-globe-icon-enabled",
      Boolean(primaryPositionDemoState.globeClass)
    );
    document.body?.classList.toggle(
      "yc-black-arrows-enabled",
      Boolean(primaryPositionDemoState.blackArrowsClass)
    );
    document.body?.classList.toggle(
      "yc-black-position-number-enabled",
      Boolean(primaryPositionDemoState.blackPositionNumberClass)
    );

    try {
      window.setupPositionCounterListeners?.(Boolean(primaryPositionDemoState.primaryEnabled));
    } catch (error) {
      warn("could not restore position counter listener", error);
    }

    primaryPositionDemoState = null;
  }

  async function click(el, label = "target", options = {}) {
    if (!el) return null;
    assertRunning();
    const showBubble = options.showBubble !== false;
    const afterWaitMs =
      Number.isFinite(options.afterWaitMs) ? Math.max(0, options.afterWaitMs) : config.waitMs;
    log(`click ${label}`);
    const bubblePromise = showBubble ? showBubbleForClick(el, label) : Promise.resolve();
    const pointElement =
      options.pointElement instanceof Element ? options.pointElement : el;
    const point = await moveTo(pointElement);
    await bubblePromise;
    cursor.classList.add("is-clicking");
    dispatchMouse("mouseover", point.x, point.y, el);
    dispatchMouse("mouseenter", point.x, point.y, el);
    dispatchMouse("mousedown", point.x, point.y, el);
    clickRing(point.x + 8, point.y + 8);
    await sleep(110);
    dispatchMouse("mouseup", point.x, point.y, el);
    dispatchMouse("click", point.x, point.y, el);
    cursor.classList.remove("is-clicking");
    await sleep(afterWaitMs);
    return el;
  }

  async function clickWhen(target, label, timeoutMs = 9000, options = {}) {
    const el = await waitFor(target, timeoutMs, label);
    if (!el) return null;
    return click(el, label, options);
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  async function typeText(input, text) {
    await click(input, "search input");
    setNativeValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    for (const char of text) {
      assertRunning();
      setNativeValue(input, input.value + char);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(config.typeMs);
    }
    await sleep(config.longWaitMs);
  }

  async function selectValue(select, value, label) {
    if (!select) return;
    await click(select, label);
    select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(config.waitMs);
  }

  async function scrollDemo(el) {
    if (!el) return;
    await moveTo(el, 520);
    for (let i = 0; i < 6; i += 1) {
      assertRunning();
      const point = currentCursorPoint();
      el.scrollTop += 135;
      el.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          deltaY: 135,
        })
      );
      await sleep(280);
    }
  }

  async function ensureVideoPausedNow() {
    const video = document.querySelector("video");
    const player = document.querySelector("#movie_player");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        player?.pauseVideo?.();
      } catch (error) {
        warn("YouTube pauseVideo failed", error);
      }

      try {
        video?.pause?.();
      } catch (error) {
        warn("video pause failed", error);
      }

      const ytState =
        typeof player?.getPlayerState === "function" ? player.getPlayerState() : null;
      if ((video && video.paused) || ytState === 2) {
        return true;
      }

      await sleep(attempt < 2 ? 40 : 90);
    }

    warn("video did not enter paused state");
    return false;
  }

  async function ensureVideoPlayingNow() {
    const video = document.querySelector("video");
    const player = document.querySelector("#movie_player");
    const startedAt = Number(video?.currentTime) || 0;

    const hasStartedPlaying = () => {
      const ytState =
        typeof player?.getPlayerState === "function" ? player.getPlayerState() : null;
      const currentTime = Number(video?.currentTime) || 0;
      const timeAdvanced = currentTime > startedAt + 0.12;
      return Boolean(video && !video.paused && timeAdvanced) || (!video && ytState === 1);
    };

    for (let attempt = 0; attempt < 24; attempt += 1) {
      try {
        player?.playVideo?.();
      } catch (error) {
        warn("YouTube playVideo failed", error);
      }

      try {
        const playResult = video?.play?.();
        if (playResult?.then) await playResult.catch(() => null);
      } catch (error) {
        warn("video play failed", error);
      }

      const ytState =
        typeof player?.getPlayerState === "function" ? player.getPlayerState() : null;
      const isProbablyPlaying = Boolean(video && !video.paused) || ytState === 1;
      if (hasStartedPlaying()) {
        return true;
      }

      if (attempt === 4 && !isProbablyPlaying) {
        const playButton =
          firstVisible(".ytp-large-play-button") || firstVisible(".ytp-play-button");
        playButton?.click?.();
      }

      await sleep(attempt < 4 ? 90 : 140);
    }

    warn("video did not enter playing state");
    return false;
  }

  async function clickVideoCenterToPause() {
    const video = document.querySelector("video");
    const player =
      document.querySelector(".html5-video-player") ||
      document.querySelector("#movie_player") ||
      video;
    const rect = (video || player)?.getBoundingClientRect?.();

    if (!rect?.width || !rect?.height) {
      warn("Skipped: video center was not available for pause");
      return;
    }

    const x = Math.min(window.innerWidth - 6, Math.max(6, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 6, Math.max(6, rect.top + rect.height / 2));
    log("click video center to pause");
    await moveToPoint(x, y);
    dispatchMouse("mouseover", x, y);
    dispatchMouse("mouseenter", x, y);
    dispatchMouse("mousedown", x, y);
    clickRing(x + 8, y + 8);
    await ensureVideoPausedNow();
    await sleep(110);
    dispatchMouse("mouseup", x, y);
    await sleep(config.afterPauseWaitMs);
  }

  async function clickVideoCenterToPlay() {
    const video = document.querySelector("video");
    const player =
      document.querySelector(".html5-video-player") ||
      document.querySelector("#movie_player") ||
      video;
    const rect = (video || player)?.getBoundingClientRect?.();

    if (!rect?.width || !rect?.height) {
      warn("Skipped: video center was not available for play");
      return;
    }

    const x = Math.min(window.innerWidth - 6, Math.max(6, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 6, Math.max(6, rect.top + rect.height / 2));
    log("click video center to play");
    await moveToPoint(x, y);
    dispatchMouse("mouseover", x, y);
    dispatchMouse("mouseenter", x, y);
    dispatchMouse("mousedown", x, y);
    clickRing(x + 8, y + 8);
    await sleep(110);
    dispatchMouse("mouseup", x, y);
    dispatchMouse("click", x, y);

    await ensureVideoPlayingNow();
    await sleep(config.afterPauseWaitMs);
  }

  async function selectCarouselArrowDemoTile() {
    carouselArrowTile = null;
    const tile = await waitFor(
      () => getCarouselArrowDemoTile(),
      7000,
      "carousel chord card for arrows"
    );
    if (!tile) return null;
    if (!hasUsableCarouselDemoTile(tile)) {
      warn("Skipped: carousel chord card was outside the video frame");
      return null;
    }

    document
      .querySelectorAll(".yc-recording-demo-action-tile")
      .forEach((item) => item.classList.remove("yc-recording-demo-action-tile"));
    tile.classList.add("yc-recording-demo-action-tile");
    carouselArrowTileIndex = getCarouselTileIndex(tile);
    await click(tile, "select carousel chord card", {
      showBubble: false,
      afterWaitMs: config.afterPauseWaitMs,
      pointElement: getCarouselTileClickPointElement(tile),
    });
    await ensureVideoPausedNow();
    const indexedTile = getCarouselTileByIndex(carouselArrowTileIndex);
    carouselArrowTile =
      (hasUsableCarouselDemoTile(indexedTile) ? indexedTile : null) ||
      (hasUsableCarouselDemoTile(tile) ? tile : getCarouselArrowDemoTile());
    carouselArrowTile?.classList?.add("yc-recording-demo-action-tile");
    await sleep(config.waitMs);
    return carouselArrowTile;
  }

  function forceCapoVisible() {
    document.querySelectorAll(".yc-capo-carousel").forEach((el) => {
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.pointerEvents = "auto";
    });
  }

  function chordExplorerButton() {
    return firstVisible(".ytp-chord-explorer-button");
  }

  function tunerButton() {
    return firstVisible(".ytp-tuner-button");
  }

  function lyricsButton() {
    return firstVisible(".ytp-lyrics-chords-button");
  }

  function subtitleButton() {
    return firstVisible(".ytp-subtitle-button");
  }

  function chordsButton() {
    return firstVisible(".ytp-chords-button");
  }

  function settingsButton() {
    return firstVisible(".settings-button");
  }

  async function runTunerIntro() {
    await clickWhen(tunerButton, "Guitar Tuner");
    await waitFor(".tuner-overlay", 12000, "Guitar Tuner overlay");
    await sleep(config.longWaitMs);
    await clickWhen(".tuner-close-btn", "close Guitar Tuner");
  }

  async function runChordExplorerIntro() {
    await clickWhen(chordExplorerButton, "Chord Explorer");
    await waitFor(".chord-explorer-overlay", 10000, "Chord Explorer overlay");
    await sleep(config.longWaitMs);
    await clickWhen(".chord-explorer-overlay .ce-close-btn", "close Chord Explorer");
  }

  async function runChordExplorerSearch() {
    await clickWhen(chordExplorerButton, "Chord Explorer");
    const overlay = await waitFor(".chord-explorer-overlay", 10000, "Chord Explorer overlay");
    if (!overlay) return;

    const input = await waitFor(".chord-explorer-overlay .ce-search-input", 8000, "Chord Explorer search");
    if (input) await typeText(input, "C7");

    await clickWhen(
      () =>
        findByText(".chord-explorer-overlay .ce-suggestion-item", "C7", {
          exact: true,
        }) || firstVisible(".chord-explorer-overlay .ce-suggestion-item"),
      "C7 result"
    );

    await sleep(config.longWaitMs);

    const fretSelect = await waitFor(
      ".chord-explorer-overlay .ce-fret-select",
      8000,
      "Fret Number"
    );
    await selectValue(fretSelect, "one", "Fret Number +1");
    await selectValue(fretSelect, "all", "Fret Number 2nd");
    await selectValue(fretSelect, "none", "Fret Number None");

    await clickWhen(".chord-explorer-overlay .ce-next-btn", "next Chord Explorer page");
    await sleep(config.longWaitMs);
    await clickWhen(".chord-explorer-overlay .ce-close-btn", "close Chord Explorer");
  }

  async function runLyricsPanel() {
    await clickWhen(lyricsButton, "Subtitle & Chords");
    const panel = await waitFor(".yt-lyrics-chords-panel", 12000, "Subtitle & Chords panel");
    if (!panel) return;

    await sleep(config.panelPreviewWaitMs);
    await clickWhen("#chords-preview-toggle", "Preview off");
    await clickWhen("#chords-preview-toggle", "Preview on");
    await clickWhen("#chords-toggle", "MINI on/off");
    await clickWhen("#chords-toggle", "MINI back");
    await clickWhen(".lyrics-chords-close", "close Subtitle & Chords panel");
  }

  async function runSubtitlesOverlay() {
    await clickWhen(subtitleButton, "Subtitles");
    await waitFor(
      () =>
        (window.subtitleState?.isVisible &&
          (window.subtitleState.overlay || firstVisible(".yt-subtitle-overlay"))) ||
        firstVisible(".yt-subtitle-overlay"),
      12000,
      "Subtitles overlay"
    );
    await sleep(config.longWaitMs);
    await clickWhen(subtitleButton, "close Subtitles");
    await waitFor(
      () => {
        const overlay = window.subtitleState?.overlay || firstVisible(".yt-subtitle-overlay");
        return !window.subtitleState?.isVisible && !isVisible(overlay) ? document.body : null;
      },
      5000,
      "Subtitles closed"
    );
  }

  function getCounterPositionContext(counter) {
    const svg = counter?.closest?.("svg");
    const arrow = svg?.querySelector?.(".chord-arrow-left, .chord-arrow-right");
    const match = (counter?.textContent || "").trim().match(/^(\d+)\/(\d+)$/);
    const rawChordName = arrow?.getAttribute?.("data-chord-name");
    const chordName = rawChordName?.replace(/_pos\d+_\d+$/, "");

    if (!svg || !arrow || !match || !chordName) return null;

    return {
      arrow,
      chordName,
      currentPosition: parseInt(match[1], 10) - 1,
      svg,
    };
  }

  function addDemoGlobalGlobe(svg) {
    if (!svg || svg.querySelector(".global-position-globe")) return;

    const globe = document.createElementNS("http://www.w3.org/2000/svg", "text");
    globe.setAttribute("x", "3");
    globe.setAttribute("y", "7");
    globe.setAttribute("font-family", "Arial");
    globe.setAttribute("font-size", "8px");
    globe.setAttribute("text-anchor", "start");
    globe.setAttribute("class", "global-position-globe yc-recording-demo-global-position-globe");
    globe.setAttribute("fill", "#4CAF50");
    globe.textContent = "🌐";
    svg.appendChild(globe);
  }

  async function showCounterGlobalState(counter) {
    const context = getCounterPositionContext(counter);
    if (!context) return;

    if (context.currentPosition <= 0) {
      warn("Skipped: position 1 cannot be global");
      await hideCounterGlobalState(counter);
      return;
    }

    try {
      await window.databaseManager?.saveGlobalChordPosition?.(
        context.chordName,
        context.currentPosition
      );
    } catch (error) {
      warn("could not save global chord position for demo", error);
    }

    try {
      await window.addGlobalPositionIndicator?.(
        context.chordName,
        context.currentPosition,
        context.arrow
      );
    } catch (error) {
      warn("could not refresh global position indicator for demo", error);
    }

    await waitFor(
      () => firstVisible(".global-position-globe", context.svg),
      1200,
      "global position globe"
    );

    if (!firstVisible(".global-position-globe", context.svg)) {
      context.svg
        .querySelectorAll(".chord-arrow-left, .chord-arrow-right")
        .forEach((arrow) => arrow.classList.add("global-position-arrow"));
      counter.classList.add("global-position-counter");
      addDemoGlobalGlobe(context.svg);
    }
  }

  async function hideCounterGlobalState(counter) {
    const context = getCounterPositionContext(counter);
    if (!context) return;

    try {
      await window.databaseManager?.saveGlobalChordPosition?.(context.chordName, 0);
    } catch (error) {
      warn("could not clear global chord position for demo", error);
    }

    context.svg
      .querySelectorAll(".global-position-globe")
      .forEach((globe) => globe.remove());
    context.svg
      .querySelectorAll(".chord-arrow-left, .chord-arrow-right")
      .forEach((arrow) => arrow.classList.remove("global-position-arrow"));
    context.svg
      .querySelectorAll(".global-position-counter")
      .forEach((positionCounter) =>
        positionCounter.classList.remove("global-position-counter")
      );
  }

  async function clickCarouselPositionCounter(label, shouldShowGlobal) {
    const counter = await waitFor(carouselPositionCounter, 5000, label);
    if (!counter) return null;

    await click(counter, label);
    if (shouldShowGlobal) {
      await showCounterGlobalState(counter);
      await sleep(config.longWaitMs);
    } else {
      await hideCounterGlobalState(counter);
      await sleep(config.waitMs);
    }

    return counter;
  }

  async function runCarouselPositionControls() {
    if (!carouselArrowTile || !carouselArrowTile.isConnected) {
      await selectCarouselArrowDemoTile();
    }

    const info = getCarouselPositionInfo();
    if (!info || info.totalPositions < 2) {
      warn("Skipped: carousel position controls were not available");
      return;
    }

    await clickWhen(carouselRightArrow, "position right arrow", 5000);
    await clickWhen(carouselLeftArrow, "position left arrow", 5000);
    await clickWhen(carouselRightArrow, "position right arrow for global demo", 5000);
    await clickCarouselPositionCounter("position counter global on", true);
    await clickCarouselPositionCounter("position counter global off", false);
    await clickWhen(carouselLeftArrow, "position left arrow back", 5000);
  }

  async function closeChordActionPopups(waitMs = config.waitMs) {
    const manager = window.chordEditsManager;
    try {
      manager?.closeChordReplacePicker?.();
      manager?.closeChordTimingEditor?.();
      manager?.closeChordRemoveScopePicker?.();
      manager?.closeChordInfoPopup?.();
      manager?.closeChordEditsSummaryPopup?.();
    } catch (error) {
      warn("closing chord action popup failed", error);
    }
    await sleep(waitMs);
  }

  async function clickChordActionButton(selector, label, options = {}) {
    carouselArrowTile =
      getCarouselTileByIndex(carouselArrowTileIndex) ||
      (carouselArrowTile?.isConnected ? carouselArrowTile : null);

    if (!carouselArrowTile || !carouselArrowTile.isConnected) {
      await selectCarouselArrowDemoTile();
    }
    carouselArrowTile?.classList?.add("yc-recording-demo-action-tile");

    const button = await waitFor(
      () => (carouselArrowTile ? firstVisible(selector, carouselArrowTile) : null),
      5000,
      label
    );
    if (!button) return;

    await click(button, `${label} open`);
    await sleep(
      Number.isFinite(options.popupWaitMs)
        ? Math.max(0, options.popupWaitMs)
        : config.longWaitMs
    );
    await closeChordActionPopups(
      Number.isFinite(options.closeWaitMs)
        ? Math.max(0, options.closeWaitMs)
        : config.waitMs
    );
    carouselArrowTile =
      getCarouselTileByIndex(carouselArrowTileIndex) ||
      (carouselArrowTile?.isConnected ? carouselArrowTile : null);
    carouselArrowTile?.classList?.add("yc-recording-demo-action-tile");
  }

  async function runCarouselCardActionsDemo() {
    if (!carouselArrowTile || !carouselArrowTile.isConnected) {
      await selectCarouselArrowDemoTile();
    }

    await clickChordActionButton(".yc-chord-action-edit", "card Edit");
    await clickChordActionButton(".yc-chord-action-time", "card Timing");
    await clickChordActionButton(".yc-chord-action-remove", "card Delete", {
      closeWaitMs: 120,
    });
  }

  async function runChordsCarousel() {
    await clickWhen(chordsButton, "Chords carousel");
    const carousel = await waitFor(".yc-chord-carousel", 13000, "Chords carousel");
    if (!carousel) return;

    setCarouselHover(true);
    await sleep(config.longWaitMs);

    await clickWhen(() => findByText(".yc-carousel-mode-btn", "R", { exact: true }), "R mode");
    await clickWhen(() => findByText(".yc-carousel-mode-btn", "H", { exact: true }), "H mode");
    await clickWhen(() => findByText(".yc-carousel-mode-btn", "H+", { exact: true }), "H+ mode");
    await clickWhen(() => findByText(".yc-carousel-mode-btn", "R", { exact: true }), "R mode back");

    await clickWhen(".yc-carousel-info-btn", "Info open");
    await clickWhen(".yc-carousel-info-btn", "Info close");
    await clickWhen(".yc-carousel-edits-btn", "Chord Edits open");
    await clickWhen(".yc-carousel-edits-btn", "Chord Edits close");
    await clickWhen(".yc-carousel-size-btn", "A size");
    await clickWhen(".yc-carousel-size-btn", "close A size");
    await clickWhen(".yc-carousel-options-btn", "Display Options");
    await clickWhen(".yc-carousel-options-btn", "close Display Options", 9000, {
      showBubble: false,
      afterWaitMs: 120,
    });
    await clickWhen(".yc-dice-carousel", "Random Positions");
    await clickWhen(".yc-dice-carousel", "Random Positions off");

    forceCapoVisible();
    await clickWhen(
      () => firstVisible(".yc-capo-carousel .yc-capo-icon") || firstVisible(".yc-capo-icon"),
      "Capo"
    );

    forceCapoVisible();
    await clickWhen(".yc-capo-carousel .yc-capo-fret-number", "Capo number");
    await clickWhen(
      () =>
        findByText(".yc-capo-fret-cell", "3", { exact: true }) ||
        findByText(".yc-capo-fret-cell", "2", { exact: true }) ||
        firstVisible(".yc-capo-fret-cell"),
      "Capo fret 3"
    );
    await sleep(config.longWaitMs);

    forceCapoVisible();
    await clickWhen(".yc-capo-carousel .yc-capo-fret-number", "Capo number");
    await clickWhen(
      () =>
        findByText(".yc-capo-fret-cell", "1", { exact: true }) ||
        firstVisible(".yc-capo-fret-cell"),
      "Capo fret 1"
    );
    forceCapoVisible();
    await clickWhen(
      () => firstVisible(".yc-capo-carousel .yc-capo-icon") || firstVisible(".yc-capo-icon"),
      "Capo off"
    );

    await clickVideoCenterToPause();
    await selectCarouselArrowDemoTile();
    await runCarouselPositionControls();
    await runCarouselCardActionsDemo();

    await sleep(config.afterPauseWaitMs);
    await clickWhen(chordsButton, "close Chords carousel");
    setCarouselHover(false);
  }

  async function runSettingsMenu() {
    await clickWhen(settingsButton, "Settings");
    const menu = await waitFor(
      () => firstVisible('[data-yc-menu="settings"]') || firstVisible(".yc-settings-menu"),
      9000,
      "Settings menu"
    );
    await sleep(config.waitMs);
    await scrollDemo(menu);
    await sleep(config.waitMs);
    await clickWhen(settingsButton, "close Settings");
  }

  async function runFinalOpenState() {
    await clickWhen(chordsButton, "final Chords carousel");
    await waitFor(".yc-chord-carousel", 13000, "final Chords carousel");
    await sleep(config.waitMs);
    await clickWhen(lyricsButton, "final Subtitle & Chords panel");
    await waitFor(".yt-lyrics-chords-panel", 12000, "final Subtitle & Chords panel");
    await sleep(config.longWaitMs);
  }

  async function run() {
    ensureDemoStyle();
    if (config.autoStart) {
      log("starting immediately. Run window.__ycStoreRecordingDemoStop() to stop.");
      await runStartCountdown();
    } else {
      log("ready. Click the on-screen Start button. Run window.__ycStoreRecordingDemoStop() to stop.");
      await waitForStartButtonClick();
      await runStartCountdown();
      log("starting. Run window.__ycStoreRecordingDemoStop() to stop.");
    }
    if (cursor) cursor.style.opacity = "1";
    await restartAndPlayVideo();

    await runTunerIntro();
    await runChordExplorerSearch();
    await runLyricsPanel();
    await runChordsCarousel();
    await clickVideoCenterToPlay();
    await runSubtitlesOverlay();
    await runSettingsMenu();
    await runFinalOpenState();

    log("finished");
  }

  run().catch((error) => {
    console.error("[YouChords demo] failed", error);
    stop();
  });
})();
