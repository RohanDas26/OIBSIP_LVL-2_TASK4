// ═══════════════════════════════════════════════════════════════════════════
// AuthPortal v3 — script.js
// Features: SHA-256 hashing, lockout, session timeout, dark mode,
//           private notes (CRUD, tags, pin, search, filter),
//           login history, profile editor, password change, account delete
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_TIMEOUT = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const AVATAR_COLORS = ["#2563eb","#7c3aed","#db2777","#d97706","#16a34a","#0891b2","#dc2626","#0f172a"];

let sessionTimer = null;
let currentFilter = "all";
let currentTag = "none";
let editingNoteIndex = null;
let editModalTag = "none";

// ─── Crypto ─────────────────────────────────────────────────────────────────
async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// ─── Storage ─────────────────────────────────────────────────────────────────
const store = {
    users:   () => JSON.parse(localStorage.getItem("ap_users")  || "[]"),
    save:    (u) => localStorage.setItem("ap_users", JSON.stringify(u)),
    att:     (e) => JSON.parse(localStorage.getItem("ap_att_"+e) || "{}"),
    saveAtt: (e,d) => localStorage.setItem("ap_att_"+e, JSON.stringify(d)),
    notes:   (uid) => JSON.parse(localStorage.getItem("ap_notes_"+uid) || "[]"),
    saveNotes:(uid,n) => localStorage.setItem("ap_notes_"+uid, JSON.stringify(n)),
    history: (uid) => JSON.parse(localStorage.getItem("ap_hist_"+uid) || "[]"),
    saveHist:(uid,h) => localStorage.setItem("ap_hist_"+uid, JSON.stringify(h)),
    session: () => JSON.parse(sessionStorage.getItem("ap_session") || "null"),
    saveSession:(s) => sessionStorage.setItem("ap_session", JSON.stringify(s)),
    clearSession:() => sessionStorage.removeItem("ap_session"),
    theme:   () => localStorage.getItem("ap_theme") || "light",
    saveTheme:(t) => localStorage.setItem("ap_theme", t),
};

