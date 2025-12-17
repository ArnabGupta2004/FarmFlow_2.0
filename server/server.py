import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    import torch
except ImportError:
    pass
import uuid
import re
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from web3 import Web3
from rank_bm25 import BM25Okapi
import warnings
warnings.filterwarnings("ignore")

os.environ["TRANSFORMERS_NO_TF"] = "1"
# -----------------------
# GOV SCHEME ENGINE (FROM FILE O)
# -----------------------
import pandas as pd
import numpy as np
import requests

from src.scheme_engine.engine import recommend_scheme_single, df as SCHEME_DF

# Optional RAG
try:
    from src.vectorstore import FaissVectorStore
    from src.search import RAGSearch
except Exception as e:
    print(f"RAG MODULE IMPORT ERROR: {e}")
    # Print full traceback for deep debugging
    import traceback
    traceback.print_exc()
    FaissVectorStore = None
    RAGSearch = None

# Translation utility
from src.translator import (
    translate_text,
    translate_to_english,
    translate_from_english,
    translate_dict_fields,
    SUPPORTED_LANGUAGES
)


# -----------------------
# INITIALIZE
# -----------------------
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"*": {"origins": "*"}})

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/krishiMitra")
app.config["MONGO_URI"] = MONGO_URI
mongo = PyMongo(app)

OPENWEATHER_KEY = os.getenv("OPENWEATHER_API")

INFURA_URL = os.getenv("INFURA_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
PORT = int(os.getenv("PORT", "5000"))

ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "farmer", "type": "address"},
            {"internalType": "address", "name": "seller", "type": "address"},
            {"internalType": "string", "name": "crop", "type": "string"},
            {"internalType": "string", "name": "region", "type": "string"},
            {"internalType": "uint256", "name": "price", "type": "uint256"},
        ],
        "name": "createDeal",
        "outputs": [{"internalType": "bytes32", "name": "dealId", "type": "bytes32"}],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


# -----------------------
# HELPERS
# -----------------------
def clean_alphanumeric(t: str) -> str:
    t_str = str(t or "").lower()
    return "".join([c for c in t_str if c.isalnum()])


def get_lang() -> str:
    """Get language from request query param, default to 'en'."""
    lang = request.args.get("lang", "en")
    return lang if lang in SUPPORTED_LANGUAGES else "en"


def get_web3():
    if not INFURA_URL:
        raise RuntimeError("INFURA_URL not set.")
    w3 = Web3(Web3.HTTPProvider(INFURA_URL))
    try:
        ok = w3.is_connected()
    except Exception:
        ok = False
    if not ok:
        raise RuntimeError("Cannot connect to blockchain provider.")
    return w3


def create_blockchain_deal(crop, region, price, farmer_address=None, seller_address=None):
    if not PRIVATE_KEY or not CONTRACT_ADDRESS:
        return None
    try:
        w3 = get_web3()
        acct = w3.eth.account.from_key(PRIVATE_KEY)
        farmer_addr = farmer_address or acct.address
        seller_addr = seller_address or acct.address
        contract = w3.eth.contract(address=w3.to_checksum_address(CONTRACT_ADDRESS), abi=ABI)
        nonce = w3.eth.get_transaction_count(acct.address)
        gas_price = w3.to_wei("10", "gwei")
        txn = contract.functions.createDeal(
            w3.to_checksum_address(farmer_addr),
            w3.to_checksum_address(seller_addr),
            str(crop),
            str(region),
            int(price)
        ).build_transaction({
            "from": acct.address,
            "nonce": nonce,
            "gas": 300000,
            "gasPrice": gas_price,
        })
        signed = acct.sign_transaction(txn)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()
    except Exception:
        return None


# -----------------------
# OPTIONAL RAG
# -----------------------
rag = None
if FaissVectorStore and RAGSearch:
    try:
        print("Initializing RAG...")
        store = FaissVectorStore("faiss_store")
        store.load()
        rag = RAGSearch(vector_store=store)
        print("RAG successfully initialized!")
    except Exception as e:
        print("RAG INIT ERROR:", e)
        rag = None
else:
    print("RAG modules not found: FaissVectorStore or RAGSearch is None")

# -----------------------
# MARKETPLACE RECOMMENDER HELPERS (FROM FILE F)
# -----------------------
def preprocess_text_for_bm25(text):
    t = str(text or "").lower()
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    return [tok for tok in t.split() if tok]


