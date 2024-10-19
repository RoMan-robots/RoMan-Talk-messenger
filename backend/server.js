import express from 'express';
import fileUpload from "express-fileupload"
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import uaParser from 'ua-parser-js';
import geoip from 'geoip-lite';
import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken'
import path from 'path';
import LanguageDetect from 'languagedetect';
import fs from "fs-extra"
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import {
    filterText,
    checkGrammar,
    analyzeSentiment,
    rephraseText,
    loadModels,
    translateTextInParts
} from './ai.js';

dotenv.config();

const __dirname = path.resolve();
const port = process.env.PORT || 8080;
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer);
const octokit = new Octokit({ auth: process.env.TOKEN_REPO });
const localDir = path.join(__dirname, 'images/message-images');

const owner = process.env.OWNER_REPO;
const repo = process.env.NAME_REPO;

let loginAttempts = {};

const lngDetector = new LanguageDetect();
let modelsLoaded = false;
let models = {}

app.use(fileUpload());
app.use(express.json());

app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

app.use('/photos', express.static(localDir));

const imagesDir = path.join(__dirname, '/images/bg');

let shuffledImages = [];
let currentIndex = 0;

app.use('/favicon.ico', express.static(path.join(__dirname, '/images/favicon.ico')));

app.use('/tutorial1.png', express.static(path.join(__dirname, '/images/tutorial1.png')));
app.use('/tutorial2.png', express.static(path.join(__dirname, '/images/tutorial2.png')));
app.use('/tutorial3.png', express.static(path.join(__dirname, '/images/tutorial3.png')));
app.use('/tutorial4.png', express.static(path.join(__dirname, '/images/tutorial4.png')));

app.use('/welcomeSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/welcomeSound.mp3')));
app.use('/newMessageSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/newMessageSound.mp3')));
app.use('/newUserSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/newUserSound.mp3')));
app.use('/tutorialSound.mp3', express.static(path.join(__dirname, '../frontend/sounds/tutorialSound.mp3')));

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    console.log("Shuffled array")
    return array;
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

async function ensureModelsLoaded() {
    if (!modelsLoaded) {
        models = await loadModels();
        modelsLoaded = true;
        console.log('Models loaded successfully');
    }
}
async function rephormatMessagesID(channelName) {
    try {
        let messages = await getMessages(channelName);

        const reformattedMessages = messages.map((message, index) => {
            return { ...message, id: index + 1 };
        });

        await saveAllMessages(channelName, reformattedMessages);
        console.log(`Повідомлення в каналі ${channelName} були успішно переформатовані.`);
    } catch (error) {
        console.error('Помилка при переформатуванні ID повідомлень:', error);
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

async function saveMessages(channelName, messageObject, messageType = "classic", retries = 3) {
    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channelName);

        if (channelIndex !== -1) {
            const channel = channels[channelIndex];
            const newMessageId = channel.messages.length + 1;

            let newMessage = {
                id: newMessageId,
                author: messageObject.author,
                context: messageObject.context,
            };

            if (messageType === 'photo' && messageObject.image) {
                const originalFileName = messageObject.image.name;

                const sanitizedFileName = originalFileName.replace(/\s+/g, '_');

                const imageFileName = `${newMessageId}--${sanitizedFileName}`;
                newMessage.photo = imageFileName;
                await uploadImage(messageObject.image, imageFileName, channelName);

                newMessage.photo = `${imageFileName}`;
            }

            channel.messages.push(newMessage);

            const content = Buffer.from(JSON.stringify({ channels }, null, 2)).toString('base64');

            try {
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
                if (retries > 0) {
                    console.log(`Retrying saveMessages due to conflict... Attempts left: ${retries}`);
                    return saveMessages(channelName, messageObject, messageType, retries - 1);
                } else {
                    throw new Error('Error saving channels: ' + error.message);
                }
            }
        } else {
            throw new Error(`Канал "${channelName}" не знайдено.`);
        }
    } catch (error) {
        console.error('Помилка при збереженні повідомлень:', error);
        throw error;
    }
}

