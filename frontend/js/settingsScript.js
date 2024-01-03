const settingsScreen = document.getElementById('settings-screen');
const themeSelect = document.getElementById('theme-select');
const saveSettingsButton = document.getElementById('save-settings');

saveSettingsButton.addEventListener('click', saveSettings);

function changeUrlToChat(url) {
  window.location.href = url;
}

function openSettings() {
  chatContainer.style.display = 'none';
  settingsScreen.style.display = 'block';
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
      alert('Тема успішно збережена.');
      changeUrlToChat('chat.html');
    } else {
      alert('Помилка збереження теми.');
    }
  } catch (error) {
    alert('Помилка збереження налаштувань.');
    console.error('Error:', error);
  }
}
