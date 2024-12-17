const originalFetch = window.fetch;

const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
const baseURL = isElectron ? 'https://roman-talk.onrender.com' : '';

window.fetch = function (...args) {
  if (typeof args[0] === 'string' && !args[0].startsWith('http')) {
    args[0] = `${baseURL}${args[0].startsWith('/') ? args[0] : '/' + args[0]}`;
  }
  console.log('Modified URL:', args[0]);
  return originalFetch(...args);
};

const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messageList = document.getElementById('message-list');
const serverDropdown = document.getElementById('server-dropdown');
const channelList = document.getElementById('channel-list');
const settingsButton = document.getElementById('settings');
const chatContainer = document.getElementById('chat-container');
const sortModal = document.getElementById('sort-modal');
const fileInput = document.getElementById('file-input');

const socket = io(baseURL);
const welcomeSound = new Audio('/welcomeSound.mp3');
const newMessageSound = new Audio("/newMessageSound.mp3");
const newUserSound = new Audio("/newUserSound.mp3");

const token = localStorage.getItem('token');

let isDropdownActive = false;
let isChannelInfoActive = false;
let currentUsername;

let editMode = false;
let selectedPhotoFiles = [];
let selectedChannel = 'RoMan_World_Official';

const typingIndicator = document.getElementById("typing");
const whoTyping = document.getElementById("who-typing");

let typingUsers = new Set();
let isTyping = false;
const typingCheckDelay = 100;
let typingTimeout;

const scrollButton = document.getElementById('scroll-to-bottom');

function updateVh() {
  const vh = window.innerHeight * 0.3;
  document.documentElement.style.setProperty('--real-vh', `${vh}px`);
}

window.addEventListener('resize', updateVh);
window.addEventListener('load', updateVh);

const NUMBER_OF_SNOWFLAKES = 100;
const MAX_SNOWFLAKE_SIZE = 4;
const MAX_SNOWFLAKE_SPEED = 1.5;
const SNOWFLAKE_COLOUR = '#ddd';
const snowflakes = [];

const canvas = document.createElement('canvas');
canvas.style.position = 'absolute';
canvas.style.pointerEvents = 'none';
canvas.style.top = '0px';
canvas.style.zIndex = '100000';
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');


const createSnowflake = () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  radius: Math.floor(Math.random() * MAX_SNOWFLAKE_SIZE) + 1,
  color: SNOWFLAKE_COLOUR,
  speed: Math.random() * MAX_SNOWFLAKE_SPEED + 1,
  sway: Math.random() - 0.5 // next
});

const drawSnowflake = snowflake => {
  ctx.beginPath();
  ctx.arc(snowflake.x, snowflake.y, snowflake.radius, 0, Math.PI * 2);
  ctx.fillStyle = snowflake.color;
  ctx.fill();
  ctx.closePath();
}

const updateSnowflake = snowflake => {
  snowflake.y += snowflake.speed;
  snowflake.x += snowflake.sway; // next
  if (snowflake.y > canvas.height) {
    Object.assign(snowflake, createSnowflake());
  }
}

const animate = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  snowflakes.forEach(snowflake => {
    updateSnowflake(snowflake);
    drawSnowflake(snowflake);
  });

  requestAnimationFrame(animate);
}

for (let i = 0; i < NUMBER_OF_SNOWFLAKES; i++) {
  snowflakes.push(createSnowflake());
}

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

window.addEventListener('scroll', () => {
  canvas.style.top = `${window.scrollY}px`;
});

animate()

