import os
import json
import base64
import unittest
import numpy as np
import cv2
import app

class TestOpenCard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Configure test client
        app.app.config['TESTING'] = True
        cls.client = app.app.test_client()
        app.index_card_images()

    def setUp(self):
        # Backup user collection if exists
        self.original_collection = app.load_user_collection()

    def tearDown(self):
        # Restore user collection
        app.save_user_collection(self.original_collection)

    # ==========================================
    # 1. Filename Parsing Tests
    # ==========================================
    def test_parse_standard_filename(self):
        filename = "Dominik Szoboszlai | 65 | 83 | 019 | Base.png"
        parsed = app.parse_card_filename(filename)
        self.assertEqual(parsed["player_name"], "Dominik Szoboszlai")
        self.assertEqual(parsed["def_stat"], 65)
        self.assertEqual(parsed["attack_stat"], 83)
        self.assertEqual(parsed["card_num"], "019")
        self.assertEqual(parsed["card_type"], "Base")
        self.assertEqual(parsed["overall"], 74)

    def test_parse_custom_type_filename(self):
        filename = "Vitinha | 91 | 82 | 372 | All Action Hero.png"
        parsed = app.parse_card_filename(filename)
        self.assertEqual(parsed["player_name"], "Vitinha")
        self.assertEqual(parsed["def_stat"], 91)
        self.assertEqual(parsed["attack_stat"], 82)
        self.assertEqual(parsed["card_num"], "372")
        self.assertEqual(parsed["card_type"], "All Action Hero")
        self.assertEqual(parsed["overall"], 86)

    def test_parse_fallback_filename(self):
        filename = "Incomplete Card Name.jpg"
        parsed = app.parse_card_filename(filename)
        self.assertEqual(parsed["player_name"], "Incomplete Card Name")
        self.assertEqual(parsed["def_stat"], 50)
        self.assertEqual(parsed["attack_stat"], 50)
        self.assertEqual(parsed["card_type"], "Base")
        self.assertEqual(parsed["overall"], 50)

    # ==========================================
    # 2. Catalog & Image Indexing Tests
    # ==========================================
    def test_catalog_directory_exists(self):
        self.assertTrue(os.path.exists(app.CARDS_DIR), f"Catalog directory {app.CARDS_DIR} must exist")
        self.assertTrue(os.path.isdir(app.CARDS_DIR), f"{app.CARDS_DIR} must be a directory")

    def test_catalog_indexing_finds_cards(self):
        app.index_card_images()
        self.assertGreaterEqual(len(app.card_database), 7, "Catalog should index at least 7 cards")
        
        filenames = [c["filename"] for c in app.card_database]
        self.assertTrue(any("Dominik Szoboszlai" in f for f in filenames))
        self.assertTrue(any("Vitinha" in f for f in filenames))
        self.assertTrue(any("Emre Can" in f for f in filenames))

    def test_catalog_card_features(self):
        for card in app.card_database:
            self.assertIsNotNone(card["descriptors"], f"Card {card['filename']} must have descriptors")
            self.assertGreater(len(card["descriptors"]), 0)
            self.assertGreater(card["img_w"], 0)
            self.assertGreater(card["img_h"], 0)

    # ==========================================
    # 3. HTTP Endpoints & API Tests
    # ==========================================
    def test_index_page(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"FOOTBALL CARD TRACKER", response.data)

    def test_api_catalog(self):
        response = self.client.get('/api/catalog')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["total"], 7)
        self.assertEqual(len(data["catalog"]), data["total"])
        
        # Verify first card structure
        card = data["catalog"][0]
        self.assertIn("filename", card)
        self.assertIn("stats", card)
        self.assertIn("img_url", card)
        self.assertTrue(card["img_url"].startswith("/cards_img/"))

    def test_serve_card_image_from_catalog(self):
        # Pick first indexed card
        sample_card = app.card_database[0]["filename"]
        response = self.client.get(f'/cards_img/{sample_card}')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.data) > 0)
        self.assertTrue(response.content_type.startswith("image/"))

    def test_serve_nonexistent_card_image(self):
        response = self.client.get('/cards_img/this_card_does_not_exist.png')
        self.assertEqual(response.status_code, 404)

    def test_api_reload(self):
        response = self.client.post('/api/reload')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["total"], 7)

    # ==========================================
    # 4. Personal Collection Management Tests
    # ==========================================
    def test_collection_lifecycle(self):
        sample_card = app.card_database[0]["filename"]
        
        # 1. Add card to collection
        add_res = self.client.post('/api/collection/add', json={"filename": sample_card})
        self.assertEqual(add_res.status_code, 200)
        add_data = add_res.get_json()
        self.assertTrue(add_data["success"])
        self.assertEqual(add_data["qty"], 1)

        # 2. Add second copy (increment duplicate qty)
        add_res2 = self.client.post('/api/collection/add', json={"filename": sample_card})
        self.assertEqual(add_res2.status_code, 200)
        self.assertEqual(add_res2.get_json()["qty"], 2)

        # 3. Verify in collection endpoint
        get_res = self.client.get('/api/collection')
        self.assertEqual(get_res.status_code, 200)
        coll_data = get_res.get_json()
        self.assertTrue(coll_data["success"])
        matching = [c for c in coll_data["collection"] if c["filename"] == sample_card]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["quantity"], 2)

        # 4. Decrement quantity
        del_res = self.client.post('/api/collection/remove', json={"filename": sample_card, "all": False})
        self.assertEqual(del_res.status_code, 200)
        
        get_res2 = self.client.get('/api/collection')
        matching2 = [c for c in get_res2.get_json()["collection"] if c["filename"] == sample_card]
        self.assertEqual(matching2[0]["quantity"], 1)

        # 5. Remove all
        del_res2 = self.client.post('/api/collection/remove', json={"filename": sample_card, "all": True})
        self.assertEqual(del_res2.status_code, 200)
        
        get_res3 = self.client.get('/api/collection')
        matching3 = [c for c in get_res3.get_json()["collection"] if c["filename"] == sample_card]
        self.assertEqual(len(matching3), 0)

    # ==========================================
    # 5. Scanner Matching Test
    # ==========================================
    def test_scanner_with_catalog_card(self):
        # Read an actual card from catalog to test feature matching
        sample_card = app.card_database[0]
        filepath = os.path.join(app.CARDS_DIR, sample_card["filename"])
        img = cv2.imread(filepath)
        self.assertIsNotNone(img)

        # Resize slightly to simulate webcam capture
        h, w = img.shape[:2]
        resized = cv2.resize(img, (w // 2, h // 2))
        _, buffer = cv2.imencode('.jpg', resized)
        b64_frame = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        scan_res = self.client.post('/api/scan', json={"frame": b64_frame})
        self.assertEqual(scan_res.status_code, 200)
        data = scan_res.get_json()
        self.assertTrue(data["success"])
        self.assertTrue(data["matched"], "Scanner should successfully match resized catalog card")
        self.assertEqual(data["card"]["filename"], sample_card["filename"])
        self.assertGreaterEqual(data["confidence"], 50)

if __name__ == '__main__':
    unittest.main()
