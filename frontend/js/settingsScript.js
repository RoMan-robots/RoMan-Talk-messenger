const settingsScreen = document.getElementById('settings-screen');
const themeSelect = document.getElementById('theme-select');
const saveSettingsButton = document.getElementById('save-settings');
const changePasswordForm = document.getElementById('change-password-form');
const changeUsernameForm = document.getElementById('change-username-form');
const toggleChangePasswordButton = document.getElementById('toggle-change-password-button');
const toggleChangeUsernameButton = document.getElementById('toggle-change-username-button');

changePasswordForm.style.display = 'none';
let display = false;
let currentChannelName;

saveSettingsButton.addEventListener('click', saveSettings);
console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

function changeUrlToChat(url) {
  window.location.href = url;
}

function openChannelSettings(channel) {
  currentChannelName = channel;

  document.getElementById('channel-name-placeholder').textContent = channel;
  document.getElementById('channel-settings-modal').style.display = 'block';

  document.getElementById('set-public-privacy-button').onclick = () => setChannelPrivacy(channel, false);
  document.getElementById('set-private-privacy-button').onclick = () => setChannelPrivacy(channel, true);
}

async function fetchUserChannels() {
  try {
      document.getElementById('channels-modal').style.display = 'block';
      const response = await fetch('/user-channels');
      const { channels } = await response.json();
      const channelsList = document.getElementById('channels-list');
      channelsList.innerHTML = '';
      channels.forEach(channel => {
          let MyChannelsElement = document.createElement('button');
          MyChannelsElement.textContent = channel;
          MyChannelsElement.onclick = () => openChannelSettings(channel);
          channelsList.appendChild(MyChannelsElement);
      });
  } catch (error) {
      console.error('Помилка при отриманні каналів:', error);
  }
}

async function setChannelPrivacy(channelName, isPrivate) {
  if(isPrivate){
    const subscribersListContainer = document.getElementById("subscribers-list-container");
    subscribersListContainer.style.display = "block";

    await loadSubscribers(channelName);
  }
    try {
      const response = await fetch('/channel/set-privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, isPrivate })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Канал "${channelName}" оновлено.`);
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Помилка:', error);
    }
}

async function loadSubscribers(channelName) {
  try {
      const response = await fetch(`/channel-subscribers/${channelName}`);
      if (!response.ok) throw new Error('Не вдалося отримати список підписників');

      const { subscribers } = await response.json();

      const subscribersListElement = document.getElementById('subscribers-list');
      subscribersListElement.innerHTML = '';

      for (const userId of subscribers) {
          const userInfoResponse = await fetch(`/user-info/${userId}`);
          if (!userInfoResponse.ok) {
              console.error(`Не вдалося отримати дані користувача з ID ${userId}`);
              continue;
          }

          const userInfo = await userInfoResponse.json();
          const username = userInfo.username;

          updateSubscribersListUI(username, userId);
      }
  } catch (error) {
      console.error('Помилка при завантаженні підписників:', error);
      alert(`Помилка при завантаженні підписників: ${error.message}`);
  }
}


async function addSubscriber() {
  const subscriberId = document.getElementById('subscriber-id').value;
  const channelName = document.getElementById('channel-name-placeholder').textContent;

  try {
    const userInfoResponse = await fetch(`/user-info/${subscriberId}`);
    if (!userInfoResponse.ok) throw new Error("Не вдалося отримати дані користувача");
    const userInfo = await userInfoResponse.json();
    const username = userInfo.username; 

    const addSubscriberResponse = await fetch('/add-subscriber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: subscriberId, channelName })
    });
    const data = await addSubscriberResponse.json();
    
    if (data.success) {
        alert(`Користувача ${username} (ID: ${subscriberId}) додано до каналу.`);
        updateSubscribersListUI(username, subscriberId);
    } else {
        alert('Помилка: ' + data.message);
    }
  } catch (error) {
      console.error('Помилка при додаванні користувача:', error);
      alert('Помилка при додаванні користувача: ' + error.message);
  }
}

async function removeSubscriber(userId, channelName) {
  try {
      const response = await fetch('/remove-subscriber', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({userId, channelName})
      });
      const data = await response.json();
      if (data.success) {
          alert(`Підписника з ID ${userId} видалено з каналу ${channelName}.`);
      } else {
          alert('Помилка: ' + data.message);
      }
  } catch (error) {
      console.error('Помилка при видаленні підписника:', error);
  }
}

function updateSubscribersListUI(username, userId) {
  const subscribersList = document.getElementById('subscribers-list');
  const newSubscriberItem = document.createElement('li');
  newSubscriberItem.textContent = `${username} (ID: ${userId})`;
  newSubscriberItem.addEventListener('click', function() {
    removeSubscriber(userId, currentChannelName);
    this.parentNode.removeChild(this);
  });
  subscribersList.appendChild(newSubscriberItem);
}

async function deleteChannel(channelName) {
  try {
    const response = await fetch('/channel/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName })
    });
    const data = await response.json();
    if (data.success) {
      alert(`Канал "${channelName}" видалено.`);
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Помилка:', error);
  }
}

function closeMyChannelsModal() {
  document.getElementById('channels-modal').style.display = 'none';
  document.getElementById('channel-settings-modal').style.display = 'none';
}

function toggleChangePassword() {
  if (!display) {
    changePasswordForm.style.display = 'block';
    toggleChangePasswordButton.textContent = 'Скасувати';
    display = true;
  } else {
    changePasswordForm.style.display = 'none';
    toggleChangePasswordButton.textContent = 'Змінити пароль';
    display = false;
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;

  try {
    const response = await fetch('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await response.json();
    if (data.success) {
      alert('Пароль успішно змінено.');
    } else {
      alert(data.message || 'Помилка зміни пароля.');
    }
  } catch (error) {
    console.error('Помилка:', error);
    alert('Помилка з’єднання з сервером.');
  }
}

async function logout() {
  if (!confirm('Ви впевнені, що хочете вийти? Потім зайти можна тільки за паролем.')) {
    return;
  }
  try {
    const response = await fetch('/logout', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      window.location.href = '/';
    } else {
      alert('Помилка при виході з акаунту.');
    }
  } catch (error) {
    alert('Помилка з’єднання з сервером.');
    console.error('Error:', error);
  }
}

async function deleteAccount() {
  const password = prompt('Будь ласка, введіть ваш пароль для підтвердження видалення акаунту:');

  try {
    const response = await fetch('/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    if (data.success) {
      window.location.href = '/';
    } else {
      alert('Видалення акаунту скасовано. Пароль неправильний.');
    }
  } catch (error) {
    alert('Помилка з’єднання з сервером.');
    console.error('Error:', error);
  }
}

async function saveSettings() {
  const selectedTheme = themeSelect.value;
  try {
    const response = await fetch('/save-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: selectedTheme })
    });
    const data = await response.json();
    if (data.success) {
      changeUrlToChat('chat.html');
    } else {
      alert('Помилка збереження теми.');
    }
  } catch (error) {
    alert('Помилка збереження налаштувань.');
    console.error('Error:', error);
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
      document.body.classList.add('dark-theme');
  } else {
      document.body.classList.remove('dark-theme');
  }
}