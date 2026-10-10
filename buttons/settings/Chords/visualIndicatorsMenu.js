// visualIndicatorsMenu.js - Visual Indicators Menu for controlling carousel position number visibility

// Global state for visual indicators (defaults)
window.carouselPositionNumberEnabled = window.carouselPositionNumberEnabled ?? true;
window.countdownTimerEnabled = window.countdownTimerEnabled ?? true;
window.singingStartDotEnabled = window.singingStartDotEnabled ?? true;
window.additionalFretNumbers = window.additionalFretNumbers ?? 'none'; // 'none', 'one', 'all'
window.singingDotSizeSubtitles = window.singingDotSizeSubtitles ?? 7;
window.singingDotSizeChords = window.singingDotSizeChords ?? 7.75;
window.singingDotColor = window.singingDotColor ?? '#4CAF50';

// Load saved states from storage immediately on file load
chrome.storage.sync.get(['countdownTimerEnabled', 'singingStartDotEnabled', 'carouselPositionNumberEnabled', 'additionalFretNumbers', 'singingDotSizeSubtitles', 'singingDotSizeChords', 'singingDotColor'], (result) => {
  // Countdown Timer
  if (result.countdownTimerEnabled !== undefined) {
    window.countdownTimerEnabled = result.countdownTimerEnabled;
  }
  
  // Singing Start Dot
  if (result.singingStartDotEnabled !== undefined) {
    window.singingStartDotEnabled = result.singingStartDotEnabled;
    // Apply CSS class based on saved state
    document.body.classList.toggle('yc-singing-dot-hidden', !result.singingStartDotEnabled);
  }
  
  // Carousel Position Number
  if (result.carouselPositionNumberEnabled !== undefined) {
    window.carouselPositionNumberEnabled = result.carouselPositionNumberEnabled;
    if (result.carouselPositionNumberEnabled) {
      document.body.classList.add('yc-carousel-position-always-visible');
    } else {
      document.body.classList.remove('yc-carousel-position-always-visible');
    }
  }
  
  // Additional Fret Numbers
  if (result.additionalFretNumbers !== undefined) {
    window.additionalFretNumbers = result.additionalFretNumbers;
  }
  
  // Singing Dot Size in Subtitles
  if (result.singingDotSizeSubtitles !== undefined) {
    window.singingDotSizeSubtitles = result.singingDotSizeSubtitles;
    applyDotSizeSubtitlesGlobal(result.singingDotSizeSubtitles);
  }
  
  // Singing Dot Size in Chords
  if (result.singingDotSizeChords !== undefined) {
    window.singingDotSizeChords = result.singingDotSizeChords;
    applyDotSizeChordsGlobal(result.singingDotSizeChords);
  }
  
  // Singing Dot Color
  if (result.singingDotColor !== undefined) {
    window.singingDotColor = result.singingDotColor;
    applyDotColorGlobal(result.singingDotColor);
  }
  
  console.log('[VisualIndicators] Loaded from storage:', {
    countdownTimerEnabled: window.countdownTimerEnabled,
    singingStartDotEnabled: window.singingStartDotEnabled,
    carouselPositionNumberEnabled: window.carouselPositionNumberEnabled,
    additionalFretNumbers: window.additionalFretNumbers,
    singingDotSizeSubtitles: window.singingDotSizeSubtitles,
    singingDotSizeChords: window.singingDotSizeChords,
    singingDotColor: window.singingDotColor
  });
});

// Global apply functions for dot settings
function applyDotSizeSubtitlesGlobal(size) {
  let style = document.getElementById('yc-dot-size-subtitles-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'yc-dot-size-subtitles-style';
    document.head.appendChild(style);
  }
  style.textContent = `.yc-ellipse-singing-dot { width: ${size}px !important; height: ${size}px !important; }`;
}

function applyDotSizeChordsGlobal(size) {
  let style = document.getElementById('yc-dot-size-chords-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'yc-dot-size-chords-style';
    document.head.appendChild(style);
  }
  style.textContent = `.yc-singing-start-dot { width: ${size}px !important; height: ${size}px !important; }`;
}

