/**
 * admin.js — Real-time admin panel for TNS.DEV Portfolio
 *
 * SETUP INSTRUCTIONS:
 * 1. Tạo project trên https://console.firebase.google.com
 * 2. Enable Authentication > Google Sign-In
 * 3. Enable Firestore Database
 * 4. Enable Storage
 * 5. Điền config vào FIREBASE_CONFIG bên dưới
 * 6. Thêm email admin của bạn vào ADMIN_EMAIL
 * 7. Trong Firestore Rules, set:
 *      allow read: if true;
 *      allow write: if request.auth != null && request.auth.token.email == "your@email.com";
 * 8. Trong Storage Rules, làm tương tự
 */

// =====================================================================
// CONFIGURATION — Điền thông tin Firebase project của bạn vào đây
// =====================================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBkMSN2Q1wcmPyY2gGtmNwkr5dDkx5fDTU",
  authDomain:        "portfolio-22582.firebaseapp.com",
  projectId:         "portfolio-22582",
  messagingSenderId: "4917618034",
  appId:             "1:4917618034:web:b64b6afe36fc951854e9eb",
  // storageBucket không cần — dùng ImgBB miễn phí thay thế
};

// Email của admin (chỉ email này mới được upload/thêm dự án)
const ADMIN_EMAIL = "ngocson11a@gmail.com";

// ImgBB API Key — lấy miễn phí tại https://api.imgbb.com/ (đăng ký → My API)
// Không mất tiền, không cần thẻ ngân hàng!
const IMGBB_API_KEY = "25c1fec92dab00726d72547811445b98"; // ← điền key vào đây
// =====================================================================

let app, auth, db, storage;
let currentUser = null;
let isFirebaseReady = false;
let unsubscribeProjects = null;
let _justLoggedIn = false;
let _allStatuses = [];    // cache for edit/delete operations

// Promise to track a single in-flight init (prevents double-init)
let _initPromise = null;

// ===== FIREBASE INIT =====
async function initFirebase() {
  if (isFirebaseReady) return;
  if (_initPromise) return _initPromise; // reuse if already loading

  // Check if config is filled
  if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
    console.info("[Admin] Firebase chưa được cấu hình. Xem hướng dẫn trong js/admin.js");
    hideFirebaseNote(false);
    return;
  }

  _initPromise = _doInitFirebase();
  return _initPromise;
}

async function _doInitFirebase() {

  try {
    // Load Firebase SDK dynamically
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
      = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const { getFirestore, collection, addDoc, deleteDoc, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy, limit }
      = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    app  = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db   = getFirestore(app);

    // Expose needed Firebase functions globally (scoped)
    window._fb = {
      GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
      collection, addDoc, deleteDoc, doc, setDoc, onSnapshot, serverTimestamp,
      query, orderBy, limit,
    };

    // Load Firebase (Auth + Firestore only — không cần Storage)
    if (FIREBASE_CONFIG.storageBucket) {
      try {
        const { getStorage, ref, uploadBytesResumable, getDownloadURL }
          = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
        storage = getStorage(app);
        window._fb.ref = ref;
        window._fb.uploadBytesResumable = uploadBytesResumable;
        window._fb.getDownloadURL = getDownloadURL;
      } catch (_) { /* storage optional */ }
    }

    isFirebaseReady = true;
    hideFirebaseNote(true);

    // Auth state listener
    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      updateAuthUI(user);
      if (user && user.email === ADMIN_EMAIL) {
        listenToProjects();
      } else {
        if (unsubscribeProjects) { unsubscribeProjects(); unsubscribeProjects = null; }
      }
    });

    setupFileUpload();
    setupAddProjectForm();
    setupStatusForm();
    listenToStatus();

  } catch (err) {
    console.error("[Admin] Firebase init error:", err);
    _initPromise = null; // allow retry
  }
}

