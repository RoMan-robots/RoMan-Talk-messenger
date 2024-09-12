const originalFetch = window.fetch;

const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
const baseURL = isElectron ? 'https://roman-tal.onrender.com' : '';

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

const socket = io();
const welcomeSound = new Audio('/welcomeSound.mp3');
const newMessageSound = new Audio("/newMessageSound.mp3");
const newUserSound = new Audio("/newUserSound.mp3");

const token = localStorage.getItem('token');

let isDropdownActive = true;
let currentUsername;

let editMode = false;
let selectedPhotoFiles = [];
let selectedChannel = 'RoMan_World_Official';

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

  const messageP = document.createElement('p');
  messageP.textContent = message.context;

  const messageOptions = document.createElement('button');
  messageOptions.classList.add('message-options');
  messageOptions.textContent = '...';
  messageOptions.onclick = () => {
    openMessageOptionsMenu(id)
    setTimeout(() => {
      openMessageOptionsMenu(id)
    }, 10);
  };

  messageElement.appendChild(messageP);
  messageElement.appendChild(messageOptions);
  messageList.appendChild(messageElement);

  if (message.photo) {
    const photoURL = `/photos/${selectedChannel}/${message.photo}`;
    const img = document.createElement('img');
    img.src = photoURL;
    img.alt = `Фото повідомлення ID ${id}`;
    img.classList.add('message-photo');
    img.dataset.index = id
    img.classList.add('message');
    messageList.appendChild(img);
  }
}

async function openMessageOptionsMenu(id) {
  const menu = document.getElementById("message-options-menu");
  let messageElement = null;

  document.querySelectorAll('.message').forEach((element) => {
    if (element.dataset.index == id) {
      messageElement = element;
    }
  });

  if (messageElement) {
    const rect = messageElement.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;

    let top = rect.top - menuHeight;
    let left = rect.left;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    setTimeout(() => {
      menu.classList.remove('message-options-menu-hide');
      menu.classList.add('message-options-menu-visible');
    }, 0);


    menu.dataset.messageId = id;
  } else {
    console.error(`Message element with ID ${id} not found.`);
  }
}

document.addEventListener('click', (event) => {
  const menu = document.getElementById("message-options-menu");
  if (!menu.contains(event.target)) {
    menu.classList.remove('message-options-menu-visible');
    menu.classList.add('message-options-menu-hide');
  }
});

document.getElementById("message-options-menu").addEventListener("click", function (event) {
  const messageId = event.currentTarget.dataset.messageId;
  if (event.target.tagName === "BUTTON") {
    const action = event.target.textContent;
    switch (action) {
      case "Перекласти текст":
        translateMessage(messageId);
        break;
      case "Стиснути текст":
        compressMessage(messageId);
        break;
      case "Редагувати повідомення":
        editMessage(messageId);
        break;
      case "Видалити повідомлення":
        deleteMessage(messageId);
        break;
    }
  }
})