async function saveAllMessages(channelName, reformattedMessages, retries = 3) {
    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channelName);

        if (channelIndex !== -1) {
            const channel = channels[channelIndex];
            channel.messages = reformattedMessages;

            const content = Buffer.from(JSON.stringify({ channels }, null, 2)).toString('base64');

            try {
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
                    message: `Reformatted messages in ${channelName}`,
                    content,
                    sha,
                });
            } catch (error) {
                if (retries > 0) {
                    console.log(`Retrying saveAllMessages due to conflict... Attempts left: ${retries}`);
                    return saveAllMessages(channelName, reformattedMessages, retries - 1);
                } else {
                    throw new Error('Error saving channels: ' + error.message);
                }
            }
        } else {
            throw new Error(`Канал "${channelName}" не знайдено.`);
        }
    } catch (error) {
        console.error('Помилка при збереженні переформатованих повідомлень:', error);
        throw error;
    }
}

async function editMessage(channelName, messageId, { newContent, newId }) {
    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channelName);

        if (channelIndex !== -1) {
            let messageFound = false;

            channels[channelIndex].messages.forEach(message => {
                if (message.id === messageId) {
                    if (newContent !== undefined) {
                        message.content = newContent;
                    }
                    if (newId !== undefined) {
                        message.id = newId;
                    }
                    messageFound = true;
                }
            });

            if (messageFound) {
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
                    message: `Updated message ${messageId} in channel ${channelName}`,
                    content,
                    sha,
                });
            } else {
                throw new Error(`Повідомлення з ID ${messageId} не знайдено у каналі "${channelName}".`);
            }
        } else {
            throw new Error(`Канал "${channelName}" не знайдено.`);
        }
    } catch (error) {
        console.error('Помилка при редагуванні повідомлення:', error);
        throw error;
    }
}

async function deleteMessage(channelName, messageId) {
    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channelName);

        if (channelIndex !== -1) {
            const messages = channels[channelIndex].messages;
            const messageToDelete = messages.find(message => message.id === messageId);

            if (!messageToDelete) {
                throw new Error('Повідомлення не знайдено.');
            }

            channels[channelIndex].messages = messages.filter(message => message.id !== messageId);

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
                message: `Deleted message with ID ${messageId} from ${channelName}`,
                content,
                sha,
            });

            return true;
        } else {
            throw new Error(`Канал "${channelName}" не знайдено.`);
        }
    } catch (error) {
        console.error('Помилка при видаленні повідомлення:', error);
        throw error;
    }
}

async function addedUserMessage(eventMessage) {
    try {
        const newMessageId = await getMessages("RoMan_World_Official")
            .then(messages => messages.length)
            .catch(error => { throw error; });
        const newMessage = { id: newMessageId, author: 'Привітання', context: eventMessage };

        await saveMessages("RoMan_World_Official", newMessage).catch(error => { throw error; });

        io.emit('chat message', "RoMan_World_Official", newMessage);
    } catch (error) {
        console.error('Помилка при додаванні події:', error);
    }
}

async function uploadImage(imageFile, imageFileName, channelName) {
    const base64Image = imageFile.data.toString('base64');
    const imagePath = `images/${channelName}/${imageFileName}`;

    try {
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: imagePath,
            message: `Upload image ${imageFileName} for channel ${channelName}`,
            content: base64Image,
        });
    } catch (error) {
        console.error('Error uploading image to GitHub:', error);
        throw error;
    }
}

async function deletePhoto(channelName, fileName) {
    const filePath = `images/${channelName}/${fileName}`;

    try {
        const { data: fileInfo } = await octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
        });

        await octokit.repos.deleteFile({
            owner,
            repo,
            path: filePath,
            message: `Delete image ${fileName}`,
            sha: fileInfo.sha,
        });
    } catch (error) {
        console.error('Error deleting file from GitHub:', error);
        throw error;
    }
}

