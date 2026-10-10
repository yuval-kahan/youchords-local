// Gemini AI Transcription Module
// Handles video transcription using Google Gemini API
//
// 📋 Response Format:
// - Default Prompt: Returns structured JSON with timestamps for synced subtitles
//   { success: true, subtitles: [{start: 10, end: 15, text: "..."}], isCustomPrompt: false }
//
// - Custom Prompt: Returns free-form text WITHOUT timestamps (for static display)
//   { success: true, subtitles: [{start: null, end: null, text: "..."}], isCustomPrompt: true, rawResponse: "..." }
//
// 🎨 Panel Display Logic:
// - if (result.isCustomPrompt) → Display as static text (no video sync)
// - else → Display as synced subtitles with timeline

// 🎯 Set to false in production to reduce CPU usage
const DEBUG_GEMINI = false; // 🔍 Set to true only when actively debugging
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_GLOBAL_MODEL_KEY = 'geminiGlobalModel';
const GEMINI_ALLOW_PAID_MODELS_KEY = 'geminiAllowPaidModels';
const PROMPT_DISCLAIMER_KEY = 'promptDisclaimerAccepted';
const MODEL_MODE_GLOBAL = 'global';
const SUPPORTED_GEMINI_MODELS = new Set([
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview'
]);
const PAID_GEMINI_MODELS = new Set();

function normalizeGeminiModelSelection(modelId, { allowGlobal = false, allowPaidModels = false } = {}) {
  if (!modelId || typeof modelId !== 'string') {
    return allowGlobal ? MODEL_MODE_GLOBAL : DEFAULT_GEMINI_MODEL;
  }
  const normalized = modelId.trim();
  if (allowGlobal && normalized === MODEL_MODE_GLOBAL) return MODEL_MODE_GLOBAL;
  if (!allowPaidModels && PAID_GEMINI_MODELS.has(normalized)) {
    return allowGlobal ? MODEL_MODE_GLOBAL : DEFAULT_GEMINI_MODEL;
  }
  return SUPPORTED_GEMINI_MODELS.has(normalized)
    ? normalized
    : (allowGlobal ? MODEL_MODE_GLOBAL : DEFAULT_GEMINI_MODEL);
}

async function isGeminiDisabledByMode() {
  try {
    const result = await chrome.storage.local.get(['aiTranscriptionMode']);
    const mode = result.aiTranscriptionMode || 'off';
    return mode === 'off';
  } catch (error) {
    console.warn('[Gemini] Failed to read aiTranscriptionMode, treating Gemini as disabled:', error);
    return true;
  }
}

async function hasAcceptedGeminiPromptResponsibility() {
  try {
    const result = await chrome.storage.local.get([PROMPT_DISCLAIMER_KEY]);
    return result[PROMPT_DISCLAIMER_KEY] === true;
  } catch (error) {
    console.warn('[Gemini] Failed to read prompt responsibility approval, treating Gemini as blocked:', error);
    return false;
  }
}

function buildPromptResponsibilityBlockedResponse() {
  return {
    success: false,
    error: 'Gemini is blocked until you accept prompt usage responsibility in the extension popup.'
  };
}

/**
 * Fetch transcription from Gemini API
 * @param {string} videoUrl - Full YouTube video URL
 * @param {string} apiKey - Gemini API key
 * @param {string} forcePromptType - Force specific prompt type: 'default', 'custom', 'translation', or null (auto-detect)
 * @param {string} translationLanguage - Language code for translation (only used when forcePromptType === 'translation')
 * @returns {Promise<{success: boolean, subtitles?: Array, error?: string, isCustomPrompt?: boolean, rawResponse?: string}>}
 */
