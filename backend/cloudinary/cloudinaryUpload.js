import dotenv from 'dotenv';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { Octokit } from '@octokit/rest';
import { validateFile  } from './fileValidator.js';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config({ path: './.env' });

const octokit = new Octokit({ 
    auth: process.env.TOKEN_REPO
});

const owner = process.env.OWNER_REPO;
const repo = process.env.NAME_REPO;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export async function uploadImageToCloudinary(file, fileName, channelName) {
    try {
        validateFile(file, fileName);

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    folder: `message-images/${channelName}`,
                    resource_type: 'image',
                    public_id: fileName.split('.')[0],
                    overwrite: true
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            uploadStream.end(file.buffer);
        });
    } catch (error) {
        console.error('Помилка завантаження в Cloudinary:', error);
        throw error;
    }
}

export async function migrateImagesFromGitHub() {
    const channelName = "RoMan_World_Official";
    const migrationResults = {};

    try {

        const { data: files } = await octokit.repos.getContent({
            owner,
            repo,
            path: `images/${channelName}`, 
        });

        const channelUploadResults = [];

        for (const file of files) {
            if (file.type === 'file' && file.download_url) {
                try {
                    console.log(`Downloading: ${file.name}`);
                    const response = await fetch(file.download_url);
                    
                    if (!response.ok) {
                        console.error(`Failed to fetch ${file.name}:`, response.status, response.statusText);
                        continue;
                    }

                    const buffer = await response.arrayBuffer();

                    console.log(`Uploading to Cloudinary: ${file.name}`);
                    const uploadResult = await uploadImageToCloudinary(
                        Buffer.from(buffer), 
                        file.name, 
                        channelName
                    );

                    channelUploadResults.push(uploadResult);
                } catch (uploadError) {
                    console.error(`Error uploading ${channelName}/${file.name}:`, uploadError);
                }
            }
        }

        migrationResults[channelName] = channelUploadResults;
    } catch (error) {
        console.error(`Error migrating images for channel ${channelName}:`, error);
        migrationResults[channelName] = [];
    }

    return migrationResults;
}

export async function generateTempUrl(publicId, expiresIn = 24) {
    try {
        return cloudinary.url(publicId, {
            sign_url: true,
            type: 'authenticated',
            expiration: Math.floor(Date.now() / 1000) + (expiresIn * 3600)
        });
    } catch (error) {
        console.error('Temp URL Generation Error:', error);
        return null;
    }
}

export async function deleteFromCloudinary(fileName, channelName) {
    try {
        const publicId = `message-images/${channelName}/${fileName.split('.')[0]}`;

        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: 'image'
        });

        return result;
    } catch (error) {
        console.error('Помилка видалення зображення з Cloudinary:', error);
        return null;
    }
}

// async function clearAllCloudinaryStorage() {
//     try {
//         const result = await cloudinary.api.delete_all_resources({ 
//             type: 'upload', 
//             resource_type: 'image' 
//         });
//         console.log('All Cloudinary Storage Cleared:', result);
//         return result;
//     } catch (error) {
//         console.error('Error clearing all Cloudinary storage:', error);
//         throw error;
//     }
// // }

// (async () => {
//     try {
//         const results = await migrateImagesFromGitHub();
//         console.log('GitHub Image Migration Results:', results);
//     } catch (error) {
//         console.error('Automatic GitHub Image Migration Failed:', error);
//     }
// })();