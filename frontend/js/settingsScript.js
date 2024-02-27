const settingsScreen = document.getElementById('settings-screen');
const themeSelect = document.getElementById('theme-select');
const saveSettingsButton = document.getElementById('save-settings');
const changePasswordForm = document.getElementById('change-password-form');
const changeUsernameForm = document.getElementById('change-username-form');
const toggleChangePasswordButton = document.getElementById('toggle-change-password-button');
const toggleChangeUsernameButton = document.getElementById('toggle-change-username-button');
const subscribersListContainer = document.getElementById("subscribers-list-container");

const settingsButtons = document.querySelector('.settings-buttons');
const settingsOption = document.querySelector(".settings-option")

changePasswordForm.style.display = 'none';
let display = false;
let currentChannelName;

saveSettingsButton.addEventListener('click', saveSettings);

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

function changeUrlToChat(url) {
  window.location.href = url;
}

async function copyUserId() {
  try {
    const response = await fetch('/username');
    const data = await response.json();
    if (data.success && data.userId) {
      await navigator.clipboard.writeText(data.userId);
      alertify.success('ID скопійовано до буферу обміну.'); 
    } else {
      alertify.error("Не вдалося отримати ID користувача")
    }
  } catch (error) {
    console.error('Помилка:', error);
    alertify.error("Помилка при копіюванні ID в буфер обміну")
  }

}

async function openChannelSettings(channel) {
  currentChannelName = channel;

  document.getElementById('channel-name-placeholder').textContent = channel;
  document.getElementById('channels-modal').style.display = 'none';
  document.getElementById('channel-settings-modal').style.display = 'block';

  document.getElementById('set-public-privacy-button').onclick = () => setChannelPrivacy(channel, false);
  document.getElementById('set-private-privacy-button').onclick = () => setChannelPrivacy(channel, true);

  const isPrivate = await checkChannelPrivacy(channel);
  if (isPrivate) {
    const subscribersListContainer = document.getElementById("subscribers-list-container");
    subscribersListContainer.style.display = "block";
    await loadSubscribers(channel);
  }
}

async function fetchUserChannels() {
  try {
    settingsButtons.style.display = 'none';
    settingsOption.style.display = 'none';
    document.getElementById('channels-modal').style.display = 'block';
    const response = await fetch('/my-channels');
    const data = await response.json();
    if (response.ok && Array.isArray(data.myChannels)) {
      const channelsList = document.getElementById('channels-list');
      channelsList.innerHTML = '';
      data.myChannels.forEach(channel => {
        let myChannelsElement = document.createElement('button');
        myChannelsElement.textContent = channel.name;
        myChannelsElement.onclick = () => openChannelSettings(channel.name);
        channelsList.appendChild(myChannelsElement);
      });
    } else {
      console.log(data.myChannels)
    }
  } catch (error) {
    console.error('Помилка при отриманні каналів:', error);
  }
}


async function checkChannelPrivacy(channelName) {
  const response = await fetch(`/get-channel-privacy/${channelName}`);
  const { isPrivate } = await response.json();
  return isPrivate;
}

async function setChannelPrivacy(channelName, isPrivate) {
  try {
    const response = await fetch('/channel/set-privacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName, isPrivate })
    });
    const data = await response.json();
    if (data.success) {
      alertify.success(`Канал "${channelName}" оновлено.`);
      if (isPrivate) {
        subscribersListContainer.style.display = "block";
        await loadSubscribers(channelName);
      } else {
        const clearResponse = await fetch('/channel/clear-subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelName })
        });
        const clearData = await clearResponse.json();
        if (clearData.success) {
          document.getElementById('subscribers-list').innerHTML = '';
          subscribersListContainer.style.display = "none";
        } else {
          alertify.error(clearData.message);
        }
      }
    } else {
      alertify.error(data.message)
    }
  } catch (error) {
    console.error('Помилка:', error);
    alertify.error('Помилка:', error)
  }
}