async function getCurrentUsername() {
  try {
    const response = await fetch('/username', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();

    if (response.status === 403) {
      window.location.href = '/';
      return;
    }

    if (data.username) {
      currentUsername = data.username;
      applyTheme(data.theme);
      loadMessages(selectedChannel)
      loadUserChannels();
      loadChannelButtons();
      messageInput.focus()
    } else {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Помилка при отриманні імені користувача:', error);
    window.location.href = '/';
  }
}

function displayMessage(message, id) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.dataset.index = id;
  messageElement.dataset.date = message.date;

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');

  if (message.replyTo) {
    const replyElement = document.createElement('div');
    replyElement.classList.add('reply-to');

    const originalMessage = document.querySelector(`.message[data-index='${message.replyTo}']`);
    if (originalMessage) {
      const originalText = originalMessage.querySelector('p').textContent;
      const originalAuthor = originalText.split(':')[0];
      replyElement.innerHTML = `
        <span class="reply-author"><i class="fa-solid fa-pen-to-square"></i>  ${originalAuthor}</span>
        <span class="reply-text">   ${originalText.split(':')[1]}</span>
      `;

      replyElement.addEventListener('click', () => {
        originalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });

        originalMessage.classList.add('highlight-message');

        setTimeout(() => {
          originalMessage.classList.remove('highlight-message');
        }, 1500);
      });

      messageContent.appendChild(replyElement);
    }
  }

  const messageP = document.createElement('p');
  messageP.textContent = message.context.includes(':') ?
    message.context :
    `${message.author}: ${message.context}`;
  messageContent.appendChild(messageP);

  if (message.photo) {
    const img = document.createElement('img');
    img.src = `${baseURL}/photos/${selectedChannel}/${message.photo}`;
    img.alt = 'Фото повідомлення';
    img.classList.add('message-photo');
    messageContent.appendChild(img);
  }

  messageElement.appendChild(messageContent);

  const messageOptions = document.createElement('button');
  messageOptions.classList.add('message-options');
  messageOptions.textContent = '...';
  messageOptions.onclick = () => {
    openMessageOptionsMenu(id);
  };

  messageElement.appendChild(messageOptions);
  messageList.appendChild(messageElement);

  setTimeout(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

async function openMessageOptionsMenu(messageId, count = 0) {
  const menu = document.getElementById("message-options-menu");
  menu.dataset.messageId = messageId;
  let messageElement = null;

  const visibleMessages = Array.from(document.querySelectorAll('.message')).filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });

  document.querySelectorAll('.message').forEach((element) => {
    if (element.dataset.index == messageId) {
      messageElement = element;
    }
  });

  if (messageElement) {
    let date = "Невідома дата відправлення";
    if (messageElement.dataset.date != "undefined") {
      date = messageElement.dataset.date + "(Київ)";
    }
    document.getElementById("kyiv-time-input").textContent = date;
    const rect = messageElement.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;

    const messageIndex = visibleMessages.indexOf(messageElement);
    
    let top;
    if (messageIndex >= 0 && messageIndex < 8) {
      top = rect.bottom;
    } else {
      top = rect.top - menuHeight;
    }

    let left = rect.left;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    if (count < 1) {
      setTimeout(() => {
        menu.classList.remove('message-options-menu-hide');
        menu.classList.add('message-options-menu-visible');
        openMessageOptionsMenu(messageId, count + 1);
      }, 0);
    }
  }
}

document.addEventListener('click', (event) => {
  const menu = document.getElementById("message-options-menu");
  if (!menu.contains(event.target)) {
    menu.classList.remove('message-options-menu-visible');
    menu.classList.add('message-options-menu-hide');
  }
});

