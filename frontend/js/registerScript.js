function changeUrlToChat(url) {
  window.location.href = url;
}
console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")
async function register(event) {
  event.preventDefault();
  const registerUsernameInput = document.getElementById('register-username-input');
  const registerPasswordInput = document.getElementById('register-password-input');
  const enteredPasswordDuplicateInput = document.getElementById('dublicate-register-password-input');

  const enteredUsername = registerUsernameInput.value;
  const enteredPassword = registerPasswordInput.value;
  const enteredPasswordDuplicate = enteredPasswordDuplicateInput.value;

  if (enteredPassword !== enteredPasswordDuplicate) {
    alert('Пароль не співпадає');
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
      alert(data.message || 'Помилка реєстрації.');
    }
  } catch (error) {
    alert('Помилка сервера при реєстрації');
  }
}
