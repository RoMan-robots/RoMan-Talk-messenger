const loginScreenButton = document.getElementById('login-screen-button');
const registerScreenButton = document.getElementById('register-screen-button');
const helloScreen = document.getElementById('hello-screen');

function changeUrlToLogin(url) {
    window.location.href = url;
  }
  function changeUrlToRegister(url) {
    window.location.href = url;
  }
    
  async function checkSessionStatus() {
    try {
        const response = await fetch('/session-status');
        const data = await response.json();
        if (!data.success) {
            alertify.alert("Ця версія RoMan Talk застаріла. Спробуйте оновити месенжер.", function () {
                checkSessionStatus();
            });
        }
        if (data.loggedIn) {
            window.location.href = '/chat.html';
        }
    } catch (error) {
        console.error('Помилка при перевірці статусу сесії:', error);
    } finally {
        if (!navigator.onLine) {
            alertify.alert("Немає підключення до інтернету, повторіть спробу пізніше", function () {
                checkSessionStatus();
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', checkSessionStatus);