async function loadMessages(channelName) {
  socket.emit('stop typing', { channel: selectedChannel, username: currentUsername });
  try {
    const response = await fetch(`/channel-messages/${channelName}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();

    messageList.innerHTML = '';

    if (data.channels && Array.isArray(data.channels)) {
      const channel = data.channels.find(c => c.name === channelName);

      if (channel && Array.isArray(channel.messages)) {
        channel.messages.forEach(message => {
          displayMessage({ context: `${message.author}: ${message.context}`, photo: message.photo, date: message.date, replyTo: message.replyTo }, message.id);
        });

        typingUsers = new Set(channel.typingUsers);
        updateTypingIndicator();
      } else {
        console.error(`Канал "${channelName}" не знайдено або у каналу немає повідомлень.`);
        alertify.error(`Канал "${channelName}" не знайдено або у каналу немає повідомлень.`);
      }
    } else {
      console.error('Невірна структура даних з сервера:', data);
      alertify.error('Невірна структура даних з сервера.');
    }
  } catch (error) {
    console.error('Помилка при завантаженні повідомлень:', error);
    alertify.error(`Канал ${channelName} не знайдено`);
  }
}

async function sendMessage() {
  const message = messageInput.value.trim();
  const messageId = messageInput.dataset.editId;
  const replyToId = messageInput.dataset.replyToId;

  if (!message) {
    return alertify.error("Не можна відправляти пусті повідомлення!");
  }

  const date = new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const actions = [
    {
      condition: () => editMode,
      action: async () => {
        const response = await fetch(`/update-message/${messageId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ channelName: selectedChannel, newContent: message })
        });
        const data = await response.json();
        if (data.success) {
          editMode = false;
          document.querySelector(`.message[data-index='${messageId}'] p`).textContent =
            `${currentUsername}: ${message}`;
          document.getElementById("edit-message").className = "edit-message-invisible";
        }
        alertify.success('Повідомлення відредаговано!');
        return data;
      }
    },
    {
      condition: () => selectedPhotoFiles.length > 0,
      action: async () => {
        const formData = new FormData();
        Object.entries({
          channelName: selectedChannel,
          author: currentUsername,
          context: message,
          date,
          ...(replyToId && { replyTo: replyToId })
        }).forEach(([key, value]) => formData.append(key, value));

        selectedPhotoFiles.forEach(file => {
          formData.append('photo', file, file.name.replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, '_'));
        });

        const response = await fetch('/upload-photo-message', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
          body: formData
        });
        return response.json();
      }
    },
    {
      condition: () => true,
      action: async () => {
        const response = await fetch('/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            author: currentUsername,
            context: message,
            channel: selectedChannel,
            date,
            ...(replyToId && { replyTo: replyToId })
          })
        });
        return response.json();
      }
    }
  ];

  try {
    const { action } = actions.find(({ condition }) => condition());
    const data = await action();

    if (data.success) {
      messageInput.value = '';

      if (replyToId) {
        messageInput.dataset.replyToId = '';
        document.getElementById("message-answer").className = "message-answer-invisible";
      }

      if (selectedPhotoFiles.length > 0) {
        selectedPhotoFiles = [];
        const uploadFilesDiv = document.getElementById("upload-files");
        uploadFilesDiv.querySelector("ul").innerHTML = '';
        uploadFilesDiv.className = "upload-files-invisible";
      }
    } else {
      alertify.error(data.message || 'Не вдалося виконати дію!');
    }
  } catch (error) {
    console.error('Error:', error);
    alertify.error('Виникла помилка під час обробки вашого запиту.');
  }
}

