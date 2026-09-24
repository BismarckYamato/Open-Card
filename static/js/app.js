// Global State
let masterCatalog = [];
let myCollection = [];
let scanInterval = null;
let currentMatchedCard = null;
let inspectedCard = null;
let isScanningActive = true;
let isScanningInFlight = false;

// Upload Modal State
let uploadSourceMode = 'file';
let modalCameraStream = null;
let capturedCameraSnapshot = null;

document.addEventListener('DOMContentLoaded', () => {
    initCameraList();
    fetchMyCollection();
    fetchMasterCatalog();
    
    scanInterval = setInterval(performScan, 500);
});

// Resync Catalog from Folder
async function syncFolder() {
    try {
        const feedback = document.getElementById('scan-feedback');
        if (feedback) feedback.innerHTML = `<i class="fa-solid fa-sync fa-spin"></i> Syncing folder & updating catalog...`;
        
        const res = await fetch('/api/reload', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            fetchMasterCatalog();
            fetchMyCollection();
            if (feedback) feedback.innerHTML = `<span class="text-success"><i class="fa-solid fa-check"></i> Catalog synced! (${data.total} cards ready)</span>`;
        }
    } catch (err) {
        console.error("Sync error:", err);
    }
}

// Navigation Tabs
function switchTab(tabName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    
    if (tabName === 'scanner') {
        document.getElementById('tab-scanner-btn').classList.add('active');
        document.getElementById('scanner-view').classList.add('active');
        isScanningActive = true;
    } else if (tabName === 'collection') {
        document.getElementById('tab-collection-btn').classList.add('active');
        document.getElementById('collection-view').classList.add('active');
        isScanningActive = false;
        fetchMyCollection();
    } else if (tabName === 'catalog') {
        document.getElementById('tab-catalog-btn').classList.add('active');
        document.getElementById('catalog-view').classList.add('active');
        isScanningActive = false;
        fetchMasterCatalog();
    }
}

// Camera Management
async function initCameraList() {
    const select = document.getElementById('camera-select');
    select.innerHTML = '';
    
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length === 0) {
            select.innerHTML = '<option>No Camera Found</option>';
            return;
        }
        
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${index + 1}`;
            select.appendChild(option);
        });
        
        startCamera();
    } catch (err) {
        console.error("Camera enumerate error:", err);
    }
}

async function startCamera() {
    const video = document.getElementById('webcam');
    const select = document.getElementById('camera-select');
    const deviceId = select.value;
    
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    
    const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : { width: 1280, height: 720 }
    };
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
    } catch (err) {
        console.error("Camera access error:", err);
        document.getElementById('scan-feedback').innerText = "Camera access denied or unavailable.";
    }
}

// Perform OpenCV Scan Frame against Catalog
async function performScan() {
    if (!isScanningActive || isScanningInFlight) return;
    
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('scan-canvas');
    
    if (!video || video.readyState !== 4) return;
    
    isScanningInFlight = true;
    
    const ctx = canvas.getContext('2d');
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    const cropW = Math.floor(vw * 0.45);
    const cropH = Math.floor(vh * 0.75);
    const cropX = Math.floor((vw - cropW) / 2);
    const cropY = Math.floor((vh - cropH) / 2);
    
    canvas.width = cropW;
    canvas.height = cropH;
    
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.85);
    
    try {
        const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame: base64Data })
        });
        
        const data = await res.json();
        handleScanResult(data);
    } catch (err) {
        console.error("Scan API error:", err);
    } finally {
        isScanningInFlight = false;
    }
}

function triggerManualScan() {
    performScan();
}

function handleScanResult(data) {
    const feedback = document.getElementById('scan-feedback');
    const hudEmpty = document.getElementById('hud-empty');
    const hudContent = document.getElementById('hud-content');
    const matchBadge = document.getElementById('match-confidence');
    
    if (data.matched && data.card) {
        const card = data.card;
        currentMatchedCard = card;
        
        feedback.innerHTML = `<span class="text-success"><i class="fa-solid fa-check"></i> Catalog Match: <strong>${card.stats.player_name}</strong></span>`;
        matchBadge.innerText = `CONFIDENCE: ${data.confidence}%`;
        matchBadge.classList.add('matched');
        
        hudEmpty.style.display = 'none';
        hudContent.style.display = 'block';
        
        document.getElementById('match-img').src = card.img_url;
        document.getElementById('match-name').innerText = card.stats.player_name;
        document.getElementById('match-num').innerText = `#${card.stats.card_num}`;
        document.getElementById('match-ovr').innerText = card.stats.overall;
        document.getElementById('match-type-badge').innerText = card.stats.card_type || "Base";
        
        document.getElementById('match-atk-val').innerText = card.stats.attack_stat;
        document.getElementById('match-atk-bar').style.width = `${card.stats.attack_stat}%`;
        
        document.getElementById('match-def-val').innerText = card.stats.def_stat;
        document.getElementById('match-def-bar').style.width = `${card.stats.def_stat}%`;
        
        const collStatus = document.getElementById('hud-coll-status');
        const qtyVal = document.getElementById('hud-qty-val');
        
        if (card.in_collection) {
            collStatus.style.display = 'block';
            qtyVal.innerText = card.quantity;
        } else {
            collStatus.style.display = 'none';
        }
    } else {
        feedback.innerHTML = `<i class="fa-solid fa-magnifying-glass fa-spin"></i> Searching catalog...`;
        matchBadge.innerText = `WAITING FOR CARD`;
        matchBadge.classList.remove('matched');
    }
}