async function downloadImages(channelName) {
    const channelDir = path.join(localDir, channelName);

    try {
        await fs.ensureDir(channelDir);

        const { data: files } = await octokit.repos.getContent({
            owner,
            repo,
            path: `images/${channelName}`,
        });

        for (const file of files) {
            if (file.type === 'file') {
                const filePath = file.path;
                const fileName = path.basename(filePath);

                const { data: fileContent } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: filePath,
                });

                const fileBuffer = Buffer.from(fileContent.content, 'base64');
                const localFilePath = path.join(channelDir, fileName);
                await fs.writeFile(localFilePath, fileBuffer);
            }
        }
    } catch (error) {
        console.error('Error downloading images:', error);
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

async function getSecurity() {
    try {
        const response = await octokit.repos.getContent({
            owner,
            repo,
            path: 'security.json',
        });
        const data = Buffer.from(response.data.content, 'base64').toString();
        return JSON.parse(data).security;
    } catch (error) {
        throw new Error('Error getting security data: ' + error.message);
    }
}

async function saveSecurity(security) {
    try {
        const content = Buffer.from(JSON.stringify({ security }, null, 2)).toString('base64');
        const getSecurityResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: 'security.json',
        });
        const sha = getSecurityResponse.data.sha;
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: 'security.json',
            message: 'Update security.json',
            content,
            sha,
        });
    } catch (error) {
        throw new Error('Error saving security data: ' + error.message);
    }
}

async function alertSecurity(req, ip, username, messageText) {
    const security = await getSecurity();
    const userAgent = req.headers['user-agent'];
    const parser = uaParser(userAgent);
    const deviceInfo = parser.os.name;

    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const formattedDateTime = `${day}.${month}.${year} ${hours}:${minutes}`;

    const geo = geoip.lookup(ip);
    let location;
    if (geo) {
        const { city, country, timezone } = geo;

        if (city) {
            location = `${city}, ${country}`;
        } else if (timezone) {
            const tzParts = timezone.split('/');
            location = tzParts.length === 2 ? `${tzParts[1].replace('_', ' ')}, ${country}` : country;
        } else {
            location = 'невідоме';
        }
    } else {
        location = 'невідоме';
    }

    const message = {
        message: messageText,
        device: deviceInfo,
        location: location,
        when: formattedDateTime
    };

    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const userSecurityLogs = security.find(entry => Object.keys(entry)[0] === username);
    if (userSecurityLogs) {

        userSecurityLogs[username] = userSecurityLogs[username].filter(log => {
            const logDate = log.when.split(' ')[0].split('.');
            const logDateTime = new Date(logDate[2], logDate[1] - 1, logDate[0]);
            return logDateTime >= oneWeekAgo;
        });

        userSecurityLogs[username].unshift(message);
    } else {
        security.unshift({ [username]: [message] });
    }

    await saveSecurity(security);
}

function checkUserExists(req, res, next) {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(499).send({ success: false, message: 'Токен не надано.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.username = decoded.username;
        next();
    } catch (err) {
        console.log(err)
        return res.status(499).send({ success: false, message: 'Невірний або прострочений токен.' });
    }
}

io.on('connection', (socket) => {
    socket.on('new message', async (channel, messageData) => {
        try {
            const messages = await getMessages(channel);
            const id = messages.length + 1;

            io.emit('chat message', channel, messageData, id);
        } catch (error) {
            console.error('Error handling new message:', error);
        }
    });

    socket.on('delete message', async (channelName, messageId) => {
        try {
            await deleteMessage(channelName, messageId);
            io.emit('message deleted', channelName, messageId);
        } catch (error) {
            console.error('Помилка при видаленні повідомлення:', error);
        }
    });

    socket.on('edit message', async (channelName, messageId, newContent) => {
        try {
            await editMessage(channelName, messageId, { newContent: newContent });
            io.emit('message edited', channelName, messageId, newContent);
        } catch (error) {
            console.error('Помилка при редагуванні повідомлення:', error);
        }
    });
});

app.get('/set-bg', (req, res) => {
    if (shuffledImages.length === 0) {
        return res.status(500).send('No images found');
    }

    const randomImage = shuffledImages[currentIndex];
    const imagePath = path.join(imagesDir, randomImage);

    fs.access(imagePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error(`File not found: ${imagePath}`);
            return res.status(404).send('Image not found');
        }

        res.sendFile(imagePath);
    });

    currentIndex = (currentIndex + 1) % shuffledImages.length;
});

