const HUMREY_AUTH_KEY = 'humrey-user';
const AUTH_API_BASE = 'http://localhost:3001/api/accounts';
const OWNER_EMAIL = 'zatulij@gmail.com';
const OWNER_USERNAMES = new Set(['Valera_OwnerSite123', 'Valera_OwnerSite1111']);
const normalizeUser = user => {
  if (!user || typeof user !== 'object') return null;
  const username = String(user.username || '').trim();
  const email = String(user.email || '').trim().toLowerCase();
  return {
    username,
    email,
    isAdmin: Boolean(user.isAdmin) || email === OWNER_EMAIL || OWNER_USERNAMES.has(username),
  };
};
const loadCurrentUser = () => {
  const raw = localStorage.getItem(HUMREY_AUTH_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return normalizeUser(parsed);
  } catch {
    const legacy = String(raw || '').trim();
    if (legacy) {
      return { username: legacy, email: '', isAdmin: false };
    }
    return null;
  }
};
const saveCurrentUser = user => localStorage.setItem(HUMREY_AUTH_KEY, JSON.stringify(normalizeUser(user)));
let currentUser = loadCurrentUser();
let pendingUsername = null;

const createElementFromHTML = htmlString => {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstElementChild;
};

const showMessage = (message, type = 'info') => {
  const messageNode = document.getElementById('authMessage');
  if (!messageNode) return;
  messageNode.textContent = message;
  messageNode.className = `auth-message ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
};

const updateHeaderButtons = () => {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const authButtons = topbar.querySelector('.auth-buttons');
  if (!authButtons) return;

  const loggedIn = Boolean(currentUser);
  authButtons.querySelectorAll('.auth-toggle, .auth-profile').forEach(el => el.classList.remove('hidden'));
  if (loggedIn) {
    const profileButton = authButtons.querySelector('.auth-profile');
    authButtons.querySelectorAll('.auth-toggle').forEach(el => el.classList.add('hidden'));
    profileButton.textContent = `Привіт, ${currentUser.username}`;
    profileButton.dataset.tab = 'profile';
  } else {
    authButtons.querySelectorAll('.auth-toggle').forEach(el => el.classList.remove('hidden'));
    authButtons.querySelector('.auth-profile').classList.add('hidden');
  }
};

const injectAuthControls = () => {
  if (!document.querySelector('.topbar')) return;
  if (document.querySelector('.auth-buttons')) return;

  const topbar = document.querySelector('.topbar');
  const container = document.createElement('div');
  container.className = 'auth-buttons';

  const loginButton = document.createElement('button');
  loginButton.type = 'button';
  loginButton.className = 'button button-outline auth-toggle';
  loginButton.dataset.tab = 'login';
  loginButton.textContent = 'Вхід';

  const registerButton = document.createElement('button');
  registerButton.type = 'button';
  registerButton.className = 'button button-primary auth-toggle';
  registerButton.dataset.tab = 'register';
  registerButton.textContent = 'Реєстрація';

  const profileButton = document.createElement('button');
  profileButton.type = 'button';
  profileButton.className = 'button button-outline auth-profile hidden';
  profileButton.textContent = 'Мій акаунт';
  profileButton.dataset.tab = 'profile';

  container.append(loginButton, registerButton, profileButton);
  topbar.insertBefore(container, topbar.lastElementChild);

  container.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('auth-toggle')) {
      event.preventDefault();
      openAuthModal(button.dataset.tab);
    }
    if (button.classList.contains('auth-profile')) {
      event.preventDefault();
      openAuthModal(currentUser ? 'profile' : 'login');
    }
  });
};

const injectAuthModal = () => {
  if (document.getElementById('authOverlay')) return;

  const markup = `
    <div class="auth-overlay hidden" id="authOverlay">
      <div class="auth-modal">
        <button type="button" class="auth-close" id="authClose">✕</button>
        <div class="auth-tabs">
          <button type="button" class="auth-tab active" data-tab="login">Вхід</button>
          <button type="button" class="auth-tab" data-tab="register">Реєстрація</button>
          <button type="button" class="auth-tab" data-tab="profile">Профіль</button>
        </div>
        <div class="auth-content">
          <div class="auth-panel auth-login active" id="loginPanel">
            <h2>Вхід</h2>
            <p>Введіть логін або email та пароль, щоб увійти.</p>
            <form class="auth-form" id="loginForm">
              <label>Логін або email
                <input type="text" name="username" autocomplete="username" required>
              </label>
              <label>Пароль
                <input type="password" name="password" autocomplete="current-password" required>
              </label>
              <button class="button button-primary" type="submit">Увійти</button>
            </form>
          </div>
          <div class="auth-panel auth-register" id="registerPanel">
            <h2>Реєстрація</h2>
            <p>Створіть обліковий запис та використайте email для входу.</p>
            <form class="auth-form" id="registerForm">
              <label>Логін
                <input type="text" name="username" autocomplete="username" required>
              </label>
              <label>Пароль
                <input type="password" name="password" autocomplete="new-password" required>
              </label>
              <label>Повторіть пароль
                <input type="password" name="confirmPassword" autocomplete="new-password" required>
              </label>
              <label>Email
                <input type="email" name="email" placeholder="example@mail.com" autocomplete="email" required>
              </label>
              <button class="button button-primary" type="submit">іареєструватися</button>
            </form>
          </div>
          <div class="auth-panel auth-profile" id="profilePanel">
            <h2>Мій акаунт</h2>
            <p>Перегляд профілю та налаштування адміністратора.</p>
            <div class="profile-info">
              <p><strong>Логін:</strong> <span id="profileUsername"></span></p>
              <p><strong>Email:</strong> <span id="profileEmail"></span></p>
              <p><strong>Роль:</strong> <span id="profileRole"></span></p>
            </div>
            <div class="admin-panel hidden" id="adminPanel">
              <h3>Адмін-панель</h3>
              <p>Тут власник сайту може призначити іншого користувача адміністратором.</p>
              <form class="auth-form" id="adminAssignForm">
                <label>Email нового адміністратора
                  <input type="email" name="targetEmail" placeholder="example@mail.com" required>
                </label>
                <button class="button button-primary" type="submit">Назначить админом</button>
              </form>
              <div class="auth-message admin-message" id="adminMessage"></div>
            </div>
            <div class="active-records-panel hidden" id="activeRecordsPanel">
              <h3>Активные записи</h3>
              <p>Перейдите на страницу просмотра текущих бронювань.</p>
              <button class="button button-secondary" type="button" id="activeRecordsButton">Перейти до активних записів</button>
            </div>
            <div class="profile-logout-panel hidden" id="profileLogoutPanel">
              <button class="button button-outline" type="button" id="profileLogoutButton">Вийти</button>
            </div>
          </div>
        </div>
        <div class="auth-message" id="authMessage"></div>
      </div>
    </div>
  `;

  document.body.appendChild(createElementFromHTML(markup));

  document.getElementById('authClose').addEventListener('click', closeAuthModal);
  document.getElementById('authOverlay').addEventListener('click', event => {
    if (event.target.id === 'authOverlay') {
      closeAuthModal();
    }
  });
  document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', event => switchAuthTab(event.target.dataset.tab)));
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  const adminForm = document.getElementById('adminAssignForm');
  if (adminForm) {
    adminForm.addEventListener('submit', handleAdminAssign);
  }
  const recordsButton = document.getElementById('activeRecordsButton');
  if (recordsButton) {
    recordsButton.addEventListener('click', () => {
      window.location.href = 'active-records.html';
    });
  }
  const profileLogoutButton = document.getElementById('profileLogoutButton');
  if (profileLogoutButton) {
    profileLogoutButton.addEventListener('click', () => {
      logout();
      closeAuthModal();
    });
  }
};

const updateAuthModalForUser = () => {
  const tabs = document.querySelectorAll('.auth-tab');
  const panels = document.querySelectorAll('.auth-panel');
  if (!currentUser) {
    tabs.forEach(tab => tab.classList.remove('hidden'));
    panels.forEach(panel => panel.classList.remove('hidden'));
    return;
  }

  tabs.forEach(tab => {
    tab.classList.toggle('hidden', tab.dataset.tab !== 'profile');
  });
  panels.forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== 'profilePanel');
    panel.classList.toggle('active', panel.id === 'profilePanel');
  });
};

const openAuthModal = tabName => {
  injectAuthModal();
  updateAuthModalForUser();
  const effectiveTab = currentUser ? 'profile' : (tabName === 'profile' ? 'login' : tabName || 'login');
  switchAuthTab(effectiveTab);
  const overlay = document.getElementById('authOverlay');
  overlay.classList.remove('hidden');
  showMessage('');
};

const closeAuthModal = () => {
  const overlay = document.getElementById('authOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
};

const switchAuthTab = tabName => {
  const tabs = document.querySelectorAll('.auth-tab');
  const panels = document.querySelectorAll('.auth-panel');
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
  panels.forEach(panel => panel.classList.toggle('active', panel.id === `${tabName}Panel`));
  if (tabName === 'profile') {
    renderProfilePanel();
  }
  showMessage('');
};

const renderProfilePanel = () => {
  const usernameNode = document.getElementById('profileUsername');
  const emailNode = document.getElementById('profileEmail');
  const roleNode = document.getElementById('profileRole');
  const adminPanel = document.getElementById('adminPanel');
  const adminMessage = document.getElementById('adminMessage');
  if (!usernameNode || !emailNode || !roleNode || !adminPanel) return;

  if (!currentUser) {
    usernameNode.textContent = '-';
    emailNode.textContent = '-';
    roleNode.textContent = 'Гість';
    adminPanel.classList.add('hidden');
    const activeRecordsPanel = document.getElementById('activeRecordsPanel');
    if (activeRecordsPanel) {
      activeRecordsPanel.classList.add('hidden');
    }
    const logoutPanel = document.getElementById('profileLogoutPanel');
    if (logoutPanel) {
      logoutPanel.classList.add('hidden');
    }
    if (adminMessage) adminMessage.textContent = '';
    return;
  }

  usernameNode.textContent = currentUser.username;
  emailNode.textContent = currentUser.email || '-';
  roleNode.textContent = currentUser.isAdmin ? 'Адмін' : 'Користувач';
  adminPanel.classList.toggle('hidden', !currentUser.isAdmin);
  const activeRecordsPanel = document.getElementById('activeRecordsPanel');
  if (activeRecordsPanel) {
    activeRecordsPanel.classList.toggle('hidden', !currentUser.isAdmin);
  }
  const logoutPanel = document.getElementById('profileLogoutPanel');
  if (logoutPanel) {
    logoutPanel.classList.remove('hidden');
  }
  if (adminMessage) adminMessage.textContent = '';
};

const logout = () => {
  currentUser = null;
  localStorage.removeItem(HUMREY_AUTH_KEY);
  updateHeaderButtons();
  showMessage('Ви вийшли з акаунту.', 'success');
};

const handleAdminAssign = async event => {
  event.preventDefault();
  if (!currentUser?.isAdmin) {
    showMessage('Ви повинні бути адміністратором.', 'error');
    return;
  }

  const form = event.target;
  const formData = new FormData(form);
  const targetEmail = String(formData.get('targetEmail') || '').trim().toLowerCase();
  const adminMessage = document.getElementById('adminMessage');
  if (!targetEmail) {
    if (adminMessage) adminMessage.textContent = 'Вкажіть email.';
    return;
  }

  try {
    const response = await fetch(`${AUTH_API_BASE}/assign-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUsername: currentUser.username, targetEmail }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (adminMessage) adminMessage.textContent = result.error || 'Не вдалося призначити адміністратора.';
      return;
    }
    if (adminMessage) adminMessage.textContent = result.message || 'Права адміністрування оновлено.';
  } catch (error) {
    if (adminMessage) adminMessage.textContent = 'Не вдалося зʼєднатися із сервером.';
  }
};

