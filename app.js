let map;
let branches = [];
let userLocation = null;
let markers = [];
let mapConfig = null;
let adminMode = false;

// Initialize Map
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0.1, // Magical Fluid Zoom
        zoomDelta: 0.5
    }).setView([13.2, 101.2], 5.8); 

    // Normal / Light Map style (CartoDB Voyager)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Initial config load
    loadConfig();
    
    // Check for Admin Mode
    checkAdminMode();
}

// Load Configuration from config.json
async function loadConfig() {
    try {
        const response = await fetch('config.json?v=' + Date.now());
        const data = await response.json();
        mapConfig = data;
        console.log('Map configuration loaded:', mapConfig);
    } catch (error) {
        console.warn('Could not load config.json, using defaults.');
    }
}

// Admin Mode Detection and UI
function checkAdminMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
        adminMode = true;
        console.log('--- ADMIN MODE ENABLED ---');
        initAdminUI();
    }
}

function initAdminUI() {
    const adminDiv = document.createElement('div');
    adminDiv.className = 'admin-controls glass';
    adminDiv.innerHTML = `
        <div class="admin-hud">
            <div>Lat: <span id="hud-lat">0</span></div>
            <div>Lng: <span id="hud-lng">0</span></div>
            <div>Zoom: <span id="hud-zoom">0</span></div>
        </div>
        <button id="save-view-btn" class="action-btn-large">
            <span>💾 Save Current View</span>
        </button>
    `;
    document.body.appendChild(adminDiv);

    // Update HUD on move
    map.on('moveend', () => {
        const center = map.getCenter();
        document.getElementById('hud-lat').textContent = center.lat.toFixed(4);
        document.getElementById('hud-lng').textContent = center.lng.toFixed(4);
        document.getElementById('hud-zoom').textContent = map.getZoom().toFixed(1);
    });

    // Save button logic
    document.getElementById('save-view-btn').onclick = () => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        const newConfig = {
            thailandView: {
                lat: parseFloat(center.lat.toFixed(4)),
                lng: parseFloat(center.lng.toFixed(4)),
                zoom: parseFloat(zoom.toFixed(1))
            }
        };

        const jsonStr = JSON.stringify(newConfig, null, 2);
        
        // Output for manual commit as per plan
        console.log('--- NEW CONFIG JSON ---');
        console.log(jsonStr);
        
        const blob = new Blob([jsonStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'config.json';
        a.click();
        
        alert('คัดลอก JSON ใน Console หรือใช้ไฟล์ที่ Download ไปทับของเดิมใน Repo นะครับ');
    };
}

// Fit map to Thailand correctly (Prioritize Config > Math)
function fitThailand() {
    if (!map) return;
    
    closePanel();
    
    setTimeout(() => {
        map.invalidateSize();
        
        // 1. Try to use manual config if loaded
        if (mapConfig && mapConfig.thailandView) {
            const { lat, lng, zoom } = mapConfig.thailandView;
            map.flyTo([lat, lng], zoom, {
                duration: 1.5,
                easeLinearity: 0.25
            });
            return;
        }

        // 2. Fallback to curated "Cinematic View" logic
        const isMobile = window.innerWidth < 768;
        const targetLat = isMobile ? 13.5 : 13.2;
        const targetLng = 101.0;
        const targetZoom = isMobile ? 5.7 : 6.2;

        map.flyTo([targetLat, targetLng], targetZoom, {
            duration: 1.5,
            easeLinearity: 0.25
        });
    }, 400);
}

// Load Branches
async function loadBranches() {
    try {
        // Add cachebuster to force fresh data download
        const response = await fetch('branches.json?v=' + Date.now());
        const rawData = await response.json();
        
        // Filter out branch 999 (demo) and ensure coordinates are valid and within Thailand bounding box
        branches = rawData.filter(b => {
            const num = parseInt(b.number);
            const lat = parseFloat(b.latitude);
            const lng = parseFloat(b.longitude);
            
            // Basic Thailand Bounding Box (Lat: 5.5 to 20.5, Lng: 97.0 to 106.0)
            const isInThailand = lat > 5.5 && lat < 20.5 && lng > 97.0 && lng < 106.0;
            
            return num !== 999 && isInThailand;
        });
        
        renderMarkers();
        renderAllBranchesList();
        
        // Fit map for the first time AFTER data is ready for consistency
        fitThailand();
    } catch (error) {
        console.error('Error loading branches:', error);
        showToast('ไม่สามารถโหลดข้อมูลสาขาได้');
    }
}

// Render Markers on Map
function renderMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    branches.forEach(branch => {
        if (branch.latitude && branch.longitude) {
            const customIcon = L.divIcon({
                className: 'custom-marker-wrapper',
                html: `
                    <div class="pulse"></div>
                    <div class="custom-pin"></div>
                `,
                iconSize: [24, 24],
                iconAnchor: [12, 24],
                popupAnchor: [0, -24]
            });

            const marker = L.marker([branch.latitude, branch.longitude], {
                icon: customIcon
            }).addTo(map);

            marker.bindPopup(`
                <div class="popup-content">
                    <strong style="color:var(--primary-color)">สาขาที่ ${branch.number}</strong>
                    <div style="font-weight:600; margin: 4px 0;">${branch.name}</div>
                    <p style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">${branch.owner || ''}</p>
                    <button onclick="openBranchDetails(${branch.id})" class="popup-btn">ดูรายละเอียด</button>
                </div>
            `);
            markers.push(marker);
        }
    });
}