def build_seller_docs_from_db():
    sellers_cursor = mongo.db.users.find({"role": {"$regex": "^seller$", "$options": "i"}})
    sellers, corpus = [], []

    for s in sellers_cursor:
        seller = {
            "_id": s.get("_id"),
            "fpcName": s.get("fpcName") or s.get("fpc_name") or s.get("_id"),
            "district": s.get("district", ""),
            "address": s.get("address", "") or s.get("Address", ""),
            "contact_phone": s.get("contact_phone", "") or s.get("Contact_Phone", "")
        }

        comms = s.get("commodities", [])
        if isinstance(comms, list):
            seller["commodities"] = ", ".join([str(x) for x in comms if x])
        else:
            seller["commodities"] = str(comms)

        try:
            rating_value = s.get("rating") or s.get("Rating") or 5
            seller["rating"] = float(rating_value)
        except:
            seller["rating"] = 5.0

        try:
            exp_value = s.get("experience") or s.get("years_of_experience") or 5
            seller["years_of_experience"] = float(exp_value)
        except:
            seller["years_of_experience"] = 5.0

        sellers.append(seller)

        doc_text = (
            f"{seller['fpcName']} {seller['district']} "
            f"{seller['commodities']} {seller['address']}"
        )
        corpus.append(preprocess_text_for_bm25(doc_text))

    bm25 = BM25Okapi(corpus) if corpus else None
    return sellers, bm25


def district_similarity_score(farmer_district, seller_district):
    farmer_district = str(farmer_district or "").lower().strip()
    seller_district = str(seller_district or "").lower().strip()
    if not farmer_district or not seller_district:
        return 0.3
    if farmer_district == seller_district:
        return 1.0
    if farmer_district in seller_district or seller_district in farmer_district:
        return 0.7
    return 0.3


def commodity_match_score(query_crops, seller_commodities):
    query_crops = [c.strip().lower() for c in str(query_crops or "").split(",") if c.strip()]
    seller_commodities = str(seller_commodities or "").lower()
    if not query_crops:
        return 0.5
    matches = sum(1 for crop in query_crops if crop in seller_commodities)
    return min(matches / len(query_crops), 1.0)


def normalize_value(val, min_val, max_val):
    if max_val == min_val:
        return 0.5
    try:
        return (val - min_val) / (max_val - min_val)
    except:
        return 0.5


# -----------------------
# GOV SCHEME ENGINE HELPERS (FROM FILE O)
# -----------------------
def is_central_ministry(text: str) -> bool:
    text = text.lower()
    return text.startswith("ministry of") or "government of india" in text


def get_next_best_scheme(crop: str, state: str, exclude_list):
    crop = crop.lower().strip()
    state = state.lower().strip()

    try:
        engine_res = recommend_scheme_single(crop, state)
        best_name = engine_res["scheme_name"]
    except:
        engine_res = None
        best_name = None

    if engine_res and best_name not in exclude_list:
        return engine_res

    df = SCHEME_DF.copy()
    df = df[~df["scheme_name"].isin(exclude_list)]

    if df.empty:
        return None

    scores = []

    for _, row in df.iterrows():
        score = 0
        desc = row["description"].lower()
        tags = row["tags"].lower()
        sm = row["state_ministry"].lower()
        name = row["scheme_name"].lower()

        if state in sm:
            score += 8000
        elif is_central_ministry(sm):
            score += 3000
        else:
            score -= 4000

        if crop in name:
            score += 500
        if crop in desc:
            score += 300
        if crop in tags:
            score += 200

        scores.append((score, row))

    scores.sort(key=lambda x: x[0], reverse=True)
    best_score, best_row = scores[0]

    return {
        "scheme_name": best_row["scheme_name"],
        "state_ministry": best_row["state_ministry"],
        "description": best_row["description"],
        "tags": best_row["tags"],
        "scheme_link": best_row.get("scheme_link", ""),
        "score": float(best_score),
    }
# ============================================================
# AUTH (KEEPING FILE F VERSION)
# ============================================================
@app.post("/signUp")
def signUp():
    data = request.get_json() or {}
    uid = data.get("uniqueID")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    state = data.get("state")

    if not uid or not email or not password or not role or not state:
        return jsonify({"error": "Missing required general fields"}), 400

    clean_uid = clean_alphanumeric(uid)

    if mongo.db.users.find_one({"_id": clean_uid}) or mongo.db.users.find_one({"email": email}):
        return jsonify({"error": "This ID or email is already taken."}), 400

    hashed = generate_password_hash(password)

    user_doc = {
        "_id": clean_uid,
        "email": email,
        "password": hashed,
        "role": role,
        "state": state
    }

    if role.lower() == "seller":
        fpc_name = data.get("fpcName") or data.get("fpc_name")
        district = data.get("district")
        experience = data.get("experience")
        commodities = data.get("commodities")
        if not all([fpc_name, district, experience, commodities]):
            return jsonify({"error": "Seller details missing"}), 400

        user_doc.update({
            "fpcName": fpc_name,
            "district": district,
            "experience": experience,
            "commodities": [c.strip() for c in commodities if c.strip()],
        })

    try:
        mongo.db.users.insert_one(user_doc)
        return jsonify({"message": "Signup successful", "user": uid}), 201

    except Exception as e:
        print("Signup DB Error:", e)
        return jsonify({"error": "Database issue"}), 500