function applyDotColorGlobal(color) {
  let style = document.getElementById('yc-dot-color-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'yc-dot-color-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    .yc-singing-start-dot { background: ${color} !important; box-shadow: 0 0 4px ${color}80 !important; }
    .yc-ellipse-singing-dot { background: ${color} !important; box-shadow: 0 0 4px ${color}80 !important; }
  `;
}

/**
 * Updates the carousel position number visibility state
 * @param {boolean} isEnabled - true = always show, false = hover only
 * @param {boolean} keepSubmenuOpen - whether to keep the submenu open after update
 */
window.updateCarouselPositionNumber = function(isEnabled, keepSubmenuOpen = false) {
  // Update global state
  window.carouselPositionNumberEnabled = isEnabled;
  
  // Save to storage
  chrome.storage.sync.set({ carouselPositionNumberEnabled: isEnabled }).then(() => {
    console.log(`[VisualIndicators] Saved to storage: ${isEnabled}`);
  }).catch(err => {
    console.warn('[VisualIndicators] Failed to save:', err);
  });
  
  // Update body class
  if (isEnabled) {
    document.body.classList.add('yc-carousel-position-always-visible');
  } else {
    document.body.classList.remove('yc-carousel-position-always-visible');
  }
  
  // Update UI
  updateCarouselPositionNumberState(isEnabled);
  
  // Close submenu after delay if not keeping open
  if (!keepSubmenuOpen) {
    const timeoutId = setTimeout(() => {
      const parent = document.querySelector('.chords-submenu');
      const self = document.querySelector('.visual-indicators-submenu');
      if (self) self.style.display = 'none';
      if (parent) parent.style.display = 'block';
    }, 100);
    
    // Store timeout ID for cleanup
    const submenu = document.querySelector('.visual-indicators-submenu');
    if (submenu) {
      if (!submenu.pendingTimeouts) {
        submenu.pendingTimeouts = new Set();
      }
      submenu.pendingTimeouts.add(timeoutId);
    }
  }
};

/**
 * Updates the toggle UI to reflect current state
 * @param {boolean} isEnabled - current state
 */
function updateCarouselPositionNumberState(isEnabled) {
  // Cache the submenu to access cached toggle element
  const submenu = document.querySelector('.visual-indicators-submenu');
  if (!submenu) return;
  
  // Use cached toggle if available, otherwise query
  const toggle = submenu.cachedToggle || document.querySelector('.carousel-position-number-toggle');
  if (!toggle) return;
  
  toggle.style.backgroundColor = isEnabled ? '#3ea6ff' : '#666';
  
  const toggleButton = toggle.querySelector('div');
  if (toggleButton) {
    toggleButton.style.transform = `translateX(${isEnabled ? '20px' : '0'})`;
  }
  
  const status = toggle.parentElement?.querySelector('span:last-child');
  if (status) {
    status.textContent = isEnabled ? 'ON' : 'OFF';
    status.style.color = isEnabled ? '#3ea6ff' : '#666';
  }
}

window.updateCarouselPositionNumberState = updateCarouselPositionNumberState;

/**
 * Creates a generic toggle switch component
 * @param {string} className - CSS class for the toggle
 * @param {boolean} initialState - initial state
 * @param {function} onChange - callback when state changes
 */
function createGenericToggle(className, initialState, onChange) {
  const toggleContainer = document.createElement('div');
  toggleContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  let currentState = initialState;
  
  const toggle = document.createElement('div');
  toggle.className = className;
  toggle.style.cssText = `
    width: 40px;
    height: 20px;
    background-color: ${initialState ? '#3ea6ff' : '#666'};
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    transition: background-color 0.3s ease;
  `;
  
  const toggleButton = document.createElement('div');
  toggleButton.style.cssText = `
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.3s ease;
    transform: translateX(${initialState ? '20px' : '0'});
  `;
  
  const status = document.createElement('span');
  status.textContent = initialState ? 'ON' : 'OFF';
  status.style.cssText = `
    color: ${initialState ? '#3ea6ff' : '#666'};
    font-size: 12px;
    font-weight: 500;
  `;
  
  toggle.appendChild(toggleButton);
  toggleContainer.appendChild(toggle);
  toggleContainer.appendChild(status);
  
  const clickHandler = (event) => {
    event.stopPropagation();
    currentState = !currentState;
    
    // Update UI
    toggle.style.backgroundColor = currentState ? '#3ea6ff' : '#666';
    toggleButton.style.transform = `translateX(${currentState ? '20px' : '0'})`;
    status.textContent = currentState ? 'ON' : 'OFF';
    status.style.color = currentState ? '#3ea6ff' : '#666';
    
    onChange?.(currentState);
  };
  
  toggle.addEventListener('click', clickHandler);
  
  const cleanup = () => {
    toggle.removeEventListener('click', clickHandler);
  };
  
  return { toggleContainer, toggle, cleanup };
}

/**
 * Creates a toggle switch component (legacy wrapper)
 */
function createToggleSwitch(initialState, onChange) {
  return createGenericToggle('carousel-position-number-toggle', initialState, onChange);
}

/**
 * Creates the Visual Indicators submenu
 */
window.createVisualIndicatorsSubmenu = function(parentMenu) {
  const submenu = document.createElement('div');
  submenu.className = 'settings-menu visual-indicators-submenu';
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.9);
    right: 12px;
    border-radius: 8px;
    padding: 0;
    z-index: 2001;
    width: 300px;
    font-family: Roboto, Arial, sans-serif;
    color: #fff;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    display: none;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  `;
  
  // Header with back button
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;
  
  const backButton = document.createElement('span');
  backButton.innerHTML = '◄';
  backButton.style.cssText = `
    cursor: pointer;
    margin-right: 12px;
    color: #aaa;
  `;
  
  // Store back button click handler for cleanup
  const backButtonClickHandler = (event) => {
    event.stopPropagation(); // מניעת התפשטות האירוע למאזין הגלובלי
    submenu.style.display = 'none';
    if (parentMenu) parentMenu.style.display = 'block';
  };
  
  backButton.addEventListener('click', backButtonClickHandler);
  
  // Store handler for cleanup
  submenu.backButtonClickHandler = backButtonClickHandler;
  submenu.backButton = backButton;
  
  const headerText = document.createElement('span');
  headerText.textContent = 'Visual Indicators';
  headerText.style.fontWeight = '500';
  
  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);
  
  // Options container
  const optionsContainer = document.createElement('div');
  optionsContainer.style.padding = '8px 0';
  
  // Carousel Position Number toggle option
  const positionNumberOption = document.createElement('div');
  positionNumberOption.className = 'settings-item';
  positionNumberOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  `;
  
  // Prevent menu close on click
  positionNumberOption.addEventListener('click', (e) => e.stopPropagation());
  
  // Hover effect
  positionNumberOption.addEventListener('mouseover', () => {
    positionNumberOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  });
  positionNumberOption.addEventListener('mouseout', () => {
    positionNumberOption.style.backgroundColor = 'transparent';
  });
  
  const positionNumberText = document.createElement('div');
  positionNumberText.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 2px;
  `;
  
  const line1 = document.createElement('span');
  line1.textContent = 'Always Show Carousel';
  line1.style.color = '#ffffff';
  
  const line2 = document.createElement('span');
  line2.textContent = 'Position Number';
  line2.style.color = '#ffffff';
  
  positionNumberText.appendChild(line1);
  positionNumberText.appendChild(line2);
  positionNumberOption.appendChild(positionNumberText);
  
  // Get initial state from storage
  chrome.storage.sync.get(['carouselPositionNumberEnabled'], (result) => {
    if (!submenu.isConnected) return;
    
    const isEnabled = result.carouselPositionNumberEnabled ?? true;
    window.carouselPositionNumberEnabled = isEnabled;
    
    // Apply initial state to body
    if (isEnabled) {
      document.body.classList.add('yc-carousel-position-always-visible');
    } else {
      document.body.classList.remove('yc-carousel-position-always-visible');
    }
    
    // Create toggle switch
    const toggleResult = createToggleSwitch(isEnabled, (newState) => {
      window.updateCarouselPositionNumber(newState, true);
    });
    
    positionNumberOption.appendChild(toggleResult.toggleContainer);
    
    // Cache the toggle element for performance
    submenu.cachedToggle = toggleResult.toggleContainer.querySelector('.carousel-position-number-toggle');
    
    // Store cleanup function
    if (!submenu.toggleCleanups) {
      submenu.toggleCleanups = [];
    }
    submenu.toggleCleanups.push(toggleResult.cleanup);
  });
  
  optionsContainer.appendChild(positionNumberOption);
  
  // --- Countdown Timer Toggle ---
  const countdownOption = document.createElement('div');
  countdownOption.className = 'settings-item';
  countdownOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  `;
  
  // Prevent menu close on click
  countdownOption.addEventListener('click', (e) => e.stopPropagation());
  
  // Hover effect
  countdownOption.addEventListener('mouseover', () => {
    countdownOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  });
  countdownOption.addEventListener('mouseout', () => {
    countdownOption.style.backgroundColor = 'transparent';
  });
  
  const countdownText = document.createElement('span');
  countdownText.textContent = 'Countdown Timer';
  countdownText.style.color = '#ffffff';
  countdownOption.appendChild(countdownText);
  
  // Get initial state from storage
  chrome.storage.sync.get(['countdownTimerEnabled'], (result) => {
    if (!submenu.isConnected) return;
    
    const isEnabled = result.countdownTimerEnabled ?? true;
    window.countdownTimerEnabled = isEnabled;
    
    const toggleResult = createGenericToggle('countdown-timer-toggle', isEnabled, (newState) => {
      window.countdownTimerEnabled = newState;
      chrome.storage.sync.set({ countdownTimerEnabled: newState });
      
      // Immediately update subtitles display
      if (window.CarouselSubtitles?.activeInstance?.isVisible) {
        const video = document.querySelector('video');
        if (video) {
          window.CarouselSubtitles.activeInstance._renderSubtitles(video.currentTime);
        }
      }
      
      console.log(`[VisualIndicators] Countdown Timer: ${newState}`);
    });
    
    countdownOption.appendChild(toggleResult.toggleContainer);
    
    if (!submenu.toggleCleanups) {
      submenu.toggleCleanups = [];
    }
    submenu.toggleCleanups.push(toggleResult.cleanup);
  });
  
  optionsContainer.appendChild(countdownOption);
  
  // --- Singing Start Dot Toggle ---
  const singingDotOption = document.createElement('div');
  singingDotOption.className = 'settings-item';
  singingDotOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  `;
  
  // Prevent menu close on click
  singingDotOption.addEventListener('click', (e) => e.stopPropagation());
  
  // Hover effect
  singingDotOption.addEventListener('mouseover', () => {
    singingDotOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  });
  singingDotOption.addEventListener('mouseout', () => {
    singingDotOption.style.backgroundColor = 'transparent';
  });
  
  const singingDotText = document.createElement('span');
  singingDotText.textContent = 'Singing Start Dot';
  singingDotText.style.color = '#ffffff';
  singingDotOption.appendChild(singingDotText);
  
  // Get initial state from storage
  chrome.storage.sync.get(['singingStartDotEnabled'], (result) => {
    if (!submenu.isConnected) return;
    
    const isEnabled = result.singingStartDotEnabled ?? true;
    window.singingStartDotEnabled = isEnabled;
    
    // Apply initial state - hide/show dots
    document.body.classList.toggle('yc-singing-dot-hidden', !isEnabled);
    
    const toggleResult = createGenericToggle('singing-start-dot-toggle', isEnabled, (newState) => {
      window.singingStartDotEnabled = newState;
      chrome.storage.sync.set({ singingStartDotEnabled: newState });
      
      // Toggle visibility via CSS class
      document.body.classList.toggle('yc-singing-dot-hidden', !newState);
      
      console.log(`[VisualIndicators] Singing Start Dot: ${newState}`);
    });
    
    singingDotOption.appendChild(toggleResult.toggleContainer);
    
    if (!submenu.toggleCleanups) {
      submenu.toggleCleanups = [];
    }
    submenu.toggleCleanups.push(toggleResult.cleanup);
  });
  
  optionsContainer.appendChild(singingDotOption);
  
  // --- Singing Dot Size in Subtitles ---
  const dotSizeSubtitlesOption = document.createElement('div');
  dotSizeSubtitlesOption.className = 'settings-item';
  dotSizeSubtitlesOption.style.cssText = `
    padding: 8px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  `;
  
  // Prevent menu close on click
  dotSizeSubtitlesOption.addEventListener('click', (e) => e.stopPropagation());
  
  // Hover effect
  dotSizeSubtitlesOption.addEventListener('mouseover', () => {
    dotSizeSubtitlesOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  });
  dotSizeSubtitlesOption.addEventListener('mouseout', () => {
    dotSizeSubtitlesOption.style.backgroundColor = 'transparent';
  });
  
  const dotSizeSubtitlesText = document.createElement('span');
  dotSizeSubtitlesText.textContent = 'Dot Size (Subtitles)';
  dotSizeSubtitlesText.style.cssText = 'color: #ffffff; font-size: 13px;';
  dotSizeSubtitlesOption.appendChild(dotSizeSubtitlesText);
  
  const dotSizeSubtitlesControls = document.createElement('div');
  dotSizeSubtitlesControls.style.cssText = 'display: flex; align-items: center; gap: 6px;';
  
  const dotSizeSubtitlesMinus = document.createElement('button');
  dotSizeSubtitlesMinus.textContent = '−';
  dotSizeSubtitlesMinus.style.cssText = `
    width: 24px; height: 24px; border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1); color: #fff; border-radius: 4px;
    cursor: pointer; font-size: 14px; font-weight: bold;
  `;
  
  const dotSizeSubtitlesValue = document.createElement('span');
  dotSizeSubtitlesValue.style.cssText = `
    min-width: 30px; text-align: center; font-size: 12px; color: #fff;
    background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;
  `;
  
  const dotSizeSubtitlesPlus = document.createElement('button');
  dotSizeSubtitlesPlus.textContent = '+';
  dotSizeSubtitlesPlus.style.cssText = dotSizeSubtitlesMinus.style.cssText;
  
  // Load and apply
  chrome.storage.sync.get(['singingDotSizeSubtitles'], (result) => {
    if (!submenu.isConnected) return;
    const size = result.singingDotSizeSubtitles ?? 7;
    window.singingDotSizeSubtitles = size;
    dotSizeSubtitlesValue.textContent = size;
    applyDotSizeSubtitles(size);
  });
  
  function applyDotSizeSubtitles(size) {
    let style = document.getElementById('yc-dot-size-subtitles-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'yc-dot-size-subtitles-style';
      document.head.appendChild(style);
    }
    style.textContent = `.yc-ellipse-singing-dot { width: ${size}px !important; height: ${size}px !important; }`;
  }
  
  const updateDotSizeSubtitles = (delta) => {
    let size = (window.singingDotSizeSubtitles ?? 7) + delta;
    size = Math.max(2, Math.min(20, size));
    window.singingDotSizeSubtitles = size;
    dotSizeSubtitlesValue.textContent = size;
    chrome.storage.sync.set({ singingDotSizeSubtitles: size });
    applyDotSizeSubtitles(size);
  };
  
  dotSizeSubtitlesMinus.addEventListener('click', (e) => { e.stopPropagation(); updateDotSizeSubtitles(-0.25); });
  dotSizeSubtitlesPlus.addEventListener('click', (e) => { e.stopPropagation(); updateDotSizeSubtitles(0.25); });
  
  dotSizeSubtitlesControls.appendChild(dotSizeSubtitlesMinus);
  dotSizeSubtitlesControls.appendChild(dotSizeSubtitlesValue);
  dotSizeSubtitlesControls.appendChild(dotSizeSubtitlesPlus);
  dotSizeSubtitlesOption.appendChild(dotSizeSubtitlesControls);
  optionsContainer.appendChild(dotSizeSubtitlesOption);
  
  // --- Singing Dot Size in Chords ---
  const dotSizeChordsOption = document.createElement('div');
  dotSizeChordsOption.className = 'settings-item';
  dotSizeChordsOption.style.cssText = `
    padding: 8px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  `;
  
  // Prevent menu close on click
  dotSizeChordsOption.addEventListener('click', (e) => e.stopPropagation());
  
  // Hover effect
  dotSizeChordsOption.addEventListener('mouseover', () => {
    dotSizeChordsOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  });
  dotSizeChordsOption.addEventListener('mouseout', () => {
    dotSizeChordsOption.style.backgroundColor = 'transparent';
  });
  
  const dotSizeChordsText = document.createElement('span');
  dotSizeChordsText.textContent = 'Dot Size (Chords)';
  dotSizeChordsText.style.cssText = 'color: #ffffff; font-size: 13px;';
  dotSizeChordsOption.appendChild(dotSizeChordsText);
  
  const dotSizeChordsControls = document.createElement('div');
  dotSizeChordsControls.style.cssText = 'display: flex; align-items: center; gap: 6px;';
  
  const dotSizeChordsMinus = document.createElement('button');
  dotSizeChordsMinus.textContent = '−';
  dotSizeChordsMinus.style.cssText = `
    width: 24px; height: 24px; border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1); color: #fff; border-radius: 4px;
    cursor: pointer; font-size: 14px; font-weight: bold;
  `;
  
  const dotSizeChordsValue = document.createElement('span');
  dotSizeChordsValue.style.cssText = `
    min-width: 30px; text-align: center; font-size: 12px; color: #fff;
    background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;
  `;
  
  const dotSizeChordsPlus = document.createElement('button');
  dotSizeChordsPlus.textContent = '+';
  dotSizeChordsPlus.style.cssText = dotSizeChordsMinus.style.cssText;
  
  // Load and apply
  chrome.storage.sync.get(['singingDotSizeChords'], (result) => {
    if (!submenu.isConnected) return;
    const size = result.singingDotSizeChords ?? 7.75;
    window.singingDotSizeChords = size;
    dotSizeChordsValue.textContent = size;
    applyDotSizeChords(size);
  });
  
  function applyDotSizeChords(size) {
    let style = document.getElementById('yc-dot-size-chords-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'yc-dot-size-chords-style';
      document.head.appendChild(style);
    }
    style.textContent = `.yc-singing-start-dot { width: ${size}px !important; height: ${size}px !important; }`;
  }
  
  const updateDotSizeChords = (delta) => {
    let size = (window.singingDotSizeChords ?? 7.75) + delta;
    size = Math.max(2, Math.min(20, size));
    window.singingDotSizeChords = size;
    dotSizeChordsValue.textContent = size;
    chrome.storage.sync.set({ singingDotSizeChords: size });
    applyDotSizeChords(size);
  };
  
  dotSizeChordsMinus.addEventListener('click', (e) => { e.stopPropagation(); updateDotSizeChords(-0.25); });
  dotSizeChordsPlus.addEventListener('click', (e) => { e.stopPropagation(); updateDotSizeChords(0.25); });
  
  dotSizeChordsControls.appendChild(dotSizeChordsMinus);
  dotSizeChordsControls.appendChild(dotSizeChordsValue);
  dotSizeChordsControls.appendChild(dotSizeChordsPlus);
  dotSizeChordsOption.appendChild(dotSizeChordsControls);
  optionsContainer.appendChild(dotSizeChordsOption);
  
  // --- Singing Dot Color ---
  const dotColorOption = document.createElement('div');
  dotColorOption.className = 'settings-item';
  dotColorOption.style.cssText = `
    padding: 8px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  `;
  
  // Prevent menu close on click
  dotColorOption.addEventListener('click', (e) => e.stopPropagation());
  
  // Hover effect
  dotColorOption.addEventListener('mouseover', () => {
    dotColorOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  });
  dotColorOption.addEventListener('mouseout', () => {
    dotColorOption.style.backgroundColor = 'transparent';
  });
  
  const dotColorText = document.createElement('span');
  dotColorText.textContent = 'Dot Color';
  dotColorText.style.cssText = 'color: #ffffff; font-size: 13px;';
  dotColorOption.appendChild(dotColorText);
  
  const dotColorInput = document.createElement('input');
  dotColorInput.type = 'color';
  dotColorInput.style.cssText = `
    width: 40px; height: 24px; border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px; cursor: pointer; background: transparent;
  `;
  
  // Load and apply
  chrome.storage.sync.get(['singingDotColor'], (result) => {
    if (!submenu.isConnected) return;
    const color = result.singingDotColor ?? '#4CAF50';
    window.singingDotColor = color;
    dotColorInput.value = color;
    applyDotColor(color);
  });
  
  function applyDotColor(color) {
    let style = document.getElementById('yc-dot-color-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'yc-dot-color-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      .yc-singing-start-dot { background: ${color} !important; box-shadow: 0 0 4px ${color}80 !important; }
      .yc-ellipse-singing-dot { background: ${color} !important; box-shadow: 0 0 4px ${color}80 !important; }
    `;
  }
  
  dotColorInput.addEventListener('input', (e) => {
    e.stopPropagation();
    const color = e.target.value;
    window.singingDotColor = color;
    chrome.storage.sync.set({ singingDotColor: color });
    applyDotColor(color);
  });
  dotColorInput.addEventListener('click', (e) => e.stopPropagation());
  
  dotColorOption.appendChild(dotColorInput);
  optionsContainer.appendChild(dotColorOption);
  
  submenu.appendChild(optionsContainer);
  
  // Position observer
  const observer = new MutationObserver(() => {
    if (submenu.style.display === 'block') {
      const controls = document.querySelector('.ytp-chrome-bottom');
      if (controls) {
        const rect = controls.getBoundingClientRect();
        submenu.style.bottom = `${rect.height + 12}px`;
        submenu.style.right = '12px';
      }
    }
  });
  
  observer.observe(submenu, { attributes: true, attributeFilter: ['style'] });
  submenu.observer = observer;
  
  return submenu;
};

/**
 * Disposes the Visual Indicators submenu
 */
window.disposeVisualIndicatorsSubmenu = function(submenu, remove = false) {
  if (!submenu) return;
  
  // Clear pending timeouts
  if (submenu.pendingTimeouts) {
    submenu.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    submenu.pendingTimeouts.clear();
    delete submenu.pendingTimeouts;
  }
  
  // Disconnect observer
  if (submenu.observer) {
    submenu.observer.disconnect();
    delete submenu.observer;
  }
  
  // Clean up back button listener
  if (submenu.backButton && submenu.backButtonClickHandler) {
    submenu.backButton.removeEventListener('click', submenu.backButtonClickHandler);
    delete submenu.backButtonClickHandler;
    delete submenu.backButton;
  }
  
  // Clean up toggles
  if (submenu.toggleCleanups) {
    submenu.toggleCleanups.forEach(cleanup => cleanup());
    delete submenu.toggleCleanups;
  }
  
  // Clean up hover listeners
  if (submenu.hoverCleanups) {
    submenu.hoverCleanups.forEach(cleanup => cleanup());
    delete submenu.hoverCleanups;
  }
  
  // Clear cached elements
  delete submenu.cachedToggle;
  
  // Remove from DOM if requested
  if (remove && submenu.parentNode) {
    submenu.parentNode.removeChild(submenu);
  }
};