app.post('/login', async (req, res) => {
    const { username, password, checked, ip } = req.body;

    try {
        const users = await getUsers();
        const foundUser = users.find(user => user.username === username);

        if (!foundUser) {
            return res.status(401).send({ success: false, message: 'Користувача не знайдено' });
        }

        const now = Date.now();
        const userAttempts = loginAttempts[username] || [];
        const recentAttempts = userAttempts.filter(attemptTime => now - attemptTime < 60000);

        if (recentAttempts.length >= 5) {
            await alertSecurity(req, ip, username, "Хтось намагається зайти на ваш акаунт. Введено 5 невірних паролів на ваше ім'я.");

            return res.status(401).send({ message: "Перевищено максимальну кількість спроб входу. Будь ласка, спробуйте пізніше." });
        }

        const isPasswordMatch = await bcrypt.compare(password, foundUser.password);

        if (isPasswordMatch) {
            if (foundUser.rank === 'banned') {
                return res.status(423).send({ success: false, message: 'Користувач заблокований' });
            }

            const token = jwt.sign(
                { userId: foundUser.id, username: foundUser.username },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.send({ success: true, redirectUrl: 'chat.html', token: token });

            if (!checked) {
                await addedUserMessage(`${username} залогінився в RoMan Talk. Вітаємо!`);
            }

            await alertSecurity(req, ip, username, "Хтось зайшов в акаунт. Пильнуємо далі за активністю акаунту...");
        } else {
            loginAttempts[username] = [...userAttempts, now];
            res.status(401).send({ success: false, message: 'Неправильний пароль' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: 'Помилка сервера' });
    }
});

app.get('/username', checkUserExists, (req, res) => {
    const username = req.username;
    getUsers().then(users => {
        const user = users.find(u => u.username === username);
        if (user) {
            res.send({
                success: true,
                username: user.username,
                theme: user['selected theme'],
                userId: user.id
            });
        } else {
            res.status(404).send({ success: false, message: 'Користувач не знайдений.' });
        }
    }).catch(err => {
        console.error(err);
        res.status(500).send({ success: false, message: 'Помилка сервера.' });
    });
});

app.post('/register', async (req, res) => {
    let { username, password, theme } = req.body;

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
        'selected theme': theme,
        'rank': 'user',
        channels: ['RoMan_World_Official']
    };
    users.push(newUser);

    await saveUsers(users);

    const security = await getSecurity();
    security.push({ [username]: [] });
    await saveSecurity(security);

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.send({ success: true, message: 'Реєстрація успішна.', token });
    await addedUserMessage(`${username} зареєструвався в RoMan Talk. Вітаємо!`);
});

app.post('/messages', checkUserExists, async (req, res) => {
    try {
        const messageObject = req.body;
        const channelName = messageObject.channel;

        const filteredText = filterText(messageObject.context);
        messageObject.context = filteredText;

        const messages = await getMessages(channelName);
        const id = messages.length ? messages.length : 0;
        messageObject.id = id + 1;

        await saveMessages(channelName, messageObject);
  
        io.emit('chat message', channelName, messageObject);

        res.status(200).send({ success: true, message: 'Повідомлення відправлено.' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send({ success: false, message: 'Сталася помилка під час відправки повідомлення.' });
    }
});

app.post('/upload-photo-message', async (req, res) => {
    try {
        const { channelName, author, context } = req.body;
        const photos = req.files?.photo;
        let messageObject = { author, context };

        const processPhoto = (photo) => {
            const validExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
            const trimmedPhotoName = photo.name.replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, '_');
            const fileExtension = trimmedPhotoName.split('.').pop().toLowerCase();

            if (!validExtensions.includes(`.${fileExtension}`)) {
                throw new Error('Відправляти можна лише фотографії!');
            }

            if (photo.size > 10 * 1024 * 1024) {
                throw new Error('Фотографія повинна важити до 10мб!');
            }

            return trimmedPhotoName;
        };

        if (Array.isArray(photos) && photos.length > 1) {
            return res.status(400).send('Можна відправляти лише одну фотографію за раз!');
        }

        if (photos) {
            const photo = Array.isArray(photos) ? photos[0] : photos;
            messageObject.image = photo;
            messageObject.image.name = processPhoto(photo);
        }

        await saveMessages(channelName, messageObject, 'photo');
        const messages = await getMessages(channelName);
        messageObject.id = messages.length;
        messageObject.photo = `${messageObject.id}--${messageObject.image.name}`;

        await downloadImages(channelName);

        const filePath = path.join(__dirname, 'images', 'message-images', channelName, messageObject.photo);
        let responseSent = false;

        const checkFileExistence = setInterval(() => {
            if (fs.existsSync(filePath) && !responseSent) {
                clearInterval(checkFileExistence);
                responseSent = true;
                io.emit('chat message', channelName, messageObject);
                res.status(200).json({ success: true, message: 'Повідомлення з фото успішно збережено.' });
            }
        }, 500);

        setTimeout(() => {
            clearInterval(checkFileExistence);
            if (!fs.existsSync(filePath) && !responseSent) {
                responseSent = true;
                res.status(500).json({ success: false, message: 'Файл не знайдено після завантаження.' });
            }
        }, 20000);

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message || 'Помилка сервера.' });
        }
    }
});

