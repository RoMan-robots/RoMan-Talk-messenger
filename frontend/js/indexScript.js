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

const version = "2.2"

function changeUrlToLogin(url) {
  window.location.href = url;
}
function changeUrlToRegister(url) {
  window.location.href = url;
}

const NUMBER_OF_SNOWFLAKES = 200;
const MAX_SNOWFLAKE_SIZE = 4;
const MAX_SNOWFLAKE_SPEED = 1.5;
const SNOWFLAKE_COLOUR = '#ddd';
const snowflakes = [];

const canvas = document.createElement('canvas');
canvas.style.position = 'absolute';
canvas.style.pointerEvents = 'none';
canvas.style.top = '0px';
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');


const createSnowflake = () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.floor(Math.random() * MAX_SNOWFLAKE_SIZE) + 1,
    color: SNOWFLAKE_COLOUR,
    speed: Math.random() * MAX_SNOWFLAKE_SPEED + 1,
    sway: Math.random() - 0.5 // next
});

const drawSnowflake = snowflake => {
    ctx.beginPath();
    ctx.arc(snowflake.x, snowflake.y, snowflake.radius, 0, Math.PI * 2);
    ctx.fillStyle = snowflake.color;
    ctx.fill();
    ctx.closePath();
}

const updateSnowflake = snowflake => {
    snowflake.y += snowflake.speed;
    snowflake.x += snowflake.sway; // next
    if (snowflake.y > canvas.height) {
        Object.assign(snowflake, createSnowflake());
    }
}

const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    snowflakes.forEach(snowflake => {
        updateSnowflake(snowflake);
        drawSnowflake(snowflake);
    });

    requestAnimationFrame(animate);
}

for (let i = 0; i < NUMBER_OF_SNOWFLAKES; i++) {
    snowflakes.push(createSnowflake());
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

window.addEventListener('scroll', () => {
    canvas.style.top = `${window.scrollY}px`;
});

animate()

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