// Haversine Formula for distance
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const l1 = parseFloat(lat1), ln1 = parseFloat(lon1);
    const l2 = parseFloat(lat2), ln2 = parseFloat(lon2);
    
    // Safety check for invalid coordinates
    if (isNaN(l1) || isNaN(ln1) || isNaN(l2) || isNaN(ln2)) return Infinity;

    const dLat = (l2 - l1) * Math.PI / 180;
    const dLon = (ln2 - ln1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(l1 * Math.PI / 180) * Math.cos(l2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Locate User
function locateUser() {
    if (!navigator.geolocation) {
        showToast('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง');
        return;
    }

    showToast('กำลังระบุตำแหน่งของคุณ...');
    
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 15000,      // Timeout after 15 seconds
        maximumAge: 0        // Force current location
    };

    navigator.geolocation.getCurrentPosition(position => {
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        // Math Power: Center user in the VISIBLE 25% area at the top
        // Header ~80px, Panel ~75% of height.
        // flyToBounds is safer for complex padding
        const userLatLng = L.latLng(userLocation.lat, userLocation.lng);
        map.flyToBounds(userLatLng.toBounds(1000), { // 1km radius
            paddingTopLeft: [0, 80],
            paddingBottomRight: [0, window.innerHeight * 0.7],
            duration: 1.5
        });
        
        // Add User Marker
        const userIcon = L.divIcon({
           className: 'user-marker',
           html: '<div style="background:#10b981; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(16,185,129,0.5)"></div>',
           iconSize: [16, 16],
           iconAnchor: [8, 8]
        });

        L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map)
            .bindPopup('ตำแหน่งของคุณ').openPopup();

        updateNearestBranches();
        showToast('พบสาขาใกล้คุณ 5 อันดับแรก');
        openPanel(); // Expand to show results (Map 25%, List 75%)
    }, error => {
        let errorMsg = 'ไม่สามารถระบุตำแหน่งได้';
        if (error.code === 1) errorMsg = 'คุณปฏิเสธการให้ตำแหน่งพิกัด';
        else if (error.code === 2) errorMsg = 'ไม่มีสัญญาณ GPS / เบราว์เซอร์บล็อกพิกัด';
        else if (error.code === 3) errorMsg = 'หมดเวลารอพิกัด (Timeout)';

        showToast(errorMsg);
        document.getElementById('nearest-branches-list').innerHTML = `<div class="location-prompt" style="color:#ff6b6b; font-size: 0.9rem; text-align: center; padding: 1rem 0;">${errorMsg}</div>`;
    }, geoOptions);
}

// Find and Display Nearest Branches
function updateNearestBranches() {
    if (!userLocation) return;

    const branchesWithDistance = branches.map(b => ({
        ...b,
        distance: calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude)
    }));

    branchesWithDistance.sort((a, b) => a.distance - b.distance);

    const nearest = branchesWithDistance.slice(0, 5);
    const listElement = document.getElementById('nearest-branches-list');
    listElement.innerHTML = '';

    nearest.forEach(b => {
        const card = createBranchCard(b, true);
        listElement.appendChild(card);
    });
}

function renderAllBranchesList() {
    const listElement = document.getElementById('all-branches-list');
    listElement.innerHTML = '';
    
    // Sort by branch number
    const sorted = [...branches].sort((a,b) => a.number - b.number);
    
    sorted.forEach(b => {
        const card = createBranchCard(b, false);
        listElement.appendChild(card);
    });
}

