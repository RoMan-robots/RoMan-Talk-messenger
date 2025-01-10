import express from 'express';
import multer from "multer"
import fetch from 'node-fetch';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import uaParser from 'ua-parser-js';
import geoip from 'geoip-lite';
import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken'
import path from 'path';
import LanguageDetect from 'languagedetect';
import fs from "fs-extra";
import bcrypt from 'bcryptjs';
import webpush from 'web-push'
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import {
    filterText,
    checkGrammar,
    analyzeSentiment,
    rephraseText,
    loadModels,
    translateTextInParts
} from './ai/ai.js';

import Channel from './schemas/messages.js';
import User from './schemas/users.js';
import Request from './schemas/requests.js';
import Security from './schemas/security.js';
import migrateFromGitHub from './utils/migration.js';

import { uploadImageToCloudinary, deleteFromCloudinary } from './cloudinary/cloudinaryUpload.js';
import { validateFile, sanitizeFileName } from './cloudinary/fileValidator.js';

dotenv.config();

const __dirname = path.resolve();
const port = process.env.PORT || 8080;
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

const octokit = new Octokit({ auth: process.env.TOKEN_REPO });

const owner = process.env.OWNER_REPO;
const repo = process.env.NAME_REPO;

mongoose.connect(process.env.MONGO_URL)
    .then(async () => {
        console.log('Connected to MongoDB');

        // await migrateFromGitHub();
        
        // const channels = await Channel.find({});
        // const users = await User.find({});
        // const security = await Security.findOne({});

        // console.log('Channels:', JSON.stringify(channels.slice(0, 1), null, 2));
        // console.log('Users:', JSON.stringify(users, null, 2));
        // console.log('Security:', JSON.stringify(security, null, 2));
    })
    .catch (err => console.error('MongoDB connection error:', err));

const localDir = path.join(__dirname, 'images/message-images');

let loginAttempts = {};

const typingUsersByChannel = {};

const lngDetector = new LanguageDetect();
let modelsLoaded = false;
let models = {}

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage
});

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
    return array;
}

async function getUsers() {
    try {
        const users = await User.find({});
        return users;
    } catch (error) {
        throw new Error('Error getting users: ' + error.message);
    }
}

async function saveUsers(users) {
    try {
        await User.deleteMany({});
        await User.insertMany(users);
    } catch (error) {
        throw new Error('Error saving users: ' + error.message);
    }
}

async function getChannels() {
    try {
        const channels = await Channel.find({});
        return channels;
    } catch (error) {
        throw new Error('Error getting channels: ' + error.message);
    }
}

async function saveChannels(channels) {
    try {
        channels.forEach(channel => {
            channel.messages = channel.messages.map(message => {
                if (!message._id) {
                    message._id = new mongoose.Types.ObjectId();
                }
                return message;
            });
        });

        // Збереження каналів
        const updatedChannels = await Promise.all(
            channels.map(channel => Channel.findOneAndUpdate(
                { name: channel.name }, 
                channel, 
                { upsert: true, new: true }
            ))
        );

        return updatedChannels;
    } catch (error) {
        console.error('Помилка при збереженні каналів:', error);
        throw error;
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
            const newId = index + 1;
            return {
                ...message,
                id: newId,
                replyTo: message.replyTo ?
                    messages.findIndex(m => m.id === message.replyTo) + 1 :
                    null
            };
        });

        await saveAllMessages(channelName, reformattedMessages);
        console.log(`Повідомлення в каналі ${channelName} були успішно переформатовані.`);
    } catch (error) {
        console.error('Помилка при переформатуванні ID повідомлень:', error);
    }
}

async function getMessages(channelName) {
    try {
        const channel = await Channel.findOne({ name: channelName }).select('messages -_id');
        return channel ? channel.messages : [];
    } catch (error) {
        throw new Error('Помилка при отриманні повідомлень: ' + error.message);
    }
}