@app.post("/login")
def login():
    data = request.get_json() or {}
    uid = data.get("uniqueID")
    pw = data.get("password")

    if not uid or not pw:
        return jsonify({"error": "Missing fields"}), 400

    clean_uid = clean_alphanumeric(uid)
    user = mongo.db.users.find_one({"_id": clean_uid})

    if not user:
        return jsonify({"error": "Invalid userID"}), 400
    if not check_password_hash(user["password"], pw):
        return jsonify({"error": "Wrong password"}), 400

    response = {
        "message": "Login successful",
        "user": uid,
        "role": user.get("role")
    }

    if user.get("role", "").lower() == "seller":
        response["fpc_name"] = user.get("fpcName")

    return jsonify(response), 200


# ============================================================
# TRANSLATION ENDPOINT
# ============================================================
@app.post("/api/translate")
def translate_api():
    """Translate text from English to target language."""
    data = request.get_json() or {}
    text = data.get("text", "")
    lang = data.get("lang", "en")
    
    if not text:
        return jsonify({"translated": ""}), 200
    
    if lang == "en" or lang not in SUPPORTED_LANGUAGES:
        return jsonify({"translated": text}), 200
    
    try:
        translated = translate_from_english(text, lang)
        return jsonify({"translated": translated}), 200
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({"translated": text}), 200


# ============================================================
# WEATHER ENDPOINTS (FROM FILE O)
# ============================================================
@app.get("/api/weather/forecast")
def weather_forecast():
    lat = request.args.get("lat")
    lon = request.args.get("lon")

    if not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    if not OPENWEATHER_KEY:
        return jsonify({"error": "Missing OpenWeather key"}), 500

    url = (
        f"https://api.openweathermap.org/data/2.5/forecast?"
        f"lat={lat}&lon={lon}&appid={OPENWEATHER_KEY}&units=metric"
    )

    try:
        r = requests.get(url)
        data = r.json()

        if "list" not in data:
            return jsonify({"error": "OpenWeather error", "details": data}), 500

        return jsonify({"forecast": data["list"]}), 200

    except Exception as e:
        print("WEATHER FORECAST ERROR:", e)
        return jsonify({"error": str(e)}), 500


@app.get("/api/weather/current")
def weather_current():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    lang = get_lang()

    if not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    if not OPENWEATHER_KEY:
        return jsonify({"error": "Missing OpenWeather key"}), 500

    url = (
        f"https://api.openweathermap.org/data/2.5/weather?"
        f"lat={lat}&lon={lon}&appid={OPENWEATHER_KEY}&units=metric"
    )

    try:
        r = requests.get(url)
        data = r.json()

        condition = data["weather"][0]["description"]
        # Translate condition if not English
        if lang != "en":
            condition = translate_from_english(condition, lang)

        result = {
            "temp": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "rain": data.get("rain", {}).get("1h", 0),
            "condition": condition,
            "icon": data["weather"][0]["icon"]
        }

        return jsonify(result), 200

    except Exception as e:
        print("CURRENT WEATHER ERROR:", e)
        return jsonify({"error": str(e)}), 500


# ============================================================
# GOV SCHEME ENDPOINTS (FROM FILE O)
# ============================================================
@app.post("/api/scheme/bycrop")
def scheme_bycrop():
    data = request.get_json() or {}
    crop = data.get("crop", "").strip()
    state = data.get("state", "").strip()
    shown = data.get("shown_schemes", [])
    lang = data.get("lang", "en")

    scheme_dict = get_next_best_scheme(crop, state, shown)

    if scheme_dict is None:
        return jsonify({"error": "No scheme available"}), 404

    # Translate scheme_name and state_ministry if not English
    if lang != "en" and lang in SUPPORTED_LANGUAGES:
        scheme_dict = translate_dict_fields(scheme_dict, ["scheme_name", "state_ministry"], lang)

    return jsonify({"recommended_scheme": scheme_dict}), 200


@app.post("/api/scheme/auto")
def scheme_auto():
    data = request.get_json() or {}
    userID = data.get("userID")
    shown = data.get("shown_schemes", [])
    lang = data.get("lang", "en")

    user = mongo.db.users.find_one({"_id": userID})
    if not user:
        return jsonify({"error": "User not found"}), 404

    state = user["state"]

    latest_crop = list(mongo.db.crops.find({"userID": userID}).sort("date", -1).limit(1))
    if not latest_crop:
        return jsonify({"error": "No crop entries"}), 404

    crop = latest_crop[0]["text"]

    scheme_dict = get_next_best_scheme(crop, state, shown)

    if scheme_dict is None:
        return jsonify({"error": "No scheme available"}), 404

    # Translate description and scheme_name if not English
    if lang != "en" and lang in SUPPORTED_LANGUAGES:
        scheme_dict = translate_dict_fields(scheme_dict, ["description", "scheme_name"], lang)

    return jsonify({
        "crop": crop,
        "state": state,
        "recommended_scheme": scheme_dict
    }), 200


