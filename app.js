let map;
let branches = [];          // เฉพาะสาขาที่มีพิกัดใช้งานได้ (ใช้กับแผนที่ + ค้นหาใกล้ฉัน)
let branchesNoCoords = [];  // สาขาที่พิกัดยังไม่ถูกต้อง แสดงในลิสต์แต่ไม่ปักหมุด
let allBranches = [];       // ทั้งหมดที่แสดงต่อผู้ใช้ (ใช้ค้นหา id ตอนเปิดรายละเอียด)
let userLocation = null;
let userMarker = null;
let markers = [];
let markerById = new Map();
let markerLayer = null;      // MarkerClusterGroup ถ้าโหลดปลั๊กอินได้ ไม่งั้นเป็น LayerGroup ธรรมดา
let selectedMarkerId = null;
let searchMapTimer = null;
let activeRegion = null;     // ชิปภาคที่เลือกอยู่
let activeGroup = null;      // ชิปกลุ่มที่เลือกอยู่
let chipMode = 'region';     // โหมดชิปที่กำลังแสดง: 'region' หรือ 'group'

// group_id 999 เป็นค่า placeholder ของสาขาที่ยังไม่ถูกจัดกลุ่มจริง ไม่ต้องขึ้นเป็นชิป
const PLACEHOLDER_GROUP_ID = 999;
let mapConfig = null;
let adminMode = false;

// สาขาที่ไม่ใช่สาขาจริง ไม่ต้องแสดงต่อผู้ใช้
const INTERNAL_BRANCH_NUMBERS = new Set([999]);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// ข้อมูลมาจาก API ภายนอก จึงต้อง escape ก่อนยัดลง innerHTML เสมอ
function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

// ข้อมูลบางสาขายังไม่ได้กรอกพิกัด และถูกบันทึกเป็น 0,0 ("00.00000") ซึ่งอยู่กลาง
// มหาสมุทรแอตแลนติก ถ้าปักหมุดตามค่านี้ผู้ใช้จะเห็นหมุดกองอยู่นอกประเทศ
function hasUsableCoords(branch) {
    const lat = parseFloat(branch.latitude);
    const lng = parseFloat(branch.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return false;
    return Math.abs(lat) > 0.5 || Math.abs(lng) > 0.5;
}

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

    // จัดกลุ่มหมุดเพื่อไม่ให้ 295 หมุดทับกันจนอ่านไม่ออกและกิน CPU
    // ถ้าปลั๊กอินโหลดไม่ได้ (CDN ล่ม) ให้ตกไปใช้ LayerGroup ธรรมดาแทน
    markerLayer = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            disableClusteringAtZoom: 13
        })
        : L.layerGroup();
    markerLayer.addTo(map);

    // Initial config load
    loadConfig();
    
    // Check for Admin Mode
    checkAdminMode();
}

// Load Configuration from config.json
async function loadConfig() {
    try {
        // ไม่ต้องใส่ cachebuster: _headers ตั้ง no-cache ให้อยู่แล้ว และการเติม ?v=
        // ทำให้ Service Worker หาไฟล์ในแคชไม่เจอตอนออฟไลน์
        const response = await fetch('config.json', { cache: 'no-cache' });
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
        // cache: 'no-cache' บังคับ revalidate กับ server (ใช้ ETag) โดยไม่ต้องเติม ?v=
        // ซึ่งจะทำให้แคชของ Service Worker ใช้งานตอนออฟไลน์ไม่ได้
        const response = await fetch('branches.json', { cache: 'no-cache' });
        const rawData = await response.json();

        allBranches = rawData.filter(b => !INTERNAL_BRANCH_NUMBERS.has(b.number));

        // แยกสาขาที่พิกัดใช้ไม่ได้ออกจากแผนที่ แต่ยังแสดงในลิสต์เพื่อให้ติดต่อได้
        // และเห็นชัดว่าสาขาไหนยังรอปรับพิกัด
        branches = allBranches.filter(hasUsableCoords);
        branchesNoCoords = allBranches.filter(b => !hasUsableCoords(b));

        if (branchesNoCoords.length) {
            console.warn(`${branchesNoCoords.length} สาขายังไม่มีพิกัดที่ใช้งานได้ (เลขสาขา): ` +
                branchesNoCoords.map(b => b.number).join(', '));
        }

        renderMarkers();
        renderFilterChips();
        renderAllBranchesList();

        // ถ้าเปิดมาจากลิงก์ ?branch=... ให้บินไปสาขานั้นแทนการซูมทั้งประเทศ
        // ไม่งั้นสองอนิเมชันจะชนกัน
        if (new URLSearchParams(window.location.search).has('branch')) {
            openBranchFromUrl();
        } else {
            // Fit map for the first time AFTER data is ready for consistency
            fitThailand();
        }
    } catch (error) {
        console.error('Error loading branches:', error);
        showToast('ไม่สามารถโหลดข้อมูลสาขาได้');
    }
}