// ===== AUTH UI =====
function updateAuthUI(user) {
  const loginSection    = document.getElementById("loginSection");
  const loggedInSection = document.getElementById("loggedInSection");

  if (user && user.email === ADMIN_EMAIL) {
    if (loginSection)    loginSection.style.display    = "none";
    if (loggedInSection) loggedInSection.style.display = "block";

    const avatarEl = document.getElementById("adminAvatar");
    const nameEl   = document.getElementById("adminName");
    const emailEl  = document.getElementById("adminEmail");
    if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;
    if (nameEl)  nameEl.textContent  = user.displayName || "Admin";
    if (emailEl) emailEl.textContent = user.email;

    // Auto-open panel on fresh login
    if (_justLoggedIn) {
      _justLoggedIn = false;
      closeLoginModal();
      openAdminPanel();
    }

    // Show admin indicator in navbar
    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) {
      loginBtn.innerHTML = '<i class="fas fa-user-check"></i><span>Admin</span>';
      loginBtn.style.borderColor = "var(--green)";
      loginBtn.style.color = "var(--green)";
    }
  } else {
    if (loginSection)    loginSection.style.display    = "block";
    if (loggedInSection) loggedInSection.style.display = "none";

    // Reset navbar button
    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) {
      loginBtn.innerHTML = '<i class="fas fa-user-shield"></i><span>Admin</span>';
      loginBtn.style.borderColor = "";
      loginBtn.style.color = "";
    }

    closeAdminPanel();

    if (user && user.email !== ADMIN_EMAIL) {
      // Signed in but not admin
      if (loginSection) {
        const note = loginSection.querySelector(".login-note");
        if (note) { note.style.color = "#ff6b6b"; note.textContent = "⚠ Tài khoản này không có quyền admin."; }
      }
      // Sign them out automatically
      if (isFirebaseReady && window._fb) window._fb.signOut(auth);
    }
  }
}

// ===== MODAL CONTROLS =====
window.openLoginModal = function () {
  const modal = document.getElementById("loginModal");
  if (modal) modal.classList.add("open");
};
window.closeLoginModal = function () {
  const modal = document.getElementById("loginModal");
  if (modal) modal.classList.remove("open");
};
window.handleOverlayClick = function (e) {
  if (e.target === document.getElementById("loginModal")) closeLoginModal();
};

// ===== GOOGLE LOGIN =====
// IMPORTANT: signInWithPopup MUST be called synchronously inside the click event.
// Any await before it breaks the "user gesture" chain → browser blocks the popup.
window.loginWithGoogle = function () {
  if (!isFirebaseReady || !window._fb) {
    alert("Firebase đang khởi động, vui lòng thử lại sau 1 giây.");
    initFirebase(); // kick off init for next attempt
    return;
  }

  const btn = document.getElementById("googleLoginBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Đang mở Google..."; }

  const provider = new window._fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // Call popup SYNCHRONOUSLY — no await before this line
  window._fb.signInWithPopup(auth, provider)
    .then(() => { _justLoggedIn = true; })
    .catch((err) => {
      const msgs = {
        "auth/popup-closed-by-user":  null, // silent
        "auth/popup-blocked":         "Trình duyệt đang chặn popup! Cho phép popup cho trang này rồi thử lại.",
        "auth/unauthorized-domain":   "Domain này chưa được thêm vào Firebase.\nVào Authentication → Settings → Authorized domains → thêm domain hiện tại.",
        "auth/cancelled-popup-request": null, // silent
      };
      const msg = msgs[err.code];
      if (msg) alert(msg);
      else if (msg !== null) console.error("[Admin] Login error:", err.code, err.message);
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-google"></i> Đăng nhập bằng Google'; }
    });
};

// ===== LOGOUT =====
window.logout = async function () {
  if (!isFirebaseReady || !window._fb) return;
  await window._fb.signOut(auth);
  closeLoginModal();
};

// ===== ADMIN PANEL =====
window.openAdminPanel = function () {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;
  if (currentUser) {
    const avatarEl = document.getElementById("adminPanelAvatar");
    const nameEl   = document.getElementById("adminPanelName");
    if (avatarEl && currentUser.photoURL) avatarEl.src = currentUser.photoURL;
    if (nameEl) nameEl.textContent = currentUser.displayName || "Admin";
  }
  panel.classList.add("open");
  document.body.style.overflow = "hidden";
  setupAdminTabs();
};
window.closeAdminPanel = function () {
  const panel = document.getElementById("adminPanel");
  if (panel) panel.classList.remove("open");
  document.body.style.overflow = "";
};