async function addMatchedCardToCollection() {
    if (!currentMatchedCard) return;
    await addToCollection(currentMatchedCard.filename);
    performScan();
}

async function addToCollection(filename) {
    try {
        const res = await fetch('/api/collection/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await res.json();
        if (data.success) {
            fetchMyCollection();
            fetchMasterCatalog();
        }
    } catch (err) {
        console.error("Add to collection error:", err);
    }
}

async function removeFromCollection(filename, removeAll=false) {
    try {
        const res = await fetch('/api/collection/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, all: removeAll })
        });
        const data = await res.json();
        if (data.success) {
            fetchMyCollection();
            fetchMasterCatalog();
        }
    } catch (err) {
        console.error("Remove error:", err);
    }
}

// DYNAMIC CARD TYPE FILTER OPTIONS
function populateDynamicTypeFilter(selectId, cardsArray) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const currentVal = select.value;
    
    const typeCounts = {};
    cardsArray.forEach(c => {
        const t = c.stats.card_type || 'Base';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    
    select.innerHTML = `<option value="all">All Card Types (${cardsArray.length})</option>`;
    
    Object.keys(typeCounts).sort().forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.innerText = `${type} (${typeCounts[type]})`;
        select.appendChild(opt);
    });
    
    if (Object.keys(typeCounts).includes(currentVal)) {
        select.value = currentVal;
    } else {
        select.value = 'all';
    }
}

// Fetch & Render Personal Collection
async function fetchMyCollection() {
    try {
        const res = await fetch('/api/collection');
        const data = await res.json();
        if (data.success) {
            myCollection = data.collection;
            document.getElementById('my-coll-count').innerText = data.total;
            document.getElementById('summary-total-cards').innerText = data.total;
            populateDynamicTypeFilter('collection-type-filter', myCollection);
            filterCollection();
        }
    } catch (err) {
        console.error("Fetch collection error:", err);
    }
}