# ============================================================
# SIMPLE SELLERS API (ONLY FROM FILE O)
# ============================================================
@app.get("/api/sellers")
def get_sellers():
    state = request.args.get("state")
    if not state:
        return jsonify({"error": "State required"}), 400

    sellers = list(
        mongo.db.users.find(
            {"role": "seller", "state": state},
            {"_id": 0, "password": 0}
        )
    )
    return jsonify({"sellers": sellers}), 200


# ============================================================
# CROPS (KEEPING FILE F)
# ============================================================
@app.post("/api/crops/add")
def add_crop():
    data = request.get_json() or {}
    userID = data.get("userID")
    text = data.get("text")
    date = data.get("date")

    if not userID or not text or not date:
        return jsonify({"error": "Missing fields"}), 400

    mongo.db.crops.insert_one({"userID": userID, "text": text, "date": date})

    return jsonify({"message": "Crop saved"}), 201


@app.get("/api/crops/get")
def get_crops():
    userID = request.args.get("userID")
    if not userID:
        return jsonify({"error": "userID required"}), 400

    # 1. Fetch all crops for user
    all_crops = list(mongo.db.crops.find({"userID": userID}))
    
    active_crops = []
    now = datetime.now()

    for c in all_crops:
        try:
            # Assuming format "YYYY-MM-DD"
            c_date = datetime.strptime(c["date"], "%Y-%m-%d")
            # If date is in the past (completed)
            if c_date < now:
                # Move to history
                # Check if already exists in history to avoid dupes? (Maybe not needed if we delete from crops)
                # Ensure _id is preserved or let mongo generate new one?
                # Let's insert a copy to history without _id to avoid collision if they use random IDs, 
                # or just pop _id.
                c_copy = c.copy()
                if "_id" in c_copy:
                    del c_copy["_id"]
                
                mongo.db.crop_history.insert_one(c_copy)
                
                # Delete from active crops
                mongo.db.crops.delete_one({"_id": c["_id"]})
            else:
                c.pop("_id", None)
                active_crops.append(c)
        except Exception as e:
            # If date parse fails, treat as active for safety or log error
            print(f"Date parse error for crop {c.get('text')}: {e}")
            c.pop("_id", None)
            active_crops.append(c)

    return jsonify(active_crops), 200


@app.get("/api/crops/history")
def get_crop_history():
    userID = request.args.get("userID")
    limit = int(request.args.get("limit", 0))

    if not userID:
        return jsonify({"error": "userID required"}), 400

    query = mongo.db.crop_history.find({"userID": userID}, {"_id": 0}).sort("date", -1)
    
    if limit > 0:
        history_crops = list(query.limit(limit))
    else:
        history_crops = list(query)

    return jsonify(history_crops), 200

# ============================================================
# ADVANCED MARKETPLACE RECOMMENDER (KEEPING FILE F EXACTLY)
# ============================================================
@app.post("/api/recommend")
def recommend():
    """
    Advanced recommendation system using:
    - BM25 semantic search
    - Rating boost
    - District matching
    - Commodity matching
    - Experience weighting
    Weighted scoring system
    """
    try:
        data = request.get_json() or {}
        crop_input = data.get("crop", "").strip()
        district_input = data.get("district", "").strip()
        state_input = data.get("state", "").strip()

        if not district_input:
            district_input = data.get("region", "").strip()

        all_sellers, bm25_model = build_seller_docs_from_db()

        if not all_sellers:
            return jsonify([]), 200

        crop_keywords = [c.strip().lower() for c in crop_input.split(",") if c.strip()]
        matched = []

        if crop_keywords:
            for s in all_sellers:
                seller_comm = str(s.get("commodities", "")).lower()
                if any(crop in seller_comm for crop in crop_keywords):
                    matched.append(s)
        else:
            matched = all_sellers

        if not matched:
            return jsonify([]), 200

        query = f"{crop_input} {district_input} {state_input}".strip()
        tokenized = preprocess_text_for_bm25(query)

        bm25_scores = {}
        if bm25_model:
            scores = bm25_model.get_scores(tokenized)
            for i, seller in enumerate(all_sellers):
                sid = seller.get("_id")
                bm25_scores[sid] = scores[i] if i < len(scores) else 0.0

        for seller in matched:
            sid = seller["_id"]
            seller["bm25_score"] = bm25_scores.get(sid, 0.0)
            seller["district_score"] = district_similarity_score(
                district_input, seller.get("district", "")
            )
            seller["commodity_score"] = commodity_match_score(
                crop_input, seller.get("commodities", "")
            )

        ratings = [s.get("rating", 5.0) for s in matched]
        experiences = [s.get("years_of_experience", 5.0) for s in matched]
        bm25_vals = [s.get("bm25_score", 0.0) for s in matched]

        min_r, max_r = min(ratings), max(ratings)
        min_e, max_e = min(experiences), max(experiences)
        max_b = max(bm25_vals) if max(bm25_vals) > 0 else 1.0

        for s in matched:
            s["rating_norm"] = normalize_value(s.get("rating", 5.0), min_r, max_r)
            s["experience_norm"] = normalize_value(
                s.get("years_of_experience", 5.0), min_e, max_e
            )
            s["bm25_norm"] = s.get("bm25_score", 0.0) / max_b

        for s in matched:
            s["final_score"] = (
                s["rating_norm"] * 0.40 +
                s["district_score"] * 0.25 +
                s["commodity_score"] * 0.20 +
                s["experience_norm"] * 0.10 +
                s["bm25_norm"] * 0.05
            )

        matched.sort(key=lambda x: x["final_score"], reverse=True)

        output = []
        for s in matched:
            comm = s.get("commodities", "")
            comm = ", ".join(comm) if isinstance(comm, list) else comm

            output.append({
                "FPC_Name": s.get("fpcName"),
                "District": s.get("district", ""),
                "Commodities": comm,
                "Rating": s.get("rating", 5.0),
                "Years_of_Experience": s.get("years_of_experience", 5.0),
                "Contact_Phone": s.get("contact_phone", ""),
                "Address": s.get("address", ""),
                "match_percentage": round(s["final_score"] * 100, 1),
                "fpc_name": s.get("fpcName"),
                "fpc_id": s.get("_id")
            })

        return jsonify(output), 200

    except Exception as e:
        print("RECOMMENDATION ERROR:", e)
        return jsonify({"error": "Recommendation failed"}), 500


