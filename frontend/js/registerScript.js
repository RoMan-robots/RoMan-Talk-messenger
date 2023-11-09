const registerScreen = document.getElementById('register-screen');
const registerButton = document.getElementById('register-button');
const RegisterSubmitButton = document.getElementById('register-submit-button');
const registerUsernameInput = document.getElementById('register-username-input');
const registerPasswordInput = document.getElementById('register-password-input');
const enteredPasswordDuplicateInput = document.getElementById('dublicate-register-password-input');

RegisterSubmitButton.addEventListener('click', register);

let usersLogins = [
  "RoMan"
];

let usersPasswords = [
  "123"
];

let usersAmount = 1;

function changeUrlToChat(url) {
  window.location.href = url;
}

function register() {
    const enteredUsername = registerUsernameInput.value;
    const enteredPassword = registerPasswordInput.value;
    const enteredPasswordDuplicate = enteredPasswordDuplicateInput.value;
  
    registerScreen.style.display = 'none';
    helloScreen.style.display = 'none';
  
    if (enteredPassword !== enteredPasswordDuplicate) {
      alert('Пароль не співпадає');
    }
  
    usersLogins.push(enteredUsername);
    usersPasswords.push(enteredPassword);
    
    displayWelcomeMessage(username);
  }
function newUser() {
    const enteredUsername = registerUsernameInput.value;
    const enteredPassword = registerPasswordInput.value;
    const enteredPasswordDuplicate = enteredPasswordDuplicateInput.value;
  
    if (enteredPassword !== enteredPasswordDuplicate) {
      alert('Пароль не співпадає');
      return;
    }
  
    const hashedPassword = CryptoJS.SHA256(enteredPassword).toString(); // Хешуємо пароль
    const hashedUsername = CryptoJS.SHA256(enteredUsername).toString(); // Хешуємо логін
  
    username = enteredUsername;
  
    usersAmount += 1;
    usersLogins.push(hashedUsername);
    usersPasswords.push(hashedPassword);
    console.log("You are " + usersAmount + " user");
    console.log(usersLogins);
    console.log(usersPasswords);
  }
  
  
  RegisterSubmitButton.addEventListener('click', newUser);