async function updateSubscribersChannels(channelName) {
  try {
    const response = await fetch(`/channel-subscribers/${channelName}`);
    if (!response.ok) throw new Error('Не вдалося отримати список підписників');

    const { subscribers } = await response.json();
    await fetch('/update-user-channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribers, channelName })
    });
  } catch (error) {
    console.error('Помилка при оновленні каналів користувачів:', error);
    alertify.error('Помилка при оновленні каналів користувачів:', error)
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
      alertify.error(`Помилка при завантаженні підписників: ${error.message}`);
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
        alertify.success(`Користувача ${username} (ID: ${subscriberId}) додано до каналу.`);
        updateSubscribersListUI(username, subscriberId);
    } else {
        alertify.error(`Помилка ${data.message}`)
    }
  } catch (error) {
      console.error('Помилка при додаванні користувача:', error);
      alertify.error(`Помилка при додаванні користувача: ${error.message}`);
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
          alertify.success(`Підписника з ID ${userId} видалено з каналу ${channelName}.`);
      } else {
          alertify.error('Помилка: ' + data.message);
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

async function deleteChannel() {
  const password = await new Promise((resolve) => {
    alertify.prompt('Будь ласка, введіть пароль для підтвердження видалення каналу:',
      function(value) {
        resolve(value);
      },
      function() {
        resolve(null);
      }
    ).set('type', 'password');
  });

  if (!password) {
    alertify.error('Видалення каналу скасовано.');
    return;
  }
  try {
    const response = await fetch('/channel/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName: currentChannelName, password })
    });
    const data = await response.json();
    if (data.success) {
      alertify.success(`Канал "${currentChannelName}" видалено.`);
      closeMyChannelsModal();
    } else {
      alertify.error(data.message);
    }
  } catch (error) {
    console.error('Помилка:', error);
    alertify.error('Помилка сервера при видаленні каналу.');
  }
}


function closeMyChannelsModal() {
  document.getElementById('channels-modal').style.display = 'none';
  document.getElementById('channel-settings-modal').style.display = 'none';
  settingsButtons.style.display = 'block';
  settingsOption.style.display = 'block';
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
      alertify.success('Пароль успішно змінено.');
    } else {
      alertify.error(data.message || 'Помилка зміни пароля.');
    }
  } catch (error) {
    console.error('Помилка:', error);
    alertify.error('Помилка з’єднання з сервером.');
  }
}

async function logout() {
  const userConfirmed = await new Promise((resolve) => {
    alertify.confirm('Ви впевнені, що хочете вийти? Потім зайти можна тільки за паролем.',
      function() {
        resolve(true);
      },
      function() {
        resolve(false);
      }
    ).set('labels', {ok:'Так', cancel:'Ні'});
  });

  if (!userConfirmed) {
    alertify.error("Вихід з акаунту скасовано")
    return; 
  }

  try {
    const response = await fetch('/logout', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      window.location.href = '/';
    } else {
      alertify.error('Помилка при виході з акаунту.');
    }
  } catch (error) {
    alertify.error('Помилка з’єднання з сервером.');
    console.error('Error:', error);
  }
}

async function deleteAccount() {
  alertify.prompt('Будь ласка, введіть ваш пароль для підтвердження видалення акаунту:',
    async function(value) {
      const password = value;
      try {
        const response = await fetch('/delete-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        if (data.success) {
          window.location.href = '/';
          alertify.success('Акаунт видалено успішно.');
        } else {
          alertify.error('Видалення акаунту скасовано. Пароль неправильний.');
        }
      } catch (error) {
        alertify.error('Помилка з’єднання з сервером.');
        console.error('Error:', error);
      }
    },
    function() {
      alertify.error('Видалення акаунту скасовано.');
    }
  ).set('type', 'password');
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
      alertify.error('Помилка збереження теми.');
    }
  } catch (error) {
    alertify.error('Помилка збереження налаштувань.');
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