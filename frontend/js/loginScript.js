const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');

let usersLogins = [
    "RoMan"
  ];
  
  let usersPasswords = [
    "123"
  ];
  
  

  function login() {
    const enteredUsername = usernameInput.value;
    const enteredPassword = passwordInput.value;
  
    const isValidLogin = usersLogins.includes(enteredUsername);
    const isValidPassword = usersPasswords[usersLogins.indexOf(enteredUsername)] === enteredPassword;
    while (True){
      if (isValidLogin && isValidPassword) {
        username = enteredUsername;
        displayWelcomeMessage(username);
        break;
        } else if (isValidLogin && !isValidPassword) {
        alert('Неправильний пароль. Будь ласка, перевірте ваш пароль та спробуйте знову.');
  
        } else {
          alert('Такого аккаунту не існує. Будь ласка, перевірте ваші дані входу.');
        }
      }
    }
  
  function displayWelcomeMessage(username) {
    const welcomeMessage = `Ласкаво просимо, ${username}! Ви успішно увійшли до RoMan Talk.`;
    displayMessage(welcomeMessage);
  }
  
  function changeUrlToChat(url) {
    window.location.href = url;
  }
  
  
  loginButton.addEventListener('click', login);
  