/**
 * ============================================
 * ADMIN.JS - Panel d'administration
 * Smart Parking - BTS CIEL IR
 * ============================================
 */

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('⚙️ Initialisation du panel admin...');
    
    // Vérifier si l'utilisateur est admin
    if (!isAdmin()) return;
    
    initAdminPanel();
});

/**
 * Vérifie si l'utilisateur est admin
 */
function isAdmin() {
    const user = JSON.parse(localStorage.getItem('smart_parking_user') || 'null');
    return user && user.role === 'admin';
}

/**
 * Initialise le panel admin
 */
function initAdminPanel() {
    loadAdminStats();
    initPlacesControl();
    loadUsersTable();
    loadReservationsTable();
    initOccupancyChart();
    loadHistoryLog();
    
    // Rafraîchissement périodique
    setInterval(() => {
        loadAdminStats();
        loadReservationsTable();
    }, 10000);
}

/**
 * Charge les statistiques admin
 */
function loadAdminStats() {
    const users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    
    // Calculer les stats
    const totalUsers = users.length + 1; // +1 pour l'admin par défaut
    const totalReservations = reservations.length;
    const totalRevenue = reservations
        .filter(r => r.status === 'active' || r.status === 'completed')
        .reduce((sum, r) => sum + (r.price || 0), 0);
    
    const occupied = spots.filter(s => s.status === 'occupied').length;
    const reserved = spots.filter(s => s.status === 'reserved').length;
    const occupancyRate = spots.length > 0 
        ? Math.round(((occupied + reserved) / spots.length) * 100) 
        : 0;
    
    // Mettre à jour l'affichage
    document.getElementById('adminTotalUsers').textContent = totalUsers;
    document.getElementById('adminTotalReservations').textContent = totalReservations;
    document.getElementById('adminTotalRevenue').textContent = totalRevenue + '€';
    document.getElementById('adminOccupancyRate').textContent = occupancyRate + '%';
}

/**
 * Initialise le contrôle des places
 */
function initPlacesControl() {
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    
    // Mettre à jour le champ du nombre de places
    const spotsInput = document.getElementById('adminTotalSpots');
    if (spotsInput) {
        spotsInput.value = spots.length || 10;
    }
    
    // Bouton de mise à jour
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
    
    // Rendre la liste des places
    renderAdminPlacesList();
}

/**
 * Rend la liste des places dans l'admin
 */
function renderAdminPlacesList() {
    const container = document.getElementById('adminPlacesList');
    if (!container) return;
    
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    
    container.innerHTML = spots.map(spot => `
        <div 
            class="admin-place-item ${spot.status}" 
            onclick="toggleSpotStatus(${spot.id})"
            title="Place ${spot.number} - Cliquez pour changer"
        >
            ${spot.number}
        </div>
    `).join('');
}

/**
 * Change le statut d'une place (admin)
 */
function toggleSpotStatus(spotId) {
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    const spot = spots.find(s => s.id === spotId);
    
    if (!spot) return;
    
    // Cycle: free -> occupied -> reserved -> free
    const cycle = ['free', 'occupied', 'reserved'];
    const currentIndex = cycle.indexOf(spot.status);
    const nextStatus = cycle[(currentIndex + 1) % cycle.length];
    
    spot.status = nextStatus;
    spot.lastUpdate = new Date().toISOString();
    
    localStorage.setItem('smart_parking_spots', JSON.stringify(spots));
    
    // Rafraîchir
    renderAdminPlacesList();
    if (window.ParkingMap) {
        window.ParkingMap.refresh();
    }
    loadAdminStats();
    
    Dashboard.showToast(`Place ${spot.number} - ${getStatusLabel(nextStatus)}`, 'success');
}

/**
 * Charge le tableau des utilisateurs
 */