async function saveMessages(channelName, messageObject, messageType = "classic") {
    try {
        const channel = await Channel.findOne({ name: channelName });
        if (!channel) throw new Error(`Канал "${channelName}" не знайдено.`);

        const newMessageId = channel.messages.length + 1;
        let newMessage = {
            id: newMessageId,
            author: messageObject.author,
            context: messageObject.context,
            date: messageObject.date
        };

        if (messageType === 'photo') {
            if (messageObject.photo) {
                newMessage.photo = messageObject.photo;
            } else if (messageObject.image) {
                const originalFileName = messageObject.image.name;
                const sanitizedFileName = originalFileName.replace(/\s+/g, '_');
                const imageFileName = `${newMessageId}--${sanitizedFileName}`;
                newMessage.photo = imageFileName;
                await uploadImage(messageObject.image, imageFileName, channelName);
            }
        }

        if (messageObject.replyTo) {
            const parentMessage = channel.messages.find(m => m.id === messageObject.replyTo);
            if (parentMessage) {
                newMessage.replyTo = messageObject.replyTo;
            }
        }

        channel.messages.push(newMessage);
        await channel.save();

        return newMessage;
    } catch (error) {
        console.error('Помилка при збереженні повідомлень:', error);
        throw error;
    }
}

async function saveAllMessages(channelName, reformattedMessages) {
    try {
        const channel = await Channel.findOneAndUpdate(
            { name: channelName },
            { $set: { messages: reformattedMessages } },
            { new: true }
        );

        if (!channel) {
            throw new Error(`Канал "${channelName}" не знайдено.`);
        }

        return channel.messages;
    } catch (error) {
        console.error('Помилка при збереженні переформатованих повідомлень:', error);
        throw error;
    }
}

async function editMessage(channelName, messageId, { newContent, newId }) {
    try {
        const channel = await Channel.findOne({ name: channelName });
        if (!channel) throw new Error(`Канал "${channelName}" не знайдено.`);

        const messageIndex = channel.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) {
            throw new Error(`Повідомлення з ID ${messageId} не знайдено.`);
        }

        if (newContent !== undefined) {
            channel.messages[messageIndex].context = newContent;
        }
        if (newId !== undefined) {
            channel.messages[messageIndex].id = newId;
        }

        await channel.save();
        return channel.messages[messageIndex];
    } catch (error) {
        console.error('Помилка при редагуванні повідомлення:', error);
        throw error;
    }
}

async function deleteMessage(channelName, messageId) {
    try {
        const channel = await Channel.findOneAndUpdate(
            { name: channelName },
            { $pull: { messages: { id: messageId } } },
            { new: true }
        );

        if (!channel) {
            throw new Error(`Канал "${channelName}" не знайдено.`);
        }

        return true;
    } catch (error) {
        console.error('Помилка при видаленні повідомлення:', error);
        throw error;
    }
}

async function addedUserMessage(eventMessage) {
    try {
        const channel = await Channel.findOne({ name: "RoMan_World_Official" });
        if (!channel) throw new Error('Канал не знайдено');

        const newMessageId = channel.messages.length + 1;
        const newMessage = {
            id: newMessageId,
            author: 'Привітання',
            context: eventMessage,
            date: new Date().toLocaleString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(',', '')
        };

        channel.messages.push(newMessage);
        await channel.save();

        io.emit('chat message', "RoMan_World_Official", newMessage);
    } catch (error) {
        console.error('Помилка при додаванні події:', error);
    }
}

async function uploadImage(imageFile, imageFileName, channelName) {
    try {
        const channel = await Channel.findOne({ name: channelName });
        if (!channel) throw new Error('Channel not found');

        if (!channel.images) channel.images = [];
        channel.images.push({
            name: imageFileName,
            data: imageFile.buffer,
            contentType: imageFile.mimetype
        });

        await channel.save();
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

async function deletePhoto(channelName, fileName) {
    try {
        await Channel.findOneAndUpdate(
            { name: channelName },
            { $pull: { images: { name: fileName } } }
        );
    } catch (error) {
        console.error('Error deleting photo:', error);
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
                const localFilePath = path.join(channelDir, file.name);

                if (file.download_url) {
                    const response = await fetch(file.download_url);
                    const buffer = await response.arrayBuffer();
                    await fs.writeFile(localFilePath, Buffer.from(buffer));
                } else {
                    console.error("Не вдалося отримати download_url для файлу:", file.path);
                }
            }
        }
    } catch (error) {
        console.error('Error downloading images:', error);
    }
}

