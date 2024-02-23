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
let selectedChannel = 'RoMan World Official';

async function getCurrentUsername() {
    try {
        const response = await fetch('/username', {
          credentials: 'include'
        });
        const data = await response.json();

        if (response.status === 403) {
            window.location.href = '/';
            return;
        }

        if (data.username) {
            currentUsername = data.username;
            applyTheme(data.theme);
            loadMessages(selectedChannel);
            loadUserChannels();
            loadChannelButtons();

            if ("Notification" in window) {
              Notification.requestPermission();
            }
            
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
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    messageList.innerHTML = '';
    const channel = data.channels.find(c => c.name === channelName);
    if (channel && Array.isArray(channel.messages)) {
      channel.messages.forEach(message => {
        displayMessage(`${message.author}: ${message.context}`);
      });
    }
  } catch (error) {
    alertify.error(`Канал ${channelName} не знайдено`);
  }
}

async function sendMessage() {
  const message = messageInput.value.trim();
  if (message) {
    try {
      const messageObject = 
      { author: currentUsername, 
        context: message, 
        channel: selectedChannel };
      await fetch('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageObject)
      });
      messageInput.value = '';
    } catch (error) {
      console.error('Помилка при відправленні повідомлення:', error);
      alertify.error('Помилка при відправленні повідомлення:', error);
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
      channelListElement.innerHTML = '';

      const createChannelButton = document.createElement('button');
      createChannelButton.id = 'create-channel-button';
      createChannelButton.textContent = 'Створити канал';
      createChannelButton.onclick = createChannelModal;
      channelListElement.appendChild(createChannelButton);

      const exploreChannelButton = document.createElement('button');
      exploreChannelButton.id = 'explore-channels-button';
      exploreChannelButton.textContent = 'Досліджувати канали';
      exploreChannelButton.onclick = openExploreChannelsModal;
      channelListElement.appendChild(exploreChannelButton);

      data.channels.forEach(channel => {
        const channelButton = document.createElement('button');
        channelButton.textContent = channel;
        channelButton.onclick = () => {
          selectedChannel = channel;
          loadMessages(channel);
        };
        channelListElement.appendChild(channelButton);
      });
    } else {
      console.error(data.message);
      alertify.error(data.message);
    }
  } catch (error) {
    console.error('Помилка при завантаженні каналів:', error);
    alertify.error('Помилка при завантаженні каналів:', error);
  }
}


function createChannelModal() {
  document.getElementById("create-channel-modal").style.display = "block";
}

function closeModal() {
  document.getElementById("create-channel-modal").style.display = "none";
}

function openExploreChannelsModal() {
  document.getElementById("explore-channels-modal").style.display = "block";
  loadChannelButtons();
}

function closeExploreModal() {
  document.getElementById("explore-channels-modal").style.display = "none";
}

function createNewChannel() {
  const channelName = document.getElementById("new-channel-name").value;

  fetch('/create-channel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelName: channelName })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      loadUserChannels();
      loadMessages(channelName);
    } else {
      console.error(data.message);
      alertify.error(data.message);
    }
  })
  .catch(error => {
    console.error('Помилка при створенні каналу:', error);
    alertify.error('Помилка при створенні каналу:', error);
  });
  closeModal();
}

async function loadChannelButtons() {
  try {
    const response = await fetch('/get-channels');
    const data = await response.json();
    if (response.ok) {
      const channelButtonsContainer = document.getElementById('channel-buttons');
      channelButtonsContainer.innerHTML = '';
      data.channels.forEach(channel => {
        const channelButton = document.createElement('button');
        channelButton.textContent = channel.name;
        channelButton.classList.add('channel-button');
        channelButton.onclick = () => joinChannel(channel.name);
        channelButtonsContainer.appendChild(channelButton);
      });
    } else {
      console.error('Помилка при завантаженні каналів:', data.message);
      alertify.error('Помилка при завантаженні каналів:', data.message);
    }
  } catch (error) {
    console.error('Помилка при завантаженні каналів:', error);
    alertify.error('Помилка при завантаженні каналів:', error);
  }
}

async function joinChannel(channelName) {
  try {
    const response = await fetch('/add-channel-to-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName: channelName })
    });
    const data = await response.json();
    if (data.success) {
      selectedChannel = channelName;
      socket.emit('join channel', channelName);
      loadUserChannels();
      closeExploreModal();
      loadMessages(channelName);
    } else {
      console.error('Помилка при додаванні каналу:', data.message);
      alertify.error('Помилка при додаванні каналу:', data.message);

    }
  } catch (error) {
    console.error('Помилка при спробі додати канал:', error);
    alertify.error('Помилка при спробі додати канал:', error);
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

socket.on('chat message', (channel, msg) => {
  if (msg.author && msg.context && channel == selectedChannel) {
      displayMessage(`${msg.author}: ${msg.context}`);
  }
});