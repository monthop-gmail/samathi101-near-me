let map;
let branches = [];
let userLocation = null;
let markers = [];

// Initialize Map
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([13.7367, 100.5231], 6); // Default to Thailand center

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
}

// Load Branches
async function loadBranches() {
    try {
        const response = await fetch('branches.json');
        branches = await response.json();
        renderMarkers();
        renderAllBranchesList();
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
            const marker = L.circleMarker([branch.latitude, branch.longitude], {
                radius: 8,
                fillColor: "#4f46e5",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);

            marker.bindPopup(`
                <div class="popup-content">
                    <strong>สาขาที่ ${branch.number}: ${branch.name}</strong><br>
                    <p>${branch.owner || ''}</p>
                    <p>${branch.owner_tel || ''}</p>
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
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
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
    navigator.geolocation.getCurrentPosition(position => {
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        map.setView([userLocation.lat, userLocation.lng], 12);
        
        // Add User Marker
        L.marker([userLocation.lat, userLocation.lng]).addTo(map)
            .bindPopup('ตำแหน่งของคุณ').openPopup();

        updateNearestBranches();
        showToast('พบสาขาใกล้คุณ 5 อันดับแรก');
    }, error => {
        showToast('ไม่สามารถระบุตำแหน่งได้: ' + error.message);
    });
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
        <div class="branch-name">สาขาที่ ${branch.number}: ${branch.name}</div>
        <div class="branch-location">${branch.province ? branch.province.name_th : ''} ${branch.district ? branch.district.name_th : ''}</div>
        ${showDistance ? `<div class="branch-distance">ห่างจากคุณ ${branch.distance.toFixed(2)} กม.</div>` : ''}
    `;
    card.onclick = () => {
        map.setView([branch.latitude, branch.longitude], 15);
        openBranchDetails(branch.id);
        if (window.innerWidth < 768) closePanel();
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

// UI Helpers
function openPanel() {
    document.getElementById('side-panel').classList.remove('collapsed');
}

function closePanel() {
    document.getElementById('side-panel').classList.add('collapsed');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Events
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadBranches();

    document.getElementById('locate-me-btn').onclick = locateUser;
    
    document.querySelector('.close-btn').onclick = () => {
        document.getElementById('branch-modal').style.display = 'none';
    };

    window.onclick = (event) => {
        const modal = document.getElementById('branch-modal');
        if (event.target == modal) modal.style.display = 'none';
    };

    // Improved Bottom Sheet interactions (Pointer & Touch)
    const panel = document.getElementById('side-panel');
    const handle = document.querySelector('.panel-handle');
    let startY = 0;
    let isDragging = false;
    let startTransform = 0;

    const onStart = (y) => {
        startY = y;
        isDragging = true;
        panel.style.transition = 'none';
        const transform = window.getComputedStyle(panel).transform;
        if (transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(transform);
            startTransform = matrix.m42;
        } else {
            startTransform = 0;
        }
    };

    const onMove = (y) => {
        if (!isDragging) return;
        const deltaY = y - startY;
        // Optional: Implement real-time drag if desired, but toggle is safer for now
    };

    const onEnd = (y) => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = '';
        const deltaY = y - startY;
        
        if (deltaY > 30) {
            closePanel();
        } else if (deltaY < -30) {
            openPanel();
        } else {
            // If it was just a tap/click on the handle, toggle it
            panel.classList.toggle('collapsed');
        }
    };

    // Touch events
    handle.addEventListener('touchstart', (e) => onStart(e.touches[0].clientY));
    document.addEventListener('touchmove', (e) => onMove(e.touches[0].clientY), { passive: true });
    document.addEventListener('touchend', (e) => onEnd(e.changedTouches[0].clientY));

    // Mouse events (for desktop/testing)
    handle.addEventListener('mousedown', (e) => onStart(e.clientY));
    document.addEventListener('mousemove', (e) => onMove(e.clientY));
    document.addEventListener('mouseup', (e) => onEnd(e.clientY));

    // Search input: Ensure panel DOES NOT open while typing unless user wants it
    document.getElementById('branch-search').oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = branches.filter(b => 
            b.name.toLowerCase().includes(query) || 
            (b.province && b.province.name_th.toLowerCase().includes(query)) ||
            (b.province && b.province.name_en.toLowerCase().includes(query)) ||
            (b.number && b.number.toString().includes(query))
        );
        
        const listElement = document.getElementById('all-branches-list');
        listElement.innerHTML = '';
        filtered.forEach(b => {
             const card = createBranchCard(b, false);
             listElement.appendChild(card);
        });
        
        // Removed openPanel() - User must explicitly open to see results
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
