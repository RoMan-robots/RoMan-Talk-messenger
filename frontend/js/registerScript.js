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

let currentStep = 1;
const tutorialSound = new Audio("/tutorialSound.mp3");

function changeUrlToChat(url) {
  window.location.href = url;
}

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

fetch('/set-bg')
  .then(response => response.blob())
  .then(imageBlob => {
    const imageURL = URL.createObjectURL(imageBlob);
    document.body.style.backgroundImage = `url(${imageURL})`;
  })
  .catch(error => console.error('Error fetching the random image:', error));

function nextStep(step) {
  if (step === 3) {
      const enteredUsername = document.getElementById('register-username-input').value;
      const enteredPassword = document.getElementById('password-input').value;
      const enteredPasswordDuplicate = document.getElementById('confirm-password-input').value;
      if (!enteredUsername || !enteredPassword) {
        alertify.error('Ім\'я користувача та пароль не можуть бути порожніми!');
        return;
      }

      if (enteredPassword !== enteredPasswordDuplicate) {
        alertify.error('Паролі не співпадають');
        return;
      }

      document.getElementById(`step-${currentStep}`).style.display = 'none';
      currentStep = step;
      document.getElementById(`step-${currentStep}`).style.display = 'block';
  } else {
    document.getElementById(`step-${currentStep}`).style.display = 'none';
    currentStep = step;
    document.getElementById(`step-${currentStep}`).style.display = 'block';
  }

  if (step === 4) {
    tutorialSound.play();
  } else {
    tutorialSound.pause();
    tutorialSound.currentTime = 0;
  }
}

function changePasswordVisiblity(button) {
  const passwordInput = button.previousElementSibling;
  if (passwordInput && passwordInput.classList.contains("changing")) {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    button.innerHTML = isPassword ? `<i class="fa-regular fa-eye-slash"></i>` : `<i class="fa-regular fa-eye"></i>`;
  }
}

async function register(event) {
  event.preventDefault();

  const enteredUsername = document.getElementById('register-username-input').value;
  const enteredPassword = document.getElementById('password-input').value;
  const selectedTheme = document.getElementById("theme-select").value
  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: enteredUsername, password: enteredPassword, theme: selectedTheme })
    });

    const data = await response.json();

    if (data.success) {
      changeUrlToChat('chat.html');
      localStorage.setItem('token', data.token);
    } else {
      alertify.error(data.message || 'Помилка реєстрації.');
    }
  } catch (error) {
    alertify.error('Помилка сервера при реєстрації');
    console.error(error)
  }
}