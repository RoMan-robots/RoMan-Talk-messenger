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

function sendMessage() {
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
function displayWelcomeMessage() {
  displayMessage(`Вітаємо в RoMan Talk!`);
}

displayWelcomeMessage();

function changeUrlToSettings(url) {
  window.location.href = url;
}