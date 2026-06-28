// ─────────────────────────────────────────────────────────────────────────────
// AuthPortal - script.js
// Security: SHA-256 password hashing via Web Crypto API
//           Login attempt lockout (5 attempts = 30min lockout)
//           Session timeout (30min inactivity)
// Purpose:  Private Notes — secured content only accessible after login
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 30 * 60 * 1000;       // 30 minutes lockout
let   sessionTimer  = null;

// ─── Crypto ──────────────────────────────────────────────────────────────────

async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────

function getUsers()        { return JSON.parse(localStorage.getItem("ap_users")    || "[]"); }
function saveUsers(u)      { localStorage.setItem("ap_users", JSON.stringify(u)); }
function getAttempts(e)    { return JSON.parse(localStorage.getItem("ap_att_" + e) || "{}"); }
function saveAttempts(e,d) { localStorage.setItem("ap_att_" + e, JSON.stringify(d)); }
function getNotes(uid)     { return JSON.parse(localStorage.getItem("ap_notes_" + uid) || "[]"); }
function saveNotes(uid, n) { localStorage.setItem("ap_notes_" + uid, JSON.stringify(n)); }
function getSession()      { return JSON.parse(sessionStorage.getItem("ap_session") || "null"); }
function saveSession(s)    { sessionStorage.setItem("ap_session", JSON.stringify(s)); }
function clearSession()    { sessionStorage.removeItem("ap_session"); }

function getInitials(name) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// ─── Lockout ──────────────────────────────────────────────────────────────────

function isLockedOut(email) {
    const att = getAttempts(email);
    if (!att.lockUntil) return false;
    if (Date.now() < att.lockUntil) return true;
    // Lockout expired — reset
    saveAttempts(email, {});
    return false;
}

function recordFailedAttempt(email) {
    const att = getAttempts(email);
    att.count = (att.count || 0) + 1;
    if (att.count >= MAX_ATTEMPTS) {
        att.lockUntil = Date.now() + LOCKOUT_MS;
        att.count = 0;
    }
    saveAttempts(email, att);
    return MAX_ATTEMPTS - (att.count || 0);
}

function clearAttempts(email) { localStorage.removeItem("ap_att_" + email); }

// ─── Session Timer ────────────────────────────────────────────────────────────

function resetSessionTimer() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        alert("Session expired due to inactivity. Please log in again.");
        handleLogout();
    }, SESSION_TIMEOUT_MS);
}

// ─── Tab Switching ────────────────────────────────────────────────────────────

window.switchTab = function(tab) {
    document.getElementById("si-error").textContent = "";
    document.getElementById("su-error").textContent  = "";
    document.getElementById("su-success").textContent = "";
    document.getElementById("strength-bar").className = "strength-bar";
    document.getElementById("strength-label").textContent = "";

    if (tab === "signin") {
        document.getElementById("tab-signin").classList.add("active");
        document.getElementById("tab-signup").classList.remove("active");
        document.getElementById("signin-panel").classList.add("active");
        document.getElementById("signup-panel").classList.remove("active");
    } else {
        document.getElementById("tab-signup").classList.add("active");
        document.getElementById("tab-signin").classList.remove("active");
        document.getElementById("signup-panel").classList.add("active");
        document.getElementById("signin-panel").classList.remove("active");
    }
};

// ─── Password Visibility ──────────────────────────────────────────────────────

window.togglePw = function(id, btn) {
    const input = document.getElementById(id);
    const icon  = btn.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
};

// ─── Password Strength ────────────────────────────────────────────────────────

document.getElementById("su-password").addEventListener("input", function() {
    const val  = this.value;
    const bar  = document.getElementById("strength-bar");
    const label = document.getElementById("strength-label");

    let score = 0;
    if (val.length >= 8)              score++;
    if (/[A-Z]/.test(val))            score++;
    if (/[0-9]/.test(val))            score++;
    if (/[^A-Za-z0-9]/.test(val))     score++;

    const levels = ["", "strength-weak", "strength-fair", "strength-good", "strength-strong"];
    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    bar.className   = "strength-bar " + (levels[score] || "");
    label.textContent = val.length ? labels[score] : "";
});

