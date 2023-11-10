import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const port = 8080;
const app = express();

app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "index.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "login.html"));
});

app.get("/test.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "test.html"));
})

app.get("/register.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "register.html"));
});

app.get("/chat.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html" , "chat.html"));
});

app.get("/settings.html", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/html", "settings.html"));
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.listen(port, '192.168.0.5', () => {
  console.log(`Server is running on port ${port}. Test at: http://192.168.0.5:${port}/`);
});