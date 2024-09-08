const originalFetch = window.fetch;

const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
const baseURL = isElectron ? 'https://roman-tal.onrender.com' : '';

window.fetch = function (...args) {
  if (typeof args[0] === 'string' && !args[0].startsWith('http')) {
    args[0] = `${baseURL}${args[0].startsWith('/') ? args[0] : '/' + args[0]}`;
  }
  console.log('Modified URL:', args[0]);
  return originalFetch(...args);
};

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
      let response = await fetch('/set-bg');
      if (response.ok) {
        const imageBlob = await response.blob();
        const imageURL = URL.createObjectURL(imageBlob);
        document.body.style.backgroundImage = `url(${imageURL})`;
      } else {
        console.error('Error fetching the random image:', response.statusText);
      }
      
      response = await fetch('/session-status');
      const data = await response.json();
      if (!data.success) {
        alertify.alert("Ця версія RoMan Talk застаріла. Спробуйте оновити месенжер.", function () {
          checkSessionStatus();
        });
      }
      if (data.loggedIn) {
        window.location.href = 'chat.html';
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
