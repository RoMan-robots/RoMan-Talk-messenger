import fs from 'fs';
import nlp from "compromise";
import fetch from 'node-fetch';
import Sentiment from 'sentiment';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.HUGGING_FACE_TOKEN
const badWordsFilePath = 'bad-words.txt';
let badWords = [];

fs.readFile(badWordsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading bad words file:', err);
    } else {
        badWords = data.split(/[\s,]+/).filter(word => word.trim().length > 0);
    }
});

function normalizeText(text) {
    const latinToCyrillicMap = {
        'A': 'А', 'a': 'а',
        'E': 'Е', 'e': 'е',
        'O': 'О', 'o': 'о',
        'P': 'Р', 'p': 'р',
        'C': 'С', 'c': 'с',
        'T': 'Т', 't': 'т',
        'X': 'Х', 'x': 'х',
        'B': 'В', 'b': 'в',
        'H': 'Н', 'h': 'н',
        'M': 'М', 'm': 'м',
        'K': 'К', 'k': 'к'
    };
    console.log(text);
    return text.split('').map(char => latinToCyrillicMap[char] || char).join('');
}

export function filterText(text) {
    console.log(text);
    const originalText = text;
    const normalizedText = normalizeText(text)

    let words = normalizedText.split(" ");
    let filteredWords = words.map(word => {
        const lowerCaseWord = word.toLowerCase();
        
        const isBadWord = badWords.some(badWord => lowerCaseWord.includes(badWord.toLowerCase()));

        if (isBadWord) {
            const originalWord = originalText.split(" ").find(w => normalizeText(w).toLowerCase() === lowerCaseWord);
            return originalWord ? '*'.repeat(originalWord.length) : word;
        } else {
            return originalText.split(" ").find(w => normalizeText(w).toLowerCase() === lowerCaseWord) || word;
        }
    });
    return filteredWords.join(' ');
}

export async function checkGrammar(text, language) {
    try {
        const response = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                text: text,
                language: language
            })
        });

        const data = await response.json();
        let correctedText = text;

        if (data.matches.length > 0) {
            data.matches.reverse().forEach(match => {
                const replacement = match.replacements[0]?.value;
                if (replacement) {
                    const start = match.offset;
                    const end = match.offset + match.length;
                    correctedText = correctedText.substring(0, start) + replacement + correctedText.substring(end);
                }
            });
        }

        return correctedText;
    } catch (error) {
        console.error('Error checking grammar:', error);
        return text;
    }
}

export function analyzeSentiment(text) {
    const sentiment = new Sentiment();
    const score = sentiment.analyze(text).score;
    if (score > 10) {
        return 'найкращий';
    } else if (score > 5) {
        return 'хороший';
    } else if (score === 0) {
        return 'нейтральний';
    } else if (score > -5) {
        return 'засмучений';
    } else {
        return 'розлючений';
    }
}

export async function rephraseText(text, language, style) {
    try {
        const response = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                text: text,
                language: language,
                enabledRules: style === 'формальний' ? 'FORMAL' : style === 'неформальний' ? 'INFORMAL' : ''
            })
        });

        const data = await response.json();
        let rephrasedText = text;

        if (data.matches.length > 0) {
            data.matches.reverse().forEach(match => {
                const replacement = match.replacements[0]?.value;
                if (replacement) {
                    const start = match.offset;
                    const end = match.offset + match.length;
                    rephrasedText = rephrasedText.substring(0, start) + replacement + rephrasedText.substring(end);
                }
            });
        }

        return rephrasedText;
    } catch (error) {
        console.error('Error rephrasing text:', error);
        return text;
    }
}

async function createSummarizer() {
    const apiUrl = 'https://api-inference.huggingface.co/models/sshleifer/distilbart-cnn-12-6';

    return async function summarizeText(text) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: text })
            });

            const summaryResult = await response.json();
            let summarizedText = summaryResult[0]?.summary_text || '';

            let doc = nlp(summarizedText);

            let adjectives = doc.adjectives();
            adjectives = adjectives.slice(0, Math.floor(adjectives.length / 2));
            adjectives.delete();

            let keySentences = doc.sentences().out('array').slice(0, Math.min(3, doc.sentences().length));

            let simplifiedText = keySentences.join(' ');

            return simplifiedText;
        } catch (error) {
            console.error("Summarization Error:", error);
            throw error;
        }
    };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTranslator(srcLang, tgtLang) {
    const apiUrl = `https://api-inference.huggingface.co/models/facebook/nllb-200-distilled-600M`;

    return async function translateText(text, retries = 3, delayMs = 30000) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: text,
                    parameters: {
                        src_lang: srcLang, 
                        tgt_lang: tgtLang 
                    }
                })
            });

            const translationResult = await response.json();
            if (translationResult.error) {
                if(translationResult.error.includes("limit")){
                    throw new Error("Ліміт API вичерпано, спробуйте через 1 годину."); 
                }
                if (retries > 0) {
                    console.warn(`Помилка API, повторюємо спробу... Залишилось спроб: ${retries}`); 
                    await delay(delayMs); 
                    console.log(translationResult.error)
                    return translateText(text, retries - 1, delayMs); 
                } else {
                    console.log(translationResult.error)
                    throw new Error('Максимальна кількість спроб вичерпана'); 
                }
            }

            console.log(translationResult);
            return translationResult[0]?.translation_text || '';
        } catch (error) {
            console.error("Translation Error:", error);
            throw error;
        }
    };
}

export async function loadModels() {
    const translatorToEnglish = await createTranslator('uk_UA', 'en_XX');
    const translatorToOriginalLanguage = await createTranslator('en_XX', 'uk_UA');
    const summarizer = await createSummarizer();

    return { translatorToEnglish, translatorToOriginalLanguage, summarizer };
}

function splitText(text, parts) {
    const textLength = text.length;
    const partLength = Math.ceil(textLength / parts);
    const textParts = [];

    for (let i = 0; i < parts; i++) {
        const start = i * partLength;
        const end = start + partLength;
        textParts.push(text.substring(start, end));
    }

    return textParts;
}

export async function translateTextInParts(text, translator, parts) {
    const textParts = splitText(text, parts);
    const translatedParts = await Promise.all(textParts.map(part => translator(part)));
    return translatedParts.join(' ');
}