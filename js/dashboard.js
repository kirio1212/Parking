/**
 * ============================================
 * DASHBOARD.JS - Gestion du dashboard
 * Smart Parking - BTS CIEL IR
 * ============================================
 */

// Configuration
const API_URL = 'http://localhost:3000/api';

// État global
let dashboardState = {
    user: null,
    currentPage: 'map'
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚗 Initialisation du dashboard...');
    
    // Vérifier l'authentification
    checkAuthentication();
    
    // Initialiser la navigation
    initNavigation();
    
    // Initialiser la déconnexion
    initLogout();
    
    // Charger les données utilisateur
    loadUserData();
});

/**
 * Vérifie que l'utilisateur est authentifié
 */
function checkAuthentication() {
    const token = localStorage.getItem('smart_parking_token');
    const user = localStorage.getItem('smart_parking_user');
    
    if (!token || !user) {
        // Rediriger vers la page de connexion
        window.location.href = '../index.html';
        return;
    }
    
    dashboardState.user = JSON.parse(user);
}

/**
 * Initialise la navigation
 */
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            navigateToPage(page);
            
            // Mettre à jour la classe active
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
    
    // Afficher le lien admin si l'utilisateur est admin
    if (dashboardState.user && dashboardState.user.role === 'admin') {
        const adminLink = document.querySelector('.admin-only');
        if (adminLink) {
            adminLink.classList.remove('hidden');
            adminLink.classList.add('visible');
        }
    }
}

/**
 * Navigation entre les pages
 */
function navigateToPage(page) {
    // Cacher toutes les pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
    });
    
    // Afficher la page demandée
    const targetPage = document.getElementById(page);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
        dashboardState.currentPage = page;
        
        // Rafraîchir les données selon la page
        if (page === 'map' && window.ParkingMap) {
            window.ParkingMap.refresh();
        } else if (page === 'my-reservations') {
            loadMyReservations();
        } else if (page === 'admin' && window.AdminModule) {
            window.AdminModule.refresh();
        }
    }
}

/**
 * Initialise la déconnexion
 */
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

/**
 * Charge les données utilisateur
 */
function loadUserData() {
    const user = dashboardState.user;
    if (!user) return;
    
    // Mettre à jour l'affichage
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrateur' : 'Client';
    
    // Page profil
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileNameInput').value = user.name;
    document.getElementById('profileEmailInput').value = user.email;
    document.getElementById('profilePhoneInput').value = user.phone || '';
    
    // Badge rôle
    const roleBadge = document.getElementById('profileRole');
    if (roleBadge) {
        roleBadge.textContent = user.role === 'admin' ? 'Administrateur' : 'Client';
        roleBadge.className = 'role-badge ' + (user.role === 'admin' ? 'badge-admin' : 'badge-client');
    }
    
    // Charger les statistiques
    loadUserStats();
}

/**
 * Charge les statistiques utilisateur
 */
function loadUserStats() {
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const userReservations = reservations.filter(r => r.userId === dashboardState.user.id);
    
    const totalReservations = userReservations.length;
    const activeReservations = userReservations.filter(r => r.status === 'active').length;
    const totalSpent = userReservations.reduce((sum, r) => sum + (r.price || 0), 0);
    
    document.getElementById('totalReservations').textContent = totalReservations;
    document.getElementById('activeReservations').textContent = activeReservations;
    document.getElementById('totalSpent').textContent = totalSpent + '€';
}

/**
 * Charge les réservations de l'utilisateur
 */
function loadMyReservations() {
    const container = document.getElementById('myReservationsList');
    const emptyState = document.getElementById('noReservations');
    
    if (!container || !emptyState) return;
    
    const reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const userReservations = reservations.filter(r => r.userId === dashboardState.user.id);
    
    if (userReservations.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    container.innerHTML = userReservations.map(res => `
        <div class="reservation-card">
            <div class="reservation-info">
                <h4>Place ${res.spotNumber}</h4>
                <div class="reservation-details">
                    <span>📅 ${res.date}</span>
                    <span>🕐 ${res.startTime}</span>
                    <span>⏱️ ${res.duration} min</span>
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
 * Annule une réservation
 */
function cancelReservation(reservationId) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette réservation ?')) return;
    
    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (reservation) {
        // Mettre à jour le statut
        reservation.status = 'cancelled';
        localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));
        
        // Libérer la place
        if (window.ParkingMap) {
            window.ParkingMap.setSpotStatus(reservation.spotNumber, 'free');
        }
        
        showToast('Réservation annulée', 'success');
        loadMyReservations();
        loadUserStats();
    }
}

/**
 * Met à jour le profil
 */
document.getElementById('profileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const phone = document.getElementById('profilePhoneInput').value;
    const newPassword = document.getElementById('profileNewPassword').value;
    
    // Mettre à jour l'utilisateur
    let user = dashboardState.user;
    user.phone = phone;
    
    if (newPassword) {
        user.password = newPassword;
    }
    
    // Sauvegarder
    localStorage.setItem('smart_parking_user', JSON.stringify(user));
    
    // Mettre à jour aussi dans la liste des utilisateurs
    let users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
        users[userIndex] = user;
        localStorage.setItem('smart_parking_users', JSON.stringify(users));
    }
    
    showToast('Profil mis à jour', 'success');
});

/**
 * Retourne le label du statut
 */
function getStatusLabel(status) {
    const labels = {
        'active': 'Active',
        'completed': 'Terminée',
        'cancelled': 'Annulée'
    };
    return labels[status] || status;
}

/**
 * Affiche une notification toast
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Exporter les fonctions
window.Dashboard = {
    navigateToPage,
    showToast,
    getUser: () => dashboardState.user,
    refreshStats: loadUserStats
};