function filterCollection() {
    const query = document.getElementById('collection-search').value.toLowerCase();
    const typeFilter = document.getElementById('collection-type-filter').value;
    const grid = document.getElementById('collection-grid');
    
    let filtered = myCollection.filter(c => {
        const nameMatch = c.stats.player_name.toLowerCase().includes(query) || c.stats.card_num.toLowerCase().includes(query);
        const typeMatch = (typeFilter === 'all') || ((c.stats.card_type || 'Base') === typeFilter);
        return nameMatch && typeMatch;
    });
    
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">
            <i class="fa-solid fa-box-open fa-2x" style="margin-bottom: 10px; opacity: 0.5;"></i><br>
            No cards found matching current search/filter.
        </div>`;
        return;
    }
    
    filtered.forEach(card => {
        const item = document.createElement('div');
        item.className = 'gallery-card-item';
        item.onclick = (e) => {
            if (!e.target.closest('button')) openCardInspector(card);
        };
        
        item.innerHTML = `
            <div class="card-frame-uniform glass-panel">
                <img src="${card.img_url}" alt="${card.stats.player_name}" class="card-img-fit">
                <div class="ovr-pill">${card.stats.overall}</div>
                <div class="type-badge">${card.stats.card_type || 'Base'}</div>
                <div class="qty-badge">x${card.quantity}</div>
            </div>
            <div class="gallery-card-info">
                <h4>${card.stats.player_name}</h4>
                <div class="gallery-card-stats">
                    <span class="text-danger">ATK ${card.stats.attack_stat}</span>
                    <span class="text-info">DEF ${card.stats.def_stat}</span>
                </div>
            </div>
            <div class="card-action-bar">
                <button class="btn-card-action btn-card-add" onclick="addToCollection('${card.filename}')">
                    <i class="fa-solid fa-plus"></i> Add
                </button>
                <button class="btn-card-action btn-card-remove" onclick="removeFromCollection('${card.filename}')">
                    <i class="fa-solid fa-minus"></i> Remove
                </button>
            </div>
        `;
        grid.appendChild(item);
    });
}

// Fetch & Render Master Catalog
async function fetchMasterCatalog() {
    try {
        const res = await fetch('/api/catalog');
        const data = await res.json();
        if (data.success) {
            masterCatalog = data.catalog;
            document.getElementById('total-catalog-count').innerText = data.total;
            populateDynamicTypeFilter('catalog-type-filter', masterCatalog);
            filterCatalog();
        }
    } catch (err) {
        console.error("Fetch catalog error:", err);
    }
}

function filterCatalog() {
    const query = document.getElementById('catalog-search').value.toLowerCase();
    const typeFilter = document.getElementById('catalog-type-filter').value;
    const sortVal = document.getElementById('catalog-sort').value;
    const grid = document.getElementById('catalog-grid');
    
    let filtered = masterCatalog.filter(c => {
        const nameMatch = c.stats.player_name.toLowerCase().includes(query) || c.stats.card_num.toLowerCase().includes(query);
        const typeMatch = (typeFilter === 'all') || ((c.stats.card_type || 'Base') === typeFilter);
        return nameMatch && typeMatch;
    });
    
    filtered.sort((a, b) => {
        if (sortVal === 'overall-desc') return b.stats.overall - a.stats.overall;
        if (sortVal === 'attack-desc') return b.stats.attack_stat - a.stats.attack_stat;
        if (sortVal === 'def-desc') return b.stats.def_stat - a.stats.def_stat;
        if (sortVal === 'name-asc') return a.stats.player_name.localeCompare(b.stats.player_name);
        if (sortVal === 'type-asc') return (a.stats.card_type || '').localeCompare(b.stats.card_type || '');
        return 0;
    });
    
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No cards found in catalog matching search/filter</div>`;
        return;
    }
    
    filtered.forEach(card => {
        const item = document.createElement('div');
        item.className = 'gallery-card-item';
        item.onclick = (e) => {
            if (!e.target.closest('button')) openCardInspector(card);
        };
        
        const inCollBadge = card.in_collection 
            ? `<div class="qty-badge"><i class="fa-solid fa-check"></i> Owned (x${card.quantity})</div>` 
            : '';
            
        item.innerHTML = `
            <div class="card-frame-uniform glass-panel">
                <img src="${card.img_url}" alt="${card.stats.player_name}" class="card-img-fit">
                <div class="ovr-pill">${card.stats.overall}</div>
                <div class="type-badge">${card.stats.card_type || 'Base'}</div>
                ${inCollBadge}
            </div>
            <div class="gallery-card-info">
                <h4>${card.stats.player_name}</h4>
                <div class="gallery-card-stats">
                    <span class="text-danger">ATK ${card.stats.attack_stat}</span>
                    <span class="text-info">DEF ${card.stats.def_stat}</span>
                </div>
            </div>
            <div class="card-action-bar">
                <button class="btn-card-action btn-card-add" onclick="addToCollection('${card.filename}')">
                    <i class="fa-solid fa-plus-circle"></i> Add to My Collection
                </button>
            </div>
        `;
        grid.appendChild(item);
    });
}

