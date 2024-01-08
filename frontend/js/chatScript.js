const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messageList = document.getElementById('message-list');
const serverDropdown = document.getElementById('server-dropdown');
const channelList = document.getElementById('channel-list');
const settingsButton = document.getElementById('settings');
const chatContainer = document.getElementById('chat-container');

let isDropdownActive = true;
let currentUsername;

async function getCurrentUsername() {
  try {
    const response = await fetch('/username');
        const data = await response.json();
        if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
            return;
        }
        if (data.username) {
            currentUsername = data.username;
            applyTheme(data.theme);
            displayWelcomeMessage();
            loadMessages();
        }
  } catch (error) {
    console.error('Помилка при отриманні імені користувача:', error);
  }
}

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
    data.forEach(message => {
      displayMessage(`${message.author}: ${message.context}`);
    });
  } catch (error) {
    console.error('Помилка при завантаженні повідомлень:', error);
  }
}

async function sendMessage() {
  const message = messageInput.value;
  try {
    await fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: currentUsername, context: message })
    });
    displayMessage(`${currentUsername}: ${message}`);
    messageInput.value = '';
  } catch (error) {
    console.error('Помилка при відправленні повідомлення:', error);
  }
}

messageInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
});

function toggleDropdown() {
  isDropdownActive = !isDropdownActive;
  channelList.classList.toggle('active', isDropdownActive);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

function displayWelcomeMessage() {
    displayMessage(`Вітаємо в RoMan Talk, ${currentUsername}!`);
}

function changeUrlToSettings(url) {
  window.location.href = url;
}

getCurrentUsername();
console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

function sendPeriodicAdvertisement() {
  setInterval(() => {
    const chance = Math.random();
    if (chance < 0.31) {
      const adMessage = "Нудно спілкуватись? Пограй у GO:TA з друзями! Типу силка шоб скачать гру";
      displayMessage(`Реклама: ${adMessage}`);
    }
  }, 25000);
}

sendPeriodicAdvertisement();
