const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messageList = document.getElementById('message-list');
const serverDropdown = document.getElementById('server-dropdown');
const channelList = document.getElementById('channel-list');
const settingsButton = document.getElementById('settings');  

let isDropdownActive = true;

function displayMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.textContent = message;
  messageList.appendChild(messageElement);
}

async function getLoggedInUser() {
  try {
    const response = await fetch('/username');
    const data = await response.json();
    return data.username;
  } catch (error) {
    console.error('Помилка при отриманні імені користувача', error);
    window.location.href = '/login.html';
  }
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

function handleChannelClick(event) {
  displayMessage('Це тестова кнопка, яка нажаль не переводить в інший чат...');
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