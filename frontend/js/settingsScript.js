const settingsScreen = document.getElementById('settings-screen');
const themeSelect = document.getElementById('theme-select');
const saveSettingsButton = document.getElementById('save-settings');

saveSettingsButton.addEventListener('click', saveSettings);

function changeUrlToChat(url) {
  window.location.href = url;
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