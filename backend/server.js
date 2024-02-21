import express from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import mongoose from 'mongoose';
import sharedsession from 'express-socket.io-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.resolve();
const port = process.env.PORT || 8080;
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(cookieParser());

io.use(sharedsession(sessionMiddleware, {
    autoSave: true
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
    const dataToSave = JSON.stringify({ users }, null, 4);
    fs.writeFile(path.join(__dirname, 'users.json'), dataToSave, 'utf8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const getChannels = () => {
  return new Promise((resolve, reject) => {
    fs.readFile('messages.json', 'utf8', (err, data) => {
      if (err) reject(err);
      else {
        const obj = JSON.parse(data);
        resolve(obj.channels);
      }
    });
  });
};


const saveChannels = (channels) => {
  return new Promise((resolve, reject) => {
    const dataToSave = JSON.stringify({ channels }, null, 4);
    fs.writeFile('messages.json', dataToSave, 'utf8', (err) => {
      if (err) {
        console.error('Помилка при збереженні каналів:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const updateUserChannels = async (username, channelName) => {
  try {
    const users = await getUsers();
    const userIndex = users.findIndex(user => user.username === username);

    if (userIndex === -1) {
      throw new Error('User not found.');
    }

    if (!users[userIndex].channels.includes(channelName)) {
      users[userIndex].channels.push(channelName);
      await saveUsers(users);
    }
  } catch (error) {
    console.error('Error in updateUserChannels:', error);
    throw error;
  }
};

const updateUserChannelList = async (username) => {
  try {
    const users = await getUsers();
    const channels = await getChannels();
    const user = users.find(u => u.username === username);
    if (!user) throw new Error('Користувача не знайдено.');

    const userChannels = user.channels;

    const updatedChannels = userChannels.filter(channelName => {
      const channel = channels.find(c => c.name === channelName);
      return channel && (!channel.isPrivate || (channel.isPrivate && channel.subs.includes(user.id.toString())));
    });

    if (updatedChannels.length !== userChannels.length) {
      user.channels = updatedChannels;
      await saveUsers(users);
    }
  } catch (error) {
    console.error(`Помилка при оновленні списку каналів для ${username}:`, error);
  }
};


const getMessages = (channel) => {
  return new Promise((resolve, reject) => {
    fs.readFile('messages.json', 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        try {
          const obj = JSON.parse(data);
          const channelData = obj.channels.find(c => c.name === channel);
          if (!channelData) {
            reject(new Error('Канал не знайдено.'));
          } else {
            resolve(channelData.messages);
          }
        } catch (error) {
          reject(error);
        }
      }
    });
  });
};

const saveMessages = async (channelName, messageObject) => {
  try {
    const data = await fs.promises.readFile('messages.json', 'utf8');
    let obj = JSON.parse(data);

    let channelIndex = obj.channels.findIndex(c => c.name === channelName);

    if (channelIndex !== -1) {
      obj.channels[channelIndex].messages.push({
        id: obj.channels[channelIndex].messages.length + 1,
        author: messageObject.author,
        context: messageObject.context
      });
    } else {
      throw new Error(`Канал "${channelName}" з типом ${typeof channelName} не знайдено.`);
    }

    const dataToSave = JSON.stringify(obj, null, 4);
    await fs.promises.writeFile('messages.json', dataToSave, 'utf8');
  } catch (error) {
    console.error('Помилка при збереженні повідомлень:', error);
    throw error;
  }
};

const addedUserMessage = async (eventMessage) => {
  try {
    const newMessageId = await getMessages("RoMan World Official")
      .then(messages => messages.length + 1)
      .catch(error => { throw error; });
    const newMessage = { id: newMessageId, author: 'Привітання', context: eventMessage };

    await saveMessages("RoMan World Official", newMessage).catch(error => { throw error; });

    io.emit('chat message', "RoMan World Official", newMessage);
  } catch (error) {
    console.error('Помилка при додаванні події:', error);
  }
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
      req.session.destroy(() => {
        res.status(404).send({ success: false, message: 'Користувач не знайдений.', redirectUrl: '/' });
      });
    } else {
      next();
    }
  } catch (error) {
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
}

io.on('connection', (socket) => {
  socket.on('new message', (channel, messageData) => {
    io.emit('chat message', channel, messageData);
  });
});

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
      req.session.save(async (err) =>{
          if (err) {
              console.error(err);
              return res.status(500).send({ success: false, message: 'Помилка збереження сесії' });
          }
          res.cookie('isLoggedIn', true, { httpOnly: true, maxAge: 3600000 });
          res.send({ success: true, redirectUrl: '/chat.html' });

          await addedUserMessage(`${username} залогінився в RoMan Talk. Вітаємо!`);
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
        res.send({ 
          success: true, 
          username: user.username, 
          theme: user['selected theme'], userId: user.id });
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
    'selected theme': 'light',
    channels: ['RoMan World Official']
  };
  users.push(newUser);

  await saveUsers(users);

  req.session.username = username;
  req.session.userId = newUser.id;

  res.cookie('isLoggedIn', true, { httpOnly: true, maxAge: 3600000 });

  res.send({ success: true, message: 'Реєстрація успішна.', redirectUrl: '/chat.html' });
  await addedUserMessage(`${username} зареєструвався в RoMan Talk. Вітаємо!`);
  console.log(newUser);
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

app.post('/messages', checkUserExists, async (req, res) => {
  try {
    const messageObject = req.body;
    const channelName = messageObject.channel
    await saveMessages(channelName, messageObject);
    io.emit('chat message', channelName, messageObject);
    res.send({ success: true, message: 'Повідомлення відправлено.' });
  } catch (error) {
    res.status(500).send({ success: false, message: error });
  }
});

app.get("/session-status", async (req, res) => {
  if (req.session.username) {
    await addedUserMessage(`${req.session.username} залогінився в RoMan Talk. Вітаємо!`);
    res.send({ loggedIn: true });
  } else {
    res.send({ loggedIn: false });
  }
});

app.get('/user-channels', checkUserExists, async (req, res) => {
  const username = req.session.username;
  await updateUserChannelList(username);
  const users = await getUsers();
  const user = users.find(u => u.username === username);

  if (user) {
    res.send({ channels: user.channels });
  } else {
    res.status(404).send({ success: false, message: 'Користувача не знайдено.' });
  }
});

app.get('/my-channels', checkUserExists, async (req, res) => {
  const username = req.session.username;
  try {
    const channels = await getChannels();
    const myChannels = channels.filter(channel => channel.owner === username);
    res.json({ myChannels });
  } catch (error) {
    console.error('Помилка при отриманні "моїх каналів":', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.get('/channel-messages/:channelName', checkUserExists, async (req, res) => {
  const { channelName } = req.params;
  try {
    const messages = await getMessages(channelName);
    res.send({ channels: [{ name: channelName, messages }] });
  } catch (error) {
    if (error.message === 'Канал не знайдено.') {
      res.status(404).send({ success: false, message: 'Канал не знайдено.' });
    } else {
      console.error('Помилка при отриманні повідомлень:', error);
      res.status(500).send({ success: false, message: 'Помилка сервера.' });
    }
  }
});


app.post('/create-channel', checkUserExists, async (req, res) => {
  const { channelName } = req.body;
  const username = req.session.username;

  try {
    const channels = await getChannels();
    const channelExists = channels.some(channel => channel.name === channelName);
    
    if (channelExists) {
      return res.status(400).send({ success: false, message: 'Канал вже існує.' });
    }

    const newChannel = { 
      name: channelName, 
      owner: username,
      isPrivate: false,
      messages: [
        {
          id: 1,
          author: "Системне",
          context: `Канал ${channelName} створено`
        }], 
      subs: []
      };
    channels.push(newChannel);
    await saveChannels(channels);
    await updateUserChannels(username, channelName);

    res.send({ success: true, message: 'Канал створено успішно.' });
    
  } catch (error) {
    console.error('Помилка при створенні каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.get('/get-channels', async (req, res) => {
  try {
    const username = req.session.username;
    const users = await getUsers();
    const user = users.find(u => u.username === username);
    const userId = user.id;

    let channels = await getChannels();
    channels = channels.filter(channel => !channel.isPrivate || (channel.isPrivate && channel.subs.includes(userId.toString())));

    res.send({ success: true, channels });
  } catch (error) {
    console.error('Помилка при отриманні списку каналів:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера при отриманні каналів.' });
  }
});

app.post('/add-channel-to-user', checkUserExists, async (req, res) => {
  const { channelName } = req.body;
  const username = req.session.username;

  try {
    await updateUserChannels(username, channelName);
    res.send({ success: true, message: 'Канал додано до списку користувача.' });
  } catch (error) {
    console.error('Помилка при додаванні каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.post('/channel/set-privacy', checkUserExists, async (req, res) => {
  const { channelName, isPrivate } = req.body;
  try {
    const channels = await getChannels();
    const channelIndex = channels.findIndex(channel => channel.name === channelName);
    if (channelIndex !== -1) {
      channels[channelIndex].isPrivate = isPrivate;
      await saveChannels(channels);
      res.send({ success: true, message: 'Приватність каналу оновлено.' });
    } else {
      res.status(404).send({ success: false, message: 'Канал не знайдено.' });
    }
  } catch (error) {
    console.error('Помилка при встановленні приватності каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.get('/user-info/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const users = await getUsers();
    const user = users.find(user => user.id === parseInt(userId));

    if (user) {
      res.json({ username: user.username });
    } else {
      res.status(404).send({ message: 'Користувача не знайдено.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Помилка сервера.' });
  }
});

app.post('/add-subscriber', checkUserExists, async (req, res) => {
  const { userId, channelName } = req.body;
  
  try {
      const channels = await getChannels();
      const channelIndex = channels.findIndex(channel => channel.name === channelName);

      if (channelIndex === -1) {
          return res.status(404).send({ success: false, message: 'Канал не знайдено.' });
      }

      const channel = channels[channelIndex];

      if (!channel.isPrivate) {
          return res.status(403).send({ success: false, message: 'Цей канал не є приватним.' });
      }

      if (channel.subs.includes(userId)) {
          return res.status(409).send({ success: false, message: 'Користувач вже є у цьому каналі.' });
      }

      channel.subs.push(userId);
      await saveChannels(channels);

      res.send({ success: true, message: 'Користувача додано до каналу.' });
  } catch (error) {
      console.error('Помилка при додаванні користувача до каналу:', error);
      res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.post('/remove-subscriber', checkUserExists, async (req, res) => {
  const { userId, channelName } = req.body;

  try {
      const channels = await getChannels();
      const channelIndex = channels.findIndex(channel => channel.name === channelName);
      
      if (channelIndex === -1) {
          return res.status(404).send({ success: false, message: 'Канал не знайдено.' });
      }

      const channel = channels[channelIndex];
      const subscriberIndex = channel.subs.indexOf(userId);
      if (subscriberIndex !== -1) {
          channel.subs.splice(subscriberIndex, 1);
          await saveChannels(channels);
          res.send({ success: true, message: 'Користувача видалено з каналу.' });
      } else {
          res.status(404).send({ success: false, message: 'Підписника не знайдено в каналі.' });
      }
  } catch (error) {
      console.error('Помилка при видаленні підписника:', error);
      res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});


app.get('/channel-subscribers/:channelName', checkUserExists, async (req, res) => {
  const { channelName } = req.params;

  try {
    const channels = await getChannels();
    const channel = channels.find(c => c.name === channelName);

    if (!channel) {
      return res.status(404).send({ success: false, message: 'Канал не знайдено.' });
    }

    if (!channel.isPrivate) {
      return res.status(403).send({ success: false, message: 'Цей канал не є приватним.' });
    }

    const subscribers = Array.isArray(channel.subs) ? channel.subs : [];
    res.json({ subscribers });
  } catch (error) {
    console.error('Помилка при отриманні підписників каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.get('/get-channel-privacy/:channelName', checkUserExists, async (req, res) => {
  const { channelName } = req.params;
  try {
    const channels = await getChannels();
    const channel = channels.find(c => c.name === channelName);
    if (channel) {
      res.json({ isPrivate: channel.isPrivate });
    } else {
      res.status(404).send({ success: false, message: 'Канал не знайдено.' });
    }
  } catch (error) {
    console.error('Помилка при отриманні приватності каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.post('/update-user-channels', checkUserExists, async (req, res) => {
  const { subscribers, channelName } = req.body;
  try {
    const users = await getUsers();
    subscribers.forEach((userId) => {
      const userIndex = users.findIndex(user => user.id === userId);
      if (userIndex !== -1 && !users[userIndex].channels.includes(channelName)) {
        users[userIndex].channels.push(channelName);
      }
    });
    await saveUsers(users);
    res.send({ success: true, message: 'Канали користувачів оновлено.' });
  } catch (error) {
    console.error('Помилка при оновленні каналів користувачів:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});


app.post('/channel/clear-subscribers', checkUserExists, async (req, res) => {
  const { channelName } = req.body;
  try {
    const channels = await getChannels();
    const channelIndex = channels.findIndex(channel => channel.name === channelName);
    if (channelIndex !== -1) {
      channels[channelIndex].subs = [];
      await saveChannels(channels);
      res.send({ success: true, message: 'Список підписників каналу очищено.' });
    } else {
      res.status(404).send({ success: false, message: 'Канал не знайдено.' });
    }
  } catch (error) {
    console.error('Помилка при очищенні підписників каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});


app.post('/channel/delete', checkUserExists, async (req, res) => {
  const { currentChannelName, password } = req.body;
  const username = req.session.username;

  try {
    const users = await getUsers();
    const user = users.find(u => u.username === username);

    const channels = await getChannels();

    const channel = channels.find(c => c.name === currentChannelName);

    if (!channel) {
      return res.status(404).send({ success: false, message: 'Канал не знайдено. ' });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      return res.status(401).send({ success: false, message: 'Неправильний пароль.' });
    }

    const updatedChannels = channels.filter(c => c.name !== currentChannelName);
    await saveChannels(updatedChannels);
    res.send({ success: true, message: 'Канал видалено.' });

  } catch (error) {
    console.error('Помилка при видаленні каналу:', error);
    res.status(500).send({ success: false, message: 'Помилка сервера.' });
  }
});

app.get('/check-session', (req, res) => {
  if (req.session.username) {
    res.send({ isLoggedIn: true });
  } else {
    res.send({ isLoggedIn: false });
  }
});

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
  res.clearCookie('isLoggedIn');
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
    res.clearCookie('isLoggedIn');
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

app.get("/tos.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html" , "tos.html"));
})

app.get("/settings.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "settings.html"));
});

// httpServer.listen(port, 'localhost', () => {
//   console.log(`Server is running on port ${port}. Test at: http://localhost:${port}/`);
//   });
  
httpServer.listen(port, () => console.log(`App listening on port ${port}!`)); 