import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

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