// CLEAN INSPECTOR MODAL DETAIL VIEW (Fixed image scaling with class="card-img-fit")
function openCardInspector(card) {
    if (!card) return;
    inspectedCard = card;
    
    document.getElementById('inspect-img').src = card.img_url;
    document.getElementById('inspect-name').innerText = card.stats.player_name;
    document.getElementById('inspect-num').innerText = `#${card.stats.card_num}`;
    document.getElementById('inspect-ovr').innerText = card.stats.overall;
    document.getElementById('inspect-type-badge').innerText = card.stats.card_type || "Base";
    
    document.getElementById('inspect-atk-val').innerText = card.stats.attack_stat;
    document.getElementById('inspect-atk-bar').style.width = `${card.stats.attack_stat}%`;
    
    document.getElementById('inspect-def-val').innerText = card.stats.def_stat;
    document.getElementById('inspect-def-bar').style.width = `${card.stats.def_stat}%`;
    
    const actionBar = document.getElementById('inspect-action-bar');
    actionBar.innerHTML = `
        <button class="btn btn-add-coll" onclick="addToCollection('${card.filename}')">
            <i class="fa-solid fa-plus-circle"></i> Add to My Collection
        </button>
    `;
    
    document.getElementById('spec-card-type').innerText = card.stats.card_type || "Base";
    document.getElementById('spec-card-code').innerText = `#${card.stats.card_num}`;
    document.getElementById('spec-filename').innerText = card.filename;
    document.getElementById('spec-res').innerText = `${card.width || 780} x ${card.height || 1080} px`;
    document.getElementById('spec-status').innerText = card.in_collection ? `Owned (Qty: ${card.quantity})` : "Not Owned";
    
    document.getElementById('inspect-specs-panel').style.display = 'none';
    document.getElementById('specs-toggle-btn-text').innerText = "View Full Card Specs";
    
    document.getElementById('inspector-modal').classList.add('open');
}

function closeCardInspector() {
    document.getElementById('inspector-modal').classList.remove('open');
}

function toggleTechnicalSpecs() {
    const panel = document.getElementById('inspect-specs-panel');
    const btnText = document.getElementById('specs-toggle-btn-text');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        btnText.innerText = "Hide Card Specs";
    } else {
        panel.style.display = 'none';
        btnText.innerText = "View Full Card Specs";
    }
}

// UPLOAD / SNAP NEW CARD MODAL LOGIC
function openUploadModal() {
    document.getElementById('upload-modal').classList.add('open');
    switchUploadSource('file');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.remove('open');
    document.getElementById('upload-form').reset();
    document.getElementById('upload-preview-box').style.display = 'none';
    document.getElementById('ocr-status-banner').style.display = 'none';
    document.getElementById('ocr-raw-text-box').style.display = 'none';
    capturedCameraSnapshot = null;
    stopModalCamera();
}

function switchUploadSource(source) {
    uploadSourceMode = source;
    document.getElementById('tab-src-file').classList.toggle('active', source === 'file');
    document.getElementById('tab-src-camera').classList.toggle('active', source === 'camera');
    
    document.getElementById('src-file-box').style.display = source === 'file' ? 'block' : 'none';
    document.getElementById('src-camera-box').style.display = source === 'camera' ? 'block' : 'none';
    
    if (source === 'camera') {
        startModalCamera();
    } else {
        stopModalCamera();
    }
}

