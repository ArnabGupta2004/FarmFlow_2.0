
from deep_translator import GoogleTranslator
import sys

try:
    text = "এই ঋতুতে গাছপালায় কী কী রোগ হতে পারে?"
    print(f"Original: {text}")
    
    translator = GoogleTranslator(source='bengali', target='english')
    translated = translator.translate(text)
    print(f"Translated (bn->en): {translated}")
    
    back = GoogleTranslator(source='english', target='bengali').translate(translated)
    print(f"Back (en->bn): {back}")
    
except Exception as e:
    print(f"Error: {e}")