# ============================================================
# REQUEST SYSTEM (KEEPING FILE F)
# ============================================================
CHATS = []

@app.post("/api/request")
def create_request():
    data = request.get_json() or {}

    provided_fpc_id = data.get("fpc_id")
    fpc_value_raw = data.get("fpc_name") or data.get("fpcName") or ""
    fpc_value = str(fpc_value_raw).strip()

    farmer_id = clean_alphanumeric(data.get("farmer_id"))
    required = ["farmer_name", "crop", "region", "price"]

    if not fpc_value and not provided_fpc_id:
        return jsonify({"error": "Missing FPC identifier"}), 400
    if not all(k in data for k in required):
        return jsonify({"error": "Missing fields"}), 400

    try:
        price_int = int(float(data.get("price")))
    except:
        return jsonify({"error": "Price must be number"}), 400

    fpc_id = None
    fpc_name_store = fpc_value

    if provided_fpc_id:
        fpc_id = clean_alphanumeric(provided_fpc_id)
        seller = mongo.db.users.find_one({"_id": fpc_id})
        if seller and seller.get("fpcName"):
            fpc_name_store = seller["fpcName"]
    else:
        seller = mongo.db.users.find_one({"fpcName": {"$regex": f"^{re.escape(fpc_value)}$", "$options": "i"}})
        if not seller:
            seller = mongo.db.users.find_one({"fpcName": {"$regex": f"{re.escape(fpc_value)}", "$options": "i"}})
        if seller:
            fpc_id = seller.get("_id")
            fpc_name_store = seller.get("fpcName", fpc_value)

    request_id = str(uuid.uuid4())
    doc = {
        "id": request_id,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "farmer_id": farmer_id,
        "farmer_name": data.get("farmer_name"),
        "crop": data.get("crop"),
        "region": data.get("region"),
        "price": price_int,
        "fpc_name": fpc_name_store,
        "fpc_id": fpc_id,
        "status": "pending"
    }

    try:
        mongo.db.requests.insert_one(doc)
        notif = {
            "id": str(uuid.uuid4()),
            "to": fpc_name_store,
            "msg": f"Farmer {data.get('farmer_name')} wants to connect for {data.get('crop')} in {data.get('region')}",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "read": False,
            "request_id": request_id
        }
        mongo.db.notifications.insert_one(notif)

        return jsonify({"ok": True, "request_id": request_id}), 201

    except Exception as e:
        print("Mongo Insert Error:", e)
        return jsonify({"error": "Failed to store request"}), 500


@app.get("/api/requests")
def list_requests():
    farmer = request.args.get("farmer_id")
    fpc = request.args.get("fpc_name")
    fpc_id = request.args.get("fpc_id")

    q = {}
    if farmer:
        q["farmer_id"] = clean_alphanumeric(farmer)
    if fpc_id:
        q["fpc_id"] = clean_alphanumeric(fpc_id)
    if fpc:
        q["fpc_name"] = {"$regex": re.escape(fpc.strip()), "$options": "i"}

    try:
        data = list(mongo.db.requests.find(q, {"_id": 0}))
        return jsonify(data), 200
    except Exception as e:
        print("Request fetch error:", e)
        return jsonify({"error": "Failed to fetch requests"}), 500


