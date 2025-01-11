import dotenv from 'dotenv';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { Octokit } from '@octokit/rest';
import { validateFile  } from './fileValidator.js';

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

export async function uploadImageToCloudinary(buffer, fileName, channelName) {
    const fileForValidation = {
        buffer: buffer,
        size: buffer.byteLength,
        mimetype: 
            fileName.endsWith('.png') ? 'image/png' : 
            fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' : 
            fileName.endsWith('.webp') ? 'image/webp' : 
            fileName.endsWith('.svg') ? 'image/svg+xml' : 
            'application/octet-stream'
    };

    try {
        validateFile(fileForValidation);

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    folder: `/${channelName}`,
                    resource_type: 'image',
                    public_id: fileName.split('.')[0],
                    overwrite: true,
                    use_filename: true,
                    unique_filename: false,
                    transformation: [
                        {width: 1000, crop: "scale"},
                        {quality: "auto:best"},
                        {fetch_format: "auto"}
                    ]
                },
                (error, result) => {
                    if (error) reject(error);
                    else {
                        resolve({
                            cloudinaryUrl: result.secure_url,
                            publicId: result.public_id,
                            originalFileName: fileName
                        });
                    }
                }
            );

            const readableStream = Readable.from(buffer);
            readableStream.pipe(uploadStream);
        });
    } catch (error) {
        console.error('Помилка завантаження зображення:', error);
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

export async function deleteFromCloudinary(fileUrl) {
    try {
        const publicId = fileUrl.split('/').pop().split('.')[0];
        const result = await cloudinary.uploader.destroy(publicId);
        return result.result === 'ok';
    } catch (error) {
        console.error('Cloudinary Delete Error:', error);
        console.log('X-Cld-Error:', error.response?.headers?.['x-cld-error']);
        return false;
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
// }

// (async () => {
//     try {
//         const results = await migrateImagesFromGitHub();
//         console.log('GitHub Image Migration Results:', results);
//     } catch (error) {
//         console.error('Automatic GitHub Image Migration Failed:', error);
//     }
// })();