// ─── Utils ───────────────────────────────────────────────────────────────────
function initials(name) { return name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function fmtDate(iso) {
    if(!iso) return "-";
    return new Date(iso).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function setError(id, msg) { const el=document.getElementById(id); if(el) el.textContent=msg; }
function setOk(id, msg)    { const el=document.getElementById(id); if(el) el.textContent=msg; }
function setLoading(btnId, label) {
    const btn = document.getElementById(btnId);
    if(btn){ btn.disabled=true; const sp=btn.querySelector("span"); if(sp) sp.textContent=label; }
}
function resetBtn(btnId, label) {
    const btn = document.getElementById(btnId);
    if(btn){ btn.disabled=false; const sp=btn.querySelector("span"); if(sp) sp.textContent=label; }
}

// ─── Dark Mode ───────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = document.querySelector("#theme-toggle i");
    if(icon) { icon.className = theme==="dark" ? "fa-solid fa-sun" : "fa-solid fa-moon"; }
}

window.toggleTheme = function() {
    const curr = document.documentElement.getAttribute("data-theme");
    const next = curr==="dark" ? "light" : "dark";
    applyTheme(next);
    store.saveTheme(next);
};

// ─── Auth Tab Switch ─────────────────────────────────────────────────────────
window.switchTab = function(tab) {
    ["si-error","su-error","su-success"].forEach(id=>setError(id,""));
    document.getElementById("strength-fill").style.width="0%";
    document.getElementById("strength-label").textContent="";
    document.getElementById("tab-signin").classList.toggle("active", tab==="signin");
    document.getElementById("tab-signup").classList.toggle("active", tab==="signup");
    document.getElementById("signin-panel").classList.toggle("active", tab==="signin");
    document.getElementById("signup-panel").classList.toggle("active", tab==="signup");
};

// ─── Dashboard Tab Switch ─────────────────────────────────────────────────────
window.switchDashTab = function(tab) {
    document.querySelectorAll(".nav-tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
    document.querySelectorAll(".dash-tab").forEach(p=>p.classList.toggle("active", p.id==="tab-"+tab));
};

// ─── Password Visibility ─────────────────────────────────────────────────────
window.togglePw = function(id, btn) {
    const input=document.getElementById(id), icon=btn.querySelector("i");
    input.type = input.type==="password" ? "text" : "password";
    icon.className = input.type==="text" ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
};

// ─── Password Strength ───────────────────────────────────────────────────────
document.getElementById("su-password").addEventListener("input",function(){
    const v=this.value, fill=document.getElementById("strength-fill"), lbl=document.getElementById("strength-label");
    let s=0;
    if(v.length>=8) s++; if(/[A-Z]/.test(v)) s++; if(/[0-9]/.test(v)) s++; if(/[^A-Za-z0-9]/.test(v)) s++;
    const widths=["0%","25%","50%","75%","100%"];
    const colors=["","#ef4444","#f97316","#eab308","#22c55e"];
    const labels=["","Weak","Fair","Good","Strong"];
    fill.style.width=v.length?widths[s]:"0%";
    fill.style.background=colors[s]||"";
    lbl.textContent=v.length?labels[s]:"";
});

// ─── Lockout ─────────────────────────────────────────────────────────────────
function isLocked(email) {
    const a=store.att(email);
    if(!a.lockUntil) return false;
    if(Date.now()<a.lockUntil) return true;
    store.saveAtt(email,{}); return false;
}
function recordFail(email) {
    const a=store.att(email);
    a.count=(a.count||0)+1;
    if(a.count>=MAX_ATTEMPTS){ a.lockUntil=Date.now()+LOCKOUT_MS; a.count=0; }
    store.saveAtt(email,a);
    return MAX_ATTEMPTS-(a.count||0);
}
function clearFails(email) { localStorage.removeItem("ap_att_"+email); }

// ─── Session Timer ───────────────────────────────────────────────────────────
function resetTimer() {
    clearTimeout(sessionTimer);
    sessionTimer=setTimeout(()=>{ alert("Session expired. Please log in again."); handleLogout(); }, SESSION_TIMEOUT);
}

// ─── Sign Up ─────────────────────────────────────────────────────────────────
window.handleSignUp = async function(e) {
    e.preventDefault();
    const name=document.getElementById("su-name").value.trim();
    const email=document.getElementById("su-email").value.trim().toLowerCase();
    const pw=document.getElementById("su-password").value;
    setError("su-error",""); setOk("su-success","");
    if(pw.length<6){ setError("su-error","Password must be at least 6 characters."); return; }
    const users=store.users();
    if(users.find(u=>u.email===email)){ setError("su-error","An account with this email already exists."); return; }
    setLoading("su-btn","Creating...");
    const hashed=await sha256(pw);
    const uid="uid_"+Date.now();
    const color=AVATAR_COLORS[users.length % AVATAR_COLORS.length];
    const user={uid,name,email,password:hashed,provider:"Email",registeredAt:new Date().toISOString(),avatarColor:color};
    users.push(user); store.save(users);
    setOk("su-success","Account created! Signing you in...");
    setTimeout(()=>loginAndShow(user,"Email"),900);
};

// ─── Sign In ─────────────────────────────────────────────────────────────────
window.handleSignIn = async function(e) {
    e.preventDefault();
    const email=document.getElementById("si-email").value.trim().toLowerCase();
    const pw=document.getElementById("si-password").value;
    setError("si-error","");
    if(isLocked(email)){
        const a=store.att(email), mins=Math.ceil((a.lockUntil-Date.now())/60000);
        setError("si-error",`Account locked. Try again in ${mins} min.`); return;
    }
    const users=store.users(), user=users.find(u=>u.email===email);
    if(!user){ setError("si-error","No account found with this email."); return; }
    setLoading("si-btn","Verifying...");
    const hashed=await sha256(pw);
    if(user.password!==hashed){
        const rem=recordFail(email);
        setError("si-error", rem>0 ? `Incorrect password. ${rem} attempt(s) left.` : "Too many attempts. Locked for 30 min.");
        resetBtn("si-btn","Sign In"); return;
    }
    clearFails(email);
    loginAndShow(user,"Email");
};

// ─── OAuth (demo) ─────────────────────────────────────────────────────────────
window.handleOAuth = function(provider) {
    const email=`demo.${provider.toLowerCase()}@authportal.demo`;
    const users=store.users();
    let user=users.find(u=>u.email===email);
    if(!user){
        const color=AVATAR_COLORS[users.length % AVATAR_COLORS.length];
        user={uid:"uid_"+provider.toLowerCase()+"_demo",name:provider+" User",email,password:null,provider,registeredAt:new Date().toISOString(),avatarColor:color};
        users.push(user); store.save(users);
    }
    loginAndShow(user, provider);
};

// ─── Login & Show Dashboard ───────────────────────────────────────────────────
function loginAndShow(user, provider) {
    const session={...user, loginTime:new Date().toISOString(), provider};
    store.saveSession(session);
    // Save login history
    const hist=store.history(user.uid);
    hist.unshift({time:session.loginTime, provider, status:"Success"});
    store.saveHist(user.uid, hist.slice(0,10));
    showDashboard(session);
}

function showDashboard(session) {
    document.getElementById("auth-screen").classList.remove("active");
    document.getElementById("dashboard-screen").classList.add("active");

    // Nav
    const avatar=document.getElementById("nav-avatar-initials");
    avatar.textContent=initials(session.name);
    avatar.style.background=session.avatarColor||AVATAR_COLORS[0];
    document.getElementById("nav-name").textContent=session.name;

    // Welcome
    document.getElementById("welcome-text").textContent=`Welcome, ${session.name.split(" ")[0]}!`;
    document.getElementById("welcome-sub").textContent=`Signed in as ${session.email}`;

    // Stats
    const users=store.users();
    document.getElementById("stat-users").textContent=users.length;
    document.getElementById("stat-method").textContent=session.provider;
    document.getElementById("stat-time").textContent=fmtDate(session.loginTime);
    const notesCount=store.notes(session.uid).length;
    document.getElementById("stat-notes").textContent=notesCount;

    renderNotesList();
    renderHistory(session.uid);
    renderUsersTable();
    setupProfileTab(session);

    resetTimer();
    document.addEventListener("mousemove",resetTimer,{passive:true});
    document.addEventListener("keydown",resetTimer,{passive:true});
}

// ─── Notes ───────────────────────────────────────────────────────────────────
window.selectTag = function(btn) {
    document.querySelectorAll(".note-compose .tag-chip").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentTag=btn.dataset.tag;
};

window.selectFilter = function(btn) {
    document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter=btn.dataset.filter;
    renderNotesList();
};

window.addNote = function() {
    const session=store.session(); if(!session) return;
    const text=document.getElementById("note-input").value.trim(); if(!text) return;
    const notes=store.notes(session.uid);
    notes.push({text, tag:currentTag==="none"?null:currentTag, pinned:false, createdAt:new Date().toISOString(), editedAt:null});
    store.saveNotes(session.uid,notes);
    document.getElementById("note-input").value="";
    document.getElementById("stat-notes").textContent=notes.length;
    renderNotesList();
};

document.getElementById("note-input").addEventListener("keydown",function(e){
    if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) addNote();
});

window.deleteNote = function(idx) {
    const session=store.session(); if(!session) return;
    const notes=store.notes(session.uid);
    notes.splice(idx,1);
    store.saveNotes(session.uid,notes);
    document.getElementById("stat-notes").textContent=notes.length;
    renderNotesList();
};

window.togglePin = function(idx) {
    const session=store.session(); if(!session) return;
    const notes=store.notes(session.uid);
    notes[idx].pinned=!notes[idx].pinned;
    store.saveNotes(session.uid,notes);
    renderNotesList();
};

window.openEditModal = function(idx) {
    const session=store.session(); if(!session) return;
    const note=store.notes(session.uid)[idx];
    editingNoteIndex=idx;
    editModalTag=note.tag||"none";
    document.getElementById("edit-note-text").value=note.text;
    document.querySelectorAll(".modal-tags .tag-chip").forEach(b=>{
        b.classList.toggle("active", b.dataset.tag===editModalTag);
    });
    document.getElementById("edit-modal").classList.add("active");
};

window.closeEditModal = function(e) {
    if(e.target.id==="edit-modal") document.getElementById("edit-modal").classList.remove("active");
};

window.selectModalTag = function(btn) {
    document.querySelectorAll(".modal-tags .tag-chip").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    editModalTag=btn.dataset.tag;
};

window.saveEditedNote = function() {
    const session=store.session(); if(!session||editingNoteIndex===null) return;
    const newText=document.getElementById("edit-note-text").value.trim();
    if(!newText) return;
    const notes=store.notes(session.uid);
    notes[editingNoteIndex].text=newText;
    notes[editingNoteIndex].tag=editModalTag==="none"?null:editModalTag;
    notes[editingNoteIndex].editedAt=new Date().toISOString();
    store.saveNotes(session.uid,notes);
    document.getElementById("edit-modal").classList.remove("active");
    renderNotesList();
};

function renderNotesList() {
    const session=store.session(); if(!session) return;
    let notes=store.notes(session.uid);
    const query=document.getElementById("note-search")?.value.trim().toLowerCase()||"";

    // Filter
    if(currentFilter==="pinned") notes=notes.filter(n=>n.pinned);
    else if(currentFilter!=="all") notes=notes.filter(n=>n.tag===currentFilter);

    // Search
    if(query) notes=notes.filter(n=>n.text.toLowerCase().includes(query));

    // Sort: pinned first
    notes=[...notes.filter(n=>n.pinned), ...notes.filter(n=>!n.pinned)];

    const allNotes=store.notes(session.uid);
    document.getElementById("notes-count").textContent=`${allNotes.length} note${allNotes.length!==1?"s":""}`;

    const tagBadge=(tag,pinned)=>{
        let html="";
        if(pinned) html+=`<span class="note-tag pinned-tag"><i class="fa-solid fa-thumbtack"></i> Pinned</span>`;
        if(tag) html+=`<span class="note-tag ${tag}">${tag.charAt(0).toUpperCase()+tag.slice(1)}</span>`;
        return html;
    };

    const list=document.getElementById("notes-list");
    if(notes.length===0){
        list.innerHTML=`<div class="notes-empty"><i class="fa-regular fa-note-sticky"></i><p>${query?"No notes match your search.":"No notes yet. Add your first one above."}</p></div>`;
        return;
    }

    // Map back to original index for correct CRUD operations
    list.innerHTML=notes.map(note=>{
        const origIdx=allNotes.indexOf(note);
        return `
        <div class="note-card${note.pinned?" pinned":""}">
            <div class="note-top">
                <div class="note-tags">${tagBadge(note.tag,note.pinned)}</div>
                <div class="note-actions">
                    <button class="note-btn${note.pinned?" pin-active":""}" onclick="togglePin(${origIdx})" title="${note.pinned?"Unpin":"Pin"}"><i class="fa-solid fa-thumbtack"></i></button>
                    <button class="note-btn" onclick="openEditModal(${origIdx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="note-btn del" onclick="deleteNote(${origIdx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="note-body">${note.text.replace(/</g,"&lt;")}</div>
            <div class="note-date">${note.editedAt?"Edited "+fmtDate(note.editedAt):"Added "+fmtDate(note.createdAt)}</div>
        </div>`;
    }).join("");
}

// ─── Login History ────────────────────────────────────────────────────────────
function renderHistory(uid) {
    const hist=store.history(uid);
    const tbody=document.getElementById("history-tbody");
    if(hist.length===0){ tbody.innerHTML=`<tr><td colspan="4" class="empty-row">No history yet.</td></tr>`; return; }
    tbody.innerHTML=hist.map((h,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${fmtDate(h.time)}</td>
            <td><span class="provider-chip chip-${h.provider.toLowerCase()}">${h.provider}</span></td>
            <td><span class="provider-chip chip-success"><i class="fa-solid fa-check"></i> ${h.status}</span></td>
        </tr>`).join("");
}

// ─── Users Table ──────────────────────────────────────────────────────────────
function renderUsersTable() {
    const users=store.users();
    const tbody=document.getElementById("user-table-body");
    document.getElementById("db-count").textContent=`${users.length} user${users.length!==1?"s":""}`;
    if(users.length===0){ tbody.innerHTML=`<tr><td colspan="5" class="empty-row">No users yet.</td></tr>`; return; }
    const chip=(p)=>{
        const map={Email:["chip-email","fa-envelope"],Google:["chip-google","fa-brands fa-google"],GitHub:["chip-github","fa-brands fa-github"],Facebook:["chip-facebook","fa-brands fa-facebook-f"]};
        const [cls,ico]=map[p]||["chip-email","fa-key"];
        return `<span class="provider-chip ${cls}"><i class="${ico}"></i> ${p}</span>`;
    };
    tbody.innerHTML=users.map((u,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${chip(u.provider)}</td>
            <td>${fmtDate(u.registeredAt)}</td>
        </tr>`).join("");
}

// ─── Profile Editor ───────────────────────────────────────────────────────────
function setupProfileTab(session) {
    document.getElementById("profile-name").value=session.name;
    const preview=document.getElementById("avatar-preview");
    preview.textContent=initials(session.name);
    preview.style.background=session.avatarColor||AVATAR_COLORS[0];

    const swatches=document.getElementById("color-swatches");
    swatches.innerHTML=AVATAR_COLORS.map(c=>`
        <div class="swatch${session.avatarColor===c?" selected":""}" style="background:${c};color:${c};" data-color="${c}" onclick="selectColor(this)"></div>
    `).join("");
}

window.selectColor = function(sw) {
    document.querySelectorAll(".swatch").forEach(s=>s.classList.remove("selected"));
    sw.classList.add("selected");
    const preview=document.getElementById("avatar-preview");
    preview.style.background=sw.dataset.color;
};

window.saveProfile = function() {
    const session=store.session(); if(!session) return;
    const newName=document.getElementById("profile-name").value.trim();
    const selectedSwatch=document.querySelector(".swatch.selected");
    const newColor=selectedSwatch?selectedSwatch.dataset.color:session.avatarColor;
    if(!newName){ setError("profile-success","Name cannot be empty."); return; }

    const users=store.users();
    const user=users.find(u=>u.uid===session.uid);
    if(user){ user.name=newName; user.avatarColor=newColor; store.save(users); }

    const newSession={...session, name:newName, avatarColor:newColor};
    store.saveSession(newSession);

    document.getElementById("nav-avatar-initials").textContent=initials(newName);
    document.getElementById("nav-avatar-initials").style.background=newColor;
    document.getElementById("nav-name").textContent=newName;
    document.getElementById("welcome-text").textContent=`Welcome, ${newName.split(" ")[0]}!`;
    document.getElementById("avatar-preview").textContent=initials(newName);

    setOk("profile-success","Profile updated!");
    setTimeout(()=>setOk("profile-success",""),3000);
};

// ─── Change Password ──────────────────────────────────────────────────────────
window.changePassword = async function() {
    const session=store.session(); if(!session) return;
    const current=document.getElementById("cp-current").value;
    const newPw=document.getElementById("cp-new").value;
    const confirm=document.getElementById("cp-confirm").value;
    setError("cp-error",""); setOk("cp-success","");

    if(!session.password){ setError("cp-error","Password change is not available for OAuth accounts."); return; }
    if(newPw.length<6){ setError("cp-error","New password must be at least 6 characters."); return; }
    if(newPw!==confirm){ setError("cp-error","New passwords do not match."); return; }

    const currentHash=await sha256(current);
    if(currentHash!==session.password){ setError("cp-error","Current password is incorrect."); return; }

    const newHash=await sha256(newPw);
    const users=store.users();
    const user=users.find(u=>u.uid===session.uid);
    if(user){ user.password=newHash; store.save(users); }

    const newSession={...session, password:newHash};
    store.saveSession(newSession);

    document.getElementById("cp-current").value="";
    document.getElementById("cp-new").value="";
    document.getElementById("cp-confirm").value="";
    setOk("cp-success","Password updated successfully!");
    setTimeout(()=>setOk("cp-success",""),3000);
};

// ─── Delete Account ───────────────────────────────────────────────────────────
window.deleteAccount = function() {
    const session=store.session(); if(!session) return;
    if(!confirm(`Are you sure you want to permanently delete your account?\n\nThis will remove all your notes and login history. This cannot be undone.`)) return;

    let users=store.users();
    users=users.filter(u=>u.uid!==session.uid);
    store.save(users);
    localStorage.removeItem("ap_notes_"+session.uid);
    localStorage.removeItem("ap_hist_"+session.uid);
    store.clearSession();

    alert("Your account has been deleted.");
    handleLogout();
};

// ─── Logout ───────────────────────────────────────────────────────────────────
window.handleLogout = function() {
    store.clearSession();
    clearTimeout(sessionTimer);
    document.removeEventListener("mousemove",resetTimer);
    document.removeEventListener("keydown",resetTimer);
    document.getElementById("dashboard-screen").classList.remove("active");
    document.getElementById("auth-screen").classList.add("active");
    switchTab("signin");
    ["si-email","si-password"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    resetBtn("si-btn","Sign In");
};

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
    applyTheme(store.theme());
    const session=store.session();
    if(session) showDashboard(session);
})();