@app.post("/api/accept/<rid>")
def accept_request(rid):
    try:
        req = mongo.db.requests.find_one({"id": rid})
        if req and req["status"] == "pending":
            tx = create_blockchain_deal(req["crop"], req["region"], req["price"])
            mongo.db.requests.update_one({"id": rid}, {"$set": {"status": "accepted", "tx_hash": tx}})
            mongo.db.notifications.update_many({"request_id": rid}, {"$set": {"read": True}})
            return jsonify({"ok": True, "tx_hash": tx}), 200
    except Exception as e:
        print("Accept error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": False}), 404


@app.post("/api/reject/<rid>")
def reject_request(rid):
    try:
        res = mongo.db.requests.update_one(
            {"id": rid, "status": "pending"},
            {"$set": {"status": "rejected"}}
        )
        mongo.db.notifications.update_many({"request_id": rid}, {"$set": {"read": True}})
        if res.modified_count > 0:
            return jsonify({"ok": True}), 200
    except Exception as e:
        print("Reject error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": False}), 404


@app.post("/api/request/delete/<rid>")
def delete_request(rid):
    try:
        req = mongo.db.requests.find_one({"id": rid})
        if not req:
            return jsonify({"ok": False, "error": "Not found"}), 404

        farmer_id = req.get("farmer_id")
        fpc_id = req.get("fpc_id")

        mongo.db.requests.delete_one({"id": rid})
        mongo.db.notifications.delete_many({"request_id": rid})

        room1 = f"{farmer_id}_{fpc_id}"
        room2 = f"{fpc_id}_{farmer_id}"

        global CHATS
        CHATS = [m for m in CHATS if not (m["room"] == room1 or m["room"] == room2)]

        return jsonify({"ok": True}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ============================================================
# NOTIFICATIONS (KEEPING FILE F)
# ============================================================
@app.get("/api/notifications")
def notifications():
    fpc_name_input = request.args.get("fpc_name")
    if not fpc_name_input:
        return jsonify([]), 200

    normalized = fpc_name_input.strip()

    try:
        notifs = list(
            mongo.db.notifications.find(
                {"to": {"$regex": f"{re.escape(normalized)}", "$options": "i"}},
                {"_id": 0}
            ).sort("timestamp", -1)
        )
        return jsonify(notifs), 200

    except Exception as e:
        print("Notification fetch error:", e)
        return jsonify({"error": "Failed to fetch notifications"}), 500


# ============================================================
# CHAT SYSTEM (KEEPING FILE F)
# ============================================================
@app.post("/api/chat/send")
def send_message():
    data = request.get_json() or {}
    sender = data.get("sender")
    receiver = data.get("receiver")
    text = data.get("text")
    room = data.get("room")

    if not sender or not receiver or not text or not room:
        return jsonify({"ok": False, "error": "Missing sender/receiver/text/room"}), 400

    msg = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "sender": str(sender),
        "receiver": str(receiver),
        "text": text,
        "room": room,
    }

    CHATS.append(msg)
    return jsonify({"ok": True, "msg": msg}), 201


@app.get("/api/chat/history")
def chat_history():
    room = request.args.get("room")
    if not room:
        return jsonify({"ok": False, "error": "room required"}), 400

    msgs = [m for m in CHATS if m.get("room") == room]
    return jsonify(msgs), 200


# ============================================================
# RAG CHATBOT (KEEPING FILE F)
# ============================================================
@app.post("/chatbot")
def chatbot():
    if rag is None:
        return jsonify({"error": "RAG not ready"}), 503

    data = request.get_json() or {}
    user_input = (data.get("message") or "").strip()
    lang = data.get("lang", "en")

    if not user_input:
        return jsonify({"error": "Empty message"}), 400

    try:
        # Translate user message to English for RAG processing
        english_input = user_input
        if lang != "en" and lang in SUPPORTED_LANGUAGES:
            english_input = translate_to_english(user_input, lang)

        # Process with RAG in English
        ans = rag.search_and_summarize(english_input)

        # Translate response back to user's language
        if lang != "en" and lang in SUPPORTED_LANGUAGES:
            ans = translate_from_english(ans, lang)

        return jsonify({"reply": ans}), 200
    except Exception as e:
        print("CHATBOT ERROR:", e)
        return jsonify({"error": "RAG search failed"}), 500


# ============================================================
# USER FETCH (KEEPING FILE F)
# ============================================================
@app.get("/api/user")
def get_user():
    uid = request.args.get("id")
    if not uid:
        return jsonify({"error": "id required"}), 400

    clean_uid = clean_alphanumeric(uid)
    user = mongo.db.users.find_one({"_id": clean_uid}, {"_id": 0})

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify(user), 200