// ─── Sign Up ──────────────────────────────────────────────────────────────────

window.handleSignUp = async function(e) {
    e.preventDefault();
    const name     = document.getElementById("su-name").value.trim();
    const email    = document.getElementById("su-email").value.trim().toLowerCase();
    const password = document.getElementById("su-password").value;
    const errEl    = document.getElementById("su-error");
    const okEl     = document.getElementById("su-success");
    const btn      = document.getElementById("su-btn");

    errEl.textContent = ""; okEl.textContent = "";

    if (password.length < 6) {
        errEl.textContent = "Password must be at least 6 characters.";
        return;
    }

    const users = getUsers();
    if (users.find(u => u.email === email)) {
        errEl.textContent = "An account with this email already exists.";
        return;
    }

    btn.disabled = true;
    btn.querySelector("span").textContent = "Creating...";

    const hashed = await hashPassword(password);
    const uid    = "uid_" + Date.now();

    const newUser = { uid, name, email, password: hashed, provider: "Email", registeredAt: new Date().toISOString() };
    users.push(newUser);
    saveUsers(users);

    okEl.textContent = "Account created! Signing you in...";

    setTimeout(() => loginAndShowDashboard(newUser, "Email"), 900);
};

// ─── Sign In ──────────────────────────────────────────────────────────────────

window.handleSignIn = async function(e) {
    e.preventDefault();
    const email    = document.getElementById("si-email").value.trim().toLowerCase();
    const password = document.getElementById("si-password").value;
    const errEl    = document.getElementById("si-error");
    const btn      = document.getElementById("si-btn");

    errEl.textContent = "";

    if (isLockedOut(email)) {
        const att = getAttempts(email);
        const mins = Math.ceil((att.lockUntil - Date.now()) / 60000);
        errEl.textContent = `Account locked. Try again in ${mins} minute(s).`;
        return;
    }

    const users = getUsers();
    const user  = users.find(u => u.email === email);

    if (!user) {
        errEl.textContent = "No account found with this email.";
        return;
    }

    btn.disabled = true;
    btn.querySelector("span").textContent = "Verifying...";

    const hashed = await hashPassword(password);

    if (user.password !== hashed) {
        const remaining = recordFailedAttempt(email);
        errEl.textContent = remaining > 0
            ? `Incorrect password. ${remaining} attempt(s) remaining.`
            : "Too many failed attempts. Account locked for 30 minutes.";
        btn.disabled = false;
        btn.querySelector("span").textContent = "Sign In";
        return;
    }

    clearAttempts(email);
    loginAndShowDashboard(user, "Email");
};

// ─── OAuth (Demo — replace with Firebase signInWithPopup for production) ──────

