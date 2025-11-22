import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, addDoc, collection, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the Canvas environment (assuming they are accessible globally after HTML load)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db;
let auth;
let userId = '';

setLogLevel('Debug'); // Enable Firestore logging

// Function to initialize Firebase and authenticate
async function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('userIdDisplay').textContent = userId;
            } else {
                // Generate a random ID for anonymous users if auth fails
                userId = crypto.randomUUID();
                document.getElementById('userIdDisplay').textContent = 'ANON-' + userId.substring(0, 8) + '...';
            }
            // Once authenticated, attach the submit listener
            document.getElementById('admissionForm').addEventListener('submit', handleFormSubmit);
        });

    } catch (error) {
        console.error("Firebase Initialization or Auth Error:", error);
        showModal('Error', 'Failed to connect to the database. Check console for details.', 'error');
    }
}

// Custom Modal Functions (Replaces alert())
window.showModal = (title, message, type) => {
    const modal = document.getElementById('statusModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = document.getElementById('modalIcon');

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalIcon.innerHTML = ''; 

    let iconClass = '';
    let iconColor = '';
    if (type === 'success') {
        iconClass = 'fas fa-check-circle';
        iconColor = '#4CAF50';
    } else if (type === 'error') {
        iconClass = 'fas fa-times-circle';
        iconColor = '#dc3545';
    } else {
        iconClass = 'fas fa-info-circle';
        iconColor = '#007bff';
    }

    modalIcon.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; font-size: 40px;"></i>`;
    modal.style.display = 'block';
};

window.closeModal = () => {
    document.getElementById('statusModal').style.display = 'none';
};

// Form Submission Logic
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!userId) {
        showModal('Pending Auth', 'Authentication not complete. Please wait a moment and try again.', 'info');
        return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const admissionData = {};

    for (const [key, value] of formData.entries()) {
        admissionData[key] = value.trim();
    }

    // Add metadata
    admissionData.admittingUserId = userId;
    admissionData.timestamp = new Date().toISOString();
    admissionData.status = 'Admitted';

    try {
        // Using the recommended public data path for shared application data
        const collectionPath = `/artifacts/${appId}/public/data/admissions`;
        
        // Save to Firestore
        const docRef = await addDoc(collection(db, collectionPath), admissionData);

        showModal(
            'Success!', 
            `Patient ${admissionData.patientName} admitted successfully. Record ID: ${docRef.id}.`, 
            'success'
        );

        form.reset(); // Clear the form on success

    } catch (e) {
        console.error("Error adding document: ", e);
        showModal('Submission Error', 'Failed to submit admission. Please check your connection.', 'error');
    }
}

// Ensure the form submission function and modal functions are globally accessible
window.handleFormSubmit = handleFormSubmit;

// Start the application
initializeFirebase();