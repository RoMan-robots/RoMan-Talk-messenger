// Генерує випадкове число 0 або 1
const random = Math.floor(Math.random() * 2);

// Визначає, чи це "так" чи "ні" на основі випадкового числа
const answer = random === 1 ? 'так' : 'ні';

console.log(answer);
