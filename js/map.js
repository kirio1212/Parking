/**
 * ============================================
 * MAP.JS - Carte des places de parking
 * Smart Parking - BTS CIEL IR
 * ============================================
 */

// Configuration
const MAP_CONFIG = {
    totalSpots: 10,  // Nombre total de places
    updateInterval: 5000  // Intervalle de mise à jour
};

// État des places
let spotsState = {
    spots: [],
    selectedSpot: null
};

// Types de places
const SPOT_STATUS = {
    FREE: 'free',
    OCCUPIED: 'occupied',
    RESERVED: 'reserved'
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('🗺️ Initialisation de la carte...');
    initParkingMap();
});

/**
 * Initialise la carte du parking
 */
function initParkingMap() {
    // Charger les places depuis le stockage local ou créer les places par défaut
    loadSpots();
    
    // Rendre la carte
    renderMap();
    
    // Mettre à jour les statistiques
    updateStats();
    
    // Mettre à jour le formulaire de réservation
    updateReservationForm();
    
    // Démarrer la simulation (si pas admin)
    if (!isAdmin()) {
        startSimulation();
    }
}

/**
 * Charge les places
 */
function loadSpots() {
    const stored = localStorage.getItem('smart_parking_spots');
    
    if (stored) {
        spotsState.spots = JSON.parse(stored);
    } else {
        // Créer les places par défaut
        createDefaultSpots();
    }
}

/**
 * Crée les places par défaut
 */
function createDefaultSpots() {
    spotsState.spots = [];
    
    for (let i = 1; i <= MAP_CONFIG.totalSpots; i++) {
        // Distribution: 60% libre, 25% occupé, 15% réservé
        const rand = Math.random();
        let status = SPOT_STATUS.FREE;
        
        if (rand > 0.85) {
            status = SPOT_STATUS.RESERVED;
        } else if (rand > 0.60) {
            status = SPOT_STATUS.OCCUPIED;
        }
        
        spotsState.spots.push({
            id: i,
            number: i,
            status: status,
            lastUpdate: new Date().toISOString(),
            sensorId: `SENSOR_${String(i).padStart(3, '0')}`
        });
    }
    
    saveSpots();
}

/**
 * Sauvegarde les places
 */
function saveSpots() {
    localStorage.setItem('smart_parking_spots', JSON.stringify(spotsState.spots));
}

/**
 * Rend la carte
 */
function renderMap() {
    const mapContainer = document.getElementById('parkingMap');
    if (!mapContainer) return;
    
    mapContainer.innerHTML = spotsState.spots.map(spot => `
        <div 
            class="parking-spot ${spot.status}" 
            data-id="${spot.id}"
            onclick="handleSpotClick(${spot.id})"
            title="Place ${spot.number} - ${getStatusLabel(spot.status)}"
        >
            <span class="spot-number">${spot.number}</span>
            <span class="spot-icon">${getStatusIcon(spot.status)}</span>
        </div>
    `).join('');
}

/**
 * Gère le clic sur une place
 */
function handleSpotClick(spotId) {
    const spot = spotsState.spots.find(s => s.id === spotId);
    if (!spot) return;
    
    spotsState.selectedSpot = spot;
    showSpotDetails(spot);
}

/**
 * Affiche les détails d'une place
 */
function showSpotDetails(spot) {
    const container = document.getElementById('spotDetails');
    if (!container) return;
    
    const isReserved = spot.status === SPOT_STATUS.RESERVED;
    const reservation = isReserved ? findReservationForSpot(spot.id) : null;
    
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
                <span class="spot-info-value">${spot.sensorId}</span>
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
                <button class="btn btn-primary btn-block" onclick="Dashboard.navigateToPage('reservation'); selectSpotForReservation(${spot.id});">
                    <span class="btn-icon">📅</span>
                    Réserver cette place
                </button>
            ` : ''}
        </div>
    `;
}

/**
 * Trouve la réservation pour une place
 */
function findReservationForSpot(spotId) {
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    return reservations.find(r => r.spotId === spotId && r.status === 'active');
}

/**
 * Met à jour les statistiques
 */
function updateStats() {
    const free = spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE).length;
    const occupied = spotsState.spots.filter(s => s.status === SPOT_STATUS.OCCUPIED).length;
    const reserved = spotsState.spots.filter(s => s.status === SPOT_STATUS.RESERVED).length;
    
    document.getElementById('freeCount').textContent = free;
    document.getElementById('occupiedCount').textContent = occupied;
    document.getElementById('reservedCount').textContent = reserved;
    document.getElementById('totalCount').textContent = spotsState.spots.length;
}

