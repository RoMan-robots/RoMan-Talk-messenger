import dotenv from 'dotenv';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { Octokit } from '@octokit/rest';

dotenv.config({ path: './.env' });
console.log('Env Path:', path.resolve(process.cwd(), '.env'));
console.log('Current Working Directory:', process.cwd());

console.log('Loaded Env Variables:', {
    TOKEN_REPO: process.env.TOKEN_REPO,
    OWNER_REPO: process.env.OWNER_REPO,
    NAME_REPO: process.env.NAME_REPO
});

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

export async function uploadToCloudinary(file, folder = 'chat-images') {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { 
                folder: folder,
                resource_type: 'image',
                allowed_formats: ['jpg', 'png', 'gif', 'webp'],
                transformation: [
                    { width: 1200, crop: "limit" },
                    { quality: "auto:best" },
                    { fetch_format: "auto" }
                ]
            },
            (error, result) => {
                if (error) reject(error);
                else resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format,
                    size: result.bytes
                });
            }
        );

        const bufferStream = new Readable();
        bufferStream.push(file);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
    });
}

export async function uploadImageToCloudinary(buffer, fileName, channelName) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { 
                folder: `images/${channelName}`,
                resource_type: 'image',
                public_id: fileName.split('.')[0],
                overwrite: true,
                transformation: [
                    { width: 1200, crop: "limit" },
                    { quality: "auto:best" },
                    { fetch_format: "auto" }
                ]
            },
            (error, result) => {
                if (error) reject(error);
                else resolve({
                    originalName: fileName,
                    cloudinaryUrl: result.secure_url,
                    publicId: result.public_id
                });
            }
        );

        const bufferStream = new Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
    });
}

export async function migrateImagesFromGitHub() {
    const channelName = "RoMan_World_Official";
    const migrationResults = {};

    try {
        console.log('GitHub Migration Params:', { 
            owner, 
            repo, 
            path: `images/${channelName}` 
        });

        const { data: files } = await octokit.repos.getContent({
            owner,
            repo,
            path: `images/${channelName}`, 
        });

        console.log('Files found:', files.length);
        console.log('Files details:', files.map(file => ({
            name: file.name,
            path: file.path,
            type: file.type,
            downloadUrl: file.download_url
        })));

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
                    console.log(`Uploaded: ${channelName}/${uploadResult.originalName}`);
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
        const result = await cloudinary.uploader.destroy(`chat-images/${publicId}`);
        return result.result === 'ok';
    } catch (error) {
        console.error('Cloudinary Delete Error:', error);
        return false;
    }
}

(async () => {
    try {
        const results = await migrateImagesFromGitHub();
        console.log('GitHub Image Migration Results:', results);
    } catch (error) {
        console.error('Automatic GitHub Image Migration Failed:', error);
    }
})();
