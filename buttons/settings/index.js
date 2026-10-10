// Get functions from window and re-expose if needed
(function() {
    const createSubtitleMenu = window.createSubtitleMenu;
    const createSettingsButton = window.createSettingsButton;
    const createProgressBarsSubmenu = window.createProgressBarsSubmenu;
    const createActiveChordPositionSubmenu = window.createActiveChordPositionSubmenu;
    const createChordsLocationSubmenu = window.createChordsLocationSubmenu;
    const createCarouselColorsSubmenu = window.createCarouselColorsSubmenu;
    const createSizesSubmenu = window.createSizesSubmenu;
    
    // Lyrics & Chords submenu functions
    const createLyricsAndChordsPastWordsSubmenu = window.createLyricsAndChordsPastWordsSubmenu;
    const createLyricsAndChordsPanelWidthSubmenu = window.createLyricsAndChordsPanelWidthSubmenu;

    // Re-expose them if needed (though they should already be there)
    if (!window.createSubtitleMenu) {
        window.createSubtitleMenu = createSubtitleMenu;
    }

    if (!window.createSettingsButton) {
        window.createSettingsButton = createSettingsButton;
    }
    
    if (!window.createProgressBarsSubmenu) {
        window.createProgressBarsSubmenu = createProgressBarsSubmenu;
    }
    
    if (!window.createActiveChordPositionSubmenu) {
        window.createActiveChordPositionSubmenu = createActiveChordPositionSubmenu;
    }
    
    if (!window.createChordsLocationSubmenu) {
        window.createChordsLocationSubmenu = createChordsLocationSubmenu;
    }
    
    if (!window.createCarouselColorsSubmenu) {
        window.createCarouselColorsSubmenu = createCarouselColorsSubmenu;
    }
    
    if (!window.createSizesSubmenu) {
        window.createSizesSubmenu = createSizesSubmenu;
    }
    
    // Re-expose Lyrics & Chords functions
    if (!window.createLyricsAndChordsPastWordsSubmenu) {
        window.createLyricsAndChordsPastWordsSubmenu = createLyricsAndChordsPastWordsSubmenu;
    }
    
    if (!window.createLyricsAndChordsPanelWidthSubmenu) {
        window.createLyricsAndChordsPanelWidthSubmenu = createLyricsAndChordsPanelWidthSubmenu;
    }
})();
