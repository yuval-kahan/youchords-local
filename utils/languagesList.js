/**
 * Language List for Translation Feature
 * Contains all major world languages with their codes and native names
 */

export const LANGUAGES = [
  // Popular languages (top of list)
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  
  // Other languages (alphabetically)
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano' },
  { code: 'ny', name: 'Chichewa', nativeName: 'Chichewa' },
  { code: 'co', name: 'Corsican', nativeName: 'Corsu' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'fy', name: 'Frisian', nativeName: 'Frysk' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hmn', name: 'Hmong', nativeName: 'Hmong' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  { code: 'jw', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Kinyarwanda' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'la', name: 'Latin', nativeName: 'Latina' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
  { code: 'mi', name: 'Maori', nativeName: 'Māori' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'my', name: 'Myanmar (Burmese)', nativeName: 'မြန်မာ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'or', name: 'Odia (Oriya)', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'sm', name: 'Samoan', nativeName: 'Gagana Samoa' },
  { code: 'gd', name: 'Scots Gaelic', nativeName: 'Gàidhlig' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho' },
  { code: 'sn', name: 'Shona', nativeName: 'Shona' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali' },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'tt', name: 'Tatar', nativeName: 'Татар' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' }
];

// Helper function to get language by code
export function getLanguageByCode(code) {
  return LANGUAGES.find(lang => lang.code === code);
}

// Helper function to search languages
export function searchLanguages(query) {
  if (!query) return LANGUAGES;
  
  const lowerQuery = query.toLowerCase();
  return LANGUAGES.filter(lang => 
    lang.name.toLowerCase().includes(lowerQuery) ||
    lang.nativeName.toLowerCase().includes(lowerQuery) ||
    lang.code.toLowerCase().includes(lowerQuery)
  );
}

// Export to window for global access
if (typeof window !== 'undefined') {
  window.LANGUAGES = LANGUAGES;
  window.getLanguageByCode = getLanguageByCode;
  window.searchLanguages = searchLanguages;
}

console.log('[LanguagesList] Loaded', LANGUAGES.length, 'languages');