async function getRequests() {
    try {
        const requests = await Request.find({});
        return requests;
    } catch (error) {
        throw new Error('Error getting requests: ' + error.message);
    }
}

async function saveRequests(requests) {
    try {
        await Request.deleteMany({});
        await Request.insertMany(requests);
    } catch (error) {
        throw new Error('Error saving requests: ' + error.message);
    }
}

async function getSecurity() {
    try {
        const securityData = await Security.findOne();
        return securityData ? securityData.security : {};
    } catch (error) {
        console.error('Помилка отримання даних безпеки:', error);
        return {};
    }
}

async function saveSecurity(security) {
    try {
        let securityDoc = await Security.findOne();
        
        if (!securityDoc) {
            securityDoc = new Security({ security });
        } else {
            securityDoc.security = security;
        }
        
        await securityDoc.save();
        return securityDoc;
    } catch (error) {
        throw new Error('Error saving security data: ' + error.message);
    }
}

async function alertSecurity(req, ip, username, messageText) {
    const security = await getSecurity();
    const userAgent = req.headers['user-agent'];
    const parser = uaParser(userAgent);
    const deviceInfo = parser.os.name;

    const loginTimestamp = Date.now();
    const loginDate = new Date();
    const day = String(loginDate.getDate()).padStart(2, '0');
    const month = String(loginDate.getMonth() + 1).padStart(2, '0');
    const year = loginDate.getFullYear();

    const hours = String(loginDate.getHours()).padStart(2, '0');
    const minutes = String(loginDate.getMinutes()).padStart(2, '0');

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

    const oneWeekAgo = new Date(loginDate);
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

    socket.on('typing', (data) => {
        const { channel, username } = data;

        if (!typingUsersByChannel[channel]) {
            typingUsersByChannel[channel] = new Set();
        }

        typingUsersByChannel[channel].add(username);

        socket.broadcast.emit('typing', { channel, username });
    });

    socket.on('stop typing', (data) => {
        const { channel, username } = data;

        if (typingUsersByChannel[channel]) {
            typingUsersByChannel[channel].delete(username);
            socket.broadcast.emit('stop typing', { channel, username });
        }
    });

    socket.on('disconnect', () => {
        Object.keys(typingUsersByChannel).forEach(channel => {
            if (typingUsersByChannel[channel].has(socket.username)) {
                typingUsersByChannel[channel].delete(socket.username);
                socket.broadcast.emit('stop typing', { channel, username: socket.username });
            }
        });
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
    const { username, password, ip } = req.body;
    const loginTimestamp = Date.now();
    const userAgent = req.headers['user-agent'];
    const parser = uaParser(userAgent);
    const deviceInfo = parser.os.name;

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

    const loginDate = new Date();
    const day = String(loginDate.getDate()).padStart(2, '0');
    const month = String(loginDate.getMonth() + 1).padStart(2, '0');
    const year = loginDate.getFullYear();

    const hours = String(loginDate.getHours()).padStart(2, '0');
    const minutes = String(loginDate.getMinutes()).padStart(2, '0');

    const formattedDateTime = `${day}.${month}.${year} ${hours}:${minutes}`;

    if (!loginAttempts[username]) {
        loginAttempts[username] = [];
    }

    const userAttempts = loginAttempts[username];
    const recentAttempts = userAttempts.filter(attemptTime => loginTimestamp - attemptTime < 60000);

    if (recentAttempts.length >= 5) {
        const message = {
            message: "Хтось намагається зайти на ваш акаунт. Введено 5 невірних паролів на ваше ім'я.",
            device: deviceInfo,
            location: location,
            when: formattedDateTime
        };

        await alertSecurity(req, ip, username, message.message);

        return res.status(401).send({ message: "Перевищено максимальну кількість спроб входу. Будь ласка, спробуйте пізніше." });
    }

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).send({ success: false, message: 'Користувача не знайдено' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            loginAttempts[username] = [];

            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "30d" });

            if (user.firstLogin) {
                await User.findByIdAndUpdate(user.id, { firstLogin: false });
                await addedUserMessage(`${username} залогінився в RoMan Talk. Вітаємо!`);
            }

            const message = {
                message: "Хтось зайшов в акаунт. Пильнуємо далі за активністю акаунту...",
                device: deviceInfo,
                location: location,
                when: formattedDateTime
            };

            await alertSecurity(req, ip, username, message.message);

            return res.status(200).send({
                success: true,
                token,
                username: user.username,
                rank: user.rank,
                firstLogin: user.firstLogin
            });
        } else {
            loginAttempts[username] = [...userAttempts, loginTimestamp];
            res.status(401).send({ success: false, message: 'Неправильний пароль' });
        }
    } catch (error) {
        console.error('Помилка входу:', error);
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
    await alertSecurity(req, req.ip, username, "Зареєструвався новий користувач з ім'ям " + username);

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.send({ success: true, message: 'Реєстрація успішна.', token });
    await addedUserMessage(`${username} зареєструвався в RoMan Talk. Вітаємо!`);
});

