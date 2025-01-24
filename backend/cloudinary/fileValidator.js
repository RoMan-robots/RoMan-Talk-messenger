export function validateFile(file, fileName) {
    const allowedExtensions = ['png', 'jpeg', 'jpg', 'webp'];
    const maxFileSize = 5 * 1024 * 1024;

    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
        throw new Error('Недозволений формат файлу');
    }

    if (file.size > maxFileSize) {
        throw new Error('Розмір файлу перевищує допустимий');
    }

    return true;
}

export function sanitizeFileName(originalName) {
    return originalName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.]/gi, '_')
        .toLowerCase();
}