/**
 * Met à jour le formulaire de réservation
 */
function updateReservationForm() {
    const select = document.getElementById('resSpot');
    if (!select) return;
    
    // Garder la première option
    const firstOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOption);
    
    // Ajouter uniquement les places libres
    const freeSpots = spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE);
    
    freeSpots.forEach(spot => {
        const option = document.createElement('option');
        option.value = spot.id;
        option.textContent = `Place ${spot.number}`;
        select.appendChild(option);
    });
}

/**
 * Sélectionne une place pour la réservation
 */
function selectSpotForReservation(spotId) {
    const select = document.getElementById('resSpot');
    if (select) {
        select.value = spotId;
    }
}

/**
 * Définit le statut d'une place
 */
function setSpotStatus(spotId, status) {
    const spot = spotsState.spots.find(s => s.id === spotId || s.number === spotId);
    if (spot) {
        spot.status = status;
        spot.lastUpdate = new Date().toISOString();
        saveSpots();
        renderMap();
        updateStats();
        updateReservationForm();
    }
}

/**
 * Change le nombre total de places
 */
function setTotalSpots(count) {
    MAP_CONFIG.totalSpots = count;
    
    // Ajuster le tableau des places
    if (count > spotsState.spots.length) {
        // Ajouter des places
        for (let i = spotsState.spots.length + 1; i <= count; i++) {
            spotsState.spots.push({
                id: i,
                number: i,
                status: SPOT_STATUS.FREE,
                lastUpdate: new Date().toISOString(),
                sensorId: `SENSOR_${String(i).padStart(3, '0')}`
            });
        }
    } else if (count < spotsState.spots.length) {
        // Supprimer des places
        spotsState.spots = spotsState.spots.slice(0, count);
    }
    
    saveSpots();
    renderMap();
    updateStats();
    updateReservationForm();
}

/**
 * Simulation automatique
 */
function startSimulation() {
    setInterval(() => {
        // 20% de chance de changer une place
        if (Math.random() > 0.8) {
            const randomSpot = spotsState.spots[Math.floor(Math.random() * spotsState.spots.length)];
            
            if (randomSpot.status === SPOT_STATUS.FREE && Math.random() > 0.5) {
                setSpotStatus(randomSpot.id, SPOT_STATUS.OCCUPIED);
            } else if (randomSpot.status === SPOT_STATUS.OCCUPIED && Math.random() > 0.3) {
                setSpotStatus(randomSpot.id, SPOT_STATUS.FREE);
            }
        }
    }, MAP_CONFIG.updateInterval);
}

/**
 * Vérifie si l'utilisateur est admin
 */
function isAdmin() {
    const user = JSON.parse(localStorage.getItem('smart_parking_user') || 'null');
    return user && user.role === 'admin';
}

/**
 * Retourne le label du statut
 */
function getStatusLabel(status) {
    const labels = {
        [SPOT_STATUS.FREE]: 'Libre',
        [SPOT_STATUS.OCCUPIED]: 'Occupée',
        [SPOT_STATUS.RESERVED]: 'Réservée'
    };
    return labels[status] || 'Inconnu';
}

/**
 * Retourne l'icône du statut
 */
function getStatusIcon(status) {
    const icons = {
        [SPOT_STATUS.FREE]: '✓',
        [SPOT_STATUS.OCCUPIED]: '🚗',
        [SPOT_STATUS.RESERVED]: '📅'
    };
    return icons[status] || '?';
}

/**
 * Formate une date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Exporter les fonctions
window.ParkingMap = {
    refresh: () => {
        loadSpots();
        renderMap();
        updateStats();
        updateReservationForm();
    },
    setSpotStatus,
    setTotalSpots,
    getSpots: () => spotsState.spots,
    getFreeSpots: () => spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE),
    getStats: () => ({
        total: spotsState.spots.length,
        free: spotsState.spots.filter(s => s.status === SPOT_STATUS.FREE).length,
        occupied: spotsState.spots.filter(s => s.status === SPOT_STATUS.OCCUPIED).length,
        reserved: spotsState.spots.filter(s => s.status === SPOT_STATUS.RESERVED).length
    })
};