app.post('/messages', checkUserExists, async (req, res) => {
    const { author, context, channel, date, replyTo } = req.body;

    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channel);

        if (channelIndex === -1) {
            return res.status(404).send({ success: false, message: 'Канал не знайдено' });
        }

        const newMessage = {
            id: Number(channels[channelIndex].messages.length + 1),
            author,
            context: filterText(context),
            date,
            replyTo
        };

        channels[channelIndex].messages.push(newMessage);
        await saveChannels(channels);

        io.emit('chat message', channel, newMessage);

        res.send({ success: true, message: newMessage });
    } catch (error) {
        console.error('Помилка при збереженні повідомлення:', error);
        res.status(500).send({ success: false, message: 'Помилка сервера' });
    }
});

app.post('/pin-message', checkUserExists, async (req, res) => {
    const { messageId, channelName } = req.body;

    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channelName);

        if (channelIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Канал не знайдено'
            });
        }

        const channel = channels[channelIndex];
        const messageToPin = channel.messages.find(m => m.id == messageId);
        if (!messageToPin) {
            return res.status(404).json({
                success: false,
                message: 'Повідомлення не знайдено'
            });
        }

        // Перевірка та конвертація ID повідомлення
        const pinnedMessageId = parseInt(messageId, 10);
        if (isNaN(pinnedMessageId)) {
            return res.status(400).json({
                success: false,
                message: 'Некоректний ідентифікатор повідомлення'
            });
        }

        // Зберігаємо лише числовий ID повідомлення
        channel.pinnedMessage = pinnedMessageId;

        await saveChannels(channels);

        io.emit('message pinned', {
            channelName,
            pinnedMessage: messageToPin
        });

        res.json({
            success: true,
            message: 'Повідомлення успішно закріплено',
            pinnedMessage: messageToPin
        });

    } catch (error) {
        console.error('Помилка при закріпленні повідомлення:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка при закріпленні повідомлення'
        });
    }
});

app.post('/unpin-message', checkUserExists, async (req, res) => {
    const { channelName } = req.body;

    try {
        const channels = await getChannels();
        const channelIndex = channels.findIndex(c => c.name === channelName);

        if (channelIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Канал не знайдено'
            });
        }

        const channel = channels[channelIndex];

        channel.pinnedMessage = null;

        await saveChannels(channels);

        io.emit('message unpinned', {
            channelName
        });

        res.json({
            success: true,
            message: 'Повідомлення відкріплено'
        });

    } catch (error) {
        console.error('Помилка при відкріпленні повідомлення:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка при відкріпленні повідомлення'
        });
    }
});

