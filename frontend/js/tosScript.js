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