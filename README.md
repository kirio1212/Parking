# 🅿️ Smart Parking

> Système complet de gestion de parking intelligent avec authentification, réservation et paiement QR code

## 📋 Fonctionnalités

### 🔐 Authentification
- Inscription avec nom, email, téléphone et mot de passe
- Connexion sécurisée
- Gestion de profil
- Deux rôles : Client et Administrateur

### 🗺️ Carte du Parking
- **10 places** visuelles (modifiable par l'admin)
- 3 états : Libre ✅, Occupée 🚗, Réservée 📅
- Mise à jour en temps réel
- Détails de chaque place au clic

### 📅 Système de Réservation
- Sélection de la place
- Choix de la date et heure
- Durée : 30min, 1h, 2h, 4h, Journée
- Saisie de la plaque d'immatriculation

### 💳 Paiement QR Code
- Génération de QR code unique
- Code de paiement affiché
- Confirmation du paiement

### 👤 Espace Client
- Consulter la carte des places
- Voir les tarifs
- Faire une réservation
- Voir l'historique des réservations
- Gérer son profil

### ⚙️ Panel Admin
- Voir toutes les statistiques
- Modifier le nombre de places
- Gérer l'état de chaque place
- Voir tous les utilisateurs
- Voir toutes les réservations
- Annuler/terminer des réservations
- Voir l'historique complet

## 💰 Tarifs

| Durée | Prix |
|-------|------|
| 30 minutes | 2€ |
| 1 heure | 3€ |
| 2 heures | 5€ |
| 4 heures | 8€ |
| Journée (8h) | 15€ |

## 🚀 Installation

### Prérequis
- Node.js 18+
- npm

### Étape 1 : Installer les dépendances

```bash
cd server
npm install
```

### Étape 2 : Démarrer le serveur

```bash
npm start
```

Pour le développement (avec redémarrage automatique) :
```bash
npm run dev
```

### Étape 3 : Accéder au site

Ouvrir un navigateur et aller sur :
```
http://localhost:3000
```

## 🔑 Compte par défaut

**Administrateur :**
- Email : `admin@smartparking.fr`
- Mot de passe : `admin123`

## 📁 Structure du projet

```
smart-parking/
├── index.html              # Page de connexion/inscription
├── css/
│   ├── style.css           # Styles globaux
│   ├── auth.css            # Styles authentification
│   └── dashboard.css       # Styles dashboard
├── js/
│   ├── auth.js             # Gestion authentification
│   ├── dashboard.js        # Gestion dashboard
│   ├── map.js              # Carte des places
│   ├── reservation.js      # Système de réservation
│   └── admin.js            # Panel admin
├── pages/
│   └── dashboard.html      # Dashboard principal
├── server/
│   ├── package.json        # Dépendances Node.js
│   ├── server.js           # Serveur principal
│   ├── db/
│   │   └── database.js     # Gestion SQLite
│   ├── middleware/
│   │   └── auth.js         # Middleware JWT
│   └── routes/
│       └── api.js          # Routes API
└── README.md               # Ce fichier
```

## 🔌 API REST

### Authentification
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/register` | Inscription |
| POST | `/api/login` | Connexion |

### Utilisateurs
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/users` | Liste des utilisateurs (admin) |
| DELETE | `/api/users/:id` | Supprimer un utilisateur (admin) |

### Places
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/spots` | Liste des places |
| PUT | `/api/spots/:id/status` | Modifier le statut |
| POST | `/api/spots/init` | Réinitialiser les places (admin) |

### Réservations
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/reservations` | Mes réservations |
| GET | `/api/reservations/all` | Toutes les réservations (admin) |
| POST | `/api/reservations` | Créer une réservation |
| PUT | `/api/reservations/:id/cancel` | Annuler une réservation |

### Statistiques
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/stats` | Statistiques du parking |
| GET | `/api/history` | Historique (admin) |

## 🛠️ Technologies utilisées

### Frontend
- HTML5
- CSS3 (responsive)
- JavaScript vanilla
- Chart.js (graphiques)
- QRCode.js (génération QR)

### Backend
- Node.js
- Express.js
- SQLite3
- JWT (authentification)
- bcryptjs (hashage mots de passe)

## 📱 Fonctionnement

### Pour les clients :
1. Créer un compte ou se connecter
2. Consulter la carte des places disponibles
3. Choisir une place libre
4. Sélectionner date, heure et durée
5. Scanner le QR code pour payer
6. La place est réservée !

### Pour l'administrateur :
1. Se connecter avec le compte admin
2. Accéder au panel Admin
3. Voir toutes les statistiques
4. Gérer les places (cliquer pour changer l'état)
5. Modifier le nombre total de places
6. Gérer les utilisateurs et réservations

## 🔒 Sécurité

- Mots de passe hashés avec bcrypt
- Authentification JWT
- Protection des routes sensibles
- Validation des données

## 📝 Notes

- Les données sont stockées dans SQLite (`server/db/smart-parking.db`)
- Le système fonctionne aussi en mode offline (stockage local)
- La simulation automatique change l'état des places toutes les 5 secondes

---

<p align="center">
  🅿️ <strong>Smart Parking - BTS CIEL IR 2025</strong> 🅿️
</p>
