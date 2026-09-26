import os
import re
import cv2
import json
import base64
import urllib.request
import urllib.parse
import numpy as np
from datetime import datetime
from flask import Flask, render_template, request, Request, jsonify, send_from_directory

app = Flask(__name__, template_folder="templates", static_folder="static")

# Allow large high-resolution card uploads and base64 snapshots (up to 50MB)
Request.max_form_memory_size = 50 * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CARDS_DIR = os.path.join(BASE_DIR, "catalog")
COLLECTION_FILE = os.path.join(BASE_DIR, "my_collection.json")

# Ensure catalog directory exists
os.makedirs(CARDS_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.PNG', '.JPG', '.JPEG'}

# Initialize ORB detector
orb = cv2.ORB_create(nfeatures=1000)
bf_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

# In-memory card catalog & feature index
card_database = []

def load_user_collection():
    """Loads user's saved personal card collection from JSON."""
    if os.path.exists(COLLECTION_FILE):
        try:
            with open(COLLECTION_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_user_collection(coll_data):
    """Saves user's personal card collection to JSON."""
    with open(COLLECTION_FILE, 'w') as f:
        json.dump(coll_data, f, indent=2)

def parse_card_filename(filename):
    """
    Parses filenames formatted like: "Player Name | Def | Attack | Card Num | Card Type.ext"
    Supports flexible unlimited card types (Chrome, Foil, Heritage, Refractor, etc.).
    """
    name_without_ext = os.path.splitext(filename)[0]
    ext = os.path.splitext(filename)[1].lower()
    
    parts = [p.strip() for p in name_without_ext.split('|')]
    
    player_name = parts[0] if len(parts) > 0 and parts[0] else "Unknown Player"
    def_stat = 50
    attack_stat = 50
    card_num = "000"
    card_type = "Base"
    
    if len(parts) >= 2:
        try:
            def_stat = int(re.sub(r'\D', '', parts[1]))
        except ValueError:
            def_stat = 50
            
    if len(parts) >= 3:
        try:
            attack_stat = int(re.sub(r'\D', '', parts[2]))
        except ValueError:
            attack_stat = 50
            
    if len(parts) >= 4 and parts[3]:
        card_num = parts[3]
    else:
        card_num = f"FC-{abs(hash(filename)) % 1000:03d}"
        
    if len(parts) >= 5 and parts[4]:
        card_type = parts[4]

    overall = round((def_stat + attack_stat) / 2)

    return {
        "filename": filename,
        "player_name": player_name,
        "def_stat": def_stat,
        "attack_stat": attack_stat,
        "overall": overall,
        "card_num": card_num,
        "card_type": card_type,
        "formatted_title": f"{player_name} | {def_stat} | {attack_stat} | {card_num} | {card_type}{ext}"
    }

def index_card_images():
    """Reads all card images in master catalog folder and indexes ORB keypoints."""
    global card_database
    card_database = []
    
    for filename in sorted(os.listdir(CARDS_DIR)):
        ext = os.path.splitext(filename)[1]
        if ext.lower() not in ALLOWED_EXTENSIONS or filename.startswith('.'):
            continue
            
        filepath = os.path.join(CARDS_DIR, filename)
        img = cv2.imread(filepath)
        if img is None:
            continue
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        
        parsed_stats = parse_card_filename(filename)
        
        card_database.append({
            "filename": filename,
            "stats": parsed_stats,
            "img_h": img.shape[0],
            "img_w": img.shape[1],
            "keypoints": keypoints,
            "descriptors": descriptors
        })
        
    print(f"[OpenCV Engine] Indexed {len(card_database)} catalog cards.")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/cards_img/<path:filename>')
def serve_card_img(filename):
    return send_from_directory(CARDS_DIR, filename)

@app.route('/api/catalog', methods=['GET'])
def get_catalog():
    """Returns all cards in master catalog + collection status."""
    index_card_images()
    coll = load_user_collection()
    
    catalog_list = []
    for c in card_database:
        fname = c["filename"]
        in_coll = fname in coll
        qty = coll[fname].get('qty', 0) if in_coll else 0
        
        catalog_list.append({
            "filename": fname,
            "stats": c["stats"],
            "img_url": f"/cards_img/{fname}",
            "width": c["img_w"],
            "height": c["img_h"],
            "in_collection": in_coll,
            "quantity": qty
        })
    return jsonify({"success": True, "catalog": catalog_list, "total": len(catalog_list)})

@app.route('/api/fetch_image_url', methods=['POST'])
def fetch_image_url():
    """
    Fetches an image from a remote URL server-side (bypassing browser CORS).
    Validates that the content is an image and returns a base64 data URI with metadata.
    """
    data = request.json or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({"success": False, "error": "No URL provided"}), 400
        
    if not (url.startswith('http://') or url.startswith('https://')):
        return jsonify({"success": False, "error": "Invalid URL scheme. Must start with http:// or https://"}), 400
        
    try:
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            content_type = response.headers.get('Content-Type', '').lower()
            img_bytes = response.read(25 * 1024 * 1024) # max 25MB
            
            nparr = np.frombuffer(img_bytes, np.uint8)
            decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if decoded is None:
                return jsonify({"success": False, "error": "URL does not point to a valid decodable image"}), 400
                
            # Determine extension and mime type
            ext = ".jpg"
            mime = "image/jpeg"
            if "png" in content_type:
                ext = ".png"
                mime = "image/png"
            elif "webp" in content_type:
                ext = ".webp"
                mime = "image/webp"
            elif "jpeg" in content_type or "jpg" in content_type:
                ext = ".jpg"
                mime = "image/jpeg"
            else:
                parsed_path = urllib.parse.urlparse(url).path
                url_ext = os.path.splitext(parsed_path)[1].lower()
                if url_ext in ALLOWED_EXTENSIONS:
                    ext = url_ext
                    mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"

            b64_str = base64.b64encode(img_bytes).decode('utf-8')
            data_uri = f"data:{mime};base64,{b64_str}"
            
            return jsonify({
                "success": True,
                "data_uri": data_uri,
                "ext": ext,
                "mime": mime,
                "width": decoded.shape[1],
                "height": decoded.shape[0]
            })
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to fetch image from URL: {str(e)}"}), 400

@app.route('/api/catalog/upload', methods=['POST'])
def upload_card():
    """
    Uploads or captures a new card image into the master catalog.
    Supports file uploads, base64 camera snapshots/images, OR direct remote image URLs.
    Formats filename cleanly: Player Name | Def | Attack | Card Num | Card Type.ext
    """
    player_name = request.form.get('player_name', '').strip() or "Unknown Player"
    try:
        def_stat = int(request.form.get('def_stat', 50))
    except ValueError:
        def_stat = 50
        
    try:
        attack_stat = int(request.form.get('attack_stat', 50))
    except ValueError:
        attack_stat = 50
        
    card_num = request.form.get('card_num', '').strip() or "001"
    card_type = request.form.get('card_type', '').strip() or "Base"
    
    camera_data = request.form.get('camera_image')
    image_url = request.form.get('image_url', '').strip()
    ext = ".jpg"
    
    # Construct target filename
    new_filename = f"{player_name} | {def_stat} | {attack_stat} | {card_num} | {card_type}"
    save_path = ""
    
    if 'file' in request.files and request.files['file'].filename != '':
        file = request.files['file']
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({"success": False, "error": f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
            
        full_filename = f"{new_filename}{ext}"
        save_path = os.path.join(CARDS_DIR, full_filename)
        file.save(save_path)
        
    elif camera_data:
        try:
            if ',' in camera_data:
                header = camera_data.split(',')[0].lower()
                if 'image/png' in header:
                    ext = '.png'
                elif 'image/webp' in header:
                    ext = '.webp'
                elif 'image/jpeg' in header or 'image/jpg' in header:
                    ext = '.jpg'
                camera_data = camera_data.split(',')[1]
            img_bytes = base64.b64decode(camera_data)
            full_filename = f"{new_filename}{ext}"
            save_path = os.path.join(CARDS_DIR, full_filename)
            with open(save_path, 'wb') as f:
                f.write(img_bytes)
        except Exception as e:
            return jsonify({"success": False, "error": f"Failed to save image: {str(e)}"}), 500
            
    elif image_url:
        try:
            req = urllib.request.Request(
                image_url,
                headers={'User-Agent': 'Mozilla/5.0 ...', 'Accept': 'image/*'}
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                content_type = response.headers.get('Content-Type', '').lower()
                img_bytes = response.read(25 * 1024 * 1024)
                if 'png' in content_type:
                    ext = '.png'
                elif 'webp' in content_type:
                    ext = '.webp'
                else:
                    parsed_path = urllib.parse.urlparse(image_url).path
                    url_ext = os.path.splitext(parsed_path)[1].lower()
                    if url_ext in ALLOWED_EXTENSIONS:
                        ext = url_ext
                        
                full_filename = f"{new_filename}{ext}"
                save_path = os.path.join(CARDS_DIR, full_filename)
                with open(save_path, 'wb') as f:
                    f.write(img_bytes)
        except Exception as e:
            return jsonify({"success": False, "error": f"Failed to download image from URL: {str(e)}"}), 500
    else:
        return jsonify({"success": False, "error": "No file, camera snapshot, or image URL provided"}), 400
        
    index_card_images() # Re-index immediately
    parsed_stats = parse_card_filename(full_filename)
    
    return jsonify({
        "success": True,
        "message": f"Successfully added '{player_name}' ({card_type}) to catalog!",
        "filename": full_filename,
        "stats": parsed_stats
    })

@app.route('/api/collection', methods=['GET'])
def get_user_collection():
    """Returns cards in user's personal collection."""
    index_card_images()
    coll = load_user_collection()
    
    coll_list = []
    cat_dict = {c["filename"]: c for c in card_database}
    
    for fname, meta in coll.items():
        if fname in cat_dict:
            c = cat_dict[fname]
            coll_list.append({
                "filename": fname,
                "stats": c["stats"],
                "img_url": f"/cards_img/{fname}",
                "width": c["img_w"],
                "height": c["img_h"],
                "quantity": meta.get('qty', 1),
                "added_at": meta.get('added_at', '')
            })
            
    return jsonify({"success": True, "collection": coll_list, "total": len(coll_list)})

@app.route('/api/collection/add', methods=['POST'])
def add_to_collection():
    """Adds a card filename to user's personal collection."""
    data = request.json or {}
    filename = data.get('filename')
    
    if not filename:
        return jsonify({"success": False, "error": "No filename specified"}), 400
        
    coll = load_user_collection()
    if filename in coll:
        coll[filename]['qty'] += 1
    else:
        coll[filename] = {
            "qty": 1,
            "added_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
    save_user_collection(coll)
    return jsonify({
        "success": True,
        "message": "Added to collection!",
        "filename": filename,
        "qty": coll[filename]['qty']
    })

@app.route('/api/collection/remove', methods=['POST'])
def remove_from_collection():
    """Removes or decrements a card in user's personal collection."""
    data = request.json or {}
    filename = data.get('filename')
    all_qty = data.get('all', False)
    
    if not filename:
        return jsonify({"success": False, "error": "No filename specified"}), 400
        
    coll = load_user_collection()
    if filename in coll:
        if all_qty or coll[filename]['qty'] <= 1:
            del coll[filename]
        else:
            coll[filename]['qty'] -= 1
            
        save_user_collection(coll)
        return jsonify({"success": True, "message": "Updated collection"})
    return jsonify({"success": False, "error": "Card not in collection"}), 404

@app.route('/api/rename', methods=['POST'])
def rename_card():
    """Renames an existing card in directory to 5-part format."""
    data = request.json or {}
    old_filename = data.get('old_filename')
    player_name = data.get('player_name', '').strip()
    def_stat = data.get('def_stat', 50)
    attack_stat = data.get('attack_stat', 50)
    card_num = data.get('card_num', '001').strip()
    card_type = data.get('card_type', 'Base').strip()
    
    if not old_filename or not player_name:
        return jsonify({"success": False, "error": "Missing old_filename or player_name"}), 400
        
    old_path = os.path.join(CARDS_DIR, old_filename)
    if not os.path.exists(old_path):
        return jsonify({"success": False, "error": "File not found"}), 404
        
    ext = os.path.splitext(old_filename)[1]
    new_filename = f"{player_name} | {def_stat} | {attack_stat} | {card_num} | {card_type}{ext}"
    new_path = os.path.join(CARDS_DIR, new_filename)
    
    try:
        os.rename(old_path, new_path)
        
        coll = load_user_collection()
        if old_filename in coll:
            coll[new_filename] = coll.pop(old_filename)
            save_user_collection(coll)
            
        index_card_images() # Re-index
        return jsonify({
            "success": True,
            "new_filename": new_filename,
            "stats": parse_card_filename(new_filename)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/scan', methods=['POST'])
def scan_card():
    """Scans camera frame against Master Catalog."""
    data = request.json or {}
    frame_data = data.get('frame')
    
    if not frame_data:
        return jsonify({"success": False, "error": "No frame data provided"}), 400
        
    try:
        if ',' in frame_data:
            frame_data = frame_data.split(',')[1]
        img_bytes = base64.b64decode(frame_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        query_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if query_img is None:
            return jsonify({"success": False, "error": "Could not decode frame image"}), 400
            
        gray_query = cv2.cvtColor(query_img, cv2.COLOR_BGR2GRAY)
        kp_query, des_query = orb.detectAndCompute(gray_query, None)
        
        if des_query is None or len(des_query) < 5:
            return jsonify({"success": True, "matched": False, "reason": "Not enough features", "score": 0})
            
        best_match = None
        best_score = 0
        min_match_count = 12
        
        for card in card_database:
            des_ref = card["descriptors"]
            if des_ref is None or len(des_ref) < 5:
                continue
                
            matches = bf_matcher.match(des_query, des_ref)
            if not matches:
                continue
                
            matches = sorted(matches, key=lambda x: x.distance)
            good_matches = [m for m in matches if m.distance < 60]
            good_count = len(good_matches)
            
            score = good_count
            if score > best_score and good_count >= min_match_count:
                best_score = score
                best_match = card
                
        if best_match:
            coll = load_user_collection()
            fname = best_match["filename"]
            in_coll = fname in coll
            qty = coll[fname].get('qty', 0) if in_coll else 0
            
            confidence = min(100, int((best_score / 35.0) * 100))
            return jsonify({
                "success": True,
                "matched": True,
                "card": {
                    "filename": fname,
                    "stats": best_match["stats"],
                    "img_url": f"/cards_img/{fname}",
                    "width": best_match["img_w"],
                    "height": best_match["img_h"],
                    "in_collection": in_coll,
                    "quantity": qty
                },
                "confidence": confidence,
                "match_count": best_score
            })
        else:
            return jsonify({"success": True, "matched": False, "reason": "Searching catalog...", "score": best_score})
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/reload', methods=['POST', 'GET'])
def reload_index():
    index_card_images()
    return jsonify({
        "success": True,
        "message": f"Successfully re-indexed {len(card_database)} catalog cards.",
        "total": len(card_database)
    })

if __name__ == '__main__':
    index_card_images()
    print("=====================================================")
    print(" Football Card Master Catalog & Collection Tracker")
    print(" Access UI at: http://localhost:8080")
    print("=====================================================")
    app.run(host='127.0.0.1', port=8080, debug=True)
