import stringSimilarity from 'string-similarity';
const database = {
    "вітання": {
        "привіт": {
            text: "Привіт! Я тут, щоб тобі допомогти.",
            category: "вітання"
        },
        "добрий день": {
            text: "Добрий день! Як я можу допомогти?",
            category: "вітання"
        },
        "здрастуйте": {
            text: "Здрастуйте! Чим можу бути корисним?",
            category: "вітання"
        }
    },
    "спілкування": {
        "як": {
            text: "Як у тебе справи?",
            category: "спілкування"
        },
        "хто ти": {
            text: "Я, RoMan AI, асистент для допомоги в месенжері RoMan Talk",
            category: "хто я"
        }
    },
    "інформація про roman talk": {
        "roman talk": {
            text: "RoMan Talk - це чат для всіх, хто хоче цікаво провести час!",
            category: "інформація про RoMan Talk"
        },
        "що таке roman talk": {
            text: "RoMan Talk - це чат для всіх, хто хоче цікаво провести час!",
            category: "інформація про RoMan Talk"
        },
        "як працює roman talk": {
            text: "RoMan Talk - це чат, де ви можете спілкуватися з іншими користувачами, обмінюватися інформацією та проводити час цікаво!",
            category: "інформація про RoMan Talk"
        }
    }
};

function findClosestMatch(word) {
    let bestMatch = null;
    let bestMatchScore = 0;

    const lowerCaseWord = word.toLowerCase();

    for (const category in database) {
        for (const subCategory in database[category]) {
            const lowerCaseSubCategory = subCategory.toLowerCase();
            const similarity = stringSimilarity.compareTwoStrings(lowerCaseWord, lowerCaseSubCategory);
            if (similarity > bestMatchScore) {
                bestMatchScore = similarity;
                bestMatch = subCategory;
            }
        }
    }

    return { bestMatch, bestMatchScore };
}

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

export function sendAI(word) {
    if (word.trim().length > 0) {
        let { bestMatch, bestMatchScore } = findClosestMatch(word);
        if (bestMatch !== null && bestMatchScore > 0.7) {
            let closestCategory = null;
            for (const category in database) {
                if (database[category].hasOwnProperty(bestMatch)) {
                    closestCategory = category;
                    const wordInfo = database[category][bestMatch];
                    return { text: wordInfo.text, category: wordInfo.category };
                }
            }
            if (!closestCategory) {
                return "Запит не знайдено в базі даних.";
            }
        } else {
            let normalizedWord = normalizeWord(word);
            let { bestMatch: normalizedBestMatch, bestMatchScore: normalizedBestMatchScore } = findClosestMatch(normalizedWord);
            if (normalizedBestMatch !== null && normalizedBestMatchScore > 0.65) {
                let closestCategory = null;
                for (const category in database) {
                    if (database[category].hasOwnProperty(normalizedBestMatch)) {
                        closestCategory = category;
                        const wordInfo = database[category][normalizedBestMatch];
                        return { text: wordInfo.text, category: wordInfo.category };
                    }
                }
                if (!closestCategory) {
                    return "Запит не знайдено в базі даних.";
                }
            } else {
                return "Запит не знайдено в базі даних?";
            }
        }
    } else {
        return "Будь ласка, введіть слово.";
    }
}