function setupAdminTabs() {
  document.querySelectorAll(".admin-tab").forEach(tab => {
    const clone = tab.cloneNode(true);
    tab.parentNode.replaceChild(clone, tab);
  });
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".admin-tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      const content = document.getElementById("tab-" + tab.dataset.tab);
      if (content) content.classList.add("active");
    });
  });
}

// ===== FILE UPLOAD =====
function setupFileUpload() {
  setupUploadZone("statusUploadZone", "statusFileInput", "statusUploadPlaceholder", "statusImgPreview", "statusPreviewImg", "removeStatusImg");
  setupUploadZone("projUploadZone",   "projFileInput",   "projUploadPlaceholder",   "projImgPreview",   "projPreviewImg",   "removeProjImg");
}

function setupUploadZone(zoneId, inputId, placeholderId, previewContId, previewImgId, removeBtnId) {
  const zone        = document.getElementById(zoneId);
  const fileInput   = document.getElementById(inputId);
  const placeholder = document.getElementById(placeholderId);
  const previewCont = document.getElementById(previewContId);
  const previewImg  = document.getElementById(previewImgId);
  const removeBtn   = document.getElementById(removeBtnId);
  if (!zone || !fileInput) return;

  const showPreview = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
      if (placeholder) placeholder.style.display = "none";
      if (previewCont) previewCont.style.display = "block";
    };
    reader.readAsDataURL(file);
  };

  const clearPreview = () => {
    fileInput.value = "";
    if (previewImg) previewImg.src = "";
    if (placeholder) placeholder.style.display = "flex";
    if (previewCont) previewCont.style.display = "none";
  };

  zone.addEventListener("click", (e) => { if (!e.target.closest(".remove-img-btn")) fileInput.click(); });
  fileInput.addEventListener("change", (e) => { if (e.target.files[0]) showPreview(e.target.files[0]); });
  if (removeBtn) removeBtn.addEventListener("click", (e) => { e.stopPropagation(); clearPreview(); });

  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      try { const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; } catch (_) {}
      showPreview(file);
    }
  });
}

// Hiển thị lỗi rõ ràng — đặc biệt hướng dẫn khi bị Firestore permissions
function _showFirestoreError(err) {
  const isPermission = err.code === "permission-denied"
    || (err.message || "").toLowerCase().includes("permission");
  if (isPermission) {
    alert(
      "❌ Lỗi: Firestore chưa cấp quyền ghi!\n\n" +
      "Vào Firebase Console → Firestore Database → Rules\n" +
      "Dán đoạn sau rồi nhấn Publish:\n\n" +
      "rules_version = '2';\n" +
      "service cloud.firestore {\n" +
      "  match /databases/{database}/documents {\n" +
      "    match /{document=**} {\n" +
      "      allow read: if true;\n" +
      "      allow write: if request.auth != null\n" +
      "        && request.auth.token.email == \"" + ADMIN_EMAIL + "\";\n" +
      "    }\n" +
      "  }\n" +
      "}"
    );
  } else {
    alert("Lỗi: " + err.message);
  }
}

// Upload ảnh qua ImgBB (miễn phí, không cần Firebase Storage)
// Đăng ký key miễn phí tại https://api.imgbb.com/
async function uploadToImgBB(file) {
  if (IMGBB_API_KEY === "YOUR_IMGBB_KEY") {
    throw new Error("Chưa điền IMGBB_API_KEY. Lấy key miễn phí tại https://api.imgbb.com/");
  }
  if (file.size > 32 * 1024 * 1024) throw new Error("File quá lớn (max 32MB)");

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const form = new FormData();
  form.append("image", base64);

  const res  = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
    method: "POST", body: form,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || "ImgBB upload thất bại");
  return data.data.display_url;
}

