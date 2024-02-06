const loginScreenButton = document.getElementById('login-screen-button');
const registerScreenButton = document.getElementById('register-screen-button');
const helloScreen = document.getElementById('hello-screen');

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

function changeUrlToLogin(url) {
    window.location.href = url;
  }
  function changeUrlToRegister(url) {
    window.location.href = url;
  }

  async function checkSessionAndRedirect() {
    try {
      const response = await fetch('/check-session');
      const data = await response.json();
  
      if (data.isLoggedIn && ['/', '/login', '/register'].includes(window.location.pathname)) {
        window.location.href = '/chat.html';
      }
    } catch (error) {
      console.error('Error:', error);
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
    }}

  document.addEventListener("DOMContentLoaded", checkSessionAndRedirect, checkSessionStatus);
  