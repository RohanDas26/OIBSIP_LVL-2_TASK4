// ─── Helpers ───────────────────────────────────────────────────────────────

function getUsers() {
    return JSON.parse(localStorage.getItem("ap_users") || "[]");
}

function saveUsers(users) {
    localStorage.setItem("ap_users", JSON.stringify(users));
}

function getSession() {
    return JSON.parse(sessionStorage.getItem("ap_session") || "null");
}

function saveSession(user) {
    sessionStorage.setItem("ap_session", JSON.stringify(user));
}

function clearSession() {
    sessionStorage.removeItem("ap_session");
}

function getInitials(name) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
}

// ─── UI Tab Switching ───────────────────────────────────────────────────────

window.switchTab = function(tab) {
    const siBtn = document.getElementById("tab-signin");
    const suBtn = document.getElementById("tab-signup");
    const siPanel = document.getElementById("signin-panel");
    const suPanel = document.getElementById("signup-panel");

    document.getElementById("si-error").textContent = "";
    document.getElementById("su-error").textContent = "";
    document.getElementById("su-success").textContent = "";

    if (tab === "signin") {
        siBtn.classList.add("active"); suBtn.classList.remove("active");
        siPanel.classList.add("active"); suPanel.classList.remove("active");
    } else {
        suBtn.classList.add("active"); siBtn.classList.remove("active");
        suPanel.classList.add("active"); siPanel.classList.remove("active");
    }
};

// ─── Password Toggle ────────────────────────────────────────────────────────

window.togglePw = function(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
};

// ─── Sign Up ────────────────────────────────────────────────────────────────

window.handleSignUp = function(e) {
    e.preventDefault();
    const name     = document.getElementById("su-name").value.trim();
    const email    = document.getElementById("su-email").value.trim().toLowerCase();
    const password = document.getElementById("su-password").value;
    const errEl    = document.getElementById("su-error");
    const okEl     = document.getElementById("su-success");
    const btn      = document.getElementById("su-btn");

    errEl.textContent = ""; okEl.textContent = "";

    const users = getUsers();
    if (users.find(u => u.email === email)) {
        errEl.textContent = "An account with this email already exists.";
        return;
    }

    const newUser = {
        name,
        email,
        password,          // In production: always hash passwords server-side
        provider: "Email",
        registeredAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    okEl.textContent = "Account created! Signing you in...";
    btn.disabled = true;

    setTimeout(() => {
        loginAndShowDashboard(newUser, "Email");
    }, 900);
};

// ─── Sign In ────────────────────────────────────────────────────────────────

window.handleSignIn = function(e) {
    e.preventDefault();
    const email    = document.getElementById("si-email").value.trim().toLowerCase();
    const password = document.getElementById("si-password").value;
    const errEl    = document.getElementById("si-error");
    const btn      = document.getElementById("si-btn");

    errEl.textContent = "";

    const users = getUsers();
    const user  = users.find(u => u.email === email);

    if (!user) {
        errEl.textContent = "No account found with this email address.";
        return;
    }

    if (user.password !== password) {
        errEl.textContent = "Incorrect password. Please try again.";
        return;
    }

    btn.disabled = true;
    btn.querySelector("span").textContent = "Signing in...";

    setTimeout(() => {
        loginAndShowDashboard(user, "Email");
        btn.disabled = false;
        btn.querySelector("span").textContent = "Sign In";
    }, 600);
};

// ─── OAuth (simulated — wires up to real Firebase when keys are added) ──────

window.handleOAuth = function(providerName) {
    // Simulates OAuth with a demo account for portfolio purposes.
    // Replace this with real Firebase signInWithPopup() calls in production.
    const demoUser = {
        name: `${providerName} User`,
        email: `demo@${providerName.toLowerCase()}.com`,
        password: null,
        provider: providerName,
        registeredAt: new Date().toISOString()
    };

    const users = getUsers();
    const existing = users.find(u => u.email === demoUser.email);
    if (!existing) {
        users.push(demoUser);
        saveUsers(users);
    }

    loginAndShowDashboard(existing || demoUser, providerName);
};

// ─── Dashboard ──────────────────────────────────────────────────────────────

function loginAndShowDashboard(user, provider) {
    const sessionData = { ...user, loginTime: new Date().toISOString(), provider };
    saveSession(sessionData);
    showDashboard(sessionData);
}

function showDashboard(session) {
    // Switch screens
    document.getElementById("auth-screen").classList.remove("active");
    const dash = document.getElementById("dashboard-screen");
    dash.classList.add("active");

    // Nav
    document.getElementById("nav-avatar-initials").textContent = getInitials(session.name);
    document.getElementById("nav-name").textContent = session.name;

    // Hero
    document.getElementById("welcome-text").textContent = `Welcome, ${session.name.split(" ")[0]}!`;
    document.getElementById("welcome-sub").textContent = `Logged in as ${session.email}`;

    // Stats
    const users = getUsers();
    document.getElementById("stat-users").textContent = users.length;
    document.getElementById("stat-method").textContent = session.provider;
    document.getElementById("stat-time").textContent = formatDate(session.loginTime);

    // Build table
    renderTable(users);
}

function renderTable(users) {
    const tbody   = document.getElementById("user-table-body");
    const countEl = document.getElementById("db-count");

    countEl.textContent = `${users.length} user${users.length !== 1 ? "s" : ""}`;

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No users registered yet.</td></tr>`;
        return;
    }

    const providerChip = (p) => {
        const map = {
            "Email": "chip-email", "Google": "chip-google",
            "GitHub": "chip-github", "Facebook": "chip-facebook"
        };
        const cls = map[p] || "chip-email";
        const icon = {
            "Email": "fa-envelope", "Google": "fa-brands fa-google",
            "GitHub": "fa-brands fa-github", "Facebook": "fa-brands fa-facebook-f"
        }[p] || "fa-key";
        return `<span class="provider-chip ${cls}"><i class="fa-solid ${icon}"></i> ${p}</span>`;
    };

    tbody.innerHTML = users.map((u, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${providerChip(u.provider)}</td>
            <td>${formatDate(u.registeredAt)}</td>
        </tr>
    `).join("");
}

// ─── Logout ─────────────────────────────────────────────────────────────────

window.handleLogout = function() {
    clearSession();
    document.getElementById("dashboard-screen").classList.remove("active");
    const authScreen = document.getElementById("auth-screen");
    authScreen.classList.add("active");
    switchTab("signin");
    document.getElementById("si-email").value = "";
    document.getElementById("si-password").value = "";
    document.getElementById("si-btn").disabled = false;
    document.getElementById("si-btn").querySelector("span").textContent = "Sign In";
};

// ─── Auto-restore session on page load ──────────────────────────────────────

(function init() {
    const session = getSession();
    if (session) {
        showDashboard(session);
    }
})();
