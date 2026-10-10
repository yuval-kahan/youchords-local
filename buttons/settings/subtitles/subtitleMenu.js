// Main subtitle menu creation function with improved option names but no category headers
// פונקציה לניקוי תפריטים ומניעת דליפות זיכרון
window.disposeMenu = function (id) {
  const menu = window.YC_MENUS?.[id];
  if (!menu) return;

  // ניתוק observer
  menu.observer?.disconnect();
  delete menu.observer;

  // הסרת אלמנט אם הוא מחובר בפועל
  if (menu.isConnected) menu.remove();

  // ניקוי map
  if (window.YC_MENUS) delete window.YC_MENUS[id];
};

// פונקציה אחידה למיקום תפריטים מעל סרגל השליטה
window.placeNearControls = function (element, extraMargin = 12) {
  const controls = document.querySelector(".ytp-chrome-bottom");
  if (!controls) return;

  const controlsRect = controls.getBoundingClientRect();
  element.style.right = "12px";
  element.style.bottom = `${controlsRect.height + extraMargin}px`;

  // הוספת z-index גבוה לוודא שהתפריט מוצג מעל אלמנטים אחרים
  if (!element.style.zIndex || parseInt(element.style.zIndex) < 2500) {
    element.style.zIndex = "2500";
  }
};

