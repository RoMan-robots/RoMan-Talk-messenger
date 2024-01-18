console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

async function login(event) {
  event.preventDefault();
  const enteredUsername = document.getElementById('username-input').value;
  const enteredPassword = document.getElementById('password-input').value;

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: enteredUsername, password: enteredPassword })
    });

    const data = await response.json();

    if (data.success) {
      window.location.href = data.redirectUrl;
    } else {
      alert(data.message || 'Неправильний логін або пароль.');
    }
  } catch (error) {
    console.error('Помилка:', error);
    alert('Помилка сервера');
  }
}

if (document.cookie.indexOf('isLoggedIn=true') !== -1) {
  if (['/', '/login', '/register'].includes(window.location.pathname)) {
    window.location.href = '/chat.html';
  }
}