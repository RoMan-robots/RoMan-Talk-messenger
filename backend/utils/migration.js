import { Message, Channel } from '../schemas/messages.js';
import User from '../schemas/users.js';
import Security from '../schemas/security.js';
import { Octokit } from '@octokit/rest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({
    auth: process.env.TOKEN_REPO
});

const owner = process.env.OWNER_REPO;
const repo = process.env.NAME_REPO;

async function migrateFromGitHub() {
    try {
        await mongoose.connection.dropDatabase();
        console.log('Database dropped');

        const channelsResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: 'messages.json',
        });
        const channelsData = JSON.parse(
            Buffer.from(channelsResponse.data.content, 'base64').toString()
        );

            for (const [channelIndex, channel] of channelsData.channels.entries()) {
            if (!channel.name || channel.name.trim() === '') {
                console.warn('Пропускаємо канал без імені');
                continue;
            }

            const transformedMessages = channel.messages.map((message, messageIndex) => {
                const newMessage = {
                    ...message,
                    _id: new mongoose.Types.ObjectId(),
                    id: messageIndex + 1
                };

                if (message.replyTo) {
                    const replyToMessage = channel.messages.find(m => m.id === message.replyTo);
                    if (replyToMessage) {
                        const replyToMessageIndex = channel.messages.findIndex(m => m.id === message.replyTo);
                        newMessage.replyTo = new mongoose.Types.ObjectId();
                        transformedMessages[replyToMessageIndex]._id = newMessage.replyTo;
                    } else {
                        newMessage.replyTo = null;
                    }
                }

                return newMessage;
            });

            const transformedChannel = {
                ...channel,
                id: channelIndex + 1,
                messages: transformedMessages
            };

            try {
                await Channel.create(transformedChannel);
            } catch (error) {
                console.error(`Помилка створення каналу ${channel.name}:`, error);
            }
        }

        const usersResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: 'users.json',
        });
        const usersData = JSON.parse(
            Buffer.from(usersResponse.data.content, 'base64').toString()
        );

        for (const userData of usersData.users) {
            if (!userData.username || userData.username.trim() === '') {
                console.warn('Пропускаємо користувача без імені');
                continue;
            }

            try {
                await User.create(userData);
            } catch (error) {
                console.error(`Помилка створення користувача ${userData.username}:`, error);
            }
        }

        const securityResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: 'security.json',
        });
        const securityData = JSON.parse(
            Buffer.from(securityResponse.data.content, 'base64').toString()
        );

        try {
            await Security.create({ security: securityData.security });
            console.log('Дані безпеки мігровано успішно');
        } catch (error) {
            console.error('Помилка міграції даних безпеки:', error);
        }

        console.log('Міграцію завершено успішно!');
    } catch (error) {
        console.error('Критична помилка міграції:', error);
        throw error;
    }
}

export default migrateFromGitHub;