# ============================================================
# HOME + HEALTH (KEEPING FILE F)
# ============================================================
@app.get("/")
def home():
    return "🌾 AgriConnect + KrishiMitra API Running!"


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


# ============================================================
# MAIN
# ============================================================

# ============================================================
# DISEASE DETECTION (FROM USER CODE)
# ============================================================
import numpy as np
from PIL import Image
import io

# Load Model Globally
DISEASE_MODEL = None
DISEASE_MODEL_ERROR = None

try:
    print("Loading Disease Model...")
    import tensorflow as tf
    from tensorflow.keras.layers import InputLayer

    # ---- Keras backward compatibility patch ----
    # TensorFlow 2.15+ doesn't accept 'shape' parameter in InputLayer config
    # This patch converts old 'shape' parameter to 'batch_input_shape'
    _original_from_config = InputLayer.from_config

    @classmethod
    def patched_from_config(cls, config):
        config = dict(config)
        
        # Handle old 'shape' parameter that's no longer accepted
        if "shape" in config and "batch_input_shape" not in config:
            shape = config.pop("shape")
            # Convert shape to batch_input_shape with None for batch dimension
            config["batch_input_shape"] = (None,) + tuple(shape)
        
        # Handle batch_shape if present
        if "batch_shape" in config and "batch_input_shape" not in config:
            config["batch_input_shape"] = config.pop("batch_shape")
        
        return _original_from_config(config)

    InputLayer.from_config = patched_from_config
    
    # ---- DTypePolicy backward compatibility patch ----
    # Some models saved with newer Keras versions use 'DTypePolicy'
    # We need to define it so it can be deserialized
    class DTypePolicy:
        def __init__(self, name=None, **kwargs):
            self._name = name or "float32"
            self._global_policy = None
            
        @property
        def name(self):
            return self._name
            
    class DTypePolicy:
        def __init__(self, name=None, **kwargs):
            self._name = name or "float32"
            self._global_policy = None
            
        @property
        def name(self):
            return self._name
            
        def __getattr__(self, name):
            # Fallback for any other attributes Keras might look for
            # (variable_dtype, compute_dtype, etc.)
            return self._name
            
        def get_config(self):
            return {"name": self._name}
            
        @classmethod
        def from_config(cls, config):
            return cls(**config)
    # -------------------------------------------------

    model_path = os.path.join(
        os.path.dirname(__file__),
        "models",
        "trained_plant_disease_model.h5"
    )

    if os.path.exists(model_path):
        DISEASE_MODEL = tf.keras.models.load_model(
            model_path,
            compile=False,
            custom_objects={'DTypePolicy': DTypePolicy}
        )
        print("Disease Model Loaded Successfully!")
    else:
        DISEASE_MODEL_ERROR = f"Model file not found at {model_path}"
        print(DISEASE_MODEL_ERROR)

except Exception as e:
    DISEASE_MODEL_ERROR = str(e)
    print(f"Error loading disease model: {e}")

DISEASE_CLASSES = [
    "Apple___Apple_scab", "Apple___Black_rot", "Apple___Cedar_apple_rust", "Apple___healthy",
    "Blueberry___healthy", "Cherry_(including_sour)___Powdery_mildew", "Cherry_(including_sour)___healthy",
    "Corn_(maize)___Cercospora_leaf_spot_Gray_leaf_spot", "Corn_(maize)___Common_rust_",
    "Corn_(maize)___Northern_Leaf_Blight", "Corn_(maize)___healthy", "Grape___Black_rot",
    "Grape___Esca_(Black_Measles)", "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)", "Grape___healthy",
    "Orange___Haunglongbing_(Citrus_greening)", "Orange___healthy", "Peach___Bacterial_spot",
    "Peach___healthy", "Pepper,_bell___Bacterial_spot", "Pepper,_bell___healthy", "Potato___Early_blight",
    "Potato___Late_blight", "Potato___healthy", "Raspberry___healthy", "Soybean___healthy",
    "Squash___Powdery_mildew", "Strawberry___Leaf_scorch", "Strawberry___healthy", "Tomato___Bacterial_spot",
    "Tomato___Early_blight", "Tomato___Late_blight", "Tomato___Leaf_Mold", "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite", "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus", "Tomato___Tomato_mosaic_virus", "Tomato___healthy"
]

@app.get("/api/disease_detection/status")
def disease_status():
    status = "loaded" if DISEASE_MODEL is not None else "failed"
    return jsonify({"status": status, "error": DISEASE_MODEL_ERROR}), 200