function loadUsersTable() {
    const tbody = document.getElementById('adminUsersTable');
    if (!tbody) return;
    
    const users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    
    // Ajouter l'admin par défaut
    const allUsers = [
        {
            id: 0,
            name: 'Administrateur',
            email: 'admin@smartparking.fr',
            phone: '01 23 45 67 89',
            role: 'admin'
        },
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
                        <button class="btn btn-danger btn-small btn-icon-only" onclick="deleteUser(${user.id})" title="Supprimer">
                            🗑️
                        </button>
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Supprime un utilisateur
 */
function deleteUser(userId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    
    let users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    users = users.filter(u => u.id !== userId);
    localStorage.setItem('smart_parking_users', JSON.stringify(users));
    
    // Supprimer aussi ses réservations
    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    reservations = reservations.filter(r => r.userId !== userId);
    localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));
    
    loadUsersTable();
    loadReservationsTable();
    loadAdminStats();
    
    Dashboard.showToast('Utilisateur supprimé', 'success');
}

/**
 * Charge le tableau des réservations
 */
function loadReservationsTable() {
    const tbody = document.getElementById('adminReservationsTable');
    if (!tbody) return;
    
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    
    if (reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Aucune réservation</td></tr>';
        return;
    }
    
    tbody.innerHTML = reservations.slice().reverse().map(res => `
        <tr>
            <td>#${res.id}</td>
            <td>${res.userName}</td>
            <td>Place ${res.spotNumber}</td>
            <td>${formatDate(res.date)}</td>
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
                        <button class="btn btn-success btn-small btn-icon-only" onclick="completeReservation(${res.id})" title="Terminer">
                            ✓
                        </button>
                        <button class="btn btn-danger btn-small btn-icon-only" onclick="adminCancelReservation(${res.id})" title="Annuler">
                            ✕
                        </button>
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Termine une réservation
 */
function completeReservation(reservationId) {
    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (reservation) {
        reservation.status = 'completed';
        localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));
        
        // Libérer la place
        if (window.ParkingMap) {
            window.ParkingMap.setSpotStatus(reservation.spotId, 'free');
        }
        
        loadReservationsTable();
        loadAdminStats();
        Dashboard.showToast('Réservation terminée', 'success');
    }
}

/**
 * Annule une réservation (admin)
 */
function adminCancelReservation(reservationId) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette réservation ?')) return;
    
    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (reservation) {
        reservation.status = 'cancelled';
        localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));
        
        // Libérer la place
        if (window.ParkingMap) {
            window.ParkingMap.setSpotStatus(reservation.spotId, 'free');
        }
        
        loadReservationsTable();
        loadAdminStats();
        Dashboard.showToast('Réservation annulée', 'success');
    }
}

/**
 * Initialise le graphique d'occupation
 */
function initOccupancyChart() {
    const ctx = document.getElementById('adminOccupancyChart');
    if (!ctx) return;
    
    // Générer des données d'exemple
    const labels = [];
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('fr-FR', { weekday: 'short' }));
        data.push(Math.floor(Math.random() * 40) + 30); // 30-70% d'occupation
    }
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Taux d\'occupation (%)',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.5)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#f1f5f9' }
                }
            },
            scales: {
                x: {
                    grid: { color: '#334155' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: '#334155' },
                    ticks: { 
                        color: '#94a3b8',
                        callback: value => value + '%'
                    }
                }
            }
        }
    });
}

/**
 * Charge l'historique
 */
function loadHistoryLog() {
    const container = document.getElementById('adminLogContainer');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('smart_parking_history') || '[]');
    
    if (history.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Aucun historique</p>';
        return;
    }
    
    container.innerHTML = history.slice(0, 20).map(item => `
        <div class="log-item">
            <span class="log-time">${formatTime(item.timestamp)}</span>
            <span><strong>${item.action}:</strong> ${item.details}</span>
        </div>
    `).join('');
}

/**
 * Formate une date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit'
    });
}

/**
 * Formate une heure
 */
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Retourne le label du statut
 */
function getStatusLabel(status) {
    const labels = {
        'pending': 'En attente',
        'active': 'Active',
        'completed': 'Terminée',
        'cancelled': 'Annulée'
    };
    return labels[status] || status;
}

// Exporter les fonctions
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
