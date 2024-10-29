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

const settingsScreen = document.getElementById('settings-screen');
const themeSelect = document.getElementById('theme-select');
const saveSettingsButton = document.getElementById('save-settings');
const changePasswordForm = document.getElementById('change-password-form');
const changeUsernameForm = document.getElementById('change-username-form');
const toggleChangePasswordButton = document.getElementById('toggle-change-password-button');
const toggleChangeUsernameButton = document.getElementById('toggle-change-username-button');
const subscribersListContainer = document.getElementById("subscribers-list-container");
const changeRankModal = document.getElementById("change-rank-modal");
const rankNamePlaceholder = document.getElementById('rank-name-placeholder');

const settingsButtons = document.querySelector('.settings-buttons');

const token = localStorage.getItem('token');

let display = false;
let currentChannelName;
let userId;

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

fetch('/set-bg')
  .then(response => response.blob())
  .then(imageBlob => {
    const imageURL = URL.createObjectURL(imageBlob);
    document.body.style.backgroundImage = `url(${imageURL})`;
  })
  .catch(error => console.error('Error fetching the random image:', error));

fetch('/username', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
  .then(response => response.json())
  .then(data => {
    if (data.success && data.userId) {
      userId = data.userId;
    } else {
      alertify.error("Не вдалося отримати ID користувача");
    }
  })
  .catch(error => {
    console.error('Помилка:', error);
    alertify.error("Помилка при отриманні ID користувача");
  });

function changeUrlToChat(url) {
  window.location.href = url;
}

async function copyUserId() {
  if (userId) {
    await navigator.clipboard.writeText(userId);
    alertify.success('ID скопійовано до буферу обміну.');
  } else {
    alertify.error("Не вдалося отримати ID користувача")
  }
}

async function openChannelSettings(channel) {
  currentChannelName = channel;

  document.getElementById('channel-name-placeholder').textContent = channel;
  document.getElementById('channels-modal').style.display = 'none';
  document.getElementById('channel-settings-modal').style.display = 'flex';

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
    document.getElementById('channels-modal').style.display = 'block';
    const response = await fetch('/my-channels', { headers: { Authorization: `Bearer ${token}` } });
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
  const response = await fetch(`/get-channel-privacy/${channelName}`, { headers: { Authorization: `Bearer ${token}` } });
  const { isPrivate } = await response.json();
  return isPrivate;
}

async function setChannelPrivacy(channelName, isPrivate) {
  try {
    const response = await fetch('/channel/set-privacy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
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
      const userInfoResponse = await fetch(`/user-info/${userId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
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
    const userInfo = await findUser('id', subscriberId);
    if (!userInfo) {
      throw new Error("Не вдалося отримати дані користувача");
    }
    const username = userInfo.username;

    const addSubscriberResponse = await fetch('/add-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ userId, channelName })
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
  newSubscriberItem.addEventListener('click', function () {
    removeSubscriber(userId, currentChannelName);
    this.parentNode.removeChild(this);
  });
  subscribersList.appendChild(newSubscriberItem);
}

async function deleteChannel() {
  const password = await new Promise((resolve) => {
    alertify.prompt('Будь ласка, введіть пароль для підтвердження видалення каналу:',
      function (value) {
        resolve(value);
      },
      function () {
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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

async function loadAppeals() {
  try {
    const response = await fetch('/get-appeals');
    const { appeals } = await response.json();

    const requestsModal = document.getElementById('requests-modal');

    appeals.forEach((appeal, index) => {
      const appealItem = document.createElement('div');
      appealItem.classList.add('appeal-item');
      appealItem.innerHTML = `
        <h3 class='classic'>Заявка ${index + 1}</h3>
        <p class='classic'><strong>Тип заявки:</strong> апеляція на блокування</p>
        <p class='classic'><strong>Ім'я акаунту:</strong> ${appeal.username}</p>
        <p class='classic'><strong>Причина апеляції:</strong> ${appeal.reason}</p>
      `;

      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'Видалити заявку';
      deleteButton.classList.add('btn', 'btn-light');
      deleteButton.addEventListener('click', async () => {
        try {
          const response = await fetch('/delete-appeal', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ index })
          });
          const data = await response.json();
          if (data.success) {
            appeals.splice(index, 1);
            requestsModal.removeChild(appealItem);
            if (appeals.length === 0) {
              const noRequestsMessage = document.createElement('p');
              noRequestsMessage.textContent = 'Немає жодних заявок.';
              noRequestsMessage.classList.add('classic')
              requestsModal.appendChild(noRequestsMessage);
            }
          } else {
            alertify.error('Помилка видалення заявки');
          }
        } catch (error) {
          console.error('Помилка:', error);
          alertify.error('Помилка з’єднання з сервером.');
        }
      });

      appealItem.appendChild(deleteButton);
      requestsModal.appendChild(appealItem);
    });


    if (appeals.length === 0) {
      const noRequestsMessage = document.createElement('p');
      noRequestsMessage.textContent = 'Немає жодних заявок.';
      noRequestsMessage.classList.add('classic')
      requestsModal.appendChild(noRequestsMessage);
    }
  } catch (error) {
    console.error('Помилка при завантаженні заявок:', error);
    alertify.error('Помилка при завантаженні заявок.');
  }
}

async function loadSecurityRecomendations() {
  const securityDiv = document.getElementById("security-recomendations");
  securityDiv.innerHTML = '';

  const response = await fetch('/get-security', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (data.success && data.security) {
    const ol = document.createElement('ul');
    const securityObj = data.security;

    Object.keys(securityObj).forEach((username) => {
      const messages = securityObj[username];
      if (messages.length > 0) {
        messages.forEach((message) => {
          const li = document.createElement('li');
          li.textContent = `${message.when}: ${message.message} (Клієнт: ${message.device}, Місцезнаходження: ${message.location})`;
          ol.appendChild(li);
        });
      }
    });

    if (ol.childNodes.length > 0) {
      securityDiv.appendChild(ol);
    } else {
      securityDiv.textContent = 'Немає нових повідомлень безпеки.';
    }
  } else {
    securityDiv.textContent = 'Не вдалося завантажити дані безпеки.';
  }
}

async function openSecurityModal() {
  document.getElementById('security-modal').style.display = 'block';

  settingsButtons.style.display = 'none';

  await loadSecurityRecomendations();
}

function closeSecurityModal() {
  document.getElementById('security-modal').style.display = 'none';

  settingsButtons.style.display = 'flex';
}

function openRequestsModal() {
  document.getElementById('requests-modal').style.display = 'block';

  settingsButtons.style.display = 'none';

  loadAppeals()
}

function closeMyChannelsModal() {
  document.getElementById('channels-modal').style.display = 'none';
  document.getElementById('channel-settings-modal').style.display = 'none';

  settingsButtons.style.display = 'flex';
}

function openChangeRankModal() {
  changeRankModal.style.display = "block";

  settingsButtons.style.display = 'none';
}

function closeChangeRankModal() {
  changeRankModal.style.display = "none";

  settingsButtons.style.display = 'flex';
}

function toggleChangePassword() {
  if (!display) {
    changePasswordForm.style.display = 'flex';
    toggleChangePasswordButton.textContent = 'Скасувати';
    display = true;
  } else {
    changePasswordForm.style.display = 'none';
    toggleChangePasswordButton.textContent = 'Змінити пароль';
    display = false;
  }
}

async function findUser(type, userInfo) {
  let endpoint;
  if (type === 'id') {
    endpoint = `/user-info/${userInfo}`;
  } else if (type === 'name') {
    endpoint = `/user-info-by-name/${userInfo}`;
  } else {
    throw new Error('Непідтримуваний тип пошуку.');
  }

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Не вдалося знайти користувача.');
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка при пошуку користувача:', error);
    alertify.error(`Помилка при пошуку користувача: ${error.message}`);
    return null;
  }
}

async function changeRankById() {
  const userId = document.querySelector('#change-rank-modal input:nth-of-type(1)').value;
  const user = await findUser('id', userId);
  if (user) {
    openChangeRankForm(user);
  } else {
    alert('Користувача з таким ID не знайдено.');
  }
}

async function changeRankByName() {
  const username = document.querySelector('#change-rank-modal input:nth-of-type(2)').value;
  const user = await findUser('name', username);
  if (user) {
    openChangeRankForm(user);
  } else {
    alert('Користувача з таким іменем не знайдено.');
  }
}

function openChangeRankForm(user) {
  const changeRankForm = document.getElementById('change-rank-form');
  const changeRankNamePlaceholder = document.getElementById('change-rank-name-placeholder');


  changeRankForm.style.display = "flex";
  changeRankModal.style.display = "none";

  changeRankNamePlaceholder.textContent = user.username;
  rankNamePlaceholder.textContent = translateRank(user.rank);
}

function translateRank(rank) {
  switch (rank) {
    case 'admin':
      return 'адміністратор';
    case 'moderator':
      return 'модератор';
    case 'tester':
      return 'тестувальник';
    case 'super-user':
      return 'супер користувач';
    case 'user':
      return 'користувач';
    case 'banned':
      return 'заблокований';
    default:
      return '';
  }
}

async function saveRank() {
  const username = document.getElementById("change-rank-name-placeholder").textContent;
  const user = await findUser("name", username);

  if (!user) {
    alertify.error('Користувача не знайдено.');
    return;
  }

  const response = await fetch('/get-rank', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();

  const currentUserRank = data.rank;
  if (currentUserRank !== 'owner' && currentUserRank !== 'admin') {
    alertify.error('Ваш акаунт заблоковано з причини незаконного використання адміністраторських інструментів');
    setTimeout(async () => {
      const response = await fetch('/block-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      window.location.href = "/"
    }, 5000);
    return;
  }

  const selectedUserId = user.id;
  const newRank = document.getElementById('new-rank-select').value;
  const translatedRank = translateRank(newRank);

  try {
    const response = await fetch('/save-rank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: selectedUserId,
        newRank: newRank
      })
    });

    const data = await response.json();
    if (response.ok) {
      alertify.success(`Ранг для ${username} успішно змінено на ${translatedRank}`);
      rankNamePlaceholder.textContent = translatedRank;
    } else {
      alertify.error('Помилка при зміні рангу');
    }
  } catch (error) {
    console.error('Помилка при зміні рангу:', error);
    alertify.error('Помилка при зміні рангу');
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;

  try {
    const response = await fetch('/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
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
      function () {
        resolve(true);
      },
      function () {
        resolve(false);
      }
    ).set('labels', { ok: 'Так', cancel: 'Ні' });
  });

  if (!userConfirmed) {
    alertify.error("Вихід з акаунту скасовано")
    return;
  }

  try {
    let response = await fetch("https://api.ipify.org?format=json");
    const ipData = await response.json();
    response = await fetch('/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ip: ipData.ip
      })
    });
    const data = await response.json();
    if (data.success) {
      window.location.href = '/';
      localStorage.removeItem('token');
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
    function () {
      alertify.error('Видалення акаунту скасовано.');
    },
    async function (evt, value) {
      const password = value;
      try {
        const response = await fetch('/delete-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ password, userId })
        });

        const data = await response.json();
        if (data.success) {
          window.location.href = '/';
          localStorage.removeItem('token');
        } else {
          alertify.error('Видалення акаунту скасовано. Пароль неправильний.');
        }
      } catch (error) {
        alertify.error('Помилка з’єднання з сервером.');
        console.error('Error:', error);
      }
    }
  ).set('type', 'password');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

async function saveSettings() {
  const selectedTheme = themeSelect.value;
  try {
    const response = await fetch('/save-theme', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ theme: selectedTheme })
    });
    const data = await response.json();
    if (data.success) {
      applyTheme(selectedTheme);
      changeUrlToChat('chat.html');
    } else {
      alertify.error('Помилка збереження налаштувань.');
    }
  } catch (error) {
    alertify.error('Помилка збереження налаштувань.');
    console.error('Error:', error);
  }
}

async function loadPastTheme() {
  const response = await fetch('/username', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  if (data.success) {
    themeSelect.value = data.theme;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch('/get-rank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    if (data.success) {
      if (data.rank === "owner" || data.rank === "admin") {
        const changeRankButton = document.getElementById("change-rank-button");
        changeRankButton.removeAttribute("style");
      }
      if (data.rank === "owner" || data.rank === "admin" || data.rank === "moderator") {
        const requestsButton = document.getElementById("requests-button");
        requestsButton.removeAttribute("style");
        document.getElementById("admin-warning").style.display = "none"
      }
    }

    await loadPastTheme();
  } catch (error) {
    alertify.error("Помилка при завантаженні рангу.")
    console.error(error)
  }
})