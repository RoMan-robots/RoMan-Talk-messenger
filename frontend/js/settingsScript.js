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

function saveSettings() {
  const selectedTheme = themeSelect.value;
  if (selectedTheme === 'dark') {
    chatContainer.classList.add('dark-theme');
  } else {
    chatContainer.classList.remove('dark-theme');
  }
  chatContainer.style.display = 'flex';
  settingsScreen.style.display = 'none';
}