// ===== ADD PROJECT FORM =====
function setupAddProjectForm() {
  const form = document.getElementById("addProjectForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;

    const title = document.getElementById("proj-title")?.value.trim();
    const genre = document.getElementById("proj-genre")?.value.trim();
    const desc  = document.getElementById("proj-desc")?.value.trim();
    const link  = document.getElementById("proj-link")?.value.trim();
    if (!title || !genre || !desc) return;

    const submitBtn = form.querySelector(".btn-post");
    const statusEl  = document.getElementById("uploadStatus");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...'; }

    try {
      let imgUrl = "";
      const projFileInput = document.getElementById("projFileInput");
      if (projFileInput?.files[0]) {
        if (statusEl) statusEl.textContent = "Đang upload ảnh...";
        imgUrl = await uploadToImgBB(projFileInput.files[0]);
        if (statusEl) statusEl.textContent = "✓ Upload xong!";
      }

      await window._fb.addDoc(window._fb.collection(db, "projects"), {
        title, genre, desc, link: link || "", imgUrl,
        createdAt: window._fb.serverTimestamp(),
        author: currentUser.email,
      });

      form.reset();
      if (projFileInput) projFileInput.value = "";
      const previewCont = document.getElementById("projImgPreview");
      const placeholder = document.getElementById("projUploadPlaceholder");
      if (previewCont) previewCont.style.display = "none";
      if (placeholder) placeholder.style.display = "flex";
      if (statusEl) statusEl.textContent = "";

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Đã thêm!';
        setTimeout(() => { submitBtn.innerHTML = '<i class="fas fa-plus"></i> Thêm vào Portfolio'; }, 2000);
      }
    } catch (err) {
      console.error("[Admin] Add project error:", err);
      _showFirestoreError(err);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-plus"></i> Thêm vào Portfolio'; }
    }
  });
}

