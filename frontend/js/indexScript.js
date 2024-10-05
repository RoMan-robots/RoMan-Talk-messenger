const originalFetch = window.fetch;

const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
const baseURL = isElectron ? 'https://roman-talk-beta-82vh.onrender.com' : '';

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

const version = "2.0"

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

    response = await fetch('/session-status', {
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
    if (response.status == "426") {
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
function showDownloadMenu() {
  if(isElectron){
    alertify.error("А нащо завантажувати програму коли ти ітак в програмі?")
    return;
  }
  document.getElementById("download-screen").style.display = "flex"
}
function downloadApp(platform) {
  const downloadLinks = {
    'mac-arm': 'https://www.dropbox.com/scl/fi/5u8e4ko8br00l7x2aquq2/RoManTalk-mac-arm.zip?rlkey=zmbo6rkn5knvfos4cigs86t13&st=7pppbvll&dl=1',
    'mac-x86': 'https://www.dropbox.com/scl/fi/yaj97ks88b6ozlvlti2vt/RoManTalk-mac-x64.zip?rlkey=g58oackv16kfi063xao4xrukc&st=0zcgdozo&dl=1',
    'win-arm': 'https://www.dropbox.com/scl/fi/ql6v8tk9c74noq32elptu/RoManTalk-win-arm.zip?rlkey=ujzbm7ij4dqa445cakobbmm1a&st=qj3fez33&dl=1',
    'win-x86': 'https://www.dropbox.com/scl/fi/7khpnuf3yhd79qohi6gwz/RoManTalk-win-x64.zip?rlkey=589exzh61wodsxii6kpjnq3c6&st=ls2vtm2j&dl=1',
    'mobile': 'https://www.dropbox.com/scl/fi/uz4f8yx7mauy54fn4hyqc/RoManTalk-apk.apk?rlkey=7go69pj1joqja6cwcqabixhzz&st=0qi0ktz2&dl=1'
  };

  if (downloadLinks[platform]) {
    window.location.href = downloadLinks[platform];
  } else {
    alert('Невідомий платформенний тип!');
  }
}

document.addEventListener('DOMContentLoaded', checkSessionStatus);