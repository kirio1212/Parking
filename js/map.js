/**
 * ============================================
 * MAP.JS - Carte des places de parking
 * Smart Parking v2.0
 * MODIFIÉ : polling API toutes les 3s pour recevoir
 *           les mises à jour en temps réel depuis Arduino
 * ============================================
 */

const MAP_CONFIG = {
    totalSpots:     10,
    updateInterval: 3000    // Refresh depuis l'API toutes les 3 secondes
};

let spotsState = {
    spots:        [],
    selectedSpot: null
};

const SPOT_STATUS = { FREE: 'free', OCCUPIED: 'occupied', RESERVED: 'reserved' };

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🗺️ Initialisation de la carte...');
    initParkingMap();
});

async function initParkingMap() {
    // Essayer d'abord de charger depuis l'API (données MariaDB + Arduino)
    const loaded = await loadSpotsFromAPI();

    // Si pas d'API disponible, utiliser le localStorage (mode offline)
    if (!loaded) {
        loadSpotsFromStorage();
    }

    renderMap();
    updateStats();
    updateReservationForm();

    // ⭐ Polling toutes les 3 secondes pour recevoir les updates Arduino
    startAPIPolling();
}

// ============================================
// CHARGEMENT DES PLACES
// ============================================

/**
 * Charge les places depuis l'API (MariaDB)
 * Retourne true si succès, false si hors-ligne
 */
async function loadSpotsFromAPI() {
    try {
        const token = localStorage.getItem('smart_parking_token');
        if (!token) return false;

        const response = await fetch('/api/spots', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!response.ok) return false;

        const data = await response.json();
        if (!data.success || !data.data.length) return false;

        // Convertir le format API → format interne
        spotsState.spots = data.data.map(s => ({
            id:         s.id,
            number:     s.number,
            status:     s.status,
            lastUpdate: s.last_update,
            sensorId:   s.sensor_id
        }));

        // Synchroniser avec localStorage pour le mode offline
        saveSpots();
        return true;

    } catch (_err) {
        // Serveur non joignable → mode offline
        return false;
    }
}

/**
 * Charge les places depuis le localStorage (mode offline)
 */
function loadSpotsFromStorage() {
    const stored = localStorage.getItem('smart_parking_spots');
    if (stored) {
        spotsState.spots = JSON.parse(stored);
    } else {
        createDefaultSpots();
    }
}

function createDefaultSpots() {
    spotsState.spots = [];
    for (let i = 1; i <= MAP_CONFIG.totalSpots; i++) {
        spotsState.spots.push({
            id:         i,
            number:     i,
            status:     SPOT_STATUS.FREE,
            lastUpdate: new Date().toISOString(),
            sensorId:   `SENSOR_${String(i).padStart(3, '0')}`
        });
    }
    saveSpots();
}

function saveSpots() {
    localStorage.setItem('smart_parking_spots', JSON.stringify(spotsState.spots));
}

// ============================================
// ⭐ POLLING TEMPS RÉEL (mises à jour Arduino)
// ============================================

/**
 * Interroge l'API toutes les 3 secondes.
 * Si l'Arduino a changé l'état d'une place via MQTT,
 * la carte se met à jour automatiquement.
 */
function startAPIPolling() {
    setInterval(async () => {
        const loaded = await loadSpotsFromAPI();
        if (loaded) {
            renderMap();
            updateStats();
            updateReservationForm();
            // Rafraîchir les détails si une place est sélectionnée
            if (spotsState.selectedSpot) {
                const updated = spotsState.spots.find(s => s.id === spotsState.selectedSpot.id);
                if (updated) {
                    spotsState.selectedSpot = updated;
                    showSpotDetails(updated);
                }
            }
        }
    }, MAP_CONFIG.updateInterval);
}

// ============================================
// RENDU DE LA CARTE
// ============================================

function renderMap() {
    const mapContainer = document.getElementById('parkingMap');
    if (!mapContainer) return;

    mapContainer.innerHTML = spotsState.spots.map(spot => `
        <div
            class="parking-spot ${spot.status}"
            data-id="${spot.id}"
            onclick="handleSpotClick(${spot.id})"
            title="Place ${spot.number} — ${getStatusLabel(spot.status)}"
        >
            <span class="spot-number">${spot.number}</span>
            <span class="spot-icon">${getStatusIcon(spot.status)}</span>
        </div>
    `).join('');
}

function handleSpotClick(spotId) {
    const spot = spotsState.spots.find(s => s.id === spotId);
    if (!spot) return;
    spotsState.selectedSpot = spot;
    showSpotDetails(spot);
}

