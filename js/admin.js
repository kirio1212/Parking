/**
 * ============================================
 * ADMIN.JS - Panel d'administration
 * Smart Parking v3.0
 * CORRIGÉ :
 *   - Suppression du graphique d'occupation
 *   - Historique affiche la date complète
 *     (jour + mois + année + heure + minute)
 * ============================================
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('⚙️ Initialisation du panel admin...');
    if (!isAdmin()) return;
    initAdminPanel();
});

function isAdmin() {
    const user = JSON.parse(localStorage.getItem('smart_parking_user') || 'null');
    return user && user.role === 'admin';
}

function initAdminPanel() {
    loadAdminStats();
    initPlacesControl();
    loadUsersTable();
    loadReservationsTable();
    loadHistoryLog();

    // Rafraîchissement périodique toutes les 10 secondes
    setInterval(() => {
        loadAdminStats();
        loadReservationsTable();
        loadHistoryLog();
    }, 10000);
}

// ============================================
// STATISTIQUES ADMIN
// ============================================

function loadAdminStats() {
    const users        = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const spots        = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');

    const totalUsers        = users.length + 1;
    const totalReservations = reservations.length;
    const totalRevenue      = reservations
        .filter(r => r.status === 'active' || r.status === 'completed')
        .reduce((sum, r) => sum + (r.price || 0), 0);

    const occupied      = spots.filter(s => s.status === 'occupied').length;
    const reserved      = spots.filter(s => s.status === 'reserved').length;
    const occupancyRate = spots.length > 0
        ? Math.round(((occupied + reserved) / spots.length) * 100)
        : 0;

    document.getElementById('adminTotalUsers').textContent        = totalUsers;
    document.getElementById('adminTotalReservations').textContent = totalReservations;
    document.getElementById('adminTotalRevenue').textContent      = totalRevenue + '€';
    document.getElementById('adminOccupancyRate').textContent     = occupancyRate + '%';
}

// ============================================
// GESTION DES PLACES
// ============================================

function initPlacesControl() {
    const spots      = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    const spotsInput = document.getElementById('adminTotalSpots');
    if (spotsInput) spotsInput.value = spots.length || 10;

    document.getElementById('updateSpotsBtn')?.addEventListener('click', () => {
        const newCount = parseInt(document.getElementById('adminTotalSpots').value);
        if (newCount < 5 || newCount > 50) {
            Dashboard.showToast('Le nombre de places doit être entre 5 et 50', 'error');
            return;
        }
        if (window.ParkingMap) {
            window.ParkingMap.setTotalSpots(newCount);
            renderAdminPlacesList();
            Dashboard.showToast('Nombre de places mis à jour', 'success');
        }
    });

    renderAdminPlacesList();
}

function renderAdminPlacesList() {
    const container = document.getElementById('adminPlacesList');
    if (!container) return;

    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');

    container.innerHTML = spots.map(spot => `
        <div
            class="admin-place-item ${spot.status}"
            onclick="toggleSpotStatus(${spot.id})"
            title="Place ${spot.number} — Cliquez pour changer"
        >
            ${spot.number}
        </div>
    `).join('');
}

function toggleSpotStatus(spotId) {
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    const spot  = spots.find(s => s.id === spotId);
    if (!spot) return;

    const cycle       = ['free', 'occupied', 'reserved'];
    const nextStatus  = cycle[(cycle.indexOf(spot.status) + 1) % cycle.length];
    spot.status       = nextStatus;
    spot.lastUpdate   = new Date().toISOString();

    localStorage.setItem('smart_parking_spots', JSON.stringify(spots));
    renderAdminPlacesList();
    if (window.ParkingMap) window.ParkingMap.refresh();
    loadAdminStats();

    Dashboard.showToast(`Place ${spot.number} — ${getStatusLabel(nextStatus)}`, 'success');
}

// ============================================
// TABLEAU UTILISATEURS
// ============================================

function loadUsersTable() {
    const tbody = document.getElementById('adminUsersTable');
    if (!tbody) return;

    const users    = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    const allUsers = [
        { id: 0, name: 'Administrateur', email: 'admin@smartparking.fr', phone: '01 23 45 67 89', role: 'admin' },
        ...users
    ];

    tbody.innerHTML = allUsers.map(user => `
        <tr>
            <td>#${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.phone || '-'}</td>
            <td>
                <span class="badge ${user.role === 'admin' ? 'badge-admin' : 'badge-client'}">
                    ${user.role === 'admin' ? 'Admin' : 'Client'}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    ${user.role !== 'admin' ? `
                        <button class="btn btn-danger btn-small btn-icon-only"
                            onclick="deleteUser(${user.id})" title="Supprimer">🗑️</button>
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

function deleteUser(userId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;

    let users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    users     = users.filter(u => u.id !== userId);
    localStorage.setItem('smart_parking_users', JSON.stringify(users));

    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    reservations     = reservations.filter(r => r.userId !== userId);
    localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));

    loadUsersTable();
    loadReservationsTable();
    loadAdminStats();
    Dashboard.showToast('Utilisateur supprimé', 'success');
}

// ============================================
// TABLEAU RÉSERVATIONS
// ============================================

function loadReservationsTable() {
    const tbody = document.getElementById('adminReservationsTable');
    if (!tbody) return;

    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');

    if (reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Aucune réservation</td></tr>';
        return;
    }

    tbody.innerHTML = reservations.slice().reverse().map(res => `
        <tr>
            <td>#${res.id}</td>
            <td>${res.userName}</td>
            <td>Place ${res.spotNumber}</td>
            <td>${formatDateShort(res.date)}</td>
            <td>${res.startTime} - ${res.endTime}</td>
            <td>${res.price}€</td>
            <td>
                <span class="reservation-status status-${res.status}">
                    ${getStatusLabel(res.status)}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    ${res.status === 'active' ? `
                        <button class="btn btn-success btn-small btn-icon-only"
                            onclick="completeReservation(${res.id})" title="Terminer">✓</button>
                        <button class="btn btn-danger btn-small btn-icon-only"
                            onclick="adminCancelReservation(${res.id})" title="Annuler">✕</button>
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

function completeReservation(reservationId) {
    let reservations  = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    reservation.status = 'completed';
    localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));

    if (window.ParkingMap) window.ParkingMap.setSpotStatus(reservation.spotId, 'free');

    loadReservationsTable();
    loadAdminStats();
    Dashboard.showToast('Réservation terminée', 'success');
}

function adminCancelReservation(reservationId) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette réservation ?')) return;

    let reservations  = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    reservation.status = 'cancelled';
    localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));

    if (window.ParkingMap) window.ParkingMap.setSpotStatus(reservation.spotId, 'free');

    loadReservationsTable();
    loadAdminStats();
    Dashboard.showToast('Réservation annulée', 'success');
}

// ============================================
// HISTORIQUE — CORRIGÉ : date complète
// ============================================

function loadHistoryLog() {
    const container = document.getElementById('adminLogContainer');
    if (!container) return;

    const history = JSON.parse(localStorage.getItem('smart_parking_history') || '[]');

    if (history.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center">Aucun historique</p>';
        return;
    }

    container.innerHTML = history.slice(0, 50).map(item => `
        <div class="log-item">
            <span class="log-time">${formatDateComplete(item.timestamp)}</span>
            <span><strong>${item.action} :</strong> ${item.details}</span>
        </div>
    `).join('');
}

// ============================================
// FONCTIONS DE FORMAT DATE
// ============================================

/**
 * CORRIGÉ — Affiche la date complète dans l'historique
 * Avant : seulement "14:32"
 * Après : "12/06/2025 à 14:32"
 */
function formatDateComplete(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const jour  = String(date.getDate()).padStart(2, '0');
    const mois  = String(date.getMonth() + 1).padStart(2, '0');
    const annee = date.getFullYear();
    const heure = String(date.getHours()).padStart(2, '0');
    const min   = String(date.getMinutes()).padStart(2, '0');
    return `${jour}/${mois}/${annee} à ${heure}:${min}`;
}

function formatDateShort(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit'
    });
}

function getStatusLabel(status) {
    return {
        pending:   'En attente',
        active:    'Active',
        completed: 'Terminée',
        cancelled: 'Annulée',
        free:      'Libre',
        occupied:  'Occupée',
        reserved:  'Réservée'
    }[status] || status;
}

// ============================================
// EXPORT
// ============================================

window.AdminModule = {
    refresh: () => {
        loadAdminStats();
        renderAdminPlacesList();
        loadUsersTable();
        loadReservationsTable();
        loadHistoryLog();
    },
    toggleSpotStatus,
    deleteUser,
    completeReservation,
    adminCancelReservation
};