"""
Translation utility with in-memory caching.
Uses deep_translator (free Google Translate backend).
"""
from functools import lru_cache
from deep_translator import GoogleTranslator

# Supported languages
SUPPORTED_LANGUAGES = {
    'en': 'english',
    'hi': 'hindi',
    'bn': 'bengali',
    'ta': 'tamil',
    'te': 'telugu',
    'mr': 'marathi',
    'gu': 'gujarati',
    'kn': 'kannada',
    'ml': 'malayalam',
    'pa': 'punjabi'
}

# Cache size limit
CACHE_SIZE = 1000


@lru_cache(maxsize=CACHE_SIZE)
def _cached_translate(text: str, source: str, target: str) -> str:
    """
    Internal cached translation function.
    Cache key = (text, source, target)
    """
    if not text or not text.strip():
        return text
    
    if source == target:
        return text
    
    try:
        translator = GoogleTranslator(source=source, target=target)
        result = translator.translate(text)
        return result if result else text
    except Exception as e:
        print(f"Translation error: {e}")
        return text


def translate_text(text: str, target_lang: str, source_lang: str = 'en') -> str:
    """
    Translate text from source language to target language.
    
    Args:
        text: Text to translate
        target_lang: Target language code (e.g., 'hi', 'bn')
        source_lang: Source language code (default: 'en')
    
    Returns:
        Translated text, or original if translation fails
    """
    if not text or target_lang == source_lang:
        return text
    
    # Normalize language codes
    target = SUPPORTED_LANGUAGES.get(target_lang, target_lang)
    source = SUPPORTED_LANGUAGES.get(source_lang, source_lang)
    
    return _cached_translate(text, source, target)


def translate_to_english(text: str, source_lang: str) -> str:
    """
    Translate text from any language to English.
    Used for chatbot input processing.
    
    Args:
        text: Text to translate
        source_lang: Source language code
    
    Returns:
        English text
    """
    if not text or source_lang == 'en':
        return text
    
    source = SUPPORTED_LANGUAGES.get(source_lang, source_lang)
    return _cached_translate(text, source, 'english')


def translate_from_english(text: str, target_lang: str) -> str:
    """
    Translate text from English to target language.
    Used for chatbot output and API responses.
    
    Args:
        text: English text to translate
        target_lang: Target language code
    
    Returns:
        Translated text
    """
    if not text or target_lang == 'en':
        return text
    
    target = SUPPORTED_LANGUAGES.get(target_lang, target_lang)
    return _cached_translate(text, 'english', target)


def translate_dict_fields(data: dict, fields: list, target_lang: str) -> dict:
    """
    Translate specific fields in a dictionary.
    
    Args:
        data: Dictionary to translate
        fields: List of field names to translate
        target_lang: Target language code
    
    Returns:
        Dictionary with translated fields
    """
    if target_lang == 'en':
        return data
    
    result = data.copy()
    for field in fields:
        if field in result and isinstance(result[field], str):
            result[field] = translate_from_english(result[field], target_lang)
    
    return result


def get_cache_info():
    """Get cache statistics."""
    return _cached_translate.cache_info()


def clear_cache():
    """Clear the translation cache."""
    _cached_translate.cache_clear()
