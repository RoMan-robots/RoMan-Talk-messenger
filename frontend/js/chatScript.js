const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messageList = document.getElementById('message-list');
const serverDropdown = document.getElementById('server-dropdown');
const channelList = document.getElementById('channel-list');
const settingsButton = document.getElementById('settings');
const chatContainer = document.getElementById('chat-container');
const socket = io();

let isDropdownActive = true;
let currentUsername;

async function getCurrentUsername() {
    try {
        const response = await fetch('/username');
        const data = await response.json();

        if (response.status === 403) {
            window.location.href = '/';
            return;
        }

        if (data.username) {
            currentUsername = data.username;
            applyTheme(data.theme);
            loadMessages("RoMan World Official");
            loadUserChannels();
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Помилка при отриманні імені користувача:', error);
        window.location.href = '/';
    }
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.textContent = message;
    messageList.appendChild(messageElement);
}

async function loadMessages(channelName) {
  try {
      const response = await fetch(`/channel-messages/${channelName}`);
      const data = await response.json();

      const channel = data.channels.find(c => c.name === channelName);
      if (channel && Array.isArray(channel.messages)) {
          channel.messages.forEach(message => {
              displayMessage(`${message.author}: ${message.context}`);
          });
      } else {
          console.error('Немає повідомлень для відображення в каналі', channelName);
      }
  } catch (error) {
      console.error('Помилка при завантаженні повідомлень для каналу', channelName, ':', error);
  }
}


async function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      try {
        const messageObject = { author: currentUsername, context: message };
        await fetch('/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageObject)
        });
        messageInput.value = '';
      } catch (error) {
        console.error('Помилка при відправленні повідомлення:', error);
      }
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

async function loadUserChannels() {
  try {
    const response = await fetch('/user-channels');
    const data = await response.json();
    if (response.ok) {
      const channelListElement = document.getElementById('channel-list');
      data.channels.forEach(channel => {
        const channelButton = document.createElement('button');
        channelButton.textContent = channel;
        channelButton.onclick = () => {
          loadMessages(channel);
        };
        channelListElement.appendChild(channelButton);
      });
    } else {
      console.error(data.message);
    }
  } catch (error) {
    console.error('Помилка при завантаженні каналів:', error);
  }
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

function changeUrlToSettings(url) {
    window.location.href = url;
}

getCurrentUsername();
console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.");

socket.on('chat message', (msg) => {
    if (msg.author && msg.context) {
      displayMessage(`${msg.author}: ${msg.context}`);
    }
  });