app.post("/session-status", async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const version = req.body.ver;

    const supportedVersions = {
        "1.2.1": false,
        "2.0": true,
        "2.1": true
    };

    if (!supportedVersions[version]) {
        return res.status(426).send({ success: false, message: 'Ця версія RoMan Talk застаріла. Спробуйте оновити додаток' });
    }

    let username = null;

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            username = decoded.username;
        } catch (err) {
            return res.status(401).send({ success: false, message: 'Неправильний або прострочений токен.' });
        }
    }

    if (username) {
        res.send({ loggedIn: true, success: true });
    } else {
        res.send({ loggedIn: false, success: true });
    }
});

app.get('/user-channels', checkUserExists, async (req, res) => {
    const username = req.username;
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
    const username = req.username;
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
        await downloadImages(channelName)

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
    let { channelName, ip } = req.body;
    const username = req.username;

    try {
        const channels = await getChannels();
        channelName = channelName.trim();
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
        await alertSecurity(req, ip, username, `Створено канал під вашим акаунтом з ім'ям ${channelName}`);
    } catch (error) {
        console.error('Помилка при створенні каналу:', error);
        res.status(500).send({ success: false, message: 'Помилка сервера.' });
    }
});

app.get('/get-channels', checkUserExists, async (req, res) => {
    try {
        const username = req.username;
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
    const username = req.username;

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

app.post('/check-grammar', async (req, res) => {
    const { text } = req.body;
    const correctedText = await checkGrammar(text, language);
    res.json({ correctedText });
});

app.post('/analyze-sentiment', (req, res) => {
    const { text } = req.body;
    const sentimentResult = analyzeSentiment(text);
    res.json({ sentimentResult });
});

app.post('/rephrase', async (req, res) => {
    const { text, language, style } = req.body;
    const rephrasedText = await rephraseText(text, language, style);
    res.json({ rephrasedText });
});

app.post('/translate', async (req, res) => {
    console.log("test1:", process.memoryUsage());
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        await ensureModelsLoaded();

        const detectedLanguages = lngDetector.detect(text, 3);

        let direction;
        const isEnglish = detectedLanguages.some(([language]) => language === 'english');
        const isUkrainian = detectedLanguages.some(([language]) => language === 'ukrainian');
        const isRussian = detectedLanguages.some(([language]) => language === 'russian');

        if (isUkrainian || isRussian) {
            direction = 'toEnglish';
        } else if (isEnglish) {
            direction = 'toOriginal';
        } else {
            return res.status(400).json({ error: 'Мова тексту не підтримується цією функцією. Лише українська, російська та англійська' });
        }

        const parts =
            text.length >= 100000 ? 1000 :
                text.length >= 50000 ? 500 :
                    text.length >= 25000 ? 250 :
                        text.length >= 10000 ? 70 :
                            text.length >= 1000 ? 5 :
                                text.length >= 500 ? 3 :
                                    text.length >= 100 ? 2 : 1;

        let translatedText;
        if (direction === 'toEnglish') {
            translatedText = await translateTextInParts(text, models.translatorToEnglish, parts);
        } else if (direction === 'toOriginal') {
            translatedText = await translateTextInParts(text, models.translatorToOriginalLanguage, parts);
        }
        console.log('Translated text:', translatedText);

        res.json({ translatedText });
    } catch (error) {
        console.error('Error in translation:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});

app.post('/summarize', async (req, res) => {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.length === 0) {
        return res.status(400).json({ error: "Invalid input text for summarization." });
    }

    await ensureModelsLoaded();

    const detectedLanguages = lngDetector.detect(text, 3);

    try {
        let processedText = text;
        const isEnglish = detectedLanguages.some(([language]) => language === 'english');
        const isUkrainian = detectedLanguages.some(([language]) => language === 'ukrainian');
        const isRussian = detectedLanguages.some(([language]) => language === 'russian');

        if (isUkrainian || isRussian) {
            const parts =
                text.length >= 100000 ? 1000 :
                    text.length >= 50000 ? 500 :
                        text.length >= 25000 ? 250 :
                            text.length >= 10000 ? 70 :
                                text.length >= 1000 ? 5 :
                                    text.length >= 500 ? 3 :
                                        text.length >= 100 ? 2 : 1;

            processedText = await translateTextInParts(text, models.translatorToEnglish, parts)
        } else if (!isEnglish) {
            return res.status(400).json({ error: "Мова тексту не підтримується цією функцією. Лише українська, російська та англійська" });
        }

        const summaryText = await models.summarizer(processedText);

        if (isUkrainian || isRussian) {
            const parts =
                text.length >= 1000 ? 5 :
                    text.length >= 500 ? 3 : 2
            processedText = await translateTextInParts(summaryText, models.translatorToOriginalLanguage, parts);
        } else {
            processedText = summaryText;
        }
        res.json({ summaryText: processedText });
    } catch (error) {
        console.error('Error summarizing text:', error);
        res.status(500).json({ error: 'Failed to summarize text.' });
    }
});

app.post('/update-message/:id', checkUserExists, async (req, res) => {
    const messageId = parseInt(req.params.id, 10);
    const { channelName, newContent } = req.body;

    try {
        const messages = await getMessages(channelName);

        const message = messages.find(m => m.id === messageId);

        if (!message) {
            return res.status(404).json({ success: false, message: 'Повідомлення не знайдено' });
        }

        if (message.author !== req.username) {
            return res.status(403).json({ success: false, message: 'Лише автор повідомлення може його редагувати!' });
        }

        const filteredText = filterText(newContent);

        message.context = filteredText;

        await editMessage(channelName, messageId, { newContent: filteredText });

        res.json({ success: true });

        io.emit('message edited', channelName, messageId, newContent);
    } catch (error) {
        console.error('Помилка при оновленні повідомлення:', error);
        res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
    }
});

app.post('/delete-message/:id', checkUserExists, async (req, res) => {
    const messageId = parseInt(req.params.id, 10);
    const channelName = req.body.channelName;

    try {
        const messages = await getMessages(channelName);
        const messageToDelete = messages.find(message => message.id === messageId);

        if (messageToDelete.author !== req.username) {
            return res.status(403).json({ success: false, message: 'Лише автор повідомлення може його видалити!' });
        }

        if (messageToDelete.photo) {
            await fs.unlink(`${localDir}/${channelName}/${messageToDelete.photo}`);

            await deletePhoto(channelName, messageToDelete.photo);
        }

        await deleteMessage(channelName, messageId);

        const updatedMessages = messages
            .filter(message => message.id > messageId)
            .map(message => {
                const newId = message.id - 1;
                return { ...message, id: newId };
            });

        for (const updatedMessage of updatedMessages) {
            await editMessage(channelName, updatedMessage.id + 1, { newId: updatedMessage.id });
        }

        res.json({ success: true });

        io.emit('message deleted', channelName, messageId);
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/user-info/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const users = await getUsers();
        const user = users.find(user => user.id === parseInt(userId));

        if (user) {
            res.json({
                username: user.username,
                id: user.id,
                rank: user.rank
            });
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
            res.json({
                username: user.username,
                id: user.id,
                rank: user.rank
            });
        } else {
            res.status(404).send({ message: 'Користувача не знайдено.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Помилка сервера.' });
    }
});

app.post('/save-rank', checkUserExists, async (req, res) => {
    const username = req.username;
    const users = await getUsers();
    const user = users.find(user => user.username === username);
    const userRank = req.rank;

    if (userRank === 'owner' || userRank === 'admin') {
        const { userId, newRank } = req.body;
        const targetUser = users.find(u => u.id === userId);
        const oldRank = targetUser.rank

        if (!targetUser) {
            return res.status(404).json({ error: 'Користувач не знайдений' });
        }

        targetUser.rank = newRank;
        await saveUsers(users);

        res.json({ message: 'Ранг користувача збережено' });
    } else {
        user.rank = 'banned';
        await saveUsers(users);
        res.json({ message: 'Використання адміністраторських можливостей користувачам заборонено' });
    }
});

app.post("/block-account", checkUserExists, async (req, res) => {
    try {
        const username = req.username;
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
        requests.push({ username, reason, 'type': 'appeal' });
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

app.get("/get-security", checkUserExists, async (req, res) => {
    const securityData = await getSecurity();
    const username = req.username;

    const userSecurityData = securityData.find(obj => Object.keys(obj)[0] === username);

    const security = {
        [username]: userSecurityData[username]
    };

    res.status(200).json({ success: true, security });
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

app.get('/sorted-channels/:type', checkUserExists, async (req, res) => {
    const { type } = req.params;
    const username = req.username;

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
    const username = req.username;
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
    const username = req.username;

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

app.post("/get-rank", checkUserExists, async (req, res) => {
    try {
        const username = req.username;
        const users = await getUsers();

        const user = Object.values(users).find(user => user.username === username);
        res.status(200).json({ success: true, rank: user.rank });
    } catch (error) {
        res.status(404).json({ success: false, message: "Користувач не знайдений" });
    }
});

app.post('/change-password', checkUserExists, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const username = req.username;

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
    const username = req.username;
    const { theme } = req.body;

    try {
        let users = await getUsers();
        const userIndex = users.findIndex(u => u.username === username);
        users[userIndex]['selected theme'] = theme;
        await saveUsers(users);
        res.send({ success: true, message: 'Тема збережена.' });
    } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: 'Помилка сервера при збереженні теми.' });
    }
});

app.post('/logout', checkUserExists, (req, res) => {
    const { ip } = req.body;
    alertSecurity(req, ip, req.username, "Хтось вийшов з акаунту.")
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
    res.sendFile(path.resolve(__dirname, "../frontend/html", "chat.html"));
});

app.get("/tos.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../frontend/html", "tos.html"));
})

app.get("/settings.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../frontend/html", "settings.html"));
});

httpServer.listen(port, 'localhost', () => {
    fs.readdir(imagesDir, (err, files) => {
        if (err) {
            console.error('Unable to scan directory:', err);
            return;
        }

        shuffledImages = shuffleArray(files);
    });
    console.log(`Server is running on port ${port}. Test at: http://localhost:${port}/`);
});

// httpServer.listen(port, () => {
//     fs.readdir(imagesDir, (err, files) => {
//         if (err) {
//             console.error('Unable to scan directory:', err);
//             return;
//         }

//         shuffledImages = shuffleArray(files);
//     }); 

//     console.log(`App listening on port ${port}!`)
// }); 