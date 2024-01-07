import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __dirname = path.resolve();
const port = process.env.PORT || 8080;
const app = express();

app.use(express.json());
app.use(session({
  secret: '123',
  resave: false,
  saveUninitialized: true
}));

app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/favicon.ico', express.static(path.join(__dirname, '../frontend/images/favicon.ico')));

const getUsers = () => {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, 'users.json'), 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        try {
          const parsedData = JSON.parse(data);
          if (Array.isArray(parsedData.users)) {
            resolve(parsedData.users);
          } else {
            reject(new TypeError("Expected 'users' to be an array"));
          }
        } catch (error) {
          reject(error);
        }
      }
    });
  });
};

async function checkUserExists(req, res, next) {
  const username = req.session.username;

  if (!username) {
    return res.status(403).send({ success: false, message: 'Необхідна авторизація.' });
  }

  try {
    const users = await getUsers();
    const userExists = users.some(user => user.username === username);

    if (!userExists) {
      req.session.destroy();
      return res.status(404).send({ success: false, message: 'Користувач не знайдений.', redirectUrl: '/' });
    }

  } catch (error) {
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
}

const saveUsers = (users) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(path.join(__dirname, 'users.json'), JSON.stringify({ users }, null, 4), 'utf8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const users = await getUsers();
    const foundUser = users.find(user => user.username === username);

    if (!foundUser) {
      return res.status(401).send({ success: false, message: 'Користувача не знайдено' });
    }

    const isPasswordMatch = await bcrypt.compare(password, foundUser.password);
    if (isPasswordMatch) {
      req.session.username = foundUser.username;
      req.session.userId = foundUser.id;
      req.session.save((err) => {
        if (err) {
          console.error(err);
          return res.status(500).send({ success: false, message: 'Помилка збереження сесії' });
        }
        res.send({ success: true, redirectUrl: '/chat.html' });
      });
    } else {
      res.status(401).send({ success: false, message: 'Неправильний пароль' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Помилка сервера' });
  }
});


app.get('/username', checkUserExists, (req, res) => {
  const username = req.session.username;
    getUsers().then(users => {
      const user = users.find(u => u.username === username);
      if (user) {
        res.send({ username: user.username, theme: user['selected theme'] });
      } else {
        res.status(404).send({ success: false, message: 'Користувач не знайдений.' });
      }
    }).catch(err => {
      console.error(err);
      res.status(500).send({ success: false, message: 'Помилка сервера.' });
    });
});



app.post('/register', async (req, res) => {
  let { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send({ success: false, message: 'Ім\'я користувача та пароль не можуть бути порожніми.' });
  }

  const users = await getUsers();
  const userExists = users.some(u => u.username === username);
  if (userExists) {
    return res.status(400).send({ success: false, message: 'Користувач вже існує.' });
  }

  password = await bcrypt.hash(password, 10);

  const newUser = {
    id: users.length + 1, 
    username, 
    password,
    'selected theme': 'light'
  };
  users.push(newUser);

  await saveUsers(users);

  req.session.username = username;
  req.session.userId = newUser.id;

  res.send({ success: true, message: 'Реєстрація успішна.', redirectUrl: '/chat.html' });
});

app.get('/messages', checkUserExists, async (req, res) => {
  const username = req.session.username;

  try {
    const users = await getUsers();
    const userExists = users.some(user => user.username === username);

    if (!userExists) {
      req.session.destroy();
      return res.status(404).send({ success: false, message: 'Користувач не знайдений.', redirectUrl: '/' });
    }

    const messages = await getMessages();
    res.send(messages);
  } catch (error) {
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});


const getMessages = () => {
  return new Promise((resolve, reject) => {
    fs.readFile('messages.json', 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  });
};

app.post('/messages', checkUserExists, async (req, res) => {
  try {
    const { author, context } = req.body;
    const messages = await getMessages();
    const newMessageId = messages.length + 1;
    const newMessage = { id: newMessageId, author, context };
    messages.push(newMessage);
    await saveMessages(messages);
    res.send({ success: true, message: 'Повідомлення відправлено.' });
  } catch (error) {
    res.status(500).send({ success: false, message: error });
  }
});

const saveMessages = (messages) => {
  return new Promise((resolve, reject) => {
    fs.writeFile('messages.json', JSON.stringify(messages, null, 4), 'utf8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

app.post('/change-password', checkUserExists, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const username = req.session.username;

  try {
    const users = await getUsers();
    const userIndex = users.findIndex(user => user.username === username);

    const isOldPasswordMatch = await bcrypt.compare(oldPassword, users[userIndex].password);
    if (!isOldPasswordMatch) {
      return res.status(401).send({ success: false, message: 'Неправильний старий пароль.' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    users[userIndex].password = hashedNewPassword;
    await saveUsers(users);

    res.send({ success: true, message: 'Пароль успішно змінено.' });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});


app.post('/save-theme', checkUserExists, async (req, res) => {
  const username = req.session.username;
  const { theme } = req.body;

  try {
    let users = await getUsers();
    const userIndex = users.findIndex(u => u.username === username);
    users[userIndex]['selected theme'] = theme;
    await saveUsers(users);
    res.send({ success: true, message: 'Тема збережена.' });
  } catch (error) {
    res.status(500).send({ success: false, message: 'Помилка сервера при збереженні теми.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.send({ success: true, redirectUrl: '/' });
});

app.post('/delete-account', checkUserExists, async (req, res) => {
  const { password } = req.body;
  let users = await getUsers();
  const userIndex = users.findIndex(user => user.id === req.session.userId);

  const isPasswordMatch = await bcrypt.compare(password, users[userIndex].password);
  if (isPasswordMatch) {
    users = users.filter(user => user.id !== req.session.userId);
    await saveUsers(users);
    req.session.destroy();
    res.send({ success: true, message: 'Акаунт видалено успішно.', redirectUrl: '/' });
  } else {
    res.status(401).send({ success: false, message: 'Невірний пароль.' });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "index.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "login.html"));
});

app.get("/register.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "register.html"));
});

app.get("/chat.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html" , "chat.html"));
});

app.get("/settings.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "settings.html"));
});

app.listen(port, 'localhost', () => {
  console.log(`Server is running on port ${port}. Test at: http://localhost:${port}/`);
  });
  

// app.listen(port, () => console.log(`App listening on port ${port}!`));