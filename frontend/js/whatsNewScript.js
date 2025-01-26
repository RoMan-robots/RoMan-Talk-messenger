console.log("Привіт! Це консоль для розробників, де виводяться різні помилки. Якщо ти звичайний користувач, який не розуміє, що це таке, краще вимкни це вікно та нічого не крути.")

fetch('/set-bg')
    .then(response => response.blob())
    .then(imageBlob => {
        const imageURL = URL.createObjectURL(imageBlob);
        document.body.style.backgroundImage = `url(${imageURL})`;
    })
    .catch(error => console.error('Error fetching the random image:', error));

function changeUrl() {
    window.location.href = "/";
}