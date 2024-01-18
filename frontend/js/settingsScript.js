const settingsScreen = document.getElementById('settings-screen');
const themeSelect = document.getElementById('theme-select');
const saveSettingsButton = document.getElementById('save-settings');
const changePasswordForm = document.getElementById('change-password-form');
const changeUsernameForm = document.getElementById('change-username-form');
const toggleChangePasswordButton = document.getElementById('toggle-change-password-button');
const toggleChangeUsernameButton = document.getElementById('toggle-change-username-button');

changePasswordForm.style.display = 'none';
let display = false;

saveSettingsButton.addEventListener('click', saveSettings);
console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

function changeUrlToChat(url) {
  window.location.href = url;
}

function toggleChangePassword() {
  if (!display) {
    changePasswordForm.style.display = 'block';
    toggleChangePasswordButton.textContent = 'Скасувати';
    display = true;
  } else {
    changePasswordForm.style.display = 'none';
    toggleChangePasswordButton.textContent = 'Змінити пароль';
    display = false;
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;

  try {
    const response = await fetch('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await response.json();
    if (data.success) {
      alert('Пароль успішно змінено.');
    } else {
      alert(data.message || 'Помилка зміни пароля.');
    }
  } catch (error) {
    console.error('Помилка:', error);
    alert('Помилка з’єднання з сервером.');
  }
}

async function logout() {
  if (!confirm('Ви впевнені, що хочете вийти? Потім зайти можна тільки за паролем.')) {
    return;
  }
  try {
    const response = await fetch('/logout', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      window.location.href = '/';
    } else {
      alert('Помилка при виході з акаунту.');
    }
  } catch (error) {
    alert('Помилка з’єднання з сервером.');
    console.error('Error:', error);
  }
}

async function deleteAccount() {
  const password = prompt('Будь ласка, введіть ваш пароль для підтвердження видалення акаунту:');

  try {
    const response = await fetch('/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    if (data.success) {
      window.location.href = '/';
    } else {
      alert('Видалення акаунту скасовано. Пароль неправильний.');
    }
  } catch (error) {
    alert('Помилка з’єднання з сервером.');
    console.error('Error:', error);
  }
}

async function saveSettings() {
  const selectedTheme = themeSelect.value;
  try {
    const response = await fetch('/save-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: selectedTheme })
    });
    const data = await response.json();
    if (data.success) {
      changeUrlToChat('chat.html');
    } else {
      alert('Помилка збереження теми.');
    }
  } catch (error) {
    alert('Помилка збереження налаштувань.');
    console.error('Error:', error);
  }
}