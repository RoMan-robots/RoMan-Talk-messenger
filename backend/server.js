import express from 'express';
import session from 'express-session';
import http from 'http';
import path from 'path';
import fs from 'fs';

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
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      req.session.username = username;
      req.session.userId = user.id;
      res.send({ success: true, redirectUrl: '/chat.html' });
    } else {
      res.status(401).send({ success: false, message: 'Неправильний логін або пароль.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});


app.get('/username', (req, res) => {
  const username = req.session.username;
  if (username) {
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
  } else {
    res.send({ username: null });
  }
});



app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send({ success: false, message: 'Ім\'я користувача та пароль не можуть бути порожніми.' });
  }

  const users = await getUsers();
  const userExists = users.find(u => u.username === username);
  if (userExists) {
    return res.status(400).send({ success: false, message: 'Користувач вже існує.' });
  }

  users.push({ id: users.length + 1, username, password });
  await saveUsers(users);

  req.session.username = username;

  res.send({ success: true, message: 'Реєстрація успішна.', redirectUrl: '/chat.html' });
});

app.post('/save-theme', async (req, res) => {
  const username = req.session.username;
  const { theme } = req.body;

  if (!username) {
    return res.status(401).send({ success: false, message: 'Необхідно ввійти в акаунт.' });
  }

  try {
    let users = await getUsers();
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      return res.status(404).send({ success: false, message: 'Користувач не знайдений.' });
    }
    users[userIndex]['selected theme'] = theme;
    await saveUsers(users);
    res.send({ success: true, message: 'Тема збережена.' });
  } catch (error) {
    res.status(500).send({ success: false, message: 'Помилка сервера при збереженні теми.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
});

app.post('/delete-account', async (req, res) => {
  const { password } = req.body;
  let users = await getUsers();
  const userIndex = users.findIndex(user => user.id === req.session.userId);

  if (userIndex === -1) {
    return res.status(404).send({ success: false, message: 'Користувач не знайдений.' });
  }

  if (users[userIndex].password === password) {
    users = users.filter(user => user.id !== req.session.userId);
    await saveUsers(users);
    req.session.destroy();
    res.send({ success: true, message: 'Акаунт видалено успішно.' });
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
  

// app.listen(port, () => console.log(`Example app listening on port ${port}!`));