window.handleOAuth = function(provider) {
    const demoUser = {
        uid: "uid_" + provider.toLowerCase() + "_demo",
        name: provider + " User",
        email: "demo@" + provider.toLowerCase() + ".com",
        password: null,
        provider,
        registeredAt: new Date().toISOString()
    };
    const users = getUsers();
    if (!users.find(u => u.email === demoUser.email)) {
        users.push(demoUser);
        saveUsers(users);
    }
    loginAndShowDashboard(users.find(u => u.email === demoUser.email) || demoUser, provider);
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

function loginAndShowDashboard(user, provider) {
    const session = { ...user, loginTime: new Date().toISOString(), provider };
    saveSession(session);
    showDashboard(session);
}

function showDashboard(session) {
    document.getElementById("auth-screen").classList.remove("active");
    const dash = document.getElementById("dashboard-screen");
    dash.classList.add("active");

    // Nav
    document.getElementById("nav-avatar-initials").textContent = getInitials(session.name);
    document.getElementById("nav-name").textContent = session.name;

    // Hero
    document.getElementById("welcome-text").textContent = `Welcome, ${session.name.split(" ")[0]}!`;
    document.getElementById("welcome-sub").textContent  = `Signed in as ${session.email}`;

    // Stats
    const users = getUsers();
    document.getElementById("stat-users").textContent  = users.length;
    document.getElementById("stat-method").textContent = session.provider;
    document.getElementById("stat-time").textContent   = formatDate(session.loginTime);

    // Notes
    renderNotes(session.uid);

    // User table
    renderTable(users);

    // Start session timer + activity reset
    resetSessionTimer();
    document.addEventListener("mousemove", resetSessionTimer, { passive: true });
    document.addEventListener("keydown", resetSessionTimer, { passive: true });
}

// ─── Private Notes ────────────────────────────────────────────────────────────

function renderNotes(uid) {
    const notes = getNotes(uid);
    const list  = document.getElementById("notes-list");
    const count = document.getElementById("notes-count");

    count.textContent = notes.length + " note" + (notes.length !== 1 ? "s" : "");

    if (notes.length === 0) {
        list.innerHTML = `<div class="notes-empty"><i class="fa-regular fa-note-sticky"></i><p>No notes yet. Add your first private note above.</p></div>`;
        return;
    }

    list.innerHTML = notes.slice().reverse().map((n, ri) => {
        const i = notes.length - 1 - ri;
        return `
            <div class="note-card" id="note-${i}">
                <div class="note-body">${n.text.replace(/</g, "&lt;")}</div>
                <div class="note-footer">
                    <span>${formatDate(n.createdAt)}</span>
                    <button class="note-delete" onclick="deleteNote('${uid}', ${i})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
    }).join("");
}

window.addNote = function() {
    const session = getSession();
    if (!session) return;
    const input = document.getElementById("note-input");
    const text  = input.value.trim();
    if (!text) return;

    const notes = getNotes(session.uid);
    notes.push({ text, createdAt: new Date().toISOString() });
    saveNotes(session.uid, notes);
    input.value = "";
    renderNotes(session.uid);
};

window.deleteNote = function(uid, index) {
    const notes = getNotes(uid);
    notes.splice(index, 1);
    saveNotes(uid, notes);
    renderNotes(uid);
};

// Allow Ctrl+Enter to submit note
document.getElementById("note-input").addEventListener("keydown", function(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
});

// ─── User Table ───────────────────────────────────────────────────────────────

function renderTable(users) {
    const tbody   = document.getElementById("user-table-body");
    const countEl = document.getElementById("db-count");

    countEl.textContent = `${users.length} user${users.length !== 1 ? "s" : ""}`;

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No users yet.</td></tr>`;
        return;
    }

    const chip = (p) => {
        const map = { Email: ["chip-email","fa-envelope"], Google: ["chip-google","fa-brands fa-google"], GitHub: ["chip-github","fa-brands fa-github"], Facebook: ["chip-facebook","fa-brands fa-facebook-f"] };
        const [cls, ico] = map[p] || ["chip-email","fa-key"];
        return `<span class="provider-chip ${cls}"><i class="${ico}"></i> ${p}</span>`;
    };

    tbody.innerHTML = users.map((u, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${chip(u.provider)}</td>
            <td>${formatDate(u.registeredAt)}</td>
        </tr>`).join("");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

window.handleLogout = function() {
    clearSession();
    clearTimeout(sessionTimer);
    document.removeEventListener("mousemove", resetSessionTimer);
    document.removeEventListener("keydown", resetSessionTimer);
    document.getElementById("dashboard-screen").classList.remove("active");
    document.getElementById("auth-screen").classList.add("active");
    switchTab("signin");
    document.getElementById("si-email").value    = "";
    document.getElementById("si-password").value = "";
    document.getElementById("si-btn").disabled   = false;
    document.getElementById("si-btn").querySelector("span").textContent = "Sign In";
};

// ─── Auto-restore session ─────────────────────────────────────────────────────

(function init() {
    const session = getSession();
    if (session) showDashboard(session);
})();