@app.post("/api/disease_detection/predict")
def predict_disease():
    print(f"Prediction Request. Model: {DISEASE_MODEL}")
    if DISEASE_MODEL is None:
        return jsonify({"error": "Model not loaded. Check server logs."}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Preprocess
        img = Image.open(file.stream).convert('RGB')
        img = img.resize((128, 128))
        x = np.array(img)
        x = np.expand_dims(x, axis=0)
        x = x / 255.0

        # Predict
        predictions = DISEASE_MODEL.predict(x)
        predicted_index = np.argmax(predictions[0])
        confidence = float(predictions[0][predicted_index] * 100)
        disease_name = DISEASE_CLASSES[predicted_index]

        return jsonify({
            "disease": disease_name,
            "confidence": confidence
        }), 200

    except Exception as e:
        print("Prediction Error:", e)
        return jsonify({"error": str(e)}), 500

# ============================================================
# CROP RECOMMENDATION (FROM USER CODE)
# ============================================================
import pickle
import pandas as pd
import sklearn  # Ensure sklearn is available for unpickling

# Load Models & Data
CROP_MODELS = {}
SOIL_DATA = None

try:
    print("Loading Crop Recommendation Models...")
    base_path = os.path.dirname(__file__)
    models_path = os.path.join(base_path, "models")
    
    # Load Pickles
    CROP_MODELS['encoder'] = pickle.load(open(os.path.join(models_path, "encoder.pkl"), 'rb'))
    CROP_MODELS['scaler'] = pickle.load(open(os.path.join(models_path, "scaler.pkl"), 'rb'))
    CROP_MODELS['model'] = pickle.load(open(os.path.join(models_path, "model_gbc.pkl"), 'rb'))
    
    # Load CSV
    csv_path = os.path.join(base_path, "shc_scaled_to_crop_range.csv")
    if os.path.exists(csv_path):
        SOIL_DATA = pd.read_csv(csv_path)
        print("Crop Recommendation Models & Data Loaded Successfully!")
    else:
        print(f"Crop CSV not found at {csv_path}")

except Exception as e:
    print(f"Error loading crop recommendation models: {e}")

# Helper: Get Weather
def get_weather_for_state(state_name):
    try:
        if not OPENWEATHER_KEY:
            return None, None, None
        
        # OpenWeather API call
        url = f"http://api.openweathermap.org/data/2.5/weather?q={state_name},IN&appid={OPENWEATHER_KEY}&units=metric"
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            temp = data["main"].get("temp", 0.0)
            hum = data["main"].get("humidity", 0.0)
            rain = data.get("rain", {}).get("1h", 0.0)
            return temp, hum, rain
        return None, None, None
    except Exception as e:
        print(f"Weather Fetch Error: {e}")
        return None, None, None

@app.get("/api/recommender/states")
def get_states():
    if SOIL_DATA is not None:
        try:
            states = SOIL_DATA['State'].unique().tolist()
            states.sort()
            return jsonify(states), 200
        except Exception as e:
             return jsonify({"error": str(e)}), 500
    return jsonify([]), 500

@app.get("/api/recommender/data")
def get_recommender_data():
    state = request.args.get("state")
    if not state or SOIL_DATA is None:
        return jsonify({"error": "Invalid state or data not loaded"}), 400
    
    try:
        subset = SOIL_DATA[SOIL_DATA['State'] == state]
        if subset.empty:
             return jsonify({"error": "State not found in dataset"}), 404
             
        row = subset.iloc[0]
        temp, hum, rain = get_weather_for_state(state)
        
        data = {
            "N": float(row['N']),
            "P": float(row['P']),
            "K": float(row['K']),
            "ph": float(row['pH']),
            "temperature": temp if temp is not None else 25.0, 
            "humidity": hum if hum is not None else 50.0,
            "rainfall": rain if rain is not None else 0.0
        }
        return jsonify(data), 200
    except Exception as e:
        print(f"Data Fetch Error: {e}")
        return jsonify({"error": "Failed to fetch data"}), 500

@app.post("/api/recommender/predict")
def predict_crop_recommendation():
    try:
        if 'model' not in CROP_MODELS:
            return jsonify({"error": "Models not loaded"}), 500
            
        data = request.json
        input_data = [
            data.get('N'),
            data.get('P'),
            data.get('K'),
            data.get('temperature'),
            data.get('humidity'),
            data.get('ph'),
            data.get('rainfall')
        ]
        
        if any(x is None for x in input_data):
             return jsonify({"error": "Missing input values"}), 400
             
        input_df = pd.DataFrame([input_data], columns=['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall'])
        
        scaler = CROP_MODELS['scaler']
        input_scaled = scaler.transform(input_df)
        
        model = CROP_MODELS['model']
        # Use predict_proba to get probabilities
        probabilities = model.predict_proba(input_scaled)[0]
        
        # Get top 4 indices
        top_4_indices = np.argsort(probabilities)[-4:][::-1]
        
        encoder = CROP_MODELS['encoder']
        top_crops = encoder.inverse_transform(top_4_indices)
        
        return jsonify({
            "top_crop": top_crops[0],
            "alternatives": top_crops[1:].tolist()
        }), 200
        
    except Exception as e:
        print(f"Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
