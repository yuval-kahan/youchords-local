// sliderUIComponent.js
// Helper function to display value tooltip - moved outside to be globally accessible
window.displayValueTooltip = function(slider, value, type) {
    // Remove any existing tooltip
    const existingTooltip = document.querySelector('.slider-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'slider-tooltip';
    
    // Format the value with sign and unit
    const sign = value > 0 ? '+' : '';
    const formattedValue = `${sign}${value} seconds`;
    
    tooltip.textContent = formattedValue;
    tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        top: -30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        white-space: nowrap;
    `;
    
    // Append tooltip to the slider's parent container
    slider.parentNode.appendChild(tooltip);
};

window.createBaseSlider = function(type) {
    const container = document.createElement('div');
    container.className = 'timing-slider-container';
    container.style.cssText = `
        flex: 1;
        margin-left: -5px;
        min-width: 140px;
        position: relative;
        display: flex;
        align-items: center;
        gap: 2px;
    `;

    // Minus button
    const minusBtn = document.createElement('button');
    minusBtn.textContent = '-';
    minusBtn.className = 'timing-button';
    minusBtn.style.cssText = `
        width: 20px;
        height: 24px;
        background: none;
        border: none;
        color: white;
        font-size: 16px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.8;
        transition: opacity 0.2s;
    `;

    // Slider wrapper for proper positioning
    const sliderWrapper = document.createElement('div');
    sliderWrapper.style.cssText = `
        flex: 1;
        position: relative;
        height: 32px;
        display: flex;
        align-items: center;
        margin-right: 10px;
    `;

    // Track line
    const trackLine = document.createElement('div');
    trackLine.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 3px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 1.5px;
        transform: translateY(-50%);
        pointer-events: none;
    `;

    // Slider input
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-180';
    slider.max = '180';
    slider.step = '0.5';
    slider.value = '0';
    slider.className = `timing-slider ${type}-timing-slider`;
    slider.style.cssText = `
        width: 100%;
        -webkit-appearance: none;
        height: 4px;
        background: transparent;
        margin: 0;
        padding: 0;
        position: relative;
        z-index: 1;
        margin-left: 8px;
    `;
    slider.removeAttribute('title');

    // Plus button
    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+';
    plusBtn.className = 'timing-button';
    plusBtn.style.cssText = `
        width: 20px;
        height: 24px;
        background: none;
        border: none;
        color: white;
        font-size: 16px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.8;
        transition: opacity 0.2s;
        margin-left: -8px;
    `;

    // Add hover effects for buttons
    [minusBtn, plusBtn].forEach(btn => {
        btn.addEventListener('mouseover', () => btn.style.opacity = '1');
        btn.addEventListener('mouseout', () => btn.style.opacity = '0.8');
    });

    // Add input handler to display current value
    slider.addEventListener('input', function() {
        if (!window._skipTooltipDisplay) {
            window.displayValueTooltip(this, this.value, type);
        }
    });
    
    // Add mouseover handler to display current value on hover
    slider.addEventListener('mouseover', function() {
        window.displayValueTooltip(this, this.value, type);
    });
    
    // Remove tooltip when mouse leaves the slider
    slider.addEventListener('mouseout', function() {
        const tooltip = document.querySelector('.slider-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    });
    
    // Keep the old mouseup handler for consistency
    slider.addEventListener('mouseup', function() {
        setTimeout(() => {
            const tooltip = document.querySelector('.slider-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        }, 1000);
    });

    // Button click handlers
    minusBtn.addEventListener('click', () => {
        const currentValue = parseFloat(slider.value);
        const newValue = Math.max(parseFloat(slider.min), currentValue - parseFloat(slider.step));
        slider.value = newValue;
        
        // Display the value tooltip when changing via button
        window.displayValueTooltip(slider, newValue, type);
        
        // Trigger the input event so that the onChange handler is called
        slider.dispatchEvent(new Event('input'));
        
        // Hide the tooltip after a delay
        setTimeout(() => {
            const tooltip = document.querySelector('.slider-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        }, 1000);
    });

    plusBtn.addEventListener('click', () => {
        const currentValue = parseFloat(slider.value);
        const newValue = Math.min(parseFloat(slider.max), currentValue + parseFloat(slider.step));
        slider.value = newValue;
        
        // Display the value tooltip when changing via button
        window.displayValueTooltip(slider, newValue, type);
        
        // Trigger the input event so that the onChange handler is called
        slider.dispatchEvent(new Event('input'));
        
        // Hide the tooltip after a delay
        setTimeout(() => {
            const tooltip = document.querySelector('.slider-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        }, 1000);
    });

    // Add specific slider styles to document if not already added
    if (!document.getElementById('slider-styles')) {
        const style = document.createElement('style');
        style.id = 'slider-styles';
        style.textContent = `
            .timing-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: white;
                cursor: pointer;
                position: relative;
                z-index: 1;
                transition: transform 0.2s;
            }

            .timing-slider::-moz-range-thumb {
                width: 12px;
                height: 12px;
                border: none;
                border-radius: 50%;
                background: white;
                cursor: pointer;
                position: relative;
                z-index: 1;
                transition: transform 0.2s;
            }

            .timing-slider::-webkit-slider-runnable-track,
            .timing-slider::-moz-range-track {
                width: 100%;
                height: 3px;
                cursor: pointer;
                background: transparent;
                border: none;
            }

            .timing-slider:hover::-webkit-slider-thumb,
            .timing-slider:hover::-moz-range-thumb {
                transform: scale(1.2);
            }
        `;
        document.head.appendChild(style);
    }

    // Assemble the components
    sliderWrapper.appendChild(trackLine);
    sliderWrapper.appendChild(slider);
    container.appendChild(minusBtn);
    container.appendChild(sliderWrapper);
    container.appendChild(plusBtn);

    return {
        container,
        slider,
        minusBtn,
        plusBtn
    };
};

// Create a reset button for individual sliders
window.createResetButton = function(type) {
    const resetBtn = document.createElement('button');
    resetBtn.className = `${type}-reset-button reset-individual-button`;
    resetBtn.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        margin-right: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
    `;
    
    // Create a clearer reset icon (circular arrow)
    resetBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11" fill="#ff4444"/>
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z" fill="white"/>
        </svg>
    `;
    
    // Add click handler to reset the specific slider and update the database
    resetBtn.addEventListener('click', () => {
        // Get current video ID correctly using extractVideoId
        const videoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
        if (!videoId) {
            console.error('Cannot reset slider: videoId is missing');
            return;
        }
        
        // Find the related slider by type
        const slider = document.querySelector(`.${type}-timing-slider`);
        if (slider) {
            // Reset slider value to 0
            slider.value = 0;
            
            // Remove any existing tooltip first
            const existingTooltip = document.querySelector('.slider-tooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }
            
            // Create and display a custom tooltip that we'll control directly
            const tooltip = document.createElement('div');
            tooltip.className = 'slider-tooltip';
            tooltip.textContent = '0 seconds';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                top: -30px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 1000;
                white-space: nowrap;
            `;
            slider.parentNode.appendChild(tooltip);
            
            // Visual feedback - change icon color to green temporarily
            const circle = resetBtn.querySelector('circle');
            const originalColor = circle.getAttribute('fill');
            circle.setAttribute('fill', '#4CAF50'); // Change to green
            
            // Change back to original color after a short delay
            setTimeout(() => {
                circle.setAttribute('fill', originalColor);
                
                // Remove our custom tooltip at the same time
                if (tooltip && tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            }, 800); // 800ms delay before changing back
            
            // Trigger the input event after setting the value, but prevent it from showing its own tooltip
            // We'll use a flag to temporarily disable the automatic tooltip display
            window._skipTooltipDisplay = true;
            slider.dispatchEvent(new Event('input'));
            setTimeout(() => {
                window._skipTooltipDisplay = false;
            }, 850); // Slightly longer than the green icon duration
            
            // Update database with reset value
            window.databaseManager.updateTimingOffset(type === 'subtitle' ? 'subtitles' : type, videoId, 0)
                .then(success => {
                    if (success) {
                        console.log(`Reset ${type} timing offset to 0 for video ${videoId}`);
                    } else {
                        console.error(`Failed to reset ${type} timing offset in database`);
                    }
                });
        }
    });
    
    return resetBtn;
};

// audioAdjustment.js
window.createAudioAdjustmentSlider = function() {
    const { container, slider } = window.createBaseSlider('audio');
    
    slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        // Audio adjustment logic would go here
        console.log('Audio adjustment:', value);
    });

    return container;
};

// chordsAdjustment.js
window.createChordsAdjustmentSlider = function() {
    const { container, slider } = window.createBaseSlider('chords');
    
    slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        // Chords adjustment logic would go here
        console.log('Chords adjustment:', value);
    });

    return container;
};

// subtitleAdjustment.js
window.createSubtitleAdjustmentSlider = function() {
    const { container, slider } = window.createBaseSlider('subtitle');
    
    slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        // Subtitle adjustment logic would go here
        console.log('Subtitle adjustment:', value);
    });

    return container;
};
