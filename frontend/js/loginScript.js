let usersLogins = ["RoMan"];
let usersPasswords = ["123"];

function changeUrlToChat(url) {
  window.location.href = url;
}

export function displayWelcomeMessage(username) {
  const welcomeMessage = `Ласкаво просимо, ${username}! Ви успішно увійшли до RoMan Talk.`;
  displayMessage(welcomeMessage);
}

export function login() {
  const enteredUsername = document.getElementById('username-input').value;
  const enteredPassword = document.getElementById('password-input').value;

  const isValidLogin = usersLogins.includes(enteredUsername);
  const isValidPassword = usersPasswords[usersLogins.indexOf(enteredUsername)] === enteredPassword;

  if (isValidLogin && isValidPassword) {
    username = enteredUsername;
    displayWelcomeMessage(username);
  } else if (isValidLogin && !isValidPassword) {
    alert('Неправильний пароль. Будь ласка, перевірте ваш пароль та спробуйте знову.');
  } else {
    alert('Такого аккаунту не існує. Будь ласка, перевірте ваші дані входу.');
  }
}

document.getElementById('login-button').addEventListener('click', function() {
  changeUrlToChat('chat.html');
});
