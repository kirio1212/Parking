/**
 * ============================================
 * AUTH.JS - Système d'authentification
 * Smart Parking - BTS CIEL IR
 * ============================================
 */

// Configuration
const AUTH_CONFIG = {
    apiUrl: 'http://localhost:3000/api',
    tokenKey: 'smart_parking_token',
    userKey: 'smart_parking_user'
};

// État de l'authentification
let authState = {
    isLoggedIn: false,
    user: null,
    token: null
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔐 Initialisation du système d\'authentification...');
    
    // Vérifier si déjà connecté
    checkAuthStatus();
    
    // Initialiser les écouteurs d'événements
    initEventListeners();
});

/**
 * Vérifie le statut d'authentification
 */
function checkAuthStatus() {
    const token = localStorage.getItem(AUTH_CONFIG.tokenKey);
    const user = localStorage.getItem(AUTH_CONFIG.userKey);
    
    if (token && user) {
        authState.token = token;
        authState.user = JSON.parse(user);
        authState.isLoggedIn = true;
        
        // Rediriger vers le dashboard
        window.location.href = 'pages/dashboard.html';
    }
}

/**
 * Initialise les écouteurs d'événements
 */
function initEventListeners() {
    // Basculer vers l'inscription
    const showRegister = document.getElementById('showRegister');
    if (showRegister) {
        showRegister.addEventListener('click', (e) => {
            e.preventDefault();
            showRegisterForm();
        });
    }
    
    // Basculer vers la connexion
    const showLogin = document.getElementById('showLogin');
    if (showLogin) {
        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginForm();
        });
    }
    
    // Formulaire de connexion
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Formulaire d'inscription
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

/**
 * Affiche le formulaire d'inscription
 */
function showRegisterForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    hideMessage();
}

/**
 * Affiche le formulaire de connexion
 */
function showLoginForm() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    hideMessage();
}

/**
 * Gère la connexion
 */
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showMessage('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    try {
        // Appel API de connexion
        const response = await fetch(`${AUTH_CONFIG.apiUrl}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Stocker les informations
            localStorage.setItem(AUTH_CONFIG.tokenKey, data.token);
            localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(data.user));
            
            showMessage('Connexion réussie ! Redirection...', 'success');
            
            // Rediriger vers le dashboard
            setTimeout(() => {
                window.location.href = 'pages/dashboard.html';
            }, 1000);
        } else {
            showMessage(data.message || 'Email ou mot de passe incorrect', 'error');
        }
    } catch (error) {
        console.error('Erreur connexion:', error);
        // Mode offline - simulation
        handleOfflineLogin(email, password);
    }
}

/**
 * Gère la connexion en mode offline (simulation)
 */
function handleOfflineLogin(email, password) {
    // Vérifier dans les utilisateurs stockés localement
    const users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        const token = generateToken();
        localStorage.setItem(AUTH_CONFIG.tokenKey, token);
        localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(user));
        
        showMessage('Connexion réussie ! Redirection...', 'success');
        setTimeout(() => {
            window.location.href = 'pages/dashboard.html';
        }, 1000);
    } else {
        // Compte admin par défaut
        if (email === 'admin@smartparking.fr' && password === 'admin123') {
            const adminUser = {
                id: 1,
                name: 'Administrateur',
                email: 'admin@smartparking.fr',
                phone: '01 23 45 67 89',
                role: 'admin'
            };
            const token = generateToken();
            localStorage.setItem(AUTH_CONFIG.tokenKey, token);
            localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(adminUser));
            
            showMessage('Connexion admin réussie ! Redirection...', 'success');
            setTimeout(() => {
                window.location.href = 'pages/dashboard.html';
            }, 1000);
            return;
        }
        
        showMessage('Email ou mot de passe incorrect', 'error');
    }
}

/**
 * Gère l'inscription
 */
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const phone = document.getElementById('registerPhone').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    
    // Validation
    if (!name || !email || !phone || !password) {
        showMessage('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    if (password !== passwordConfirm) {
        showMessage('Les mots de passe ne correspondent pas', 'error');
        return;
    }
    
    if (password.length < 8) {
        showMessage('Le mot de passe doit faire au moins 8 caractères', 'error');
        return;
    }
    
    try {
        // Appel API d'inscription
        const response = await fetch(`${AUTH_CONFIG.apiUrl}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, phone, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Compte créé avec succès ! Vous pouvez vous connecter.', 'success');
            setTimeout(() => {
                showLoginForm();
                // Pré-remplir l'email
                document.getElementById('loginEmail').value = email;
            }, 1500);
        } else {
            showMessage(data.message || 'Erreur lors de la création du compte', 'error');
        }
    } catch (error) {
        console.error('Erreur inscription:', error);
        // Mode offline - stockage local
        handleOfflineRegister(name, email, phone, password);
    }
}

/**
 * Gère l'inscription en mode offline (simulation)
 */
function handleOfflineRegister(name, email, phone, password) {
    // Récupérer les utilisateurs existants
    let users = JSON.parse(localStorage.getItem('smart_parking_users') || '[]');
    
    // Vérifier si l'email existe déjà
    if (users.find(u => u.email === email)) {
        showMessage('Cet email est déjà utilisé', 'error');
        return;
    }
    
    // Créer le nouvel utilisateur
    const newUser = {
        id: Date.now(),
        name,
        email,
        phone,
        password, // En production: hasher le mot de passe !
        role: 'client',
        createdAt: new Date().toISOString()
    };
    
    // Ajouter à la liste
    users.push(newUser);
    localStorage.setItem('smart_parking_users', JSON.stringify(users));
    
    showMessage('Compte créé avec succès ! Vous pouvez vous connecter.', 'success');
    setTimeout(() => {
        showLoginForm();
        document.getElementById('loginEmail').value = email;
    }, 1500);
}

/**
 * Génère un token simple
 */
function generateToken() {
    return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Affiche un message
 */
function showMessage(message, type) {
    const messageEl = document.getElementById('authMessage');
    messageEl.textContent = message;
    messageEl.className = `auth-message ${type}`;
    messageEl.classList.remove('hidden');
}

/**
 * Cache le message
 */
function hideMessage() {
    const messageEl = document.getElementById('authMessage');
    messageEl.classList.add('hidden');
}

/**
 * Déconnexion
 */
function logout() {
    localStorage.removeItem(AUTH_CONFIG.tokenKey);
    localStorage.removeItem(AUTH_CONFIG.userKey);
    window.location.href = '../index.html';
}

// Exporter les fonctions
window.Auth = {
    logout,
    getToken: () => localStorage.getItem(AUTH_CONFIG.tokenKey),
    getUser: () => JSON.parse(localStorage.getItem(AUTH_CONFIG.userKey) || 'null'),
    isAdmin: () => {
        const user = JSON.parse(localStorage.getItem(AUTH_CONFIG.userKey) || 'null');
        return user && user.role === 'admin';
    }
};
