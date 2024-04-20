import express from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import { Octokit } from '@octokit/rest';
import { sendAI } from './ai.js';
import sharedsession from 'express-socket.io-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.resolve();
const port = process.env.PORT || 8080;
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer);
const octokit = new Octokit({ auth: process.env.TOKEN_REPO });
const version = "2.0";

const owner = process.env.OWNER_REPO;
const repo = process.env.NAME_REPO;

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

app.use('/welcomeSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/welcomeSound.mp3')));
app.use('/newMessageSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/newMessageSound.mp3')));
app.use('/newUserSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/newUserSound.mp3')));

async function checkVersion() {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: 'versions.json',
    });
    const data = Buffer.from(response.data.content, 'base64').toString();
    const versions = JSON.parse(data).versions;

    let isSupported = false;
    if (versions[version.toString()] === true) {
      isSupported = true;
    }

    return isSupported;
  } catch (error) {
    if(error.message != "getaddrinfo ENOTFOUND api.github.com"){
      console.error('Помилка при перевірці версії:', error.message);
    }
    return false;
  }
}

async function getUsers() {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: 'users.json',
    });
    const data = Buffer.from(response.data.content, 'base64').toString();
    const users = JSON.parse(data).users;
    return users;
  } catch (error) {
    throw new Error('Error getting users: ' + error.message);
  }
}

async function saveUsers(users) {
  try {
    const content = Buffer.from(JSON.stringify({ users }, null, 2)).toString('base64');
    const getUsersResponse = await octokit.repos.getContent({
      owner,
      repo,
      path: 'users.json',
    });
    const sha = getUsersResponse.data.sha;
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'users.json',
      message: 'Update users.json',
      content,
      sha,
    });
  } catch (error) {
    throw new Error('Error saving users: ' + error.message);
  }
}

async function getChannels() {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: 'messages.json',
    });
    const data = Buffer.from(response.data.content, 'base64').toString();
    return JSON.parse(data).channels;
  } catch (error) {
    throw new Error('Error getting channels: ' + error.message);
  }
}

async function saveChannels(channels) {
  try {
    const content = Buffer.from(JSON.stringify({ channels }, null, 2)).toString('base64');
    const getChannelsResponse = await octokit.repos.getContent({
      owner,
      repo,
      path: 'messages.json',
    });
    const sha = getChannelsResponse.data.sha;
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'messages.json',
      message: 'Update messages.json',
      content,
      sha,
    });
  } catch (error) {
    throw new Error('Error saving channels: ' + error.message);
  }
}

async function updateUserChannels(username, channelName) {
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
}

async function updateUserChannelList(username) {
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
}

async function getMessages(channelName) {
  try {
    const channels = await getChannels();
    const channelData = channels.find(c => c.name === channelName);

    if (!channelData) {
      throw new Error('Канал не знайдено.');
    } else {
      return channelData.messages;
    }
  } catch (error) {
    throw new Error('Помилка при отриманні повідомлень: ' + error.message);
  }
}

async function saveMessages(channelName, messageObject) {
  try {
    const channels = await getChannels();
    const channelIndex = channels.findIndex(c => c.name === channelName);

    if (channelIndex !== -1) {
      const newMessageId = channels[channelIndex].messages.length + 1;
      channels[channelIndex].messages.push({
        id: newMessageId,
        author: messageObject.author,
        context: messageObject.context,
      });

      try {
        const content = Buffer.from(JSON.stringify({ channels }, null, 2)).toString('base64');
        const getChannelsResponse = await octokit.repos.getContent({
          owner,
          repo,
          path: 'messages.json',
        });
        const sha = getChannelsResponse.data.sha;
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: 'messages.json',
          message: `New message from ${channelName}`,
          content,
          sha,
        });
      } catch (error) {
        throw new Error('Error saving channels: ' + error.message);
      }
    } else {
      throw new Error(`Канал "${channelName}" не знайдено.`);
    }
  } catch (error) {
    console.error('Помилка при збереженні повідомлень:', error);
    throw error;
  }
}

async function addedUserMessage(eventMessage) {
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
}

async function getRequests() {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: 'requests.json',
    });
    const data = Buffer.from(response.data.content, 'base64').toString();
    const requests = JSON.parse(data).requests;
    return requests;
  } catch (error) {
    throw new Error('Error getting requests: ' + error.message);
  }
}

async function saveRequests(requests) {
  try {
    const content = Buffer.from(JSON.stringify({ requests }, null, 2)).toString('base64');
    const getRequestsResponse = await octokit.repos.getContent({
      owner,
      repo,
      path: 'requests.json',
    });
    const sha = getRequestsResponse.data.sha;
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'requests.json',
      message: 'Update requests.json',
      content,
      sha,
    });
  } catch (error) {
    throw new Error('Error saving requests: ' + error.message);
  }
}

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
      if (foundUser.rank === 'banned') {
        return res.status(423).send({ success: false, message: 'Користувач заблокований' });
      }
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
          theme: user['selected theme'], 
          userId: user.id });
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
    'rank': 'user', 
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
  const isSupportedVersion = await checkVersion();
  if(!isSupportedVersion){
    res.send({ success: false, message: "Оновіть версію додатку" })
  } else if (req.session.username) {
    await addedUserMessage(`${req.session.username} залогінився в RoMan Talk. Вітаємо!`);
    res.send({ loggedIn: true, success: true });
  } else {
    res.send({ loggedIn: false, success: true });
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
      res.json({ username: user.username, 
                 id: user.id, 
                 rank: user.rank });
    } else {
      res.status(404).send({ message: 'Користувача не знайдено.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Помилка сервера.' });
  }
});

