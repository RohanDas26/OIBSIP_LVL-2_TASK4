// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    GithubAuthProvider,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// TODO: Replace this object with your actual Firebase config from console.firebase.google.com
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// --- INITIALIZE FIREBASE ---
// Note: If the firebaseConfig is not updated with real keys, the Auth calls will fail.
let app, auth;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

// Providers
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// DOM Elements
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const emailForm = document.getElementById('email-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const toggleModeBtn = document.getElementById('toggle-mode');
const toggleText = document.getElementById('toggle-text');
const submitBtn = document.getElementById('submit-btn');
const authHeaderTitle = document.querySelector('.auth-header h2');
const authHeaderDesc = document.querySelector('.auth-header p');

// Dashboard Elements
const welcomeMessage = document.getElementById('welcome-message');
const userEmailText = document.getElementById('user-email');
const userPhoto = document.getElementById('user-photo');
const logoutBtn = document.getElementById('logout-btn');

// State
let isLoginMode = true;

// Toggle Login / Register UI
toggleModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    errorMessage.textContent = '';
    
    if(isLoginMode) {
        authHeaderTitle.textContent = "Welcome Back";
        authHeaderDesc.textContent = "Log in to your account to continue";
        submitBtn.textContent = "Sign In";
        toggleText.textContent = "Don't have an account?";
        toggleModeBtn.textContent = "Sign up";
    } else {
        authHeaderTitle.textContent = "Create an Account";
        authHeaderDesc.textContent = "Enter your details to get started";
        submitBtn.textContent = "Sign Up";
        toggleText.textContent = "Already have an account?";
        toggleModeBtn.textContent = "Log in";
    }
});

// Handle Email/Password Form Submit
emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (!auth) {
        errorMessage.textContent = "Firebase API keys are missing in script.js";
        return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;
    errorMessage.textContent = '';
    submitBtn.textContent = "Loading...";
    submitBtn.disabled = true;

    if (isLoginMode) {
        // Sign In
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                errorMessage.textContent = error.message.replace("Firebase: ", "");
                submitBtn.textContent = "Sign In";
                submitBtn.disabled = false;
            });
    } else {
        // Register
        createUserWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                errorMessage.textContent = error.message.replace("Firebase: ", "");
                submitBtn.textContent = "Sign Up";
                submitBtn.disabled = false;
            });
    }
});

// Handle Google OAuth
document.getElementById('google-login').addEventListener('click', () => {
    if (!auth) {
        errorMessage.textContent = "Firebase API keys are missing in script.js";
        return;
    }
    errorMessage.textContent = '';
    signInWithPopup(auth, googleProvider).catch((error) => {
        errorMessage.textContent = error.message.replace("Firebase: ", "");
    });
});

// Handle GitHub OAuth
document.getElementById('github-login').addEventListener('click', () => {
    if (!auth) {
        errorMessage.textContent = "Firebase API keys are missing in script.js";
        return;
    }
    errorMessage.textContent = '';
    signInWithPopup(auth, githubProvider).catch((error) => {
        errorMessage.textContent = error.message.replace("Firebase: ", "");
    });
});

// Handle Logout
logoutBtn.addEventListener('click', () => {
    if(auth) signOut(auth);
});

// Listen for Auth State Changes
if (auth) {
    onAuthStateChanged(auth, (user) => {
        // Reset buttons
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? "Sign In" : "Sign Up";

        if (user) {
            // User is signed in, show dashboard
            authContainer.classList.add('hidden');
            dashboardContainer.classList.remove('hidden');
            document.body.style.display = 'block'; // Adjust layout for dashboard
            
            const name = user.displayName || user.email.split('@')[0];
            welcomeMessage.textContent = `Welcome, ${name}`;
            userEmailText.textContent = user.email;

            if (user.photoURL) {
                userPhoto.src = user.photoURL;
                userPhoto.classList.remove('hidden');
            } else {
                userPhoto.classList.add('hidden');
            }
        } else {
            // User is signed out, show auth form
            authContainer.classList.remove('hidden');
            dashboardContainer.classList.add('hidden');
            document.body.style.display = 'flex'; // Re-center auth form
            emailInput.value = '';
            passwordInput.value = '';
            errorMessage.textContent = '';
        }
    });
}
