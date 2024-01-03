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

function handleChannelClick(event) {
  displayMessage(`Це тестова кнопка, яка нажаль не переводить в інший чат...`);
}

async function loadMessages() {
  try {
    const response = await fetch('/messages');
    const data = await response.json();
    data.messages.forEach(message => {
      displayMessage(`${message.author}: ${message.context}`);
    });
  } catch (error) {
    console.error('Помилка при завантаженні повідомлень:', error);
  }
}


async function sendMessage() {
  const message = messageInput.value;
  const username = await getLoggedInUser();
  if (!username) return;

  try {
    await fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: username, context: message })
    });
    displayMessage(`${username}: ${message}`);
    messageInput.value = '';
  } catch (error) {
    console.error('Помилка при відправленні повідомлення:', error);
  }
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
loadMessages();

function changeUrlToSettings(url) {
  window.location.href = url;
}