async function fetchGeminiTranscription(videoUrl, apiKey, forcePromptType = null, translationLanguage = null) {
  if (DEBUG_GEMINI) console.log('[Gemini] Starting transcription for:', videoUrl, '| Force type:', forcePromptType, '| Translation lang:', translationLanguage);

  if (await isGeminiDisabledByMode()) {
    if (DEBUG_GEMINI) console.log('[Gemini] Blocked because aiTranscriptionMode=off');
    return {
      success: false,
      error: 'Gemini is disabled because AI transcription mode is OFF.'
    };
  }

  if (!(await hasAcceptedGeminiPromptResponsibility())) {
    if (DEBUG_GEMINI) console.log('[Gemini] Blocked because prompt responsibility is not accepted');
    return buildPromptResponsibilityBlockedResponse();
  }

  if (!apiKey) {
    console.error('[Gemini] No API key provided');
    return {
      success: false,
      error: 'No API key configured. Please add your Gemini API key in settings.'
    };
  }

  // 🎯 Load selected prompt from storage
  // Note: With JSON Schema, the prompt can be simpler - the schema handles the format
  // Using English for better LLM performance (30-40% fewer tokens, better accuracy)

  /* 📝 OLD PROMPTS (history):
   * Hebrew v1: 'תמלל את הדיבור והשירה בסרטון הזה - רק את המילים המדוברות/נשרות...'
   * Hebrew v2: 'תמלל את כל הדיבור והשירה בסרטון. תמלל רק מילים מדוברות או נשרות...'
   * 
   * Problems with Hebrew prompts:
   * - More tokens required (~35-40 vs ~20-25 in English)
   * - LLM trained primarily on English - better understanding
   * - Sometimes returned visual descriptions instead of speech
   */

  let promptText = 'Transcribe ONLY the audio (spoken and sung words). Ignore all visual content, text on screen, and images. Extract speech from audio track only. Return timestamps in SRT format (HH:MM:SS,mmm).'; // Default fallback
  let isCustomPrompt = false; // Track if using custom prompt
  let isTranscriptBasedCustomPrompt = false; // Custom prompt that must use transcript-only answering
  let useVideoAnalysis = false; // Track if video analysis is enabled
  let useTranscriptBased = false; // Track if transcript-based mode is enabled
  let useGoogleSearch = false; // Track if Google Search is enabled
  let useUrlContext = false; // Track if URL Context is enabled
  let prompts = [];
  let activePromptId = null;
  let globalGeminiModel = DEFAULT_GEMINI_MODEL;
  let selectedPrompt = null; // Store selected prompt for later use
  let isAboutSongPrompt = false; // Built-in "about-song" prompt mode
  let showDefault = true;
  let selectedCustomPromptId = null;
  let includeOriginal = false;
  let secondaryLang = null;
  const resolveLanguageName = (langCode) => {
    if (!langCode) return 'English';
    const normalizedCode = String(langCode).trim().toLowerCase();
    if (!normalizedCode) return 'English';

    if (window.getLanguageByCode) {
      const lang = window.getLanguageByCode(normalizedCode);
      if (lang && lang.name) return lang.name;
    }

    if (Array.isArray(window.LANGUAGES)) {
      const lang = window.LANGUAGES.find((entry) => entry?.code === normalizedCode);
      if (lang && lang.name) return lang.name;
    }

    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      const intlName = displayNames.of(normalizedCode);
      if (intlName && typeof intlName === 'string') return intlName;
    } catch (error) {
      // Fallback below
    }

    const LEGACY_LANGUAGE_NAMES = {
      he: 'Hebrew',
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ar: 'Arabic',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      jw: 'Javanese',
      ny: 'Chichewa',
      hmn: 'Hmong',
      ceb: 'Cebuano'
    };
    if (LEGACY_LANGUAGE_NAMES[normalizedCode]) {
      return LEGACY_LANGUAGE_NAMES[normalizedCode];
    }

    return 'English';
  };

  const buildAboutSongPrompt = (languageName) => {
    return [
      'Transcribe ONLY the audio content of this video (spoken/sung words) for internal analysis.',
      'Ignore all visual content, on-screen text, and images.',
      'Based ONLY on the audio transcript, produce a short summary of what the song/video is about.',
      '',
      `Respond only in ${languageName}.`,
      'Return ONLY valid JSON in this exact shape: {"summary":"<brief summary>"}',
      'The "summary" value must contain only the final summary text.',
      '',
      'Do NOT include the transcript.',
      'Do NOT include timestamps.',
      'Do NOT include bullet points or extra sections.',
      'Do NOT mention visuals/camera/scenes.'
    ].join(' ');
  };

  const buildTranscriptBasedPrompt = (userPrompt) => {
    return [
      'Transcribe ONLY the audio content of this video (spoken/sung words) for internal analysis.',
      'Ignore all visual content, on-screen text, and images.',
      'Based ONLY on the audio transcript, answer the user request below.',
      '',
      `User request: ${userPrompt}`,
      '',
      'Return ONLY valid JSON in this exact shape: {"answer":"<final answer>"}',
      'The "answer" value must contain only the final answer text.',
      '',
      'Do NOT include the transcript.',
      'Do NOT include timestamps.',
      'Do NOT include markdown code fences.',
      'Do NOT include extra sections.'
    ].join(' ');
  };

  const parseSingleFieldFromRaw = (rawText, fieldName, labelRegex = null) => {
    if (typeof rawText !== 'string') return '';
    const trimmed = rawText.trim();
    if (!trimmed) return '';

    const unwrapped = (() => {
      const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      return fenced ? fenced[1].trim() : trimmed;
    })();

    const tryParseJsonField = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed[fieldName] === 'string') {
          const fieldValue = parsed[fieldName].trim();
          return fieldValue || '';
        }
      } catch (error) {
        // Not valid JSON, continue to fallback parsing.
      }
      return '';
    };

    let parsedField = tryParseJsonField(unwrapped);
    if (parsedField) return parsedField;

    const jsonObjectMatch = unwrapped.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      parsedField = tryParseJsonField(jsonObjectMatch[0]);
      if (parsedField) return parsedField;
    }

    const fieldMatch = unwrapped.match(new RegExp(`"${fieldName}"\\s*:\\s*"([\\s\\S]*?)"`, 'i'));
    if (fieldMatch && fieldMatch[1]) {
      const fieldText = fieldMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
        .trim();
      if (fieldText) return fieldText;
    }

    if (labelRegex) {
      let labelMatch = null;
      let lastLabel = null;
      while ((labelMatch = labelRegex.exec(unwrapped)) !== null) {
        lastLabel = labelMatch;
      }
      if (lastLabel) {
        const afterLabel = unwrapped.slice(lastLabel.index + lastLabel[0].length).trim();
        if (afterLabel) return afterLabel;
      }
    }

    return unwrapped;
  };

  const parseAboutSongSummaryFromRaw = (rawText) =>
    parseSingleFieldFromRaw(rawText, 'summary', /(SUMMARY|סיכום)\s*:/gi);

  const parseTranscriptBasedAnswerFromRaw = (rawText) =>
    parseSingleFieldFromRaw(rawText, 'answer', /(ANSWER|תשובה)\s*:/gi);

  try {
    const result = await chrome.storage.local.get([
      'geminiPrompts', 
      'showDefault', 
      'selectedCustomPromptId',
      'translationIncludeOriginal',
      'translationSecondaryLanguage',
      GEMINI_GLOBAL_MODEL_KEY,
      GEMINI_ALLOW_PAID_MODELS_KEY
    ]);
    prompts = result.geminiPrompts || [];
    showDefault = result.showDefault !== false; // Default true if not set
    selectedCustomPromptId = result.selectedCustomPromptId || null;
    includeOriginal = result.translationIncludeOriginal || false;
    secondaryLang = result.translationSecondaryLanguage || null;
    const allowPaidModels = result[GEMINI_ALLOW_PAID_MODELS_KEY] === true;
    globalGeminiModel = normalizeGeminiModelSelection(result[GEMINI_GLOBAL_MODEL_KEY], { allowPaidModels });

    console.log('[Gemini] 🔍 Loaded from storage:', {
      promptsCount: prompts.length,
      showDefault: showDefault,
      selectedCustomPromptId: selectedCustomPromptId,
      forcePromptType: forcePromptType,
      includeOriginal: includeOriginal,
      secondaryLang: secondaryLang,
      prompts: prompts.map(p => ({ id: p.id, title: p.title }))
    });

    // 🎯 Determine which prompt to use based on forcePromptType or user selection
    if (forcePromptType === 'default') {
      // 🔒 Force default prompt (for multi-prompt scenarios)
      activePromptId = 'default';
      promptText = 'Transcribe ONLY the audio (spoken and sung words). Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use SRT timestamp format (HH:MM:SS,mmm) for ALL timestamps. Example: 00:01:23,456 means 1 minute, 23 seconds, and 456 milliseconds.';
      isCustomPrompt = false;
      useVideoAnalysis = false;
      if (DEBUG_GEMINI) console.log('[Gemini] 🎯 Forced default prompt with JSON Schema');
    } else if (forcePromptType === 'translation') {
      // 🆕 Force translation prompt (for multi-prompt scenarios)
      activePromptId = 'translation';
      const targetLang = translationLanguage || 'he'; // Use provided language or default to Hebrew
      
      // Get language name from code
      let languageName = targetLang;
      if (window.getLanguageByCode) {
        const lang = window.getLanguageByCode(targetLang);
        if (lang) languageName = lang.name;
      }
      
      // 🎯 Check if we need Translation + Original or Dual Translation
      if (includeOriginal && !secondaryLang) {
        // Translation + Original (structured format)
        promptText = `Transcribe ONLY the audio (spoken and sung words) in its ORIGINAL language AND translate it to ${languageName} like a professional translator. Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use SRT timestamp format (HH:MM:SS,mmm) for ALL timestamps. Example: 00:01:23,456 means 1 minute, 23 seconds, and 456 milliseconds. Return each sentence as an object with 'translation' (${languageName}) and 'original' (source language) fields in the SAME object with the SAME timestamps.`;
        console.log('[Gemini] 🎯 Translation + Original mode (structured format)');
      } else if (secondaryLang && !includeOriginal) {
        // Dual Translation (structured format)
        let secondaryLanguageName = secondaryLang;
        if (window.getLanguageByCode) {
          const lang = window.getLanguageByCode(secondaryLang);
          if (lang) secondaryLanguageName = lang.name;
        }
        promptText = `Transcribe ONLY the audio (spoken and sung words) and translate it to TWO languages: ${languageName} and ${secondaryLanguageName} like a professional translator. Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use SRT timestamp format (HH:MM:SS,mmm) for ALL timestamps. Example: 00:01:23,456 means 1 minute, 23 seconds, and 456 milliseconds. Return each sentence as an object with 'primary' (${languageName}) and 'secondary' (${secondaryLanguageName}) fields in the SAME object with the SAME timestamps.`;
        console.log('[Gemini] 🎯 Dual Translation mode (structured format):', languageName, '+', secondaryLanguageName);
      } else {
        // Simple translation (existing behavior)
        promptText = `Transcribe ONLY the audio (spoken and sung words) and translate it to ${languageName} like a professional translator. Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use SRT timestamp format (HH:MM:SS,mmm) for ALL timestamps. Example: 00:01:23,456 means 1 minute, 23 seconds, and 456 milliseconds. Maintain the original timing and natural flow in the target language.`;
        console.log('[Gemini] 🎯 Simple translation mode');
      }
      
      isCustomPrompt = false;
      isTranscriptBasedCustomPrompt = false;
      useVideoAnalysis = false;
      useTranscriptBased = false;
      console.log('[Gemini] 🎯 Forced translation prompt with JSON Schema (target:', languageName, ')');
    } else if (forcePromptType === 'custom') {
      // 🔒 Force custom prompt (for multi-prompt scenarios)
      if (selectedCustomPromptId) {
        selectedPrompt = prompts.find(p => p.id === selectedCustomPromptId);
        activePromptId = selectedCustomPromptId;
        if (selectedPrompt && selectedPrompt.prompt) {
          if (selectedPrompt.id === 'about-song') {
            const aboutSongResult = await chrome.storage.local.get(['aboutSongLanguage']);
            const aboutSongLangCode = aboutSongResult.aboutSongLanguage || 'en';
            const aboutSongLanguage = resolveLanguageName(aboutSongLangCode);
            promptText = buildAboutSongPrompt(aboutSongLanguage);
            isAboutSongPrompt = true;
            isTranscriptBasedCustomPrompt = false;
            useTranscriptBased = true;
            console.log('[Gemini] 🎯 Built-in about-song prompt selected. Output language:', aboutSongLanguage);
          } else if (selectedPrompt.useTranscriptBased === true) {
            promptText = buildTranscriptBasedPrompt(selectedPrompt.prompt);
            isAboutSongPrompt = false;
            isTranscriptBasedCustomPrompt = true;
            useTranscriptBased = true;
          } else {
            promptText = selectedPrompt.prompt;
            isAboutSongPrompt = false;
            isTranscriptBasedCustomPrompt = false;
            useTranscriptBased = false;
          }
          isCustomPrompt = true;
          useVideoAnalysis = selectedPrompt.useVideoAnalysis || false;
          if (useTranscriptBased) {
            useVideoAnalysis = false;
          }
          useGoogleSearch = selectedPrompt.useGoogleSearch || false;
          useUrlContext = selectedPrompt.useUrlContext || false;
          console.log('[Gemini] 🎯 Forced custom prompt (NO JSON Schema):', selectedPrompt.title);
          console.log('[Gemini] 📝 Custom prompt text:', promptText);
          console.log('[Gemini] 📝 Transcript-based mode:', useTranscriptBased ? 'ENABLED' : 'DISABLED');
          console.log('[Gemini] 🎥 Video analysis:', useVideoAnalysis ? 'ENABLED' : 'DISABLED');
          console.log('[Gemini] 🔎 Google Search:', useGoogleSearch ? 'ENABLED' : 'DISABLED');
          console.log('[Gemini] 📖 URL Context:', useUrlContext ? 'ENABLED' : 'DISABLED');
        } else {
          console.warn('[Gemini] ⚠️ Custom prompt not found, using default');
          promptText = 'Transcribe ONLY the audio (spoken and sung words). Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use absolute decimal seconds for ALL timestamps (e.g., 12.5, 62.5, 125.3). Do NOT use HH:MM:SS or MM:SS format.';
          isCustomPrompt = false;
          isTranscriptBasedCustomPrompt = false;
          useVideoAnalysis = false;
          useTranscriptBased = false;
        }
      } else {
        console.warn('[Gemini] ⚠️ No custom prompt selected, using default');
        promptText = 'Transcribe ONLY the audio (spoken and sung words). Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use absolute decimal seconds for ALL timestamps (e.g., 12.5, 62.5, 125.3). Do NOT use HH:MM:SS or MM:SS format.';
        isCustomPrompt = false;
        isTranscriptBasedCustomPrompt = false;
        useVideoAnalysis = false;
        useTranscriptBased = false;
      }
    } else {
      // 🔒 Auto-detect based on user selection (original behavior)
      if (showDefault && !selectedCustomPromptId) {
        activePromptId = 'default';
        promptText = 'Transcribe ONLY the audio (spoken and sung words). Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use SRT timestamp format (HH:MM:SS,mmm) for ALL timestamps. Example: 00:01:23,456 means 1 minute, 23 seconds, and 456 milliseconds.';
        isCustomPrompt = false;
        isTranscriptBasedCustomPrompt = false;
        useVideoAnalysis = false;
        useTranscriptBased = false;
        if (DEBUG_GEMINI) console.log('[Gemini] Using default (hardcoded) prompt with JSON Schema');
      } else if (selectedCustomPromptId) {
        selectedPrompt = prompts.find(p => p.id === selectedCustomPromptId);
        activePromptId = selectedCustomPromptId;
        if (selectedPrompt && selectedPrompt.prompt) {
          if (selectedPrompt.id === 'about-song') {
            const aboutSongResult = await chrome.storage.local.get(['aboutSongLanguage']);
            const aboutSongLangCode = aboutSongResult.aboutSongLanguage || 'en';
            const aboutSongLanguage = resolveLanguageName(aboutSongLangCode);
            promptText = buildAboutSongPrompt(aboutSongLanguage);
            isAboutSongPrompt = true;
            isTranscriptBasedCustomPrompt = false;
            useTranscriptBased = true;
            console.log('[Gemini] 🎯 Built-in about-song prompt selected. Output language:', aboutSongLanguage);
          } else if (selectedPrompt.useTranscriptBased === true) {
            promptText = buildTranscriptBasedPrompt(selectedPrompt.prompt);
            isAboutSongPrompt = false;
            isTranscriptBasedCustomPrompt = true;
            useTranscriptBased = true;
          } else {
            promptText = selectedPrompt.prompt;
            isAboutSongPrompt = false;
            isTranscriptBasedCustomPrompt = false;
            useTranscriptBased = false;
          }
          isCustomPrompt = true;
          useVideoAnalysis = selectedPrompt.useVideoAnalysis || false;
          if (useTranscriptBased) {
            useVideoAnalysis = false;
          }
          useGoogleSearch = selectedPrompt.useGoogleSearch || false;
          useUrlContext = selectedPrompt.useUrlContext || false;
          console.log('[Gemini] ✅ Using custom prompt (NO JSON Schema):', selectedPrompt.title);
          console.log('[Gemini] 📝 Custom prompt text:', promptText);
          console.log('[Gemini] 📝 Transcript-based mode:', useTranscriptBased ? 'ENABLED' : 'DISABLED');
          console.log('[Gemini] 🎥 Video analysis:', useVideoAnalysis ? 'ENABLED' : 'DISABLED');
          console.log('[Gemini] 🔎 Google Search:', useGoogleSearch ? 'ENABLED' : 'DISABLED');
          console.log('[Gemini] 📖 URL Context:', useUrlContext ? 'ENABLED' : 'DISABLED');
        } else {
          console.warn('[Gemini] ⚠️ Selected prompt not found, using default');
          isCustomPrompt = false;
          isTranscriptBasedCustomPrompt = false;
          useVideoAnalysis = false;
          useTranscriptBased = false;
        }
      } else {
        promptText = 'Transcribe ONLY the audio (spoken and sung words). Ignore all visual content, text on screen, and images. Extract speech from audio track only. CRITICAL: Use absolute decimal seconds for ALL timestamps (e.g., 12.5, 62.5, 125.3). Do NOT use HH:MM:SS or MM:SS format.';
        isCustomPrompt = false;
        isTranscriptBasedCustomPrompt = false;
        useVideoAnalysis = false;
        useTranscriptBased = false;
        if (DEBUG_GEMINI) console.log('[Gemini] No prompt selected, using default');
      }
    }
  } catch (e) {
    console.warn('[Gemini] Failed to load custom prompt, using default:', e);
    isCustomPrompt = false;
    isTranscriptBasedCustomPrompt = false;
    useVideoAnalysis = false;
    useTranscriptBased = false;
  }

  if (!activePromptId) {
    if (forcePromptType === 'default') activePromptId = 'default';
    if (forcePromptType === 'translation') activePromptId = 'translation';
  }

  const promptForModel = activePromptId
    ? prompts.find((prompt) => prompt.id === activePromptId)
    : selectedPrompt;
  const allowPaidModelsForRequest = (await chrome.storage.local.get([GEMINI_ALLOW_PAID_MODELS_KEY]))[GEMINI_ALLOW_PAID_MODELS_KEY] === true;
  const promptModelOverride = normalizeGeminiModelSelection(promptForModel?.modelOverride, {
    allowGlobal: true,
    allowPaidModels: allowPaidModelsForRequest
  });
  const MODEL = promptModelOverride === MODEL_MODE_GLOBAL
    ? normalizeGeminiModelSelection(globalGeminiModel, { allowPaidModels: allowPaidModelsForRequest })
    : normalizeGeminiModelSelection(promptModelOverride, { allowPaidModels: allowPaidModelsForRequest });

  console.log('[Gemini] 🤖 Model selection:', {
    model: MODEL,
    globalModel: globalGeminiModel,
    promptOverride: promptModelOverride,
    activePromptId
  });
  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  // 🎯 Build request body - conditionally add JSON Schema
  const requestBody = {
    contents: [{
      parts: [
        {
          fileData: {
            mimeType: 'video/*',
            fileUri: videoUrl
          }
        },
        {
          text: promptText // 🎯 Use selected prompt
        }
      ]
    }],
    generationConfig: {
      temperature: 0.0,                        // 🎯 Lower temperature for more accurate transcription (less "creativity")
      maxOutputTokens: 64000                   // 🎯 Maximum tokens for long videos
    }
  };

  // 🆕 Add thinking level for DEFAULT, TRANSLATION and CUSTOM prompts
  let thinkingLevel = null;
  if (forcePromptType === 'default') {
    // DEFAULT gets MINIMAL thinking (just enough for accuracy)
    thinkingLevel = 'MINIMAL';
    console.log('[Gemini] 🧠 Default thinking level: MINIMAL');
  } else if (forcePromptType === 'translation') {
    // Get thinking level from localStorage for translation
    const thinkingResult = await chrome.storage.local.get(['translationThinkingLevel']);
    thinkingLevel = thinkingResult.translationThinkingLevel || 'LOW';
    console.log('[Gemini] 🧠 Translation thinking level:', thinkingLevel);
  } else if (forcePromptType === 'custom' && selectedPrompt) {
    // Get thinking level from prompt object for custom prompts
    thinkingLevel = selectedPrompt.thinkingLevel || 'MINIMAL';  // Changed default to MINIMAL
    console.log('[Gemini] 🧠 Custom prompt thinking level:', thinkingLevel);
  } else if (!forcePromptType && showDefault && !selectedCustomPromptId) {
    // Auto-detected DEFAULT (no forcePromptType)
    thinkingLevel = 'MINIMAL';
    console.log('[Gemini] 🧠 Default thinking level: MINIMAL (auto-detected)');
  }

  // Add thinkingConfig if thinking level is set
  if (thinkingLevel) {
    requestBody.generationConfig.thinkingConfig = {
      thinkingLevel: thinkingLevel
    };
    console.log('[Gemini] ✅ Added thinkingConfig:', thinkingLevel);
  }

  // 🎯 Add JSON Schema for default/translation prompts and transcript-based custom prompts
  // Other custom prompts remain free-form
  if (!isCustomPrompt || isAboutSongPrompt || isTranscriptBasedCustomPrompt) {
    // 🎯 Determine schema based on translation mode
    let subtitleSchema;

    if (isAboutSongPrompt) {
      subtitleSchema = {
        type: "object",
        description: "Short meaning summary for built-in about-song prompt.",
        properties: {
          summary: {
            type: "string",
            description: "A brief summary in the selected output language."
          }
        },
        required: ["summary"]
      };
      console.log('[Gemini] Using about-song summary JSON schema');
    } else if (isTranscriptBasedCustomPrompt) {
      subtitleSchema = {
        type: "object",
        description: "Answer extracted from audio transcript for transcript-based custom prompt.",
        properties: {
          answer: {
            type: "string",
            description: "Final answer text based only on the audio transcript."
          }
        },
        required: ["answer"]
      };
      console.log('[Gemini] Using transcript-based custom prompt JSON schema');
    } else {
    // Check translation settings from storage
    const includeOriginal = forcePromptType === 'translation' && 
                           (await chrome.storage.local.get(['translationIncludeOriginal'])).translationIncludeOriginal;
    const secondaryLang = forcePromptType === 'translation' && 
                         (await chrome.storage.local.get(['translationSecondaryLanguage'])).translationSecondaryLanguage;
    
    if (forcePromptType === 'translation' && includeOriginal && !secondaryLang) {
      // Translation + Original (structured format)
      subtitleSchema = {
        type: "object",
        description: "Transcription with translation and original text. Use SRT timestamp format (HH:MM:SS,mmm).",
        properties: {
          timeFormat: {
            type: "string",
            enum: ["srt"],
            description: "MUST be 'srt' - all times are in SRT format"
          },
          subtitles: {
            type: "array",
            description: "Array of subtitle segments with translation and original",
            items: {
              type: "object",
              properties: {
                translation: {
                  type: "string",
                  description: "Translated text in target language"
                },
                original: {
                  type: "string",
                  description: "Original text in source language"
                },
                start: {
                  type: "string",
                  description: "Start time in SRT format (HH:MM:SS,mmm)"
                },
                end: {
                  type: "string",
                  description: "End time in SRT format (HH:MM:SS,mmm)"
                }
              },
              required: ["translation", "original", "start", "end"]
            }
          }
        },
        required: ["timeFormat", "subtitles"],
        examples: [{
          timeFormat: "srt",
          subtitles: [
            {
              translation: "שלום עולם",
              original: "Hello world",
              start: "00:00:07,500",
              end: "00:00:11,000"
            }
          ]
        }]
      };
      console.log('[Gemini] 📋 Using Translation + Original schema with SRT');
      
    } else if (forcePromptType === 'translation' && secondaryLang && !includeOriginal) {
      // Dual Translation (structured format)
      subtitleSchema = {
        type: "object",
        description: "Transcription with dual translations. Use SRT timestamp format (HH:MM:SS,mmm).",
        properties: {
          timeFormat: {
            type: "string",
            enum: ["srt"],
            description: "MUST be 'srt' - all times are in SRT format"
          },
          subtitles: {
            type: "array",
            description: "Array of subtitle segments with primary and secondary translations",
            items: {
              type: "object",
              properties: {
                primary: {
                  type: "string",
                  description: "Primary translation"
                },
                secondary: {
                  type: "string",
                  description: "Secondary translation"
                },
                start: {
                  type: "string",
                  description: "Start time in SRT format (HH:MM:SS,mmm)"
                },
                end: {
                  type: "string",
                  description: "End time in SRT format (HH:MM:SS,mmm)"
                }
              },
              required: ["primary", "secondary", "start", "end"]
            }
          }
        },
        required: ["timeFormat", "subtitles"],
        examples: [{
          timeFormat: "srt",
          subtitles: [
            {
              primary: "שלום עולם",
              secondary: "Hola mundo",
              start: "00:00:07,500",
              end: "00:00:11,000"
            }
          ]
        }]
      };
      console.log('[Gemini] 📋 Using Dual Translation schema with SRT');
      
    } else {
      // Default schema (simple translation or transcription)
      subtitleSchema = {
        type: "object",
        description: "Transcription with timestamps in SRT format (HH:MM:SS,mmm). Example: 00:01:23,456 means 1 minute, 23 seconds, and 456 milliseconds.",
        properties: {
          timeFormat: {
            type: "string",
            enum: ["srt"],
            description: "MUST be 'srt' - all times are in SRT format (HH:MM:SS,mmm)"
          },
          subtitles: {
            type: "array",
            description: "Array of subtitle segments with SRT timestamps",
            items: {
              type: "object",
              properties: {
                start: {
                  type: "string",
                  description: "Start time in SRT format (HH:MM:SS,mmm). Example: 00:01:23,456"
                },
                end: {
                  type: "string",
                  description: "End time in SRT format (HH:MM:SS,mmm). Example: 00:01:27,890"
                },
                text: {
                  type: "string",
                  description: "The exact spoken or sung words"
                }
              },
              required: ["start", "end", "text"]
            }
          }
        },
        required: ["timeFormat", "subtitles"],
        examples: [{
          timeFormat: "srt",
          subtitles: [
            {
              start: "00:00:07,500",
              end: "00:00:11,000",
              text: "Hello world"
            },
            {
              start: "00:01:00,500",
              end: "00:01:04,000",
              text: "This is one minute and half second"
            }
          ]
        }]
      };
      console.log('[Gemini] 📋 Using default schema with SRT timestamps');
    }
    }

    requestBody.generationConfig.responseMimeType = "application/json";
    requestBody.generationConfig.responseJsonSchema = subtitleSchema;
    
    // 🎯 Use LOW resolution for transcription (audio only - saves money!)
    requestBody.generationConfig.mediaResolution = "MEDIA_RESOLUTION_LOW";
    
    console.log('[Gemini] 📋 Using JSON Schema for structured transcription');
    console.log('[Gemini] 💰 Using LOW resolution (audio only - cost optimized)');
  } else {
    console.log('[Gemini] 🆓 Free-form response (no JSON Schema)');
    
    // ✅ For custom prompts: handle video resolution
    if (!useVideoAnalysis) {
      // Video analysis disabled → LOW resolution
      requestBody.generationConfig.mediaResolution = "MEDIA_RESOLUTION_LOW";
      console.log('[Gemini] 💰 Using LOW resolution (video analysis disabled - cost optimized)');
    } else {
      // Video analysis enabled → check user's resolution choice
      const videoResolution = selectedPrompt?.videoResolution || 'medium';
      if (videoResolution === 'high') {
        requestBody.generationConfig.mediaResolution = "MEDIA_RESOLUTION_HIGH";
        console.log('[Gemini] 🎥💸 Using HIGH resolution (video analysis enabled - expensive!)');
      } else {
        requestBody.generationConfig.mediaResolution = "MEDIA_RESOLUTION_MEDIUM";
        console.log('[Gemini] 🎥💵 Using MEDIUM resolution (video analysis enabled - default)');
      }
    }
    
    // 🔎 Add tools if enabled (Google Search and/or URL Context)
    if (useGoogleSearch || useUrlContext) {
      requestBody.tools = [];
      
      if (useGoogleSearch) {
        requestBody.tools.push({ googleSearch: {} });
        console.log('[Gemini] 🔎 Google Search enabled');
      }
      
      if (useUrlContext) {
        requestBody.tools.push({ urlContext: {} });
        console.log('[Gemini] 📖 URL Context (Deep Reading) enabled');
      }
      
      console.log('[Gemini] 🛠️ Tools added:', requestBody.tools.length);
    }
  }

  try {
    if (DEBUG_GEMINI) console.log('[Gemini] Sending request to API...');

    // 🎯 Dynamic timeout based on video length
    let timeoutMs = 120000; // Default: 120 seconds (2 minutes)
    
    // Try to get video duration for dynamic timeout
    try {
      if (typeof window !== 'undefined' && window.getLocalDuration) {
        const videoId = videoUrl.match(/[?&]v=([^&]+)/)?.[1];
        if (videoId) {
          const seconds = await window.getLocalDuration(videoId);
          if (seconds && seconds > 600) { // >10 minutes
            // For long videos: 5 minutes timeout
            timeoutMs = 300000;
            if (DEBUG_GEMINI) console.log(`[Gemini] ⏱️ Long video (${Math.floor(seconds/60)} min) - using extended timeout: ${timeoutMs/1000}s`);
          }
        }
      }
    } catch (durationError) {
      if (DEBUG_GEMINI) console.warn('[Gemini] Could not check video duration for timeout adjustment:', durationError);
    }

    const response = await fetch(`${API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (DEBUG_GEMINI) console.error('[Gemini] API Error:', response.status, errorText);

      // Parse error details if available
      let errorDetails = null;
      try {
        errorDetails = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use raw text
      }

      if (response.status === 404) {
        return {
          success: false,
          error: `Gemini model "${MODEL}" not found. Please check your model selection or API access.`
        };
      }

      if (response.status === 403) {
        // Check if it's quota exceeded or invalid key
        const errorMessage = errorDetails?.error?.message || errorText;
        if (errorMessage.toLowerCase().includes('quota')) {
          return {
            success: false,
            error: 'API quota exceeded. Please check your Gemini API usage limits or try again later.'
          };
        }
        return {
          success: false,
          error: 'Invalid API key or permission denied. Please check your Gemini API key in settings.'
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait a moment and try again.'
        };
      }

      if (response.status === 400) {
        const errorMessage = errorDetails?.error?.message || 'Bad request';
        return {
          success: false,
          error: `Invalid request: ${errorMessage}`
        };
      }

      return {
        success: false,
        error: `API Error: ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();
    if (DEBUG_GEMINI) console.log('[Gemini] Response received');

    // Extract transcription from response
    if (!data.candidates || data.candidates.length === 0) {
      console.error('[Gemini] No candidates in response');
      return {
        success: false,
        error: 'No transcription generated. The video might be too long or unavailable.'
      };
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error('[Gemini] No content in response');
      return {
        success: false,
        error: 'Empty response from Gemini API.'
      };
    }

    const transcriptionText = candidate.content.parts[0].text;
    if (DEBUG_GEMINI) {
      console.log('[Gemini] Transcription text received, parsing...');
      console.log('[Gemini] 📝 RAW RESPONSE (first 500 chars):', transcriptionText.substring(0, 500));
    }

    // 🎯 Handle custom prompts - return raw text response (no timestamps)
    if (isCustomPrompt) {
      if (isAboutSongPrompt) {
        const summaryText = parseAboutSongSummaryFromRaw(transcriptionText);
        if (!summaryText) {
          return {
            success: false,
            error: 'No summary generated for about-song prompt. Please try again.'
          };
        }

        console.log('[Gemini] About-song summary parsed successfully');
        return {
          success: true,
          subtitles: [{
            start: null,
            end: null,
            text: summaryText
          }],
          isCustomPrompt: true,
          rawResponse: summaryText,
          promptId: selectedPrompt?.id || 'about-song'
        };
      }
      if (isTranscriptBasedCustomPrompt) {
        const answerText = parseTranscriptBasedAnswerFromRaw(transcriptionText);
        if (!answerText) {
          return {
            success: false,
            error: 'No answer generated for transcript-based prompt. Please try again.'
          };
        }

        console.log('[Gemini] Transcript-based custom answer parsed successfully');
        return {
          success: true,
          subtitles: [{
            start: null,
            end: null,
            text: answerText
          }],
          isCustomPrompt: true,
          rawResponse: answerText,
          promptId: selectedPrompt?.id || null
        };
      }
      console.log('[Gemini] 🆓 Custom prompt response (raw text, no timestamps)');
      console.log('[Gemini] 📄 Full response:', transcriptionText);
      
      // Return as a single subtitle entry WITHOUT timestamps
      // Panel should display this as static text, not synced to video
      return {
        success: true,
        subtitles: [{
          start: null,  // ✅ No start time for custom prompts
          end: null,    // ✅ No end time for custom prompts
          text: transcriptionText
        }],
        isCustomPrompt: true,
        rawResponse: transcriptionText,
        promptId: selectedPrompt?.id || null // 🎯 Return the prompt ID
      };
    }

    // 🎯 Default prompt - parse JSON with structured output
    let subtitles;
    try {
      subtitles = JSON.parse(transcriptionText);
    } catch (parseError) {
      console.error('[Gemini] Failed to parse JSON:', parseError);
      return {
        success: false,
        error: 'Failed to parse API response. Please try again.'
      };
    }

    // 🎯 Handle new schema format with timeFormat
    let timeFormat = 'unknown';
    let subtitleArray = subtitles;

    // Check if it's the new object format with timeFormat
    if (subtitles && typeof subtitles === 'object' && !Array.isArray(subtitles)) {
      timeFormat = subtitles.timeFormat || 'unknown';
      subtitleArray = subtitles.subtitles || [];
      if (DEBUG_GEMINI) {
        console.log(`[Gemini] 📋 Time format reported by Gemini: ${timeFormat}`);
      }
    }

    // Validate response format
    if (!Array.isArray(subtitleArray)) {
      console.error('[Gemini] Response subtitles is not an array');
      return {
        success: false,
        error: 'Invalid response format from API.'
      };
    }

    if (subtitleArray.length === 0) {
      console.error('[Gemini] Empty subtitles array');
      return {
        success: false,
        error: 'No subtitles generated. The video might not contain speech.'
      };
    }

    // 🔍 DEBUG: Show RAW subtitles BEFORE conversion
    if (DEBUG_GEMINI) {
      console.log(`[Gemini] 📝 RAW SUBTITLES (before conversion): ${subtitleArray.length} items, format: ${timeFormat}`);
      console.log('[Gemini] 🔥🔥🔥 FULL RAW GEMINI RESPONSE 🔥🔥🔥');
      console.log(JSON.stringify(subtitleArray, null, 2));
      console.log('[Gemini] 🔥🔥🔥 END FULL RAW GEMINI RESPONSE 🔥🔥🔥');
    }

    // 🔧 Convert time formats to seconds based on Gemini's reported format
    const convertMMSStoSeconds = (time) => {
      const minutes = Math.floor(time / 100);
      const seconds = time % 100;
      return minutes * 60 + seconds;
    };

    // 🆕 Parse SRT timestamp to seconds.
    // Accept strict SRT (HH:MM:SS,mmm) and Gemini variants without milliseconds.
    const parseSRTTimestamp = (timestamp) => {
      if (typeof timestamp !== 'string') return null;

      const trimmed = timestamp.trim();
      if (!trimmed) return null;

      const [timePart, fractionPart = ''] = trimmed.split(/[,.]/);
      const parts = timePart.split(':').map(part => Number(part));
      if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isFinite(part))) {
        return null;
      }

      const [hours, minutes, seconds] =
        parts.length === 3 ? parts : [0, parts[0], parts[1]];

      if (minutes < 0 || seconds < 0 || minutes >= 60 || seconds >= 60) {
        return null;
      }

      const milliseconds = fractionPart
        ? Number(fractionPart.slice(0, 3).padEnd(3, '0'))
        : 0;
      if (!Number.isFinite(milliseconds)) return null;

      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    };

    const convertTime = (time, format) => {
      // 🆕 Handle SRT timestamp strings
      if (typeof time === 'string') {
        if (time.includes(':')) {
          // This is an SRT timestamp (HH:MM:SS,mmm)
          const seconds = parseSRTTimestamp(time);
          if (!Number.isFinite(seconds)) {
            console.warn('[Gemini] ⚠️ Could not parse SRT timestamp:', time);
            return null;
          }
          if (DEBUG_GEMINI) {
            console.log(`[Gemini] 🎬 Parsed SRT timestamp: ${time} → ${seconds}s`);
          }
          return seconds;
        }
        // Try to parse as number
        const parsed = parseFloat(time);
        if (!isNaN(parsed)) {
          return convertTime(parsed, format);
        }
        console.warn('[Gemini] ⚠️ Could not parse time string:', time);
        return null;
      }
      
      if (typeof time === 'number') {
        // 🔧 SMART DETECTION: Check if this looks like MM.SS format
        // Logic: If time >= 100 AND the "seconds part" (time % 100) is < 60
        // AND it has a decimal part < 1, it's likely MM.SS
        if (time >= 100) {
          const wholePart = Math.floor(time);
          const secondsPart = wholePart % 100;
          const decimalPart = time - wholePart;
          
          // Check if it looks like MM.SS:
          // - Seconds part must be < 60 (valid seconds)
          // - Decimal part must be < 1 (not like 101.5 seconds)
          // - OR if seconds part is very small (0-10), likely MM.SS
          if (secondsPart < 60 && (decimalPart < 1 || secondsPart <= 10)) {
            const converted = convertMMSStoSeconds(time);
            if (DEBUG_GEMINI) {
              const minutes = Math.floor(time / 100);
              console.log(`[Gemini] 🔧 Auto-detected MM.SS (format="${format}"): ${time} → ${converted}s (${minutes}:${secondsPart.toFixed(1)})`);
            }
            return converted;
          }
        }
        
        // If Gemini explicitly said 'mmss', always convert >= 100
        if (format === 'mmss' && time >= 100) {
          const converted = convertMMSStoSeconds(time);
          if (DEBUG_GEMINI) {
            const minutes = Math.floor(time / 100);
            const seconds = time % 100;
            console.log(`[Gemini] 🔄 Converted MM.SS (format=${format}): ${time} → ${converted}s (${minutes}:${seconds.toString().padStart(2, '0')})`);
          }
          return converted;
        }

        return time;
      }
      
      console.warn('[Gemini] ⚠️ Unknown time type:', typeof time, time);
      return null;
    };

    // Convert all timestamps using the reported format
    const convertedSubtitles = subtitleArray.map((sub, index) => {
      // 🎯 Handle different formats: simple text, translation+original, or primary+secondary
      let text;
      if (sub.text) {
        // Simple format (existing)
        text = sub.text;
      } else if (sub.translation && sub.original) {
        // Translation + Original format (new)
        // ✅ Keep text in natural order - browser will handle RTL display with dir="auto"
        text = `${sub.translation}\n${sub.original}`;
      } else if (sub.primary && sub.secondary) {
        // Dual Translation format (new)
        // ✅ Keep text in natural order - browser will handle RTL display with dir="auto"
        text = `${sub.primary}\n${sub.secondary}`;
      } else {
        console.warn('[Gemini] Unknown subtitle format:', sub);
        text = '';
      }
      
      // ✅ Round timestamps to 2 decimal places for cleaner output
      const startTime = convertTime(sub.start, timeFormat);
      const endTime = convertTime(sub.end, timeFormat);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        console.warn('[Gemini] ⚠️ Dropping subtitle with invalid timestamp:', {
          index,
          start: sub.start,
          end: sub.end,
          text: text?.substring(0, 80)
        });
        return null;
      }
      
      return {
        start: Math.round(startTime * 100) / 100,
        end: Math.round(endTime * 100) / 100,
        text: text
      };
    }).filter(Boolean);

    if (convertedSubtitles.length === 0) {
      console.error('[Gemini] No valid subtitles after timestamp conversion');
      return {
        success: false,
        error: 'No valid subtitle timestamps generated. Please try again.'
      };
    }

    // 🔧 VALIDATION: Check for invalid timestamps (start > end or huge gaps)
    for (let i = 0; i < convertedSubtitles.length; i++) {
      const sub = convertedSubtitles[i];
      
      // Check if start > end (invalid!)
      if (sub.start > sub.end) {
        console.warn(`[Gemini] ⚠️ Invalid timestamp at index ${i}: start (${sub.start}) > end (${sub.end})`);
        console.warn(`[Gemini] 🔧 Attempting to fix by swapping...`);
        // Swap them
        const temp = sub.start;
        sub.start = sub.end;
        sub.end = temp;
      }
      
      // Check for unreasonably long subtitles (> 30 seconds)
      const duration = sub.end - sub.start;
      if (duration > 30) {
        console.warn(`[Gemini] ⚠️ Unusually long subtitle at index ${i}: ${duration.toFixed(1)}s (${sub.start} → ${sub.end})`);
        console.warn(`[Gemini] 📝 Text: "${sub.text.substring(0, 50)}..."`);
        // This might indicate a MM.SS conversion issue
      }
      
      // Check for huge gaps between subtitles (> 20 seconds)
      if (i > 0) {
        const prevSub = convertedSubtitles[i - 1];
        const gap = sub.start - prevSub.end;
        if (gap > 20) {
          console.warn(`[Gemini] ⚠️ Large gap detected: ${gap.toFixed(1)}s between subtitle ${i-1} (ends ${prevSub.end}) and ${i} (starts ${sub.start})`);
          // This might indicate missing content or MM.SS conversion issue
        }
      }
    }

    if (DEBUG_GEMINI) {
      console.log(`[Gemini] Successfully transcribed ${convertedSubtitles.length} lines`);
      console.log('[Gemini] 🔥🔥🔥 FULL CONVERTED SUBTITLES 🔥🔥🔥');
      console.log(JSON.stringify(convertedSubtitles, null, 2));
      console.log('[Gemini] 🔥🔥🔥 END FULL CONVERTED SUBTITLES 🔥🔥🔥');
    }

    return {
      success: true,
      subtitles: convertedSubtitles
    };

  } catch (error) {
    console.error('[Gemini] Error:', error);

    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return {
        success: false,
        error: 'Transcription timed out. The video might be too long. Please try a shorter video.'
      };
    }

    return {
      success: false,
      error: `Transcription failed: ${error.message}`
    };
  }
}