window.createSubtitleMenu = function (closeCallback) {
  const menu = document.createElement("div");
  menu.className = "settings-menu subtitle-settings-menu";
  menu.style.cssText = `
        position: absolute;
        background: rgba(28, 28, 28, 0.9);
        right: 12px;
        border-radius: 8px;
        padding: 0;
        z-index: 2000;
        display: none;
        width: 300px;
        font-family: Roboto, Arial, sans-serif;
        color: #fff;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
    `;

  // Create back button and header
  const header = document.createElement("div");
  header.className = "subtitle-menu-header";
  header.style.cssText = `
        padding: 12px 24px;
        font-size: 13px;
        display: flex;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    `;

  const backButton = document.createElement("span");
  backButton.innerHTML = "◄";
  backButton.style.cssText = `
        cursor: pointer;
        margin-right: 12px;
        color: #aaa;
    `;
  backButton.addEventListener("click", () => {
    if (menu.observer) {
      menu.observer.disconnect();
      delete menu.observer;
    }
    if (typeof closeCallback === "function") {
      closeCallback();
    }
  });

  const headerText = document.createElement("span");
  headerText.textContent = "Subtitle Options";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  menu.appendChild(header);

  // Create options container
  const optionsContainer = document.createElement("div");
  optionsContainer.style.padding = "8px 0";

  // Helper function to create menu items
  function createMenuItem(text, clickHandler) {
    const item = document.createElement("div");
    item.className = "settings-item";
    item.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const optionText = document.createElement("span");
    optionText.textContent = text;
    optionText.style.color = "#ffffff"; // White text color

    const valueText = document.createElement("span");
    valueText.textContent = "►";
    valueText.style.color = "#aaa";

    item.appendChild(optionText);
    item.appendChild(valueText);

    item.addEventListener("mouseover", () => {
      item.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    item.addEventListener("mouseout", () => {
      item.style.backgroundColor = "transparent";
    });

    if (clickHandler) {
      item.addEventListener("click", clickHandler);
    }

    return item;
  }

  // --- General Subtitles options ---

  // Font size option
  const fontSizeItem = createMenuItem("Subtitle Font Size", () => {
    menu.style.display = "none";
    const fontSizeSubmenu = window.createFontSizeSubmenu(menu);
    const player = document.querySelector(".html5-video-player");
    if (player && !player.contains(fontSizeSubmenu)) {
      player.appendChild(fontSizeSubmenu);
    }

    window.placeNearControls(fontSizeSubmenu);
    fontSizeSubmenu.style.display = "block";
  });
  optionsContainer.appendChild(fontSizeItem);

  // Font color option
  const fontColorItem = createMenuItem("Subtitle Text Color", () => {
    menu.style.display = "none";
    const fontColorSubmenu = window.createFontColorSubmenu(menu);
    const player = document.querySelector(".html5-video-player");
    if (player && !player.contains(fontColorSubmenu)) {
      player.appendChild(fontColorSubmenu);
    }

    window.placeNearControls(fontColorSubmenu);
    fontColorSubmenu.style.display = "block";
  });
  optionsContainer.appendChild(fontColorItem);

  // Font opacity option
  const fontOpacityItem = createMenuItem("Subtitle Text Opacity", () => {
    menu.style.display = "none";
    const fontOpacitySubmenu = window.createFontOpacitySubmenu(menu);
    const player = document.querySelector(".html5-video-player");
    if (player && !player.contains(fontOpacitySubmenu)) {
      player.appendChild(fontOpacitySubmenu);
    }

    window.placeNearControls(fontOpacitySubmenu);
    fontOpacitySubmenu.style.display = "block";
  });
  optionsContainer.appendChild(fontOpacityItem);

  // --- Current Word Highlight options ---

  // Word highlight text color option
  const wordHighlightTextItem = createMenuItem(
    "Highlighted Word Text Color",
    () => {
      menu.style.display = "none";
      const wordHighlightTextColorSubmenu =
        window.createWordHighlightTextColorSubmenu(menu);
      const player = document.querySelector(".html5-video-player");
      if (player && !player.contains(wordHighlightTextColorSubmenu)) {
        player.appendChild(wordHighlightTextColorSubmenu);
      }

      window.placeNearControls(wordHighlightTextColorSubmenu);
      wordHighlightTextColorSubmenu.style.display = "block";
    }
  );
  optionsContainer.appendChild(wordHighlightTextItem);

  // Highlight background color option
  const highlightColorItem = createMenuItem(
    "Highlighted Word Background Color",
    () => {
      menu.style.display = "none";
      const highlightColorSubmenu = window.createHighlightColorSubmenu(menu);
      const player = document.querySelector(".html5-video-player");
      if (player && !player.contains(highlightColorSubmenu)) {
        player.appendChild(highlightColorSubmenu);
      }

      window.placeNearControls(highlightColorSubmenu);
      highlightColorSubmenu.style.display = "block";
    }
  );
  optionsContainer.appendChild(highlightColorItem);

  // Highlight opacity option
  const highlightOpacityItem = createMenuItem(
    "Highlighted Word Background Opacity",
    () => {
      menu.style.display = "none";
      const highlightOpacitySubmenu =
        window.createHighlightOpacitySubmenu(menu);
      const player = document.querySelector(".html5-video-player");
      if (player && !player.contains(highlightOpacitySubmenu)) {
        player.appendChild(highlightOpacitySubmenu);
      }

      window.placeNearControls(highlightOpacitySubmenu);
      highlightOpacitySubmenu.style.display = "block";
    }
  );
  optionsContainer.appendChild(highlightOpacityItem);

  // --- Subtitle Background options ---

  // Background color option
  const backgroundColorItem = createMenuItem(
    "Subtitle Box Background Color",
    () => {
      menu.style.display = "none";
      const backgroundColorSubmenu = window.createBackgroundColorSubmenu(menu);
      const player = document.querySelector(".html5-video-player");
      if (player && !player.contains(backgroundColorSubmenu)) {
        player.appendChild(backgroundColorSubmenu);
      }

      window.placeNearControls(backgroundColorSubmenu);
      backgroundColorSubmenu.style.display = "block";
    }
  );
  optionsContainer.appendChild(backgroundColorItem);

  // Background opacity option
  const backgroundOpacityItem = createMenuItem(
    "Subtitle Box Background Opacity",
    () => {
      menu.style.display = "none";

      const backgroundOpacitySubmenu =
        window.createBackgroundOpacitySubmenu(menu);

      const player = document.querySelector(".html5-video-player");
      if (player && !player.contains(backgroundOpacitySubmenu)) {
        player.appendChild(backgroundOpacitySubmenu);
      }

      window.placeNearControls(backgroundOpacitySubmenu);
      backgroundOpacitySubmenu.style.display = "block";
    }
  );
  optionsContainer.appendChild(backgroundOpacityItem);

  // Subtitle Location option
  const subtitleLocationItem = createMenuItem("Subtitle Location", async () => {
    menu.style.display = "none";

    // 🔍 DEBUG: Check state before opening
    console.log("[SubtitleMenu] 🔍 DEBUG: Opening Subtitle Location menu");
    console.log(
      "[SubtitleMenu] 🔍 window.subtitleLocationState:",
      window.subtitleLocationState
    );
    console.log(
      "[SubtitleMenu] 🔍 userSelectedValue:",
      window.subtitleLocationState?.userSelectedValue
    );
    console.log(
      "[SubtitleMenu] 🔍 currentValue:",
      window.subtitleLocationState?.currentValue
    );

    // Import the module
    const { createSubtitleLocationSubmenu } = await import(
      "./subtitleLocationMenu.js"
    );

    // Check if submenu already exists to prevent memory leaks
    let locationSubmenu = document.querySelector(".subtitle-location-submenu");

    if (!locationSubmenu) {
      // Create new submenu only if it doesn't exist
      const currentValue = window.subtitleLocationState?.currentValue ?? 10;
      console.log(
        `[SubtitleMenu] 🔍 Creating NEW submenu with value: ${currentValue}%`
      );
      locationSubmenu = createSubtitleLocationSubmenu(menu, currentValue);

      const player = document.querySelector(".html5-video-player");
      if (player) {
        player.appendChild(locationSubmenu);
      }
    } else {
      // Update the selected value in existing submenu
      const currentValue = window.subtitleLocationState?.currentValue ?? 10;
      console.log(
        `[SubtitleMenu] 🔍 Updating EXISTING submenu to show ${currentValue}%`
      );
      const allButtons = locationSubmenu.querySelectorAll(
        ".subtitle-location-value"
      );

      allButtons.forEach((btn) => {
        const btnValue = parseInt(
          btn.textContent.replace("%", "").replace(" ✓", "").trim()
        );
        btn.classList.remove("selected");
        btn.style.color = "#fff";
        btn.style.borderColor = "rgba(255, 255, 255, 0.2)";
        btn.style.background = "transparent";
        btn.textContent = btnValue + "%";

        if (btnValue === currentValue) {
          btn.classList.add("selected");
          btn.textContent = btnValue + "% ✓";
          btn.style.color = "#3ea6ff";
          btn.style.borderColor = "#3ea6ff";
          btn.style.borderColor = "#3ea6ff";
        }
      });
    }

    window.placeNearControls(locationSubmenu);
    locationSubmenu.style.display = "block";
  });
  optionsContainer.appendChild(subtitleLocationItem);

  menu.appendChild(optionsContainer);

  // Prevent menu closing when clicking inside
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Update menu position when shown
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === "style" &&
        mutation.target === menu &&
        menu.style.display === "block"
      ) {
        window.placeNearControls(menu);
      }
    });
  });

  observer.observe(menu, {
    attributes: true,
    attributeFilter: ["style"],
  });

  // Store observer reference for cleanup
  menu.observer = observer;

  return menu;
};
