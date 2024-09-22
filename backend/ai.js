import fs from 'fs';
import nlp from "compromise";
import { franc } from "franc";
import fetch from 'node-fetch';
import Sentiment from 'sentiment';
import { pipeline } from '@xenova/transformers';

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

    return text.split('').map(char => latinToCyrillicMap[char] || char).join('');
}

export function filterText(text) {
    text = normalizeText(text)
    let words = text.split(" ");
    let filteredWords = words.map(word => {
        return badWords.some(badWord => word.toLowerCase().includes(badWord.toLowerCase()))
            ? '*'.repeat(word.length)
            : word;
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
    try {
        const pipelineInstance = await pipeline("summarization");
        return async function summarizeText(text) {
            try {
                const textLength = text.length;
                const minLength = Math.ceil(textLength / 2.5);
                const maxLength = Math.ceil(textLength / 1.5);

                const summaryResult = await pipelineInstance(text, {
                    max_length: maxLength,
                    min_length: minLength
                });

                let summarizedText = summaryResult[0].summary_text;

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
    } catch (error) {
        console.error("Error loading summarizer model:", error);
        throw error;
    }
}

async function createTranslator(model) {
    try {
        const pipelineInstance = await pipeline("translation", model);
        return async function translateText(text) {
            try {
                const translationResult = await pipelineInstance(text);
                return translationResult[0].translation_text;
            } catch (error) {
                console.error("Translation Error:", error);
                throw error;
            }
        };
    } catch (error) {
        console.error("Error loading translator model:", error);
        throw error;
    }
}

export async function loadModels() {
    const translatorToEnglish = await createTranslator('Xenova/opus-mt-uk-en');
    const translatorToOriginalLanguage = await createTranslator('Xenova/opus-mt-en-uk');
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

export async function processRequest(text, style) {
    const { translatorToEnglish, translatorToOriginalLanguage, summarizer } = await loadModels();

    console.log(`Original Text: ${text}`);

    const filteredText = filterText(text);
    console.log(`Filtered Text: ${filteredText}`);

    const originalLanguage = franc(filteredText);
    console.log(`Detected Original Language: ${originalLanguage}`);

    let textToTranslate = filteredText;

    if (originalLanguage !== 'eng') {
        const parts = text.length >= 10000 ? 1000 : text.length >= 1000 ? 100 : text.length >= 500 ? 50 : text.length >= 250 ? 30 : 1;
        console.log(T`ranslating text to English in ${parts} parts...`);
        textToTranslate = await translateTextInParts(filteredText, translatorToEnglish, parts);
        console.log(`Translated to English: ${textToTranslate}`);
    }

    const correctedText = await checkGrammar(textToTranslate, 'en');
    console.log(`Corrected Text: ${correctedText}`);

    const sentimentResult = analyzeSentiment(correctedText);
    console.log(`Sentiment Analysis: ${sentimentResult}`);

    const rephrasedText = await rephraseText(correctedText, 'en', style);
    console.log(`Rephrased Text: ${rephrasedText}`);

    const summaryText = await summarizer(rephrasedText);
    console.log(`Generated Summary: ${summaryText}`);

    let finalText = summaryText;

    if (originalLanguage !== 'eng') {
        const parts =
            summaryText.length >= 100000 ? 1000 :
                summaryText.length >= 50000 ? 500 :
                    summaryText.length >= 25000 ? 250 :
                        summaryText.length >= 10000 ? 100 :
                            summaryText.length >= 1000 ? 50 :
                                summaryText.length >= 500 ? 10 :
                                    summaryText.length >= 100 ? 3 : 2
        console.log(`Translating summary back to original language in ${parts} parts...`);
        finalText = await translateTextInParts(summaryText, translatorToOriginalLanguage, parts);
        console.log(`Translated back to original language: ${finalText}`);
    }

    return finalText;
}