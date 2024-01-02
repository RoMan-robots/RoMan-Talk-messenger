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
        const parsedData = JSON.parse(data);
        resolve(parsedData.users);
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
      res.send({ success: true, redirectUrl: '/chat.html' });
    } else {
      res.status(401).send({ success: false, message: 'Неправильний логін або пароль.' });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.get('/username', (req, res) => {
  if (req.session.username) {
    res.send({ username: req.session.username });
  } else {
    res.send({ username: null });
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