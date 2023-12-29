window.username = '';
let usersLogins = ["RoMan"];
let usersPasswords = ["123"];

function changeUrlToChat(url) {
  window.location.href = url;
}


function login() {
  const enteredUsername = document.getElementById('username-input').value;
  const enteredPassword = document.getElementById('password-input').value;

  const isValidLogin = usersLogins.includes(enteredUsername);
  const isValidPassword = usersPasswords[usersLogins.indexOf(enteredUsername)] === enteredPassword;

  if (isValidLogin && isValidPassword) {
    username = enteredUsername;
    changeUrlToChat('chat.html');
  } else if (isValidLogin && !isValidPassword) {
    alert('Неправильний пароль. Будь ласка, перевірте ваш пароль та спробуйте знову.');
  } else {
    alert('Такого аккаунту не існує. Будь ласка, перевірте ваші дані входу.');
  }
}