const handleLogin = async event => {
  event.preventDefault();
  const form = event.target;
  const data = {
    username: form.username.value.trim(),
    password: form.password.value.trim(),
  };
  if (!data.username || !data.password) {
    showMessage('Заповніть логін і пароль.', 'error');
    return;
  }

  try {
    const response = await fetch(`${AUTH_API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      showMessage(result.error || 'Помилка при вході.', 'error');
      return;
    }
    currentUser = normalizeUser(result.user || { username: data.username, email: '', isAdmin: false });
    saveCurrentUser(currentUser);
    updateHeaderButtons();
    showMessage(result.message || 'Вхід успішний.', 'success');
    setTimeout(closeAuthModal, 900);
  } catch (error) {
    showMessage('Не вдалося зʼєднатися із сервером.', 'error');
  }
};

const handleRegister = async event => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = {
    username: String(formData.get('username') || '').trim(),
    password: String(formData.get('password') || '').trim(),
    confirmPassword: String(formData.get('confirmPassword') || '').trim(),
    email: String(formData.get('email') || '').trim().toLowerCase(),
  };

  if (!data.username || !data.password || !data.confirmPassword || !data.email) {
    showMessage('Заповніть всі поля.', 'error');
    return;
  }

  if (!/^\S+@\S+\.\S+$/.test(data.email)) {
    showMessage('Введіть дійсний email.', 'error');
    return;
  }

  try {
    const response = await fetch(`${AUTH_API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      showMessage(result.error || 'Помилка при реєстраціі.', 'error');
      return;
    }

    currentUser = normalizeUser(result.user || { username: data.username, email: data.email, isAdmin: false });
    saveCurrentUser(currentUser);
    updateHeaderButtons();
    showMessage(result.message || 'Реєстрацію успішно завершено.', 'success');
    setTimeout(closeAuthModal, 900);
  } catch (error) {
    showMessage('Не вдалося зʼєднатися із сервером.', 'error');
  }
};

const handleVerify = async event => {
  event.preventDefault();
  const form = event.target;
  const code = form.code.value.trim();
  const username = pendingUsername;
  if (!username || !code) {
    showMessage('Вкажіть код із SMS.', 'error');
    return;
  }

  try {
    const response = await fetch(`${AUTH_API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code }),
    });
    const result = await response.json();
    if (!response.ok) {
      showMessage(result.error || 'Неправильний код.', 'error');
      return;
    }
    currentUser = username;
    localStorage.setItem(HUMREY_AUTH_KEY, currentUser);
    updateHeaderButtons();
    showMessage(result.message || 'Телефон підтверджено.', 'success');
    setTimeout(closeAuthModal, 900);
  } catch (error) {
    showMessage('Не вдалося зʼєднатися із сервером.', 'error');
  }
};

const handleResendCode = async () => {
  if (!pendingUsername) {
    showMessage('Вкажіть логін для повторноі відправки.', 'error');
    return;
  }

  try {
    const response = await fetch(`${AUTH_API_BASE}/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: pendingUsername }),
    });
    const result = await response.json();
    if (!response.ok) {
      showMessage(result.error || 'Не вдалося повторно надіслати код.', 'error');
      return;
    }
    showMessage(result.message || 'Код повторно надіслано.', 'success');
  } catch (error) {
    showMessage('Не вдалося зʼєднатися із сервером.', 'error');
  }
};

const initAuth = () => {
  injectAuthControls();
  injectAuthModal();
  updateHeaderButtons();
};

document.addEventListener('DOMContentLoaded', initAuth);



