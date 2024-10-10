# US: A bot for forwarding Telegram to Discord messages and vice versa

This project consists of two bots: one for Telegram and one for Discord. The bots exchange messages between each other, sending them on behalf of users from both platforms. A bot for forwarding Telegram to Discord messages and vice versa. There are supporting voice messages and files sending.

## Installation

### Requirements
- Node.js (v14 or higher)
- npm (v6 or higher)
- Ffmpeg(latest)
- Telegram Bot API key
- Discord Bot API key

### Steps to Install

1. Clone the repository:
  ```bash
  git clone https://github.com/sosadly/BetweenTgDs.git
  cd BetweenTgDs
  ```
2. Install the required dependencies:
  ```bash
  npm i
  ```
3. Set up environment variables(Before this you need to create BOT in telegram and discord and in telegram set privacy to disable):
  ```
  DISCORD_TOKEN=
  DISCORD_CHANNEL_ID= THIS MUST BE YOUR CHAT ID IN SPECIFED CHANNEL.
  TELEGRAM_TOKEN=
  TELEGRAM_CHAT_ID= 
  ```
4. Start the bot:
  ```bash
  npm start
  ```
  or
  ```
  node index.js
  ```

**Now, when someone writes to your specified Telegram chat, the message will automatically be sent to Discord, and similarly, when someone writes to your specified Discord chat, these messages will be sent to Telegram chat.**



# UA: Бот для пересилання повідомлень з Telegram до Discord і навпаки.

Цей проект складається з двох ботів: одного для Telegram і одного для Discord. Боти обмінюються повідомленнями між собою, надсилаючи їх від імені користувачів з обох платформ. Бот Telegram пересилає повідомлення до Discord і навпаки за допомогою бота. Є підтримка голосових повідомлень і відправка файлів.

## Встановлення

### Вимоги
- Node.js (v14 або вище)
- npm (v6 або вище)
- API ключ бота Telegram
- API ключ бота Discord

### Кроки для встановлення

1. Клонуйте репозиторій:
   ```bash
   git clone https://github.com/sosadly/BetweenTgDs.git
   cd BetweenTgDs
   ```
2. Встановіть необхідні залежності:
   ```bash
   npm i
   ```
3. Налаштуйте змінні середовища (перед цим потрібно створити бота в Telegram і Discord, а в Telegram вимкнути приватність):
   ```
   DISCORD_TOKEN=
   DISCORD_CHANNEL_ID=
   TELEGRAM_TOKEN=
   TELEGRAM_CHAT_ID=
   ```
4. Запустіть скрипт:
   ```bash
   npm start
   ```
   або
   ```bash
   node index.js
   ```

**Тепер, коли хтось пише у ваш зазначений чат Telegram, повідомлення автоматично буде надіслано до Discord, і навпаки, коли хтось пише у ваш зазначений чат Discord, ці повідомлення будуть надіслані до чату Telegram.**