function createBranchCard(branch, showDistance) {
    const card = document.createElement('div');
    card.className = 'branch-card';
    card.innerHTML = `
        <div class="branch-card-header">
            <div class="branch-name">สาขาที่ ${branch.number}: ${branch.name}</div>
            ${branch.group_id ? `<span class="group-badge">ก.${branch.group_id}</span>` : ''}
        </div>
        <div class="branch-location">${branch.province ? branch.province.name_th : ''} ${branch.district ? branch.district.name_th : ''}</div>
        ${showDistance ? `<div class="branch-distance">ห่างจากคุณ ${branch.distance.toFixed(2)} กม.</div>` : ''}
    `;
    card.onclick = () => {
        const isMobile = window.innerWidth < 768;
        const branchLatLng = L.latLng(branch.latitude, branch.longitude);
        
        map.flyToBounds(branchLatLng.toBounds(500), {
            paddingTopLeft: [0, 80],
            paddingBottomRight: [0, isMobile ? window.innerHeight * 0.5 : 0],
            duration: 2
        });
        
        openBranchDetails(branch.id);
        if (isMobile) closePanel();
    };
    return card;
}

// Modal handling
function openBranchDetails(id) {
    const branch = branches.find(b => b.id === id);
    if (!branch) return;

    const detailHtml = `
        <h2 style="color:var(--text-main); font-size: 1.5rem; margin-bottom: 1rem;">${branch.name}</h2>
        <div style="margin-bottom: 1.5rem;">
            <p><strong>หมายเลขสาขา:</strong> ${branch.number}</p>
            <p><strong>กลุ่มสาขา:</strong> <span class="group-text">กลุ่มที่ ${branch.group_id || 'ไม่ระบุ'}</span></p>
            <p><strong>ผู้ดูแล:</strong> ${branch.owner || 'ไม่ระบุ'}</p>
            <p><strong>โทร:</strong> ${branch.owner_tel || 'ไม่ระบุ'}</p>
            <p><strong>เวลาทำการ:</strong> ${branch.opening_hours || 'ไม่ระบุ'}</p>
            <p><strong>จังหวัด:</strong> ${branch.province ? branch.province.name_th : 'ไม่ระบุ'}</p>
            <p><strong>ภาค:</strong> ${branch.province ? branch.province.region_name_6_th : 'ไม่ระบุ'}</p>
        </div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}" target="_blank" class="popup-btn" style="text-align:center; display:block; text-decoration:none;">นำทางด้วย Google Maps</a>
    `;

    document.getElementById('branch-detail').innerHTML = detailHtml;
    document.getElementById('branch-modal').style.display = 'flex';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Panel Control Functions
function openPanel() {
    const p = document.getElementById('side-panel');
    if (p) p.classList.remove('collapsed');
}

function closePanel() {
    const p = document.getElementById('side-panel');
    if (p) p.classList.add('collapsed');
}

function togglePanel() {
    const p = document.getElementById('side-panel');
    if (p) p.classList.toggle('collapsed');
}

// Events
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadBranches();

    document.getElementById('locate-me-btn').onclick = locateUser;
    document.getElementById('fit-thailand-btn').onclick = fitThailand;
    
    document.querySelector('.close-btn').onclick = () => {
        document.getElementById('branch-modal').style.display = 'none';
    };

    window.onclick = (event) => {
        const modal = document.getElementById('branch-modal');
        if (event.target == modal) modal.style.display = 'none';
    };

    // Simplified Bottom Sheet Interaction (Click/Tap only)
    const handle = document.querySelector('.panel-handle');
    
    handle.onclick = togglePanel;

    // Close panel when clicking on the map (so users aren't trapped)
    map.on('click', () => {
        closePanel();
    });

    // Search input: Filter list without auto-expanding
    document.getElementById('branch-search').oninput = (e) => {
        const query = e.target.value.toLowerCase();
        
        // Smart Group Query: Extract number if query starts with "ก." or "กลุ่ม"
        const cleanQuery = query.replace('ก.', '').replace('กลุ่ม', '').trim();
        const isNumeric = /^\d+$/.test(cleanQuery);

        const filtered = branches.filter(b => {
             const nameMatch = b.name.toLowerCase().includes(query);
             const provinceMatch = b.province && b.province.name_th.toLowerCase().includes(query);
             const provinceEnMatch = b.province && b.province.name_en.toLowerCase().includes(query);
             const numberMatch = b.number && b.number.toString().includes(query);
             
             // Group Match
             let groupMatch = false;
             if (b.group_id) {
                 const gid = b.group_id.toString();
                 // Direct match with number (e.g., "10") or smart match (e.g., "ก.10")
                 groupMatch = gid.includes(query) || (isNumeric && gid === cleanQuery);
             }

             return nameMatch || provinceMatch || provinceEnMatch || numberMatch || groupMatch;
        });
        
        const listElement = document.getElementById('all-branches-list');
        listElement.innerHTML = '';
        filtered.forEach(b => {
             const card = createBranchCard(b, false);
             listElement.appendChild(card);
        });
        
        if (query.length > 0) openPanel(); else closePanel();
    };
});

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('SW registered');
        }).catch(err => {
            console.log('SW registration failed:', err);
        });
    });
}