async function startModalCamera() {
    const video = document.getElementById('modal-webcam');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        video.srcObject = stream;
        modalCameraStream = stream;
    } catch (err) {
        console.error("Modal camera access error:", err);
    }
}

function stopModalCamera() {
    if (modalCameraStream) {
        modalCameraStream.getTracks().forEach(track => track.stop());
        modalCameraStream = null;
    }
}

function captureModalPhoto() {
    const video = document.getElementById('modal-webcam');
    const canvas = document.getElementById('modal-snap-canvas');
    if (!video || video.readyState !== 4) return;
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    // Crop center ROI region where physical card is placed inside target frame
    const cropW = Math.floor(vw * 0.45);
    const cropH = Math.floor(vh * 0.75);
    const cropX = Math.floor((vw - cropW) / 2);
    const cropY = Math.floor((vh - cropH) / 2);
    
    canvas.width = cropW;
    canvas.height = cropH;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    capturedCameraSnapshot = dataUrl;
    
    const previewBox = document.getElementById('upload-preview-box');
    const previewImg = document.getElementById('upload-img-preview');
    previewImg.src = dataUrl;
    previewBox.style.display = 'block';
    
    runOCR(dataUrl);
}


function onFileSelectedForOCR(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const previewBox = document.getElementById('upload-preview-box');
            const previewImg = document.getElementById('upload-img-preview');
            previewImg.src = dataUrl;
            previewBox.style.display = 'block';
            
            runOCR(dataUrl);
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// AUTOMATIC OCR TEXT & STAT EXTRACTOR (Tesseract.js)
async function runOCR(imageSrc) {
    const banner = document.getElementById('ocr-status-banner');
    const rawBox = document.getElementById('ocr-raw-text-box');
    const rawContent = document.getElementById('ocr-raw-text-content');
    
    banner.style.display = 'block';
    banner.innerHTML = `<i class="fa-solid fa-robot fa-spin text-highlight"></i> Reading text & auto-filling stats from photo...`;
    
    try {
        if (typeof Tesseract !== 'undefined') {
            const worker = await Tesseract.createWorker('eng');
            const ret = await worker.recognize(imageSrc);
            await worker.terminate();
            
            const text = ret.data.text;
            console.log("[OCR Detected Text]:\n", text);
            
            // Show extracted raw text
            if (rawBox && rawContent) {
                rawContent.innerText = text.trim() || "(No clear text detected)";
                rawBox.style.display = 'block';
            }
            
            parseAndAutofillOCRText(text);
            banner.innerHTML = `<span class="text-success"><i class="fa-solid fa-circle-check"></i> Text & stats auto-detected! You can adjust fields below before saving.</span>`;
        } else {
            banner.style.display = 'none';
        }
    } catch (err) {
        console.error("OCR error:", err);
        banner.style.display = 'none';
    }
}

function parseAndAutofillOCRText(text) {
    const lowerText = text.toLowerCase();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // 1. Extract Numbers (potential stats & card code)
    const allNumbers = [];
    const numMatches = text.match(/\b\d{1,3}\b/g) || [];
    numMatches.forEach(n => {
        const val = parseInt(n);
        if (val > 0 && val <= 99) allNumbers.push(val);
    });
    
    if (allNumbers.length >= 2) {
        const sortedNums = [...allNumbers].sort((a, b) => b - a);
        document.getElementById('upload-atk-stat').value = sortedNums[0];
        document.getElementById('upload-def-stat').value = sortedNums[1];
    } else if (allNumbers.length === 1) {
        document.getElementById('upload-atk-stat').value = allNumbers[0];
    }
    
    // Extract Card Number / Code
    const codeMatch = text.match(/#?\s*(\d{3})/);
    if (codeMatch) {
        document.getElementById('upload-card-num').value = codeMatch[1];
    }
    
    // 2. Extract Card Type Phrases (e.g. All Action Hero, Cup Champion, Man of the Match, etc.)
    const typePhrases = [
        "All Action Hero", "Cup Champion", "Man of the Match", "Magic Memories", 
        "Vintage Vibes", "Heritage", "Chrome", "Foil", "Refractor", "Autograph", 
        "Relic", "Patch", "Prizm", "Golden Baller", "World Class", "Icon", "Stealth Strike"
    ];
    
    let matchedType = "";
    for (const tp of typePhrases) {
        if (lowerText.includes(tp.toLowerCase())) {
            matchedType = tp;
            break;
        }
    }
    
    const select = document.getElementById('upload-card-type');
    const customInput = document.getElementById('upload-custom-type');
    
    if (matchedType) {
        // Check if type exists in select options
        let foundOption = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value.toLowerCase() === matchedType.toLowerCase()) {
                select.selectedIndex = i;
                customInput.style.display = 'none';
                customInput.required = false;
                foundOption = true;
                break;
            }
        }
        
        if (!foundOption) {
            select.value = 'CUSTOM';
            customInput.style.display = 'block';
            customInput.value = matchedType;
            customInput.required = true;
        }
    }
    
    // 3. Extract Player Name (Capitalized Words)
    const nameLines = lines.filter(l => /^[A-Z\s]{4,}$/.test(l) || /^[A-Z][a-z]+\s[A-Z][a-z]+/.test(l));
    if (nameLines.length > 0) {
        const candidateName = nameLines[0].replace(/[^A-Za-z\s]/g, '').trim();
        if (candidateName.length >= 3) {
            document.getElementById('upload-player-name').value = candidateName;
        }
    }
}