/**
 * Parse text format subtitles (fallback when JSON parsing fails)
 * Format: "01:37 text here" or "01:37 text here01:42 more text"
 * 🎯 Optimized: Added iteration limit to prevent infinite loops
 */
function parseTextFormatSubtitles(text) {
  const subtitles = [];

  // Try to match patterns like "01:37 text" or "02:15 text"
  const regex = /(\d{2}):(\d{2})\s*([^\d][^]*?)(?=\d{2}:\d{2}|$)/g;
  let match;

  // 🎯 Prevent infinite loops with iteration limit
  const MAX_ITERATIONS = 10000;
  let iterations = 0;

  while ((match = regex.exec(text)) !== null) {
    if (++iterations > MAX_ITERATIONS) {
      console.warn('[Gemini] Too many matches, stopping parse');
      break;
    }

    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const start = minutes * 60 + seconds;
    const textContent = match[3].trim();

    if (textContent) {
      subtitles.push({
        start: start,
        end: start + 5, // temporary, will be fixed
        text: textContent
      });
    }
  }

  // Remove duplicates (same start time and text)
  const unique = [];
  const seen = new Set();

  for (const sub of subtitles) {
    const key = `${sub.start}-${sub.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(sub);
    }
  }

  // 🎯 Clear Set to help garbage collection
  seen.clear();

  // Sort by start time
  unique.sort((a, b) => a.start - b.start);

  // Fix end times - each subtitle ends when the next one starts
  for (let i = 0; i < unique.length - 1; i++) {
    unique[i].end = unique[i + 1].start;
  }

  // Last subtitle - add 5 seconds duration
  if (unique.length > 0) {
    const last = unique[unique.length - 1];
    last.end = last.start + 5;
  }

  return unique;
}

// ============================================
// Multi API Key Fallback System
// ============================================

/**
 * Load all API keys from storage for fallback
 * @returns {Promise<Array>} Array of API key objects
 */
async function loadApiKeysForFallback() {
  try {
    const result = await chrome.storage.local.get(['geminiApiKeys', 'geminiApiKey']);
    let keys = Array.isArray(result.geminiApiKeys) ? [...result.geminiApiKeys] : [];

    // 🔄 Backward compatibility: if only single key exists, use it
    if (result.geminiApiKey && !keys.some((entry) => entry?.key === result.geminiApiKey)) {
      keys.unshift({
        id: 'legacy-primary',
        name: 'Primary Key',
        key: result.geminiApiKey,
        active: true,
        status: 'active',
        lastError: null
      });
    }

    // Filter only active keys
    const activeKeys = keys.filter(k => k.active !== false && k.status !== 'disabled');

    // 📊 Sort: primary key ALWAYS first, then by creation order
    activeKeys.sort((a, b) => {
      if (a.id === 'primary' || a.id === 'legacy-primary') return -1;
      if (b.id === 'primary' || b.id === 'legacy-primary') return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    return activeKeys;
  } catch (error) {
    console.error('[Gemini Fallback] Error loading API keys:', error);
    return [];
  }
}

/**
 * Update API key status in storage
 * @param {string} keyId - The key ID to update
 * @param {string} status - New status: 'active', 'error', 'rate-limited'
 * @param {string|null} errorMessage - Optional error message
 */
async function updateApiKeyStatus(keyId, status, errorMessage = null) {
  try {
    const result = await chrome.storage.local.get(['geminiApiKeys']);
    const keys = result.geminiApiKeys || [];

    const keyIndex = keys.findIndex(k => k.id === keyId);
    if (keyIndex !== -1) {
      keys[keyIndex].status = status;
      keys[keyIndex].lastError = errorMessage;
      keys[keyIndex].lastUsed = Date.now();

      await chrome.storage.local.set({ geminiApiKeys: keys });
      console.log(`[Gemini Fallback] Updated key ${keyId} status to: ${status}`);
    }
  } catch (error) {
    console.error('[Gemini Fallback] Error updating key status:', error);
  }
}

/**
 * Check if error should trigger fallback to next key
 * @param {string} error - Error message
 * @returns {boolean} True if should try next key
 */
function shouldTryNextApiKey(error) {
  if (!error) return false;
  const errorLower = error.toLowerCase();

  // Errors that warrant trying another key
  return (
    errorLower.includes('rate limit') ||
    errorLower.includes('quota') ||
    errorLower.includes('429') ||
    errorLower.includes('403') ||
    errorLower.includes('invalid api key') ||
    errorLower.includes('permission denied')
  );
}

/**
 * Fetch transcription with automatic fallback to multiple API keys
 * @param {string} videoUrl - Full YouTube video URL
 * @param {string} forcePromptType - Force specific prompt type: 'default', 'custom', 'translation', or null
 * @param {string} translationLanguage - Language code for translation (only used when forcePromptType === 'translation')
 * @returns {Promise<{success: boolean, subtitles?: Array, error?: string}>}
 */
async function fetchGeminiTranscriptionWithFallback(videoUrl, forcePromptType = null, translationLanguage = null) {
  if (await isGeminiDisabledByMode()) {
    return {
      success: false,
      error: 'Gemini is disabled because AI transcription mode is OFF.'
    };
  }

  if (!(await hasAcceptedGeminiPromptResponsibility())) {
    return buildPromptResponsibilityBlockedResponse();
  }

  const keys = await loadApiKeysForFallback();

  if (keys.length === 0) {
    // No multi-keys, try single key from storage
    const result = await chrome.storage.local.get(['geminiApiKey']);
    if (result.geminiApiKey) {
      console.log('[Gemini Fallback] Using single API key (no multi-key setup)');
      return fetchGeminiTranscription(videoUrl, result.geminiApiKey, forcePromptType, translationLanguage);
    }

    return {
      success: false,
      error: 'No API key configured. Please add your Gemini API key in settings.'
    };
  }

  console.log(`[Gemini Fallback] 🔑 Starting with ${keys.length} API key(s)`);

  // Try each key until one succeeds
  for (let i = 0; i < keys.length; i++) {
    const keyData = keys[i];
    console.log(`[Gemini Fallback] Trying key ${i + 1}/${keys.length}: ${keyData.name || keyData.id}`);

    const result = await fetchGeminiTranscription(videoUrl, keyData.key, forcePromptType, translationLanguage);

    if (result.success) {
      // Success! Update status and return
      await updateApiKeyStatus(keyData.id, 'active', null);
      console.log(`[Gemini Fallback] ✅ Success with key: ${keyData.name || keyData.id}`);
      return result;
    }

    // Failed - check if we should try next key
    const error = result.error || 'Unknown error';
    console.log(`[Gemini Fallback] ❌ Key ${keyData.name || keyData.id} failed: ${error}`);

    if (shouldTryNextApiKey(error)) {
      // Mark this key as problematic
      if (error.toLowerCase().includes('rate limit') || error.includes('429')) {
        await updateApiKeyStatus(keyData.id, 'rate-limited', error);
      } else if (error.toLowerCase().includes('quota')) {
        await updateApiKeyStatus(keyData.id, 'rate-limited', 'Quota exceeded');
      } else {
        await updateApiKeyStatus(keyData.id, 'error', error);
      }

      // Try next key if available
      if (i < keys.length - 1) {
        console.log(`[Gemini Fallback] 🔄 Switching to next key...`);
        continue;
      }
    }

    // If not a fallback-eligible error OR last key, return the error
    if (i === keys.length - 1) {
      console.log(`[Gemini Fallback] ❌ All ${keys.length} keys failed`);
      return {
        success: false,
        error: keys.length > 1
          ? `All ${keys.length} API keys failed. Last error: ${error}`
          : error
      };
    }
  }

  // Should not reach here, but just in case
  return {
    success: false,
    error: 'All API keys exhausted'
  };
}

// Export for use in other modules
/**
 * 🚀 Fetch transcription with load balancing across multiple API keys
 * Each request uses a different key (round-robin)
 * @param {string} videoUrl - Full YouTube video URL
 * @param {string} forcePromptType - Force specific prompt type
 * @param {string} translationLanguage - Language code for translation
 * @param {number} preferredKeyIndex - Preferred key index for load balancing (optional)
 * @returns {Promise<{success: boolean, subtitles?: Array, error?: string, usedKeyIndex?: number}>}
 */
async function fetchGeminiTranscriptionWithLoadBalancing(videoUrl, forcePromptType = null, translationLanguage = null, preferredKeyIndex = null) {
  if (await isGeminiDisabledByMode()) {
    return {
      success: false,
      error: 'Gemini is disabled because AI transcription mode is OFF.'
    };
  }

  if (!(await hasAcceptedGeminiPromptResponsibility())) {
    return buildPromptResponsibilityBlockedResponse();
  }

  const keys = await loadApiKeysForFallback();

  if (keys.length === 0) {
    // No multi-keys, fallback to single key
    const result = await chrome.storage.local.get(['geminiApiKey']);
    if (result.geminiApiKey) {
      console.log('[Gemini LB] Using single API key (no multi-key setup)');
      return fetchGeminiTranscription(videoUrl, result.geminiApiKey, forcePromptType, translationLanguage);
    }

    return {
      success: false,
      error: 'No API key configured. Please add your Gemini API key in settings.'
    };
  }

  console.log(`[Gemini LB] 🔑 Load balancing with ${keys.length} API key(s)`);

  // Filter out keys that are rate-limited or errored
  const availableKeys = keys.filter(k => k.status !== 'rate-limited' && k.status !== 'error');
  
  if (availableKeys.length === 0) {
    console.warn('[Gemini LB] ⚠️ All keys are rate-limited or errored, trying all keys anyway');
    // Try all keys as fallback
    return fetchGeminiTranscriptionWithFallback(videoUrl, forcePromptType, translationLanguage);
  }

  // Determine which key to use (round-robin)
  let keyIndex;
  if (preferredKeyIndex !== null && preferredKeyIndex < availableKeys.length) {
    keyIndex = preferredKeyIndex;
  } else {
    // Get last used index from storage for round-robin
    const storageResult = await chrome.storage.local.get(['lastUsedKeyIndex']);
    const lastIndex = storageResult.lastUsedKeyIndex || 0;
    keyIndex = (lastIndex + 1) % availableKeys.length;
    // Save for next time
    await chrome.storage.local.set({ lastUsedKeyIndex: keyIndex });
  }

  const keyData = availableKeys[keyIndex];
  console.log(`[Gemini LB] 🎯 Using key ${keyIndex + 1}/${availableKeys.length}: ${keyData.name || keyData.id}`);

  const result = await fetchGeminiTranscription(videoUrl, keyData.key, forcePromptType, translationLanguage);

  if (result.success) {
    await updateApiKeyStatus(keyData.id, 'active', null);
    console.log(`[Gemini LB] ✅ Success with key: ${keyData.name || keyData.id}`);
    return { ...result, usedKeyIndex: keyIndex };
  }

  // Failed - try fallback to other keys
  const error = result.error || 'Unknown error';
  console.log(`[Gemini LB] ❌ Key ${keyData.name || keyData.id} failed: ${error}`);

  if (error.toLowerCase().includes('rate limit') || error.includes('429')) {
    await updateApiKeyStatus(keyData.id, 'rate-limited', error);
  } else if (error.toLowerCase().includes('quota')) {
    await updateApiKeyStatus(keyData.id, 'rate-limited', 'Quota exceeded');
  }

  // Fallback to trying all keys
  console.log('[Gemini LB] 🔄 Falling back to trying all keys...');
  return fetchGeminiTranscriptionWithFallback(videoUrl, forcePromptType, translationLanguage);
}

if (typeof window !== 'undefined') {
  window.fetchGeminiTranscription = fetchGeminiTranscription;
  window.fetchGeminiTranscriptionWithFallback = fetchGeminiTranscriptionWithFallback;
  window.fetchGeminiTranscriptionWithLoadBalancing = fetchGeminiTranscriptionWithLoadBalancing; // 🚀 New!
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchGeminiTranscription, fetchGeminiTranscriptionWithFallback };
}
