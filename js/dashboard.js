/**
 * ============================================
 * DASHBOARD.JS - Gestion du dashboard
 * Smart Parking - BTS CIEL IR
 * CORRIGÉ : cancelReservation utilisait spotNumber
 *           au lieu de spotId pour libérer la place
 * ============================================
 */

const API_URL = 'http://localhost:3000/api';

let dashboardState = {
    user:        null,
    currentPage: 'map'
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚗 Initialisation du dashboard...');
    checkAuthentication();
    initNavigation();
    initLogout();
    loadUserData();
});

function checkAuthentication() {
    const token = localStorage.getItem('smart_parking_token');
    const user  = localStorage.getItem('smart_parking_user');
    if (!token || !user) {
        window.location.href = '../index.html';
        return;
    }
    dashboardState.user = JSON.parse(user);
}

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            navigateToPage(page);
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    if (dashboardState.user && dashboardState.user.role === 'admin') {
        const adminLink = document.querySelector('.admin-only');
        if (adminLink) {
            adminLink.classList.remove('hidden');
            adminLink.classList.add('visible');
        }
    }
}

function navigateToPage(page) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
    });

    const targetPage = document.getElementById(page);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
        dashboardState.currentPage = page;

        if (page === 'map' && window.ParkingMap) {
            window.ParkingMap.refresh();
        } else if (page === 'my-reservations') {
            loadMyReservations();
        } else if (page === 'admin' && window.AdminModule) {
            window.AdminModule.refresh();
        }
    }
}

function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('smart_parking_token');
            localStorage.removeItem('smart_parking_user');
            window.location.href = '../index.html';
        });
    }
}

function loadUserData() {
    const user = dashboardState.user;
    if (!user) return;

    document.getElementById('userName').textContent = user.name;
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrateur' : 'Client';

    document.getElementById('profileName').textContent         = user.name;
    document.getElementById('profileNameInput').value          = user.name;
    document.getElementById('profileEmailInput').value         = user.email;
    document.getElementById('profilePhoneInput').value         = user.phone || '';

    const roleBadge = document.getElementById('profileRole');
    if (roleBadge) {
        roleBadge.textContent = user.role === 'admin' ? 'Administrateur' : 'Client';
        roleBadge.className   = 'role-badge ' + (user.role === 'admin' ? 'badge-admin' : 'badge-client');
    }

    loadUserStats();
}

function loadUserStats() {
    const reservations     = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const userReservations = reservations.filter(r => r.userId === dashboardState.user.id);

    document.getElementById('totalReservations').textContent  = userReservations.length;
    document.getElementById('activeReservations').textContent = userReservations.filter(r => r.status === 'active').length;
    document.getElementById('totalSpent').textContent         = userReservations.reduce((s, r) => s + (r.price || 0), 0) + '€';
}

function loadMyReservations() {
    const container  = document.getElementById('myReservationsList');
    const emptyState = document.getElementById('noReservations');
    if (!container || !emptyState) return;

    const reservations     = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const userReservations = reservations.filter(r => r.userId === dashboardState.user.id);

    if (userReservations.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = userReservations.slice().reverse().map(res => `
        <div class="reservation-card">
            <div class="reservation-info">
                <h4>Place ${res.spotNumber}</h4>
                <div class="reservation-details">
                    <span>📅 ${res.date}</span>
                    <span>🕐 ${res.startTime}</span>
                    <span>⏱️ ${formatDurationLabel(res.duration)}</span>
                    <span>🚗 ${res.vehicle || 'N/A'}</span>
                </div>
            </div>
            <div class="reservation-actions">
                <span class="reservation-price">${res.price}€</span>
                <span class="reservation-status status-${res.status}">${getStatusLabel(res.status)}</span>
                ${res.status === 'active' ? `
                    <button class="btn btn-danger btn-small" onclick="cancelReservation(${res.id})">
                        Annuler
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * CORRIGÉ : utilisait reservation.spotNumber (le numéro visible)
 * au lieu de reservation.spotId (l'id interne), ce qui empêchait
 * la place d'être libérée sur la carte.
 */
function cancelReservation(reservationId) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette réservation ?')) return;

    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const reservation = reservations.find(r => r.id === reservationId);

    if (reservation) {
        reservation.status = 'cancelled';
        localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));

        // CORRIGÉ : spotId au lieu de spotNumber
        if (window.ParkingMap) {
            window.ParkingMap.setSpotStatus(reservation.spotId, 'free');
        }

        showToast('Réservation annulée', 'success');
        loadMyReservations();
        loadUserStats();
    }
}

// Mise à jour du profil
document.getElementById('profileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone       = document.getElementById('profilePhoneInput').value;
    const newPassword = document.getElementById('profileNewPassword').value;

    let user = dashboardState.user;
    user.phone = phone;
    if (newPassword) user.password = newPassword;

    localStorage.setItem('smart_parking_user', JSON.stringify(user));

    let users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
        users[idx] = user;
        localStorage.setItem('smart_parking_users', JSON.stringify(users));
    }

    showToast('Profil mis à jour', 'success');
});

function getStatusLabel(status) {
    return { active: 'Active', completed: 'Terminée', cancelled: 'Annulée' }[status] || status;
}

function formatDurationLabel(minutes) {
    if (minutes >= 480) return 'Journée';
    if (minutes >= 60)  return Math.floor(minutes / 60) + 'h' + (minutes % 60 ? (minutes % 60) + 'min' : '');
    return minutes + ' min';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast     = document.createElement('div');
    toast.className  = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.Dashboard = {
    navigateToPage,
    showToast,
    getUser:      () => dashboardState.user,
    refreshStats: loadUserStats
};