app.get('/user-info-by-name/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const users = await getUsers();
    const user = users.find(user => user.username === username);
    if (user) {
      res.json({ username: user.username, 
                 id: user.id,
                 rank: user.rank});
    } else {
      res.status(404).send({ message: 'Користувача не знайдено.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Помилка сервера.' });
  }
});

app.post('/save-rank', async (req, res) => {
  const username = req.session.username;
  const users = await getUsers();
  const user = users.find(user => user.username === username);
  const userRank = req.session.rank;

  if (userRank === 'owner' || userRank === 'admin') {
    const { userId, newRank } = req.body;
    const targetUser = users.find(u => u.id === userId);

    if (!targetUser) {
      return res.status(404).json({ error: 'Користувач не знайдений' });
    }

    targetUser.rank = newRank;
    await saveUsers(users);

    res.json({ message: 'Ранг користувача збережено' });
  } else {
    user.rank = 'banned';
    await saveUsers(users);
    req.session.destroy();
    res.json({ message: 'Використання адміністраторських можливостей користувачам заборонено' });
  }
});

app.post("/block-account", async (req, res) => {
  try {
    const username = req.session.username;
    const users = await getUsers();
    const user = Object.values(users).find(user => user.username === username);
      
     if (user) {
      user.rank = 'banned';
      await saveUsers(users);
    }
    req.session.destroy();
      
      res.status(403).json({ success: false, message: `Ваш акаунт заблоковано з причини незаконного використання адміністраторських інструментів` });
    } catch (error) {
    res.status(500).json({ success: false, message: "Помилка при блокуванні акаунта" });
  }
});

app.post('/send-appeal', async (req, res) => {
  const { username, reason } = req.body;

  try {
    const requests = await getRequests();
    requests.push({ username, reason, 'type':'appeal'});
    await saveRequests(requests);
    res.send({ success: true });
  } catch (error) {
    console.error('Помилка при збереженні апеляції:', error);
    res.status(500).send({ success: false });
  }
});

app.get('/get-appeals', async (req, res) => {
  try {
    const appeals = await getRequests();

    res.status(200).json({ success: true, appeals });
  } catch (error) {
    console.error('Помилка при отриманні апеляцій:', error);
    res.status(500).json({ success: false, message: 'Помилка при отриманні апеляцій.' });
  }
});

app.post('/delete-appeal', async (req, res) => {
  const { index } = req.body;
  const appeals = await getRequests();

  if (index !== undefined && index >= 0 && index < appeals.length) {
    appeals.splice(index, 1);
    await saveRequests(appeals);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Неправильний індекс заявки' });
    console.log(index)
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

app.get('/sorted-channels/:type', async (req, res) => {
  const { type } = req.params;
  const username = req.session.username;
  
  if (!username) {
    return res.status(403).json({ message: 'Потрібно увійти в акаунт для доступу до каналів.' });
  }

  try {
    const users = await getUsers();
    const userIndex = users.findIndex(e => e.username === username);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Користувач не знайдений.' });
    }

    const user = users[userIndex];
    const sortedChannels = user.channels ? [...user.channels] : [];

    if (type === 'name') {
      sortedChannels.sort((a, b) => a.localeCompare(b));
    } else if (type === 'size') {
      sortedChannels.sort((a, b) => a.length - b.length);
    }

    users[userIndex].channels = sortedChannels;
    await saveUsers(users);

    res.json({ channels: sortedChannels, success: true });
  } catch (error) {
    console.error('Помилка при сортуванні каналів:', error);
    res.status(500).json({ message: 'Помилка при сортуванні каналів.' });
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

app.post('/ai', async (req, res) =>{
  const prompt = req.body.message;
  const result = sendAI(prompt);
  res.status(200).json({ res:result.text, success: true });
})

app.get('/check-session', (req, res) => {
  if (req.session.username) {
    res.send({ isLoggedIn: true });
  } else {
    res.send({ isLoggedIn: false });
  }
});

app.post("/get-rank", async (req, res) => {
  try {
    const username = req.session.username;
    const users = await getUsers();
    
    const user = Object.values(users).find(user => user.username === username);
    res.status(200).json({ success: true, rank: user.rank });
  } catch (error){
    res.status(404).json({ success:false, message: "Користувач не знайдений" });
  }
});

app.post('/gpt', async (req, res) => {
  const { message } = req.body;

  const gpt2 = new GPT2();
  const generatedText = await gpt2.generate(message);
  console.log(generatedText)
  res.json({ success: true, message: generatedText });
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

httpServer.listen(port, 'localhost', () => {
  console.log(`Server is running on port ${port}. Test at: http://localhost:${port}/`);
  });
  
// httpServer.listen(port, () => console.log(`App listening on port ${port}!`)); 