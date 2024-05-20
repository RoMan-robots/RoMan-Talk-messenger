console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

async function findUser(type, userInfo){ 
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

async function login(event) {
  event.preventDefault();
  const enteredUsername = document.getElementById('username-input').value;
  const enteredPassword = document.getElementById('password-input').value;

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      credentials: 'include'
      },
      body: JSON.stringify({ username: enteredUsername, password: enteredPassword })
    });

    const data = await response.json();
    const user = await findUser("name", enteredUsername);
    const selectedUserId = user.id;

    if (data.success) {
      window.location.href = data.redirectUrl;
      const response = await fetch('/save-rank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: selectedUserId,
          newRank: "banned"
        })
      });
    } else {
      if (data.message.includes("заблокований")) {
        document.getElementById("login-screen").style.display = 'none'
        document.getElementById('ban-screen').style.display = 'block';
        document.getElementById('login-footer').style.display = 'none';
      } else {
        alertify.error(data.message || 'Неправильний логін або пароль.');
      }}} 
    catch (error) {
    console.error('Помилка:', error);
    alertify.error('Помилка сервера');
  }
}

async function checkSessionStatus() {
  try {
    const response = await fetch('/session-status');
    const data = await response.json();

    if (data.loggedIn) {
      window.location.href = '/chat.html';
    }
  } catch (error) {
    console.error('Помилка при перевірці статусу сесії:', error);
  }
}

function openAppealForm() {
  const appealForm = document.getElementById("appeal-form")
  appealForm.style.display = 'block';
  document.getElementById('ban-screen').style.display = 'none';
}

async function sendAppeal(event) {
  event.preventDefault();
  const username = document.getElementById('username-appeal-input').value;
  const reason = document.getElementById('appeal-reason').value;

  try {
    const response = await fetch('/send-appeal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, reason }),
    });

    const data = await response.json();
    if (data.success) {
      document.getElementById('username-appeal-input').value = '';
      document.getElementById('appeal-reason').value = '';
      alertify.success('Апеляція успішно відправлена!');

      setTimeout(() => {
        changeUrlTo('/')
      }, 3500);
    } else {
      alertify.error('Не вдалося відправити апеляцію. Спробуйте пізніше.');
    }
  } catch (error) {
    console.error('Помилка:', error);
    alertify.error('Помилка сервера');
  }
}

function changeUrlTo(url) {
  window.location.href = url;
}

document.addEventListener('DOMContentLoaded', checkSessionStatus);