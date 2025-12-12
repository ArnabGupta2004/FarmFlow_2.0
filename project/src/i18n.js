import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import language files
import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import mr from './locales/mr.json';
import gu from './locales/gu.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import pa from './locales/pa.json';

// Language configuration
export const languages = {
    en: { name: 'English', flag: '🇬🇧' },
    hi: { name: 'हिंदी', flag: '🇮🇳' },
    bn: { name: 'বাংলা', flag: '🇮🇳' },
    ta: { name: 'தமிழ்', flag: '🇮🇳' },
    te: { name: 'తెలుగు', flag: '🇮🇳' },
    mr: { name: 'मराठी', flag: '🇮🇳' },
    gu: { name: 'ગુજરાતી', flag: '🇮🇳' },
    kn: { name: 'ಕನ್ನಡ', flag: '🇮🇳' },
    ml: { name: 'മലയാളം', flag: '🇮🇳' },
    pa: { name: 'ਪੰਜਾਬੀ', flag: '🇮🇳' }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            hi: { translation: hi },
            bn: { translation: bn },
            ta: { translation: ta },
            te: { translation: te },
            mr: { translation: mr },
            gu: { translation: gu },
            kn: { translation: kn },
            ml: { translation: ml },
            pa: { translation: pa }
        },
        fallbackLng: 'en',
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage']
        },
        interpolation: {
            escapeValue: false
        }
    });

export default i18n;

// Helper to get current language
export const getCurrentLang = () => {
    return localStorage.getItem('i18nextLng') || 'en';
};

// Helper to change language
export const changeLanguage = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
};
