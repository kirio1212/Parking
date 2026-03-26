/**
 * ============================================
 * RESERVATION.JS - Système de réservation
 * Smart Parking - BTS CIEL IR
 * MODIFIÉ : Suppression du QR code, remplacement
 *           par une confirmation simple avec badge
 * ============================================
 */

// Tarifs
const PRICING = {
    30: 2,    // 30 min = 2€
    60: 3,    // 1h = 3€
    120: 5,   // 2h = 5€
    240: 8,   // 4h = 8€
    480: 15   // 8h (journée) = 15€
};

// Horaires disponibles
const TIME_SLOTS = [
    '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
    '22:00'
];

// État de la réservation en cours
let currentReservation = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('📅 Initialisation du système de réservation...');
    initReservationForm();
    initDatePicker();
    initTimeSlots();
    initPricePreview();
    initConfirmationModal(); // MODIFIÉ : était initPaymentModal()
});

/**
 * Initialise le formulaire de réservation
 */
function initReservationForm() {
    const form = document.getElementById('reservationForm');
    if (!form) return;
    form.addEventListener('submit', handleReservationSubmit);
}

/**
 * Initialise le sélecteur de date
 */
function initDatePicker() {
    const dateInput = document.getElementById('resDate');
    if (!dateInput) return;
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
}

/**
 * Initialise les créneaux horaires
 */
function initTimeSlots() {
    const select = document.getElementById('resStartTime');
    if (!select) return;

    TIME_SLOTS.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        select.appendChild(option);
    });

    // Sélectionner le prochain créneau disponible
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const nextSlot = TIME_SLOTS.find(t => {
        const [h, m] = t.split(':').map(Number);
        return h > currentHour || (h === currentHour && m > currentMinutes);
    });
    if (nextSlot) select.value = nextSlot;
}

/**
 * Initialise la prévisualisation du prix
 */
function initPricePreview() {
    const durationSelect = document.getElementById('resDuration');
    if (!durationSelect) return;
    durationSelect.addEventListener('change', updatePricePreview);
    updatePricePreview();
}

/**
 * Met à jour la prévisualisation du prix
 */
function updatePricePreview() {
    const duration = parseInt(document.getElementById('resDuration').value);
    const price = PRICING[duration] || 0;
    document.getElementById('previewPrice').textContent = price + '€';
}

/**
 * Gère la soumission du formulaire
 * MODIFIÉ : la réservation est enregistrée ici directement,
 *           puis le modal de confirmation s'affiche.
 */
function handleReservationSubmit(e) {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem('smart_parking_user') || 'null');
    if (!user) {
        Dashboard.showToast('Veuillez vous connecter', 'error');
        return;
    }

    const spotId    = parseInt(document.getElementById('resSpot').value);
    const date      = document.getElementById('resDate').value;
    const startTime = document.getElementById('resStartTime').value;
    const duration  = parseInt(document.getElementById('resDuration').value);
    const vehicle   = document.getElementById('resVehicle').value;

    if (!spotId || !date || !startTime || !vehicle) {
        Dashboard.showToast('Veuillez remplir tous les champs', 'error');
        return;
    }

    // Vérifier que la place est toujours libre
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    const spot  = spots.find(s => s.id === spotId);

    if (!spot || spot.status !== 'free') {
        Dashboard.showToast('Cette place n\'est plus disponible', 'error');
        if (window.ParkingMap) window.ParkingMap.refresh();
        return;
    }

    // Calculer l'heure de fin
    const endDate = new Date(date + 'T' + startTime);
    endDate.setMinutes(endDate.getMinutes() + duration);
    const endTime = endDate.toTimeString().slice(0, 5);

    // Construire l'objet réservation
    currentReservation = {
        id:          Date.now(),
        userId:      user.id,
        userName:    user.name,
        spotId:      spotId,
        spotNumber:  spot.number,
        date:        date,
        startTime:   startTime,
        endTime:     endTime,
        duration:    duration,
        vehicle:     vehicle.toUpperCase(),
        price:       PRICING[duration],
        status:      'active',
        createdAt:   new Date().toISOString()
    };

    // ---- Enregistrement immédiat (plus de bouton "J'ai payé") ----

    // Sauvegarder la réservation
    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    reservations.push(currentReservation);
    localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));

    // Mettre la place en "réservée" sur la carte
    if (window.ParkingMap) {
        window.ParkingMap.setSpotStatus(currentReservation.spotId, 'reserved');
    }

    // Ajouter à l'historique admin
    addToHistory(
        'Réservation',
        `Place ${currentReservation.spotNumber} réservée par ${currentReservation.userName} - ${currentReservation.price}€`
    );

    // Réinitialiser le formulaire
    document.getElementById('reservationForm').reset();
    initDatePicker();
    updatePricePreview();

    // Afficher le modal de confirmation
    showConfirmationModal();
}

// ============================================
// MODAL DE CONFIRMATION (remplace le QR code)
// ============================================

/**
 * Initialise les événements du modal de confirmation
 * REMPLACE : initPaymentModal()
 */
function initConfirmationModal() {
    document.getElementById('closeConfirmationModal')?.addEventListener('click', hideConfirmationModal);
    document.getElementById('closeConfirmationBtn')?.addEventListener('click', hideConfirmationModal);
}

/**
 * Affiche le modal de confirmation
 * REMPLACE : showPaymentModal() + generateQRCode()
 */
function showConfirmationModal() {
    if (!currentReservation) return;

    const modal = document.getElementById('confirmationModal');

    // Remplir le récapitulatif
    document.getElementById('paySpot').textContent     = 'Place ' + currentReservation.spotNumber;
    document.getElementById('payDate').textContent     = formatDate(currentReservation.date);
    document.getElementById('payTime').textContent     = currentReservation.startTime + ' - ' + currentReservation.endTime;
    document.getElementById('payDuration').textContent = formatDuration(currentReservation.duration);
    document.getElementById('payTotal').textContent    = currentReservation.price + '€';

    // Afficher le modal
    modal.classList.remove('hidden');
}

/**
 * Cache le modal de confirmation
 * REMPLACE : hidePaymentModal()
 */
function hideConfirmationModal() {
    document.getElementById('confirmationModal').classList.add('hidden');

    // Rediriger vers "Mes réservations" après fermeture
    if (window.Dashboard) {
        Dashboard.navigateToPage('my-reservations');
        document.querySelector('[data-page="my-reservations"]')?.classList.add('active');
        document.querySelector('[data-page="reservation"]')?.classList.remove('active');
    }

    // Rafraîchir les stats du profil
    if (window.Dashboard) Dashboard.refreshStats();
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Ajoute une entrée à l'historique
 */
function addToHistory(action, details) {
    let history = JSON.parse(localStorage.getItem('smart_parking_history') || '[]');
    history.unshift({
        id:        Date.now(),
        action:    action,
        details:   details,
        timestamp: new Date().toISOString()
    });
    if (history.length > 100) history = history.slice(0, 100);
    localStorage.setItem('smart_parking_history', JSON.stringify(history));
}

/**
 * Formate une date DD/MM/YYYY
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    });
}

/**
 * Formate une durée en minutes vers texte lisible
 */
function formatDuration(minutes) {
    if (minutes >= 480) return 'Journée (8h)';
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
    return `${minutes} min`;
}

// Exporter les fonctions publiques
window.Reservation = {
    PRICING,
    TIME_SLOTS,
    formatDuration,
    addToHistory
};