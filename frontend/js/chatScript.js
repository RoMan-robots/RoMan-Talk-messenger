const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messageList = document.getElementById('message-list');
const serverDropdown = document.getElementById('server-dropdown');
const channelList = document.getElementById('channel-list');
const settingsButton = document.getElementById('settings');

let isDropdownActive = false;

sendButton.addEventListener('click', sendMessage());
serverDropdown.addEventListener('click', toggleDropdown());
channelList.addEventListener('click', handleChannelClick());
settingsButton.addEventListener('click', () => changeUrlToSettings("settings.html"));

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
  if (event.target.matches('button')) {
    const channelName = event.target.textContent;
    displayMessage(`Ви перейшли до каналу: ${channelName}`);
  }
}

export function changeUrlToSettings(url) {
  window.location.href = url;
}