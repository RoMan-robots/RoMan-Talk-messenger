function openFullscreen(imgElement) {
    const fullscreenDiv = document.createElement('div');
    fullscreenDiv.classList.add('fullscreen-img');
    fullscreenDiv.innerHTML = `
          <span class="close-btn" onclick="closeFullscreen()">×</span>
          <img src="${imgElement.src}" alt="${imgElement.alt}">
      `;
    document.body.appendChild(fullscreenDiv);
}

function closeFullscreen() {
    const fullscreenDiv = document.querySelector('.fullscreen-img');
    if (fullscreenDiv) {
        fullscreenDiv.remove();
    }
}

console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

fetch('/set-bg')
  .then(response => response.blob())
  .then(imageBlob => {
    const imageURL = URL.createObjectURL(imageBlob);
    document.body.style.backgroundImage = `url(${imageURL})`;
  })
  .catch(error => console.error('Error fetching the random image:', error));

  function changeUrl(){
    window.location.href = "/";
  }