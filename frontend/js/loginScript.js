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

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")
const version = "2.1"
fetch('/set-bg')
  .then(response => response.blob())
  .then(imageBlob => {
    const imageURL = URL.createObjectURL(imageBlob);
    document.body.style.backgroundImage = `url(${imageURL})`;
  })
  .catch(error => console.error('Error fetching the random image:', error));

async function login(event) {
  event.preventDefault();
  const enteredUsername = document.getElementById('username-input').value;
  const enteredPassword = document.getElementById('password-input').value;
  const isChecked = document.getElementById("anonymousLogin").checked;

  const response = await fetch("https://api.ipify.org?format=json");
  const ipData = await response.json();
  const ip = ipData.ip;

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: enteredUsername, password: enteredPassword, checked: isChecked, ip: ip })
    });

    const data = await response.json();

    if (data.success) {
      window.location.href = 'chat.html';
      localStorage.setItem('token', data.token);
    } else {
      if (data.message.includes("заблокований")) {
        document.getElementById("login-screen").style.display = 'none'
        document.getElementById('ban-screen').style.display = 'block';
        document.getElementById('login-footer').style.display = 'none';
      } else {
        alertify.error(data.message || 'Неправильний логін або пароль.');
      }
    }
  }
  catch (error) {
    console.error('Помилка:', error);
    alertify.error('Помилка сервера');
  }
}

async function checkSessionStatus() {
  try {
    const response = await fetch('/session-status', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({
        ver: version
      })
    });
    const data = await response.json();

    if (data.loggedIn) {
      window.location.href = 'chat.html';
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