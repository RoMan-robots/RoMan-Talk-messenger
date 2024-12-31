import Channel from '../schemas/messages.js';
import User from '../schemas/users.js';
import Security from '../schemas/security.js';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
    auth: process.env.TOKEN_REPO
});

const owner = process.env.OWNER_REPO;
const repo = process.env.NAME_REPO;

async function migrateFromGitHub() {
    try {
        await Channel.deleteMany({});
        await User.deleteMany({});
        await Security.deleteMany({});
        console.log('Database cleared');

        const channelsResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: 'messages.json',
        });
        const channelsData = JSON.parse(
            Buffer.from(channelsResponse.data.content, 'base64').toString()
        );

        for (const channelData of channelsData.channels) {
            if (!channelData.name || channelData.name.trim() === '') {
                continue;
            }

            delete channelData._id;

            await Channel.create(channelData);
        }
        console.log('Channels migrated successfully');

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
                continue;
            }

            delete userData._id;

            await User.create(userData);
        }
        console.log('Users migrated successfully');

        const securityResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: 'security.json',
        });
        const securityData = JSON.parse(
            Buffer.from(securityResponse.data.content, 'base64').toString()
        );

        await Security.create({ data: securityData.security });
        console.log('Security data migrated successfully');

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration error:', error);
    }
}

export default migrateFromGitHub;