app.post('/upload-photo-message', upload.single('photo'), async (req, res) => {
    try {
        const { channelName, author, context, date, replyTo } = req.body;
        const filteredText = filterText(context)
        const photo = req.file;

        if (!photo) {
            return res.status(400).json({ success: false, message: 'Файл не завантажено!' });
        }

        const uploadResult = await uploadImageToCloudinary(
            photo.buffer, 
            photo.originalname, 
            channelName
        );

        let messageObject = {
            author,
            context: filteredText,
            date,
            replyTo,
            photo: uploadResult.cloudinaryUrl
        };

        const savedMessage = await saveMessages(channelName, messageObject, 'photo');

        io.emit('chat message', channelName, savedMessage);
        res.status(200).json({ 
            success: true, 
            message: 'Повідомлення з фото успішно збережено.',
            savedMessage 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Помилка сервера.' });
    }
});

app.post("/session-status", async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const version = req.body.ver;

    const supportedVersions = {
        "2.1": true,
        "2.2": true,
        "2.3": true
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
    try {
        const { channelName } = req.params;
        const channels = await getChannels();

        const channel = channels.find(c => c.name === channelName);
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: `Канал "${channelName}" не знайдено.`
            });
        }

        res.json({
            success: true,
            channels: [{
                name: channel.name,
                messages: channel.messages,
                pinnedMessage: channel.pinnedMessage,
                typingUsers: channel.typingUsers || []
            }]
        });

    } catch (error) {
        console.error('Помилка при отриманні повідомлень:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні повідомлень'
        });
    }
});

app.post('/create-channel', checkUserExists, async (req, res) => {
    let { channelName, ip } = req.body;
    const username = req.username;

    try {
        const channels = await getChannels();
        channelName = channelName.replace(/ /g, "_");
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
        await alertSecurity(req, ip, username, `Створено канал з назвою ${channelName} під вашим акаунтом з ім'ям `);
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
        channels = channels.filter(channel => {
            return !channel.isPrivate || (channel.isPrivate && channel.subs.includes(userId.toString()));
        });

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

        if (!messageToDelete) {
            return res.status(404).json({ success: false, message: 'Повідомлення не знайдено' });
        }

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
        console.log(error);
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
    try {
        const username = req.username;
        console.log('Шукаємо логи для користувача:', username);

        const securityDoc = await Security.findOne();
        console.log('Знайдений документ безпеки:', JSON.stringify(securityDoc, null, 2));

        if (!securityDoc || !securityDoc.security) {
            console.log('Документ безпеки не знайдено');
            return res.status(200).json({ success: true, security: [] });
        }

        // Пошук логів для username або повернення всіх логів
        let userLogs = [];
        for (const item of securityDoc.security) {
            const key = Object.keys(item)[0];
            if (key === username || key.trim() === '') {
                userLogs = item[key];
                break;
            }
        }

        console.log('Знайдені логи:', userLogs);

        return res.status(200).json({ success: true, security: userLogs });
    } catch (error) {
        console.error('Помилка при отриманні логів безпеки:', error);
        return res.status(500).json({ success: false, message: 'Помилка сервера' });
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
    const { password, userId } = req.body;
    let users = await getUsers();

    const userIndex = users.findIndex(user => user.id === userId);
    if (userIndex === -1) {
        return res.status(404).send({ success: false, message: 'Користувача не знайдено.' });
    }

    const isPasswordMatch = await bcrypt.compare(password, users[userIndex].password);
    if (!isPasswordMatch) {
        return res.status(401).send({ success: false, message: 'Невірний пароль.' });
    }

    users.splice(userIndex, 1);

    const updatedUsers = users.map((user, index) => ({
        ...user,
        id: index + 1
    }));

    await saveUsers(updatedUsers);

    res.send({ success: true, message: 'Акаунт видалено успішно.', redirectUrl: '/' });
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

app.get("/tutorial.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../frontend/html", "tutorial.html"));
});

app.get("/whats-new.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../frontend/html", "whats-new.html"));
});

app.get("/settings.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../frontend/html", "settings.html"));
});
if (process.env.SERVER_TYPE == "local") {
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
} else {
    httpServer.listen(port, () => {
        fs.readdir(imagesDir, (err, files) => {
            if (err) {
                console.error('Unable to scan directory:', err);
                return;
            }

            shuffledImages = shuffleArray(files);
        });

        console.log(`App listening on port ${port}!`)
    });
}