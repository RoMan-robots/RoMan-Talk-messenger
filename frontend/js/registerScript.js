let currentStep = 1;
const enteredUsername = document.getElementById('register-username-input').value;

const tutorialSound = new Audio("/tutorialSound.mp3");

function changeUrlToChat(url) {
  window.location.href = url;
}

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

function nextStep(step) {
  if(step == 3){  
  const enteredPassword = document.getElementById('register-password-input').value;
  const enteredPasswordDuplicate = document.getElementById('confirm-password-input').value;
    if (enteredPassword !== enteredPasswordDuplicate) {
      alertify.error('Пароль не співпадає');
      return;
    }
  }
  document.getElementById(`step-${currentStep}`).style.display = 'none';
  currentStep = step;
  document.getElementById(`step-${currentStep}`).style.display = 'block';
  if(step == 4){
    tutorialSound.play();
  } else {
    tutorialSound.pause()
    tutorialSound.currentTime = 0;
  }
}

async function register(event) {
  event.preventDefault();
  const enteredUsername = document.getElementById('register-username-input').value;
  const enteredPassword = document.getElementById('register-password-input').value;
  const enteredPasswordDuplicate = document.getElementById('confirm-password-input').value;

  if (!enteredUsername || !enteredPassword) {
    alertify.error('Ім\'я користувача та пароль не можуть бути порожніми');
    return;
  }

  if (enteredPassword !== enteredPasswordDuplicate) {
    alertify.error('Пароль не співпадає');
    return;
  }

  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: enteredUsername, password: enteredPassword })
    });

    const data = await response.json();

    if (data.success) {
      changeUrlToChat('chat.html');
    } else {
      alertify.error(data.message || 'Помилка реєстрації.');
    }
  } catch (error) {
    alertify.error('Помилка сервера при реєстрації');
  }
}

if (document.cookie.indexOf('isLoggedIn=true') !== -1) {
  if (['/', '/login', '/register'].includes(window.location.pathname)) {
    window.location.href = '/chat.html';
  }
}