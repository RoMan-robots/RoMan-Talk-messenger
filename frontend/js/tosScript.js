const originalFetch = window.fetch;

const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
const baseURL = isElectron ? 'https://roman-talk-beta.onrender.com' : '';

window.fetch = function (...args) {
  if (typeof args[0] === 'string' && !args[0].startsWith('http')) {
    args[0] = `${baseURL}${args[0].startsWith('/') ? args[0] : '/' + args[0]}`;
  }
  console.log('Modified URL:', args[0]);
  return originalFetch(...args);
};

function changeUrlToIndex(url) {
    window.location.href = url;
}

fetch('/set-bg')
.then(response => response.blob())
.then(imageBlob => {
  const imageURL = URL.createObjectURL(imageBlob);
  document.body.style.backgroundImage = `url(${imageURL})`;
})
.catch(error => console.error('Error fetching the random image:', error));