function toggleCustomTypeInput(select) {
    const customInput = document.getElementById('upload-custom-type');
    if (select.value === 'CUSTOM') {
        customInput.style.display = 'block';
        customInput.required = true;
    } else {
        customInput.style.display = 'none';
        customInput.required = false;
    }
}

async function handleCardUpload(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('upload-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving to catalog...`;
    
    const playerName = document.getElementById('upload-player-name').value;
    const defStat = document.getElementById('upload-def-stat').value;
    const atkStat = document.getElementById('upload-atk-stat').value;
    const cardNum = document.getElementById('upload-card-num').value;
    
    const selectType = document.getElementById('upload-card-type').value;
    const customType = document.getElementById('upload-custom-type').value;
    const cardType = (selectType === 'CUSTOM') ? customType : selectType;
    
    const formData = new FormData();
    formData.append('player_name', playerName);
    formData.append('def_stat', defStat);
    formData.append('attack_stat', atkStat);
    formData.append('card_num', cardNum);
    formData.append('card_type', cardType);
    
    if (uploadSourceMode === 'file') {
        const fileInput = document.getElementById('upload-file-input');
        if (!fileInput.files || !fileInput.files[0]) {
            alert("Please choose a file or switch to 'Take Photo' mode!");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Save & Auto-Rename to Folder`;
            return;
        }
        formData.append('file', fileInput.files[0]);
    } else {
        if (!capturedCameraSnapshot) {
            alert("Please click '📸 Snap Photo' first!");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Save & Auto-Rename to Folder`;
            return;
        }
        formData.append('camera_image', capturedCameraSnapshot);
    }
    
    try {
        const res = await fetch('/api/catalog/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        if (data.success) {
            closeUploadModal();
            fetchMasterCatalog();
            switchTab('catalog');
            alert(`Success! '${playerName}' (${cardType}) added to catalog!`);
        } else {
            alert(`Upload Error: ${data.error}`);
        }
    } catch (err) {
        console.error("Upload error:", err);
        alert("Upload failed. Please check file format.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Save & Auto-Rename to Folder`;
    }
}
