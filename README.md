# Open-Card ⚽🎴

> **Intelligent Computer Vision Football Trading Card Scanner & Personal Collection Manager**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-brightgreen.svg)](https://www.python.org/)
[![Flask 3.0+](https://img.shields.io/badge/Flask-3.0+-lightgrey.svg)](https://flask.palletsprojects.com/)
[![OpenCV](https://img.shields.io/badge/OpenCV-ORB%20Engine-red.svg)](https://opencv.org/)

**Open-Card** is a full-featured web application and computer vision engine designed for football (soccer) card collectors. Powered by OpenCV ORB feature matching and Tesseract OCR, Open-Card identifies physical cards held up to a webcam or uploaded as photos, matches them against your master card catalog in real time, and lets you manage your personal collection with ease.

---

## ✨ Features

- 📸 **Live Webcam Scanner**: Point physical cards at your camera. The live laser ROI target automatically tracks, detects, and matches cards against your master catalog.
- 🧠 **OpenCV ORB Feature Matching**: Utilizes Oriented FAST and Rotated BRIEF (ORB) feature extraction and Hamming Brute-Force Matcher for scale-, rotation-, and tilt-invariant recognition.
- ⚡ **Instant & Fallback Scanning**: Instant scan button with automatic threshold evaluation and visual confidence scoring.
- 🗂️ **Dynamic Master Catalog**: Automatically indexes card image files from disk. Card metadata (player name, defense stat, attack stat, card code, card type) is automatically parsed from pipe-delimited filenames.
- 📦 **Personal Collection Manager**:
  - Track owned cards with duplicate quantity counters.
  - Search, sort, and filter by card type (Base, Man of the Match, Heritage, Foil, Chrome, etc.).
  - Timestamped acquisition tracking stored in `my_collection.json`.
- 🤖 **Smart Onboarding with OCR (Tesseract.js)**:
  - Snap a photo from webcam or upload an image file.
  - Optical Character Recognition automatically reads text and extracts player name and stats to pre-fill the form.
  - Automatically renames and organizes the uploaded card into the master catalog.
- 🔍 **Card Inspector Modal**: View high-resolution card artwork, overall ratings (OVR), attack/defense gauges, and full technical metadata.
- 🎨 **Futuristic Cyber HUD**: Sleek glassmorphism interface with high-contrast glowing stat bars, animated scanner effects, and responsive layout.

---

## 🛠️ Architecture & Tech Stack

- **Backend**:
  - [Python 3.10+](https://www.python.org/)
  - [Flask 3.0+](https://flask.palletsprojects.com/) – Lightweight REST API & static file server
  - [OpenCV (`cv2`)](https://opencv.org/) – ORB feature detector & descriptor matcher
  - [NumPy](https://numpy.org/) – Image array transformations & matrix computations
  - [Pillow](https://python-pillow.org/) – Image handling & conversion
- **Frontend**:
  - Vanilla ES6+ JavaScript – MediaDevices webcam streaming, Canvas manipulation, dynamic filtering
  - Modern CSS3 – Glassmorphism, animations, responsive grid system
  - [Tesseract.js](https://tesseract.projectnaptha.com/) – Client-side optical character recognition
  - [Font Awesome 6](https://fontawesome.com/) – Vector icons

---

## 📋 Card Filename Convention

The master catalog (`catalog/`) parses filenames using a clean 5-part pipe-delimited format:

```text
Player Name | Defense | Attack | Card Number | Card Type.ext
```

### Examples:
- `Dominik Szoboszlai | 65 | 83 | 019 | Base.png`
- `Emre Can | 69 | 90 | 331 | Man of the Match.png`
- `Vitinha | 91 | 82 | 372 | All Action Hero.png`
- `Madas Bidstrup | 83 | 94 | 404 | Heritage.jpg`

> **Note:** Supported image formats include `.png`, `.jpg`, `.jpeg`, and `.webp`. The overall rating (OVR) is automatically calculated as `round((Defense + Attack) / 2)`.

---

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/BismarckYamato/Open-Card.git
cd Open-Card
```

### 2. Set Up Virtual Environment & Dependencies

**Using `uv` (Fastest & Recommended):**
```bash
uv venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

**Or using standard `venv` & `pip`:**
```bash
python3 -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Run the Application

```bash
python app.py
```

### 5. Open in Browser

Navigate to **[http://localhost:8080](http://localhost:8080)**.

---

## 🔌 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `GET /` | `GET` | Main application user interface |
| `GET /api/catalog` | `GET` | Returns list of all indexed cards in the master catalog |
| `POST /api/catalog/upload` | `POST` | Uploads/snaps a new card and indexes it into the catalog |
| `POST /api/scan` | `POST` | Matches a base64 camera frame against catalog descriptors |
| `GET /api/collection` | `GET` | Fetches all cards in the user's personal collection |
| `POST /api/collection/add` | `POST` | Adds or increments a card in the personal collection |
| `POST /api/collection/remove` | `POST` | Decrements or removes a card from the personal collection |
| `POST /api/rename` | `POST` | Renames an existing catalog file to match the naming convention |
| `GET/POST /api/reload` | `GET/POST`| Triggers re-indexing of all card images in catalog directory |

---

## 🧪 Running Tests

A comprehensive unit and integration test suite is included in `tests/test_app.py`, validating filename parsing, catalog indexing, image serving, collection operations, and the OpenCV scanning engine:

```bash
# Run all tests using Python's built-in unittest
python -m unittest discover tests -v
```

---

## 📁 Project Structure

```text
Open-Card/
├── catalog/                   # Master card images catalog (*.png, *.jpg)
├── tests/
│   └── test_app.py            # Unit & integration test suite
├── app.py                     # Flask server, OpenCV ORB matching engine & REST APIs
├── requirements.txt           # Python package dependencies
├── my_collection.json         # User personal collection database (JSON)
├── static/
│   ├── css/
│   │   └── style.css          # Futuristic glassmorphism styles & animations
│   └── js/
│       └── app.js             # Camera management, scanning loop, OCR & UI handlers
├── templates/
│   └── index.html             # Single-page web application UI
├── LICENSE                    # MIT License
├── .gitignore                 # Git ignore rules
└── README.md                  # Project documentation
```

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are always welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.