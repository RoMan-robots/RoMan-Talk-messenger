export function validateFile(file) {
    const MAX_FILE_SIZE = parseInt('5242880'); 
    const ALLOWED_TYPES = [
        'image/png', 
        'image/jpg', 
        'image/jpeg', 
        'image/svg+xml', 
        'image/webp'
    ];

    if (!file) {
        throw new Error('Файл не надано');
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Розмір файлу перевищує ${MAX_FILE_SIZE / 1024 / 1024} МБ`);
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
        throw new Error('Недозволений формат файлу');
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
