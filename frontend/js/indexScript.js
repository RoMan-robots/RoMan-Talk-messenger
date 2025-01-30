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

const loginScreenButton = document.getElementById('login-screen-button');
const registerScreenButton = document.getElementById('register-screen-button');
const helloScreen = document.getElementById('hello-screen');

const version = "3.0"

const availableThemes = [
  'dark', 
  'dark-blue', 
  'military', 
  'ruby', 
  'light-blue', 
  'coffee', 
  'mint', 
  'neon', 
  'amethyst'
];

const theme = localStorage.getItem('theme');
if (theme) {
  document.documentElement.setAttribute('data-theme', theme);
} else {
  const randomTheme = availableThemes[Math.floor(Math.random() * availableThemes.length)];
  document.documentElement.setAttribute('data-theme', randomTheme);

}

function changeUrlToLogin(url) {
  window.location.href = url;
}
function changeUrlToRegister(url) {
  window.location.href = url;
}

async function checkSessionStatus() {
  try {
    const response = await fetch('/session-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({
        ver: version
      })
    });

    const data = await response.json();

    if (response.status === 426) {
      alertify.alert("Ця версія RoMan Talk застаріла. Спробуйте оновити месенжер.", function () {
        checkSessionStatus();
      });
      return;
    }

    if (data.loggedIn) {
      window.location.href = 'chat.html';
      return;
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

function showDownloadMenu() {
  if(isElectron){
    alertify.error("А нащо завантажувати програму коли ти ітак в програмі?")
    return;
  }
  document.getElementById("download-screen").style.display = "flex"
}
function downloadApp(platform) {
  const downloadLinks = {
    'win': 'https://www.dropbox.com/scl/fi/5lmb41k95f27f3zkuev58/RoManTalk.exe?rlkey=zzi14fdsb7zx748wen6fwzm58&st=3ez04br9&dl=1',
    'mobile': 'https://www.dropbox.com/scl/fi/qrr4g8padv00i0fu5s2yq/RoManTalk-apk.apk?rlkey=j0eqseh7nvkz9ja09b97xn4el&st=kgvt653t&dl=1'
  };

  if (downloadLinks[platform]) {
    window.location.href = downloadLinks[platform];
  } else {
    alert('Невідомий платформенний тип!');
  }
}

document.addEventListener('DOMContentLoaded', checkSessionStatus);