// ===== LISTEN TO FIRESTORE PROJECTS (real-time) =====
function listenToProjects() {
  if (!isFirebaseReady || !db) return;

  const listEl    = document.getElementById("dynamicProjectsList");
  const gridEl    = document.getElementById("dynamic-grid");
  const sectionEl = document.getElementById("dynamic-projects-section");

  if (unsubscribeProjects) unsubscribeProjects();

  unsubscribeProjects = window._fb.onSnapshot(
    window._fb.collection(db, "projects"),
    (snapshot) => {
      const projects = [];
      snapshot.forEach((d) => projects.push({ id: d.id, ...d.data() }));

      // Sort by newest first
      projects.sort((a, b) => {
        const ta = a.createdAt?.seconds ?? 0;
        const tb = b.createdAt?.seconds ?? 0;
        return tb - ta;
      });

      // Update sidebar list
      if (listEl) {
        if (projects.length === 0) {
          listEl.innerHTML = '<p class="empty-hint">Chưa có dự án nào được thêm...</p>';
        } else {
          listEl.innerHTML = projects.map((p) => `
            <div class="dynamic-item">
              ${p.imgUrl ? `<img src="${sanitizeUrl(p.imgUrl)}" alt="${escapeHtml(p.title)}" onerror="this.style.display='none'"/>` : '<div style="width:44px;height:44px;background:rgba(125,95,255,0.1);border-radius:6px;flex-shrink:0"></div>'}
              <div class="dynamic-item-info">
                <strong>${escapeHtml(p.title)}</strong>
                <span>${escapeHtml(p.genre)}</span>
              </div>
              <button class="dynamic-item-del" onclick="deleteProject('${p.id}')" title="Xóa">
                <i class="fas fa-trash"></i>
              </button>
            </div>`).join("");
        }
      }

      // Update main portfolio grid
      if (gridEl && sectionEl) {
        if (projects.length === 0) {
          sectionEl.style.display = "none";
        } else {
          sectionEl.style.display = "block";
          gridEl.innerHTML = projects.map((p) => `
            <div class="project-card reveal active">
              <div class="card-img-wrap">
                ${p.imgUrl
                  ? `<img src="${sanitizeUrl(p.imgUrl)}" alt="${escapeHtml(p.title)}" loading="lazy" />`
                  : '<div style="width:100%;height:130px;background:rgba(125,95,255,0.1);display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:2rem"><i class="fas fa-gamepad"></i></div>'}
                <div class="card-status released">Live</div>
              </div>
              <div class="card-body">
                <span class="card-genre"><i class="fas fa-star"></i> ${escapeHtml(p.genre)}</span>
                <h4>${escapeHtml(p.title)}</h4>
                <p>${escapeHtml(p.desc)}</p>
                ${p.link
                  ? `<a href="${sanitizeUrl(p.link)}" class="btn-card" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-right"></i> View Details</a>`
                  : ""}
              </div>
            </div>`).join("");
        }
      }
    },
    (err) => console.error("[Admin] Firestore listener error:", err)
  );
}

// Public listen for non-admin visitors (read-only)
async function initPublicListener() {
  if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") return;
  try {
    await initFirebase();
    if (!isFirebaseReady) return;
    // onAuthStateChanged will handle project listening
  } catch (_) {}
}

// ===== DELETE PROJECT =====
window.deleteProject = async function (id) {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  if (!confirm("Xóa dự án này?")) return;
  try {
    await window._fb.deleteDoc(window._fb.doc(db, "projects", id));
  } catch (err) {
    console.error("[Admin] Delete error:", err);
    alert("Lỗi khi xóa: " + err.message);
  }
};

// ===== STATUS FEATURE =====
let selectedMood = "💻";

function setupStatusForm() {
  // Mood picker
  const picker = document.getElementById("moodPicker");
  if (picker) {
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest(".mood-btn");
      if (!btn) return;
      picker.querySelectorAll(".mood-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMood = btn.dataset.mood;
    });
  }

  // Char counter
  const textArea = document.getElementById("status-text");
  if (textArea) {
    textArea.addEventListener("input", () => {
      const el = document.getElementById("statusCharCount");
      if (el) el.textContent = textArea.value.length;
    });
  }

  // Form submit
  const form = document.getElementById("statusForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;

    const text = document.getElementById("status-text")?.value.trim();
    if (!text) return;

    const submitBtn = document.getElementById("statusSubmitBtn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng...'; }

    try {
      let imgUrl = "";
      const statusFileInput = document.getElementById("statusFileInput");
      if (statusFileInput?.files[0]) {
        imgUrl = await uploadToImgBB(statusFileInput.files[0]);
      }

      const editingId = document.getElementById("editingStatusId")?.value;
      if (editingId) {
        // Cập nhật status cũ
        const updateData = { mood: selectedMood, text, updatedAt: window._fb.serverTimestamp() };
        if (imgUrl) updateData.imgUrl = imgUrl;
        await window._fb.setDoc(window._fb.doc(db, "statuses", editingId), updateData, { merge: true });
        window.cancelStatusEdit();
      } else {
        // Đăng mới
        await window._fb.addDoc(window._fb.collection(db, "statuses"), {
          mood: selectedMood, text, imgUrl,
          createdAt: window._fb.serverTimestamp(),
        });
      }

      form.reset();
      const charCount = document.getElementById("statusCharCount");
      if (charCount) charCount.textContent = "0";
      if (statusFileInput) statusFileInput.value = "";
      const previewCont = document.getElementById("statusImgPreview");
      const placeholder = document.getElementById("statusUploadPlaceholder");
      if (previewCont) previewCont.style.display = "none";
      if (placeholder) placeholder.style.display = "flex";
    } catch (err) {
      console.error("[Admin] Status error:", err);
      _showFirestoreError(err);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        const editing = document.getElementById("editingStatusId")?.value;
        submitBtn.innerHTML = editing
          ? '<i class="fas fa-save"></i> Lưu thay đổi'
          : '<i class="fas fa-paper-plane"></i> Đăng Status';
      }
    }
  });
}

window.cancelStatusEdit = function () {
  const hiddenId  = document.getElementById("editingStatusId");
  const submitBtn = document.getElementById("statusSubmitBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const textArea  = document.getElementById("status-text");
  if (hiddenId)  hiddenId.value  = "";
  if (textArea)  textArea.value  = "";
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Đăng Status';
  if (cancelBtn) cancelBtn.style.display = "none";
  selectedMood = "💻";
  document.querySelectorAll("#moodPicker .mood-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.mood === "💻")
  );
  const charCount = document.getElementById("statusCharCount");
  if (charCount) charCount.textContent = "0";
  const previewCont = document.getElementById("statusImgPreview");
  const placeholder = document.getElementById("statusUploadPlaceholder");
  if (previewCont) previewCont.style.display = "none";
  if (placeholder) placeholder.style.display = "flex";
};

window.editStatusInPanel = function (id) {
  const s = _allStatuses.find(x => x.id === id);
  if (!s) return;
  const textArea  = document.getElementById("status-text");
  const hiddenId  = document.getElementById("editingStatusId");
  const submitBtn = document.getElementById("statusSubmitBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  if (textArea)  textArea.value  = s.text || "";
  if (hiddenId)  hiddenId.value  = id;
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Lưu thay đổi';
  if (cancelBtn) cancelBtn.style.display = "";
  selectedMood = s.mood || "💻";
  document.querySelectorAll("#moodPicker .mood-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.mood === selectedMood)
  );
  const charCount = document.getElementById("statusCharCount");
  if (charCount && textArea) charCount.textContent = textArea.value.length;
  const form = document.getElementById("statusForm");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window.deleteStatus = async function (id) {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  if (!confirm("Xóa status này?")) return;
  try {
    await window._fb.deleteDoc(window._fb.doc(db, "statuses", id));
  } catch (err) {
    console.error(err);
    _showFirestoreError(err);
  }
};

function _formatRelTime(ts) {
  if (!ts) return "";
  try {
    const d    = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)     return "Vừa xong";
    if (diff < 3600)   return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (_) { return ""; }
}

function renderStatusFeed(statuses) {
  const feedEl    = document.getElementById("status-feed");
  const sectionEl = document.getElementById("status-section");
  if (!feedEl) return;
  if (statuses.length === 0) {
    if (sectionEl) sectionEl.style.display = "none";
    return;
  }
  if (sectionEl) sectionEl.style.removeProperty("display");
  feedEl.innerHTML = statuses.map(s => `
    <div class="status-post-card">
      <div class="status-post-header">
        <span class="status-post-mood">${escapeHtml(s.mood || "💬")}</span>
        <div class="status-post-meta">
          <strong>Trần Ngọc Sơn</strong>
          <span>${_formatRelTime(s.createdAt || s.updatedAt)}</span>
        </div>
      </div>
      <p class="status-post-text">${escapeHtml(s.text || "")}</p>
      ${s.imgUrl ? `<div class="status-post-img-wrap"><img src="${sanitizeUrl(s.imgUrl)}" alt="" class="status-post-img" loading="lazy" /></div>` : ""}
    </div>`).join("");
}

function renderAdminStatusList(statuses) {
  const listEl = document.getElementById("adminStatusList");
  if (!listEl) return;
  if (statuses.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">Chưa có status nào...</p>';
    return;
  }
  listEl.innerHTML =
    `<p class="admin-list-label"><i class="fas fa-history"></i> Đã đăng (${statuses.length})</p>` +
    statuses.map(s => `
    <div class="asi-item">
      <span class="asi-mood">${escapeHtml(s.mood || "💬")}</span>
      <span class="asi-text">${escapeHtml((s.text || "").substring(0, 45))}${(s.text || "").length > 45 ? "…" : ""}</span>
      <div class="asi-btns">
        <button class="asi-btn asi-edit" onclick="editStatusInPanel('${s.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
        <button class="asi-btn asi-del"  onclick="deleteStatus('${s.id}')"        title="Xóa"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join("");
}

function listenToStatus() {
  if (!isFirebaseReady || !db) return;
  const q = window._fb.query(
    window._fb.collection(db, "statuses"),
    window._fb.orderBy("createdAt", "desc"),
    window._fb.limit(10)
  );
  window._fb.onSnapshot(q, (snapshot) => {
    _allStatuses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStatusFeed(_allStatuses);
    if (currentUser?.email === ADMIN_EMAIL) renderAdminStatusList(_allStatuses);
  }, (err) => console.error("[Admin] Status listener:", err));
}



// ===== HELPERS =====
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUrl(url) {
  if (!url) return "";
  // Only allow http/https URLs
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return url;
  } catch (_) { return ""; }
}

function hideFirebaseNote(configured) {
  const note = document.getElementById("firebaseNote");
  if (note) note.style.display = configured ? "none" : "flex";
}

// ===== INIT on DOM ready =====
document.addEventListener("DOMContentLoaded", () => {
  // Init Firebase eagerly so it's ready before user clicks Login
  initFirebase();
});
