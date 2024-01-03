const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messageList = document.getElementById('message-list');
const serverDropdown = document.getElementById('server-dropdown');
const channelList = document.getElementById('channel-list');
const settingsButton = document.getElementById('settings');
const chatContainer = document.getElementById('chat-container');

let isDropdownActive = true;

function displayMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.textContent = message;
  messageList.appendChild(messageElement);
}

async function sendMessage() {
  const username = await getLoggedInUser();
  if (!username) return;

  const message = messageInput.value;
  displayMessage(`${username}: ${message}`);
  messageInput.value = '';
}

function toggleDropdown() {
  isDropdownActive = !isDropdownActive;
  channelList.classList.toggle('active', isDropdownActive);
}

async function getLoggedInUser() {
  try {
    const response = await fetch('/username');
    const data = await response.json();
    if (data.username) {
      applyTheme(data.theme);
      return data.username;
    } else {
      window.location.href = '/login.html';
    }
  } catch (error) {
    console.error('Помилка при отриманні імені користувача:', error);
    window.location.href = '/login.html';
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

async function displayWelcomeMessage() {
  const username = await getLoggedInUser();
  if (username) {
    displayMessage(`Вітаємо в RoMan Talk, ${username}!`);
  }
}

displayWelcomeMessage();

function changeUrlToSettings(url) {
  window.location.href = url;
}