function showSpotDetails(spot) {
    const container = document.getElementById('spotDetails');
    if (!container) return;

    const reservation = spot.status === SPOT_STATUS.RESERVED
        ? findReservationForSpot(spot.id)
        : null;

    container.innerHTML = `
        <div class="spot-info-detail">
            <div class="spot-info-row">
                <span class="spot-info-label">Numéro</span>
                <span class="spot-info-value">Place ${spot.number}</span>
            </div>
            <div class="spot-info-row">
                <span class="spot-info-label">État</span>
                <span class="spot-info-value spot-status-${spot.status}">
                    ${getStatusLabel(spot.status)}
                </span>
            </div>
            <div class="spot-info-row">
                <span class="spot-info-label">Capteur</span>
                <span class="spot-info-value">${spot.sensorId || 'N/A'}</span>
            </div>
            <div class="spot-info-row">
                <span class="spot-info-label">Dernière mise à jour</span>
                <span class="spot-info-value">${formatDate(spot.lastUpdate)}</span>
            </div>
            ${reservation ? `
                <div class="spot-info-row">
                    <span class="spot-info-label">Réservé par</span>
                    <span class="spot-info-value">${reservation.userName}</span>
                </div>
                <div class="spot-info-row">
                    <span class="spot-info-label">Jusqu'à</span>
                    <span class="spot-info-value">${reservation.endTime}</span>
                </div>
            ` : ''}
            ${spot.status === SPOT_STATUS.FREE ? `
                <button class="btn btn-primary btn-block"
                    onclick="Dashboard.navigateToPage('reservation'); selectSpotForReservation(${spot.id});">
                    <span class="btn-icon">📅</span>
                    Réserver cette place
                </button>
            ` : ''}
        </div>
    `;
}

function findReservationForSpot(spotId) {
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    return reservations.find(r => r.spotId === spotId && r.status === 'active');
}

// ============================================
// STATISTIQUES & FORMULAIRE
// ============================================

function updateStats() {
    const free     = spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE).length;
    const occupied = spotsState.spots.filter(s => s.status === SPOT_STATUS.OCCUPIED).length;
    const reserved = spotsState.spots.filter(s => s.status === SPOT_STATUS.RESERVED).length;

    document.getElementById('freeCount').textContent     = free;
    document.getElementById('occupiedCount').textContent = occupied;
    document.getElementById('reservedCount').textContent = reserved;
    document.getElementById('totalCount').textContent    = spotsState.spots.length;
}

function updateReservationForm() {
    const select = document.getElementById('resSpot');
    if (!select) return;

    const firstOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOption);

    spotsState.spots
        .filter(s => s.status === SPOT_STATUS.FREE)
        .forEach(spot => {
            const option = document.createElement('option');
            option.value       = spot.id;
            option.textContent = `Place ${spot.number}`;
            select.appendChild(option);
        });
}

function selectSpotForReservation(spotId) {
    const select = document.getElementById('resSpot');
    if (select) select.value = spotId;
}

// ============================================
// ACTIONS ADMIN & SIMULATION
// ============================================

async function setSpotStatus(spotId, status) {
    const spot = spotsState.spots.find(s => s.id === spotId || s.number === spotId);
    if (!spot) return;

    spot.status     = status;
    spot.lastUpdate = new Date().toISOString();
    saveSpots();
    renderMap();
    updateStats();
    updateReservationForm();

    // Synchroniser avec l'API si connecté
    try {
        const token = localStorage.getItem('smart_parking_token');
        if (token) {
            await fetch(`/api/spots/${spot.id}/status`, {
                method:  'PUT',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ status })
            });
        }
    } catch (_err) { /* mode offline */ }
}

function setTotalSpots(count) {
    MAP_CONFIG.totalSpots = count;
    if (count > spotsState.spots.length) {
        for (let i = spotsState.spots.length + 1; i <= count; i++) {
            spotsState.spots.push({
                id: i, number: i,
                status:     SPOT_STATUS.FREE,
                lastUpdate: new Date().toISOString(),
                sensorId:   `SENSOR_${String(i).padStart(3, '0')}`
            });
        }
    } else {
        spotsState.spots = spotsState.spots.slice(0, count);
    }
    saveSpots();
    renderMap();
    updateStats();
    updateReservationForm();
}

// ============================================
// UTILITAIRES
// ============================================

function isAdmin() {
    const user = JSON.parse(localStorage.getItem('smart_parking_user') || 'null');
    return user && user.role === 'admin';
}

function getStatusLabel(status) {
    return { free: 'Libre', occupied: 'Occupée', reserved: 'Réservée' }[status] || 'Inconnu';
}

function getStatusIcon(status) {
    return { free: '✓', occupied: '🚗', reserved: '📅' }[status] || '?';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ============================================
// EXPORT
// ============================================

window.ParkingMap = {
    refresh: async () => {
        const loaded = await loadSpotsFromAPI();
        if (!loaded) loadSpotsFromStorage();
        renderMap();
        updateStats();
        updateReservationForm();
    },
    setSpotStatus,
    setTotalSpots,
    getSpots:     () => spotsState.spots,
    getFreeSpots: () => spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE),
    getStats: () => ({
        total:    spotsState.spots.length,
        free:     spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE).length,
        occupied: spotsState.spots.filter(s => s.status === SPOT_STATUS.OCCUPIED).length,
        reserved: spotsState.spots.filter(s => s.status === SPOT_STATUS.RESERVED).length
    })
};