function showUploadFilesSection(fileName, fileIndex) {
  const uploadFilesDiv = document.getElementById("upload-files");
  const fileList = uploadFilesDiv.querySelector("ul");

  const listItem = document.createElement("li");
  listItem.textContent = fileName;
  listItem.dataset.fileIndex = fileIndex;

  listItem.addEventListener("click", function () {
    const index = listItem.dataset.fileIndex;

    selectedPhotoFiles = selectedPhotoFiles.filter((_, i) => i != index);

    listItem.remove();

    if (selectedPhotoFiles.length === 0) {
      uploadFilesDiv.classList.remove("upload-files-visible");
      uploadFilesDiv.classList.add("upload-files-invisible");
    }
  });

  fileList.appendChild(listItem);

  uploadFilesDiv.classList.remove("upload-files-invisible");
  uploadFilesDiv.classList.add("upload-files-visible");
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

function toggleChannelInfo() {
  isChannelInfoActive = !isChannelInfoActive;
  document.getElementById('channel-info').classList.toggle('active', isChannelInfoActive);
}

document.getElementById('channel-info-button').onclick = toggleChannelInfo;

function loadChannelManagementButtons() {
  const channelListElement = document.getElementById('management-buttons');
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

  const sortChannelsButton = document.createElement('button');
  sortChannelsButton.id = 'sort-channels-button';
  sortChannelsButton.textContent = 'Сортувати канали';
  channelListElement.appendChild(sortChannelsButton);

  sortChannelsButton.addEventListener('click', () => {
    sortModal.style.display = 'block';
  });
}

async function loadUserChannels() {
  try {
    const response = await fetch('/user-channels', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (response.ok) {
      const channelListElement = document.getElementById('channels');
      channelListElement.innerHTML = '';
      loadChannelManagementButtons();

      data.channels.forEach(channel => {
        const channelButton = document.createElement('button');
        channelButton.textContent = channel;
        channelButton.classList.add("user-channel-button")
        channelButton.onclick = () => {
          messageInput.value = '';
          loadMessages(channel);
          selectedChannel = channel;
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

async function sortChannels(type) {
  try {
    const response = await fetch(`/sorted-channels/${type}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();

    if (data.success) {
      const channelListElement = document.getElementById('channels');
      channelListElement.innerHTML = '';
      loadChannelManagementButtons();

      data.channels.forEach(channel => {
        const channelButton = document.createElement('button');
        channelButton.classList.add("user-channel-button")
        channelButton.textContent = channel;
        channelButton.onclick = () => {
          messageInput.value = '';
          loadMessages(channel);
          selectedChannel = channel;
        };
        channelListElement.appendChild(channelButton);
      });

      document.getElementById('sort-modal').style.display = 'none';
      alertify.success("Канали відсортовано успішно");
    } else {
      console.error(data.message);
      alertify.error('Помилка при сортуванні каналів');
    }
  } catch (error) {
    console.error('Помилка при сортуванні каналів:', error);
    alertify.error('Помилка при сортуванні каналів:', error);
  }
}

function createChannelModal() {
  document.getElementById("create-channel-modal").style.display = "block";
}

function closeModal(element) {
  if (typeof element === 'string') {
    const modalElement = document.getElementById(element);
    if (modalElement) {
      if (element === 'edit-message') {
        modalElement.classList.remove("edit-message-visible");
        modalElement.classList.add("edit-message-invisible");
        messageInput.value = '';
        messageInput.placeholder = 'Напишіть повідомлення';
        editMode = false;
      } else if (element === "message-answer") {
        modalElement.classList.remove("message-answer-visible");
        modalElement.classList.add("message-answer-invisible");
      } else {
        modalElement.style.display = "none";
      }
    }
  } 
  else if (element instanceof HTMLElement) {
    if (element.id === 'edit-message') {
      element.classList.remove("edit-message-visible");
      element.classList.add("edit-message-invisible");
      messageInput.value = '';
      messageInput.placeholder = 'Напишіть повідомлення';
      editMode = false;
    } else if (element.id === "message-answer") {
      element.classList.remove("message-answer-visible");
      element.classList.add("message-answer-invisible");
    } else {
      element.style.display = "none";
    }
  }
}

function openExploreChannelsModal() {
  document.getElementById("explore-channels-modal").style.display = "block";
  loadChannelButtons();
}

function closeExploreModal() {
  document.getElementById("explore-channels-modal").style.display = "none";
}

function createNewChannel() {
  let channelName = document.getElementById("new-channel-name").value;
  channelName = channelName.replace(/ /g, "_");

  fetch("https://api.ipify.org?format=json")
    .then(response => response.json())
    .then(ipData => {
      const ip = ipData.ip;

      return fetch('/create-channel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelName: channelName,
          ip: ip
        })
      });
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
    const response = await fetch('/get-channels', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
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
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ channelName: channelName })
    });
    const data = await response.json();
    if (data.success) {
      selectedChannel = channelName;
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
  document.documentElement.setAttribute('data-theme', theme);
}

function changeUrlToSettings(url) {
  window.location.href = url;
}

async function translateMessage(messageId) {
  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);

  if (messageElement) {
    const [author, ...textParts] = messageElement.textContent.split(': ');
    const originalText = textParts.join(': ');
    try {
      messageElement.textContent = "Перекладання повідомлення, будь ласка, зачекайте...";
      const response = await fetch('/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'Ліміт API вичерпано, спробуйте через 1 годину.') {
          alertify.error('Ліміт API вичерпано, спробуйте пізніше.');
        } else {
          throw new Error(errorData.error || 'Network response was not ok');
        }
      }

      const data = await response.json();

      if (data.translatedText) {
        messageElement.dataset.originalText = originalText;
        messageElement.textContent = author + ': ' + data.translatedText;
        alertify.success('Повідомлення перекладено!');
      } else {
        alertify.error('Помилка в відповіді');
      }
    } catch (error) {
      console.error('Помилка при перекладі повідомлення:', error);
      messageElement.textContent = author + ': ' + originalText;
      alertify.error("Ліміт вичерпано. Спробуйте повторити запит через 15-40хв");
    }
  }
}

async function compressMessage(messageId) {
  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
  if (messageElement) {
    const [author, ...textParts] = messageElement.textContent.split(': ');
    const originalText = textParts.join(': ');
    try {
      messageElement.textContent = "Стиснення повідомлення, будь ласка, зачекайте...";

      const response = await fetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'Ліміт API вичерпано, спробуйте через 1 годину.') {
          alertify.error('Ліміт API вичерпано, спробуйте пізніше.');
        } else {
          throw new Error(errorData.error || 'Network response was not ok');
        }
      }

      const data = await response.json();

      if (data.summaryText) {
        messageElement.dataset.originalText = originalText;
        messageElement.textContent = author + ': ' + data.summaryText;
        alertify.success('Повідомлення стиснено!');
      } else {
        alertify.error('Помилка в відповіді');
      }
    } catch (error) {
      console.error('Помилка при стисненні повідомлення:', error);
      messageElement.textContent = author + ': ' + originalText;
      alertify.error("Ліміт вичерпано. Спробуйте повторити запит через 15-40хв");
    }
  }
}

async function compressAllMessages(messageId) {
  const messageElements = document.querySelectorAll(`.message[data-index]`);
  let isTargetMessage = false;
  let messagesToCompress = [];

  messageElements.forEach(messageElement => {
    const currentMessageId = messageElement.dataset.index;
    if (currentMessageId == messageId) {
      isTargetMessage = true;
    }

    if (isTargetMessage) {
      const [author, ...textParts] = messageElement.querySelector('p').textContent.split(': ');
      const originalText = textParts.join(': ');
      messagesToCompress.push({ author, originalText, element: messageElement });
    }
  });
  messageId = +messageId + 1;
  if (messagesToCompress.length > 0) {
    displayMessage({ context: `Початок стиснення повідомлень від повідомлення з ID: ${messageId}` }, messageId);

    try {
      const combinedText = messagesToCompress.map(msg => `${msg.author}: ${msg.originalText}`).join('\n');
      const response = await fetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combinedText })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'Ліміт API вичерпано, спробуйте через 1 годину.') {
          alertify.error('Ліміт API вичерпано, спробуйте пізніше.');
        } else {
          throw new Error(errorData.error || 'Network response was not ok');
        }
      }

      const data = await response.json();

      if (data.summaryText) {
        const summaryMessages = data.summaryText.split('\n');
        displayMessage({
          context: `Результат: ${summaryMessages}`
        }, messageId);
        alertify.success('Повідомлення стиснено!');
      } else {
        alertify.error('Помилка в відповіді');
      }
    } catch (error) {
      console.error('Помилка при стисненні повідомлення:', error);
      messagesToCompress.forEach(msg => {
        msg.element.querySelector('p').textContent = msg.author + ': ' + msg.originalText;
      });
      alertify.error("Ліміт вичерпано. Спробуйте повторити запит через 15-40хв");
    }
  }
}

function getOriginalMessage() {
  const menu = document.getElementById("message-options-menu");
  const messageId = menu.dataset.messageId;
  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);

  if (messageElement && messageElement.dataset.originalText) {
    messageElement.textContent = messageElement.textContent.split(': ')[0] + ': ' + messageElement.dataset.originalText;
    alertify.success('Повернуто оригінальне повідомлення!');
  } else {
    alertify.error('Оригінальне повідомлення не знайдено');
  }
}

function answerToMessage(messageId) {
  if (!messageId) {
    console.error('MessageId is required for answerToMessage');
    return;
  }

  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
  const answerMessage = document.getElementById("message-answer");
  const answerMessageSpan = document.getElementById("message-answer-span");

  if (messageElement) {
    const originalMessage = messageElement.textContent;
    answerMessageSpan.textContent = originalMessage;
    messageInput.dataset.replyToId = messageId;

    answerMessage.classList.remove("message-answer-invisible");
    answerMessage.classList.add("message-answer-visible");

    messageInput.focus();
  } else {
    console.error('Message element not found for id:', messageId);
  }
}

function editMessage(messageId) {
  editMode = true;

  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
  const editMessage = document.getElementById("edit-message")
  const editMessageSpan = document.getElementById("edit-message-span")
  const oldContent = messageElement.textContent.split(': ')[1];

  editMessageSpan.textContent = oldContent
  messageInput.value = oldContent;

  messageInput.placeholder = 'Редагування повідомлення';
  messageInput.dataset.editId = messageId;

  editMessage.classList.remove("edit-message-invisible")
  editMessage.classList.add("edit-message-visible")
}

function deleteMessage(messageId) {
  fetch(`/delete-message/${messageId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ channelName: selectedChannel })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alertify.success('Повідомлення видалено!');
      } else {
        alertify.error(data.message || 'Не вдалося видалити повідомлення');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alertify.error('Помилка під час видалення повідомлення');
    });
}

function copyText(buttonElement) {
  const menu = buttonElement.closest('#message-options-menu');
  const messageId = menu.dataset.messageId;
  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
  if (messageElement) {
    let text = messageElement.textContent;
    const colonIndex = text.indexOf(':');
    if (colonIndex !== -1) {
      text = text.substring(colonIndex + 1).trim();
    }
    navigator.clipboard.writeText(text)
      .then(() => alertify.success('Текст скопійовано!'))
      .catch(error => alertify.error('Помилка при копіюванні тексту: ' + error));
  } else {
    alertify.error('Повідомлення не знайдено');
  }
}

function copyMessageId(buttonElement) {
  const menu = buttonElement.closest('#message-options-menu');
  const messageId = menu.dataset.messageId;
  navigator.clipboard.writeText(messageId)
    .then(() => alertify.success('ID повідомлення скопійовано!'))
    .catch(error => alertify.error('Помилка при копіюванні ID повідомлення: ' + error));
}

getCurrentUsername();
console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.");

messageInput.addEventListener('input', () => {
  const message = messageInput.value.trim();

  if (message.length > 0 && !isTyping) {
    isTyping = true;
    socket.emit('typing', { channel: selectedChannel, username: currentUsername });

    typingInterval = setInterval(() => {
      if (messageInput.value.trim().length === 0) {
        clearInterval(typingInterval);
        socket.emit('stop typing', { channel: selectedChannel, username: currentUsername });
        isTyping = false;
      }
    }, typingCheckDelay);
  }
});

fileInput.addEventListener("change", function () {
  if (fileInput.files && fileInput.files.length > 0) {
    for (let i = 0; i < fileInput.files.length; i++) {
      const fileName = fileInput.files[i].name;
      selectedPhotoFiles.push(fileInput.files[i]);

      alertify.success(`Завантажено зображення: ${fileName}`);
      showUploadFilesSection(fileName, selectedPhotoFiles.length - 1);
    }
    fileInput.value = '';
  }
});

socket.on('chat message', (channel, msg) => {
  if (channel === selectedChannel) {
      displayMessage({
          context: `${msg.author}: ${msg.context}`,
          photo: msg.photo,
          date: msg.date,
          replyTo: msg.replyTo
      }, msg.id);
      
      if (!msg.author.includes("Привітання:") && !msg.context.includes(currentUsername)) {
          newMessageSound.play();
      } else if (!msg.context.includes(currentUsername) && !msg.author.includes(currentUsername)) {
          newUserSound.play();
      }

      if (msg.author.includes("Привітання") && msg.context.includes(currentUsername)) {
          welcomeSound.play();
      }
  }
});

socket.on('typing', (data) => {
  if (data.channel === selectedChannel && !typingUsers.has(data.username)) {
    typingUsers.add(data.username);
    updateTypingIndicator();
  }
});

socket.on('stop typing', (data) => {
  if (data.channel === selectedChannel && typingUsers.has(data.username)) {
    typingUsers.delete(data.username);
    updateTypingIndicator();
  }
});

function updateTypingIndicator() {
  const usersTypingArray = Array.from(typingUsers);

  if (typingUsers.size === 1) {
    typingIndicator.style.display = 'block';
    whoTyping.textContent = `${usersTypingArray[0]} пише...`;
  } else if (typingUsers.size > 1 && typingUsers.size <= 5) {
    typingIndicator.style.display = 'block';
    whoTyping.textContent = `${usersTypingArray.join(', ')} пишуть...`;
  } else if (typingUsers.size > 5) {
    typingIndicator.style.display = 'block';
    whoTyping.textContent = `Кілька людей пишуть...`;
  } else {
    typingIndicator.style.display = 'none';
  }
}

window.addEventListener('beforeunload', () => {
  if (isTyping) {
    socket.emit('stop typing', { channel: selectedChannel, username: currentUsername });
  }
});

socket.on('message deleted', (channelName, messageId) => {
  if (channelName === selectedChannel) {
    const messageElement = document.querySelector(`.message[data-index='${messageId}']`);
    const photoElement = document.querySelector(`img[data-index='${messageId}']`);
    if (messageElement) {
      messageElement.remove();
      if (photoElement) {
        photoElement.remove();
      }
    }
    const messages = document.querySelectorAll('.message');
    let currentIndex = 1;

    messages.forEach((message) => {
      if (message.classList.contains('message-photo')) {
        message.dataset.index = currentIndex - 1;
      } else {
        message.dataset.index = currentIndex;
        currentIndex++;
      }
    });
  }
});

socket.on('message edited', (channelName, messageId, newContent) => {
  if (channelName === selectedChannel) {
    const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
    if (messageElement) {
      const existingText = messageElement.textContent;

      const colonIndex = existingText.indexOf(':');

      if (colonIndex !== -1) {
        messageElement.textContent = existingText.substring(0, colonIndex + 1) + " " + newContent;
      } else {
        messageElement.textContent = newContent;
      }
    }
  }
});

document.getElementById("message-options-menu").addEventListener("click", function (event) {
  if (event.target.tagName === "BUTTON") {
    const messageId = this.dataset.messageId;
    const action = event.target.textContent;

    switch (action) {
      case "Перекласти текст":
        translateMessage(messageId);
        break;
      case "Стиснути текст":
        compressMessage(messageId);
        break;
      case "Що нового":
        compressAllMessages(messageId);
        break;
      case "Показати оригінал":
        getOriginalMessage();
        break;
      case "Відповісти":
        answerToMessage(messageId);
        break;
      case "Редагувати":
        editMessage(messageId);
        break;
      case "Видалити":
        deleteMessage(messageId);
        break;
      default:
        console.warn("Невідома дія:", action);
    }
  }
});

messageList.addEventListener('scroll', () => {
  const messages = document.querySelectorAll('.message');
  const scrollTop = messageList.scrollTop;
  const scrollHeight = messageList.scrollHeight;
  const clientHeight = messageList.clientHeight;
  
  // Показуємо кнопку якщо прокручено більше 50 повідомлень вгору
  if (messages.length > 50 && scrollHeight - scrollTop - clientHeight > 1000) {
    scrollButton.classList.remove('scroll-button-hidden');
    scrollButton.classList.add('scroll-button-visible');
  } else {
    scrollButton.classList.remove('scroll-button-visible');
    scrollButton.classList.add('scroll-button-hidden');
  }
});

scrollButton.addEventListener('click', () => {
  messageList.scrollTo({
    top: messageList.scrollHeight,
    behavior: 'smooth'
  });
});