// Render Markers on Map
function renderMarkers() {
    markerLayer.clearLayers();
    markers = [];
    markerById.clear();

    // branches มีเฉพาะสาขาที่พิกัดใช้งานได้แล้ว (กรองใน loadBranches)
    branches.forEach(branch => {
        // ไม่ใส่ .pulse ในทุกหมุดแล้ว เพราะ animation แบบ infinite เกือบ 300 ตัว
        // พร้อมกันกิน CPU/แบตหนักมากบนมือถือ — ให้เต้นเฉพาะหมุดที่ถูกเลือก
        const customIcon = L.divIcon({
            className: 'custom-marker-wrapper' + (branch.coords_needs_review ? ' unverified' : ''),
            html: '<div class="custom-pin"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });

        const marker = L.marker([branch.latitude, branch.longitude], {
            icon: customIcon
        });
        markerLayer.addLayer(marker);

        marker.bindPopup(`
            <div class="popup-content">
                <strong style="color:var(--primary-color)">สาขา ${esc(branch.number)}</strong>
                <div style="font-weight:600; margin: 4px 0;">${esc(branch.name)}</div>
                <p style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">${esc(branch.owner)}</p>
                <button onclick="openBranchDetails(${Number(branch.id)})" class="popup-btn">ดูรายละเอียด</button>
            </div>
        `);
        markers.push(marker);
        markerById.set(branch.id, marker);
    });
}

// ซ่อน/แสดงหมุดให้ตรงกับผลการค้นหา (แตะเฉพาะหมุดที่สถานะเปลี่ยนจริง)
function updateVisibleMarkers(visibleIds) {
    const toAdd = [];
    const toRemove = [];

    markerById.forEach((marker, id) => {
        const shouldShow = visibleIds.has(id);
        const onMap = markerLayer.hasLayer(marker);
        if (shouldShow && !onMap) toAdd.push(marker);
        else if (!shouldShow && onMap) toRemove.push(marker);
    });

    // MarkerClusterGroup มี bulk API ที่เร็วกว่าการวนเพิ่มทีละตัวมาก
    if (typeof markerLayer.addLayers === 'function') {
        if (toRemove.length) markerLayer.removeLayers(toRemove);
        if (toAdd.length) markerLayer.addLayers(toAdd);
        return;
    }

    toRemove.forEach(m => markerLayer.removeLayer(m));
    toAdd.forEach(m => markerLayer.addLayer(m));
}

// ให้หมุดของสาขาที่กำลังดูอยู่เต้น เพื่อให้หาเจอง่ายบนแผนที่
function highlightMarker(branchId) {
    if (selectedMarkerId !== null) {
        const prev = markerById.get(selectedMarkerId);
        const prevEl = prev && prev.getElement && prev.getElement();
        if (prevEl) prevEl.classList.remove('is-selected');
    }

    selectedMarkerId = branchId;
    const marker = markerById.get(branchId);
    const el = marker && marker.getElement && marker.getElement();
    if (el) el.classList.add('is-selected');
}

// ซูมแผนที่ให้เห็นผลการค้นหาทั้งหมด (เว้นที่ให้ header และ bottom sheet)
function fitToBranches(list) {
    if (!list.length) return;

    const isMobile = window.innerWidth < 768;
    const padding = {
        paddingTopLeft: [20, 90],
        paddingBottomRight: [20, isMobile ? window.innerHeight * 0.55 : 40],
        duration: 1.2
    };

    if (list.length === 1) {
        map.flyToBounds(L.latLng(list[0].latitude, list[0].longitude).toBounds(1500), padding);
        return;
    }

    map.flyToBounds(L.latLngBounds(list.map(b => [+b.latitude, +b.longitude])), padding);
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

        // ลบหมุดเดิมก่อน ไม่งั้นกดปุ่มซ้ำจะมีหมุดซ้อนกันเรื่อยๆ
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map)
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

// วาดลิสต์ "สาขาทั้งหมด" และ "รอปรับพิกัด" ตามผลการค้นหาที่ส่งเข้ามา
function renderBranchLists(withCoords, withoutCoords) {
    const listElement = document.getElementById('all-branches-list');
    listElement.innerHTML = '';
    [...withCoords].sort((a, b) => a.number - b.number).forEach(b => {
        listElement.appendChild(createBranchCard(b, false));
    });

    const pendingSection = document.getElementById('pending-coords-section');
    const pendingList = document.getElementById('pending-branches-list');
    pendingList.innerHTML = '';
    [...withoutCoords].sort((a, b) => a.number - b.number).forEach(b => {
        pendingList.appendChild(createBranchCard(b, false));
    });
    pendingSection.hidden = withoutCoords.length === 0;
    document.getElementById('pending-count').textContent = withoutCoords.length;
}

function renderAllBranchesList() {
    renderBranchLists(branches, branchesNoCoords);
}

// เทียบคำค้นกับทุกฟิลด์ที่ผู้ใช้น่าจะพิมพ์: ชื่อสาขา เลขสาขา กลุ่ม จังหวัด อำเภอ ตำบล และภาค
function branchMatchesQuery(branch, query, groupQuery) {
    const fields = [
        branch.name,
        branch.custom_region,
        branch.province && branch.province.name_th,
        branch.province && branch.province.name_en,
        branch.district && branch.district.name_th,
        branch.sub_district && branch.sub_district.name_th,
        branch.number
    ];

    if (fields.some(f => f !== null && f !== undefined && String(f).toLowerCase().includes(query))) {
        return true;
    }

    if (branch.group_id) {
        const gid = String(branch.group_id);
        // ตรงกับตัวเลขในคำค้น (เช่น "10") หรือคำค้นแบบ "ก.10" / "กลุ่ม 10"
        return gid.includes(query) || (groupQuery !== null && gid === groupQuery);
    }

    return false;
}

// นับจำนวนสาขาต่อค่าหนึ่งๆ (ภาค หรือ กลุ่ม)
function countBy(getValue) {
    const counts = new Map();
    allBranches.forEach(b => {
        const value = getValue(b);
        if (value === null || value === undefined) return;
        counts.set(value, (counts.get(value) || 0) + 1);
    });
    return counts;
}

// สร้างชิปกรองจากข้อมูลจริง — โหมดภาคเรียงตามจำนวนสาขา โหมดกลุ่มเรียงตามเลขกลุ่ม
function renderFilterChips() {
    const isGroupMode = chipMode === 'group';
    const active = isGroupMode ? activeGroup : activeRegion;

    const entries = isGroupMode
        ? [...countBy(b => b.group_id).entries()]
            .filter(([id]) => id !== PLACEHOLDER_GROUP_ID)
            .sort((a, b) => a[0] - b[0])
            .map(([id, count]) => ({ label: `ก.${id}`, value: id, count }))
        : [...countBy(b => b.custom_region).entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([region, count]) => ({ label: region, value: region, count }));

    const chips = [{ label: 'ทั้งหมด', value: null, count: allBranches.length }].concat(entries);

    const container = document.getElementById('filter-chips');
    container.innerHTML = '';
    chips.forEach(({ label, value, count }) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (active === value ? ' active' : '');
        chip.setAttribute('aria-pressed', String(active === value));
        chip.innerHTML = `${esc(label)} <span class="chip-count">${count}</span>`;
        chip.onclick = () => {
            // กดชิปเดิมซ้ำ = ยกเลิกการกรอง
            const next = active === value ? null : value;
            if (isGroupMode) activeGroup = next; else activeRegion = next;
            renderFilterChips();
            applySearch(document.getElementById('branch-search').value);
            container.scrollLeft = 0;
        };
        container.appendChild(chip);
    });
}

// สลับระหว่างชิปภาคกับชิปกลุ่ม — ล้างตัวกรองอีกโหมดทิ้ง เพื่อไม่ให้เหลือ
// ตัวกรองที่ผู้ใช้มองไม่เห็นค้างอยู่
function setChipMode(mode) {
    if (chipMode === mode) return;
    chipMode = mode;
    if (mode === 'group') activeRegion = null; else activeGroup = null;

    ['region', 'group'].forEach(m => {
        const btn = document.getElementById(`chip-mode-${m}`);
        btn.classList.toggle('active', chipMode === m);
        btn.setAttribute('aria-pressed', String(chipMode === m));
    });

    renderFilterChips();
    applySearch(document.getElementById('branch-search').value);
    document.getElementById('filter-chips').scrollLeft = 0;
}

function applySearch(rawQuery) {
    const query = rawQuery.toLowerCase().trim();

    // Smart Group Query: ดึงเลขกลุ่มออกมาถ้าผู้ใช้พิมพ์ "ก.x" หรือ "กลุ่ม x"
    const cleaned = query.replace('ก.', '').replace('กลุ่ม', '').trim();
    const groupQuery = /^\d+$/.test(cleaned) ? cleaned : null;

    const matches = b => (!activeRegion || b.custom_region === activeRegion)
        && (activeGroup === null || b.group_id === activeGroup)
        && branchMatchesQuery(b, query, groupQuery);
    const mapped = branches.filter(matches);
    const pending = branchesNoCoords.filter(matches);

    // ลิสต์อัปเดตทันทีเพื่อให้พิมพ์แล้วรู้สึกตอบสนอง
    renderBranchLists(mapped, pending);
    const isFiltering = query.length > 0 || activeRegion !== null || activeGroup !== null;
    if (isFiltering) openPanel(); else closePanel();

    // ส่วนแผนที่หน่วงไว้ เพราะการซ่อน/แสดงหมุดและ flyTo หนักกว่าการวาดลิสต์มาก
    clearTimeout(searchMapTimer);
    searchMapTimer = setTimeout(() => {
        updateVisibleMarkers(new Set(mapped.map(b => b.id)));
        if (isFiltering) fitToBranches(mapped);
    }, 250);
}

function createBranchCard(branch, showDistance) {
    const usable = hasUsableCoords(branch);
    const card = document.createElement('div');
    card.className = usable ? 'branch-card' : 'branch-card no-coords';
    card.innerHTML = `
        <div class="branch-card-header">
            <div class="branch-name">สาขา ${esc(branch.number)}: ${esc(branch.name)}</div>
            ${branch.group_id ? `<span class="group-badge">ก.${esc(branch.group_id)}</span>` : ''}
        </div>
        <div class="branch-location">${esc(branch.province && branch.province.name_th)} ${esc(branch.district && branch.district.name_th)}</div>
        ${branch.coords_needs_review ? '<div class="coords-review-tag">พิกัดรอสาขายืนยัน</div>' : ''}
        ${showDistance ? `<div class="branch-distance">ห่างจากคุณ ${branch.distance.toFixed(2)} กม.</div>` : ''}
    `;
    card.onclick = () => {
        const isMobile = window.innerWidth < 768;

        // สาขาที่ยังไม่มีพิกัดจะไม่ขยับแผนที่ (ไม่งั้นจะบินไปพิกัด 0,0)
        if (usable) {
            const branchLatLng = L.latLng(branch.latitude, branch.longitude);
            map.flyToBounds(branchLatLng.toBounds(500), {
                paddingTopLeft: [0, 80],
                paddingBottomRight: [0, isMobile ? window.innerHeight * 0.5 : 0],
                duration: 2
            });
        }

        openBranchDetails(branch.id);
        if (isMobile && usable) closePanel();
    };
    return card;
}

// Modal handling
function openBranchDetails(id) {
    const branch = allBranches.find(b => b.id === id);
    if (!branch) return;

    // ไม่มีพิกัด = นำทางไม่ได้ ให้ค้นหาด้วยชื่อใน Google Maps แทน
    const mapsAction = hasUsableCoords(branch)
        ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}" target="_blank" rel="noopener" class="popup-btn" style="text-align:center; display:block; text-decoration:none;">นำทางด้วย Google Maps</a>`
        : `<div class="coords-warning">สาขานี้ยังไม่มีพิกัดในระบบ จึงยังนำทางอัตโนมัติไม่ได้</div>
           <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.name)}" target="_blank" rel="noopener" class="popup-btn" style="text-align:center; display:block; text-decoration:none;">ค้นหาชื่อสาขาใน Google Maps</a>`;

    // รูปสาขาไฟล์ค่อนข้างใหญ่ (~800KB) จึงโหลดตอนเปิดหน้ารายละเอียดเท่านั้น
    // และถ้าโหลดไม่สำเร็จให้ซ่อนกรอบรูปไปเลย ไม่ต้องเหลือช่องว่าง
    const photo = branch.img
        ? `<div class="branch-photo-wrap"><img class="branch-photo" src="${esc(branch.img)}" alt="รูปสาขา ${esc(branch.name)}" loading="lazy" decoding="async" onerror="this.closest('.branch-photo-wrap').remove()"></div>`
        : '';

    // พิกัดที่ทีมงานเติมให้เอง ต้องบอกผู้ใช้ตรงๆ ว่ายังไม่ได้รับการยืนยันจากสาขา
    const coordsNotice = branch.coords_needs_review
        ? `<div class="coords-warning">
               <strong>พิกัดนี้ทีมงานเติมให้ ยังรอสาขายืนยัน</strong><br>
               ค้นจาก OpenStreetMap อาจคลาดเคลื่อนได้ กรุณาโทรสอบถามสาขาก่อนเดินทาง
               ${branch.coords_note ? `<br><span class="coords-note">${esc(branch.coords_note)}</span>` : ''}
           </div>`
        : '';

    const detailHtml = `
        ${photo}
        <h2 id="branch-detail-title" style="color:var(--text-main); font-size: 1.5rem; margin-bottom: 1rem;">${esc(branch.name)}</h2>
        <div style="margin-bottom: 1.5rem;">
            <p><strong>หมายเลขสาขา:</strong> ${esc(branch.number)}</p>
            <p><strong>กลุ่มสาขา:</strong> <span class="group-text">กลุ่ม ${esc(branch.group_id) || 'ไม่ระบุ'}</span></p>
            <p><strong>ผู้ดูแล:</strong> ${esc(branch.owner) || 'ไม่ระบุ'}</p>
            <p><strong>โทร:</strong> ${branch.owner_tel ? `<a href="tel:${esc(branch.owner_tel.replace(/\s+/g, ''))}" class="phone-link">${esc(branch.owner_tel)}</a>` : 'ไม่ระบุ'}</p>
            <p><strong>เวลาทำการ:</strong> ${esc(branch.opening_hours) || 'ไม่ระบุ'}</p>
            <p><strong>จังหวัด:</strong> ${esc(branch.province && branch.province.name_th) || 'ไม่ระบุ'}</p>
            <p><strong>ภาค:</strong> ${esc(branch.custom_region) || 'ไม่ระบุ'}</p>
        </div>
        ${coordsNotice}
        ${mapsAction}
        <button type="button" class="share-btn" id="share-branch-btn">🔗 คัดลอกลิงก์สาขานี้</button>
    `;

    document.getElementById('branch-detail').innerHTML = detailHtml;
    document.getElementById('branch-modal').style.display = 'flex';
    document.querySelector('.close-btn').focus();

    highlightMarker(branch.id);
    setBranchInUrl(branch.number);

    document.getElementById('share-branch-btn').onclick = () => shareBranch(branch);
}

// ลิงก์ตรงไปยังสาขา เช่น ?branch=35 เพื่อให้ส่งต่อใน LINE ได้
function branchUrl(number) {
    const url = new URL(window.location.href);
    url.searchParams.set('branch', number);
    return url.href;
}

function setBranchInUrl(number) {
    const url = new URL(window.location.href);
    url.searchParams.set('branch', number);
    window.history.replaceState(null, '', url.pathname + url.search);
}

function clearBranchFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('branch');
    window.history.replaceState(null, '', url.pathname + url.search);
}

async function shareBranch(branch) {
    const url = branchUrl(branch.number);
    const title = `สาขา ${branch.number}: ${branch.name}`;

    // มือถือส่วนใหญ่มี Web Share API ให้เลือกส่งเข้า LINE ได้เลย
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return; // ผู้ใช้กดยกเลิกเอง
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        showToast('คัดลอกลิงก์แล้ว');
    } catch (err) {
        showToast('คัดลอกลิงก์ไม่สำเร็จ');
    }
}

// เปิดสาขาจาก ?branch=<เลขสาขา> ตอนโหลดหน้า
function openBranchFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('branch');
    if (raw === null) return;

    const number = parseInt(raw, 10);
    const branch = allBranches.find(b => b.number === number);
    if (!branch) {
        showToast(`ไม่พบสาขา ${raw}`); // showToast ใช้ textContent จึงไม่ต้อง escape
        return;
    }

    if (hasUsableCoords(branch)) {
        const isMobile = window.innerWidth < 768;
        map.flyToBounds(L.latLng(branch.latitude, branch.longitude).toBounds(1500), {
            paddingTopLeft: [0, 90],
            paddingBottomRight: [0, isMobile ? window.innerHeight * 0.5 : 40],
            duration: 1.5
        });
    }
    openBranchDetails(branch.id);
}

function closeBranchModal() {
    document.getElementById('branch-modal').style.display = 'none';
    clearBranchFromUrl();
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
    document.getElementById('chip-mode-region').onclick = () => setChipMode('region');
    document.getElementById('chip-mode-group').onclick = () => setChipMode('group');
    
    document.querySelector('.close-btn').onclick = closeBranchModal;

    // ใช้ addEventListener แทน window.onclick เพื่อไม่ไปทับ handler อื่น
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('branch-modal')) closeBranchModal();
    });

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (document.getElementById('branch-modal').style.display === 'flex') {
            closeBranchModal();
        } else {
            closePanel();
        }
    });

    // Simplified Bottom Sheet Interaction (Click/Tap only)
    const handle = document.querySelector('.panel-handle');
    
    handle.onclick = togglePanel;

    // Close panel when clicking on the map (so users aren't trapped)
    map.on('click', () => {
        closePanel();
    });

    // Search input: Filter list without auto-expanding
    document.getElementById('branch-search').oninput = (e) => applySearch(e.target.value);
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