async function loadMessages(channelName) {
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
          displayMessage({ context: `${message.author}: ${message.context}`, photo: message.photo }, message.id);
        })
        setTimeout(()=>{
          messageList.scrollTop = messageList.scrollHeight;
        })
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
  const message = messageInput.value.trim()
  const messageId = messageInput.dataset.editId;

  if (message) {
    try {
      if (editMode) {
        const response = await fetch(`/update-message/${messageId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelName: selectedChannel, newContent: message })
        });
        const data = await response.json();

        if (data.success) {
          alertify.success('Повідомлення відредаговано!');
          editMode = false;

          messageInput.value = '';

          const editMessage = document.getElementById("edit-message");
          let messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);

          const currentText = messageElement.textContent;
          const colonIndex = currentText.indexOf(':');

          if (colonIndex !== -1) {
            const textBeforeColon = currentText.substring(0, colonIndex + 1);
            messageElement.textContent = textBeforeColon + ' ' + message;

            messageInput.placeholder = 'Напишіть повідомлення';

            editMessage.classList.add("edit-message-invisible");
            editMessage.classList.remove("edit-message-visible");
          } else {
            messageElement.textContent = message;
          }
        } else {
          alertify.error(data.message);
        }
      } else if (selectedPhotoFiles.length > 0) {
        const formData = new FormData();
        formData.append('channelName', selectedChannel);
        formData.append('author', currentUsername);
        formData.append('context', message);

        selectedPhotoFiles.forEach(file => {
          formData.append('photo', file);
        });

        const response = await fetch('/upload-photo-message', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (data.success) {
          messageInput.value = '';
        } else {
          alertify.error(data.message || 'Не вдалося відправити фото!');
        }

        selectedPhotoFiles = [];
        const uploadFilesDiv = document.getElementById("upload-files");
        const fileList = uploadFilesDiv.querySelector("ul");
        fileList.innerHTML = '';

        uploadFilesDiv.classList.remove("upload-files-visible");
        uploadFilesDiv.classList.add("upload-files-invisible");

      } else {
        const messageObject = {
          author: currentUsername,
          context: message,
          channel: selectedChannel
        };
        const response = await fetch('/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageObject)
        });

        const data = await response.json();
        if (data.success) {
          messageInput.value = '';
        } else {
          alertify.error(data.message || 'Не вдалося відправити повідомлення!');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alertify.error('Виникла помилка під час обробки вашого запиту.');
    }
  } else {
    alertify.error("Не можна відправляти пусті повідомлення!");
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

  const sortModalClose = document.getElementById('sort-modal-close');
  sortChannelsButton.addEventListener('click', () => {
    sortModal.style.display = 'block';
  });

  sortModalClose.addEventListener('click', () => {
    sortModal.style.display = 'none';
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

async function sortChannels(type) {
  try {
    const response = await fetch(`/sorted-channels/${type}`);
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
          selectedChannel = channel;
          loadMessages(channel);
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
  document.documentElement.setAttribute('data-theme', theme);
}

function changeUrlToSettings(url) {
  window.location.href = url;
}

async function translateMessage(messageId) {
  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
  if (messageElement) {
    try {
      const originalText = messageElement.textContent.split(': ')[1];

      const response = await fetch('/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Network response was not ok');
      }

      const data = await response.json();

      if (data.translatedText) {
        messageElement.dataset.originalText = originalText;
        messageElement.textContent = messageElement.textContent.split(': ')[0] + ': ' + data.translatedText;
        alertify.success('Повідомлення перекладено!');
      } else {
        alertify.error('Error in response');
      }
    } catch (error) {
      console.error('Помилка при перекладі повідомлення:', error);
      alertify.error(error.message);
    }
  }
}

async function compressMessage(messageId) {
  const messageElement = document.querySelector(`.message[data-index='${messageId}'] p`);
  if (messageElement) {
    try {
      const originalText = messageElement.textContent.split(': ')[1];

      const response = await fetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Network response was not ok');
      }

      const data = await response.json();

      if (data.summaryText) {
        messageElement.dataset.originalText = originalText;
        messageElement.textContent = messageElement.textContent.split(': ')[0] + ': ' + data.summaryText;
        alertify.success('Повідомлення стиснено!');
      } else {
        alertify.error('Error in response');
      }
    } catch (error) {
      console.error('Помилка при стисненні повідомлення:', error);
      alertify.error(error.message);
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelName: selectedChannel })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alertify.success('Повідомлення видалено!');

        const messageElement = document.querySelector(`.message[data-index='${messageId}']`);
        const photoElement = document.querySelector(`img[data-index='${messageId}']`);
        if (messageElement) {
          messageElement.remove();
          if (photoElement) {
            photoElement.remove();
          }
        }
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
  if (msg.author && msg.context && channel == selectedChannel) {
    if (msg.photo) {
      displayMessage({ context: `${msg.author}: ${msg.context}`, photo: `${msg.photo}` }, msg.id);
    } else {
      displayMessage({ context: `${msg.author}: ${msg.context}` }, msg.id);
    }
  }
  if (!msg.author.includes("Привітання:") && !msg.context.includes(currentUsername)) {
    newMessageSound.play();
  } else if (!msg.context.includes(currentUsername) && !msg.author.includes(currentUsername)) {
    newUserSound.play();
  }

  if (msg.author.includes("Привітання") && msg.context.includes(currentUsername)) {
    welcomeSound.play();
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
