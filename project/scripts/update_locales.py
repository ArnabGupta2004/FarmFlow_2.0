
import json
import os
import sys

# Set encoding to utf-8 for console output
sys.stdout.reconfigure(encoding='utf-8')

LOCALES_DIR = r"d:\fyp_farm\project\src\locales"
EN_FILE = os.path.join(LOCALES_DIR, "en.json")

def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def sync_keys(source, target):
    """Recursively adds missing keys from source to target, using source values as defaults."""
    updated = False
    for key, value in source.items():
        if key not in target:
            target[key] = value
            updated = True
        elif isinstance(value, dict) and isinstance(target.get(key), dict):
            if sync_keys(value, target[key]):
                updated = True
    return updated

def main():
    if not os.path.exists(EN_FILE):
        print(f"Error: {EN_FILE} not found.")
        return

    en_data = load_json(EN_FILE)
    print(f"Loaded {len(en_data)} top-level keys from en.json")

    for filename in os.listdir(LOCALES_DIR):
        if filename == "en.json" or not filename.endswith(".json"):
            continue

        file_path = os.path.join(LOCALES_DIR, filename)
        print(f"Processing {filename}...")
        
        target_data = load_json(file_path)
        if sync_keys(en_data, target_data):
            save_json(file_path, target_data)
            print(f"  Updated {filename}")
        else:
            print(f"  No changes needed for {filename}")

if __name__ == "__main__":
    main()
