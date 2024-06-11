import stringSimilarity from 'string-similarity';

function normalizeWord(word) {
    const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ie', 'ж': 'zh', 'з': 'z',
        'и': 'y', 'і': 'i', 'ї': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 
        'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'iu', 'я': 'ia', "'": ''
    };

    return word
        .toLowerCase()
        .split('')
        .map(char => map[char] || char)
        .join('');
}

function generateGreetingResponse() {
    const greetings = [
        "Привіт! Як справи?",
        "Добрий день! Як я можу допомогти?",
        "Здрастуйте! Чим можу бути корисним?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
}

function generateInformationResponse() {
    return "RoMan Talk - це чат для всіх, хто хоче цікаво провести час!";
}

function generateGeneralResponse() {
    const responses = [
        "Це цікаве питання!",
        "Я не зовсім впевнений, як відповісти на це.",
        "Дай мені трохи часу подумати."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateResponse(word) {
    const normalizedWord = normalizeWord(word);
    const greetingsKeywords = ["привіт", "добрий день", "здрастуйте"];
    const infoKeywords = ["roman talk", "що таке roman talk", "як працює roman talk"];

    for (const keyword of greetingsKeywords) {
        const similarity = stringSimilarity.compareTwoStrings(normalizedWord, normalizeWord(keyword));
        if (similarity > 0.7) {
            return generateGreetingResponse();
        }
    }

    for (const keyword of infoKeywords) {
        const similarity = stringSimilarity.compareTwoStrings(normalizedWord, normalizeWord(keyword));
        if (similarity > 0.7) {
            return generateInformationResponse();
        }
    }

    return generateGeneralResponse();
}

export function sendAI(word) {
    if (word.trim().length > 0) {
        return generateResponse(word);
    } else {
        return "Будь ласка, введіть слово.";
    }
}