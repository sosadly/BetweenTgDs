const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const { Telegraf } = require('telegraf');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const winston = require('winston');
require('dotenv').config();

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
            info => `${info.timestamp} - ${info.level.toUpperCase()}: ${info.message}`
        )
    ),
    transports: [
        new winston.transports.Console(),
    ],
});

logger.info('Bot script started.');

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID);

if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID || !TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.error('One or more environment variables are missing. Please check your .env file.');
    process.exit(1);
}

ffmpeg.setFfmpegPath(ffmpegPath);
logger.info(`FFmpeg Path: ${ffmpegPath}`);

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

discordClient.once('ready', () => {
    logger.info(`Discord bot is ready as ${discordClient.user.tag}`);
});

discordClient.on('error', (error) => {
    logger.error(`Discord client error: ${error.message}`);
});

const telegramBot = new Telegraf(TELEGRAM_TOKEN);

const downloadTelegramFile = async (fileUrl, destPath) => {
    try {
        logger.info(`Downloading file from URL: ${fileUrl}`);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await fs.ensureDir(path.dirname(destPath));

        await fs.writeFile(destPath, buffer);
        logger.info(`File saved to: ${destPath}`);
    } catch (error) {
        logger.error(`Error downloading file: ${error.message}`);
        throw error;
    }
};

const convertAudio = (inputPath, outputPath, format, codec) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat(format)
            .audioCodec(codec)
            .audioBitrate('64k')
            .on('start', (commandLine) => {
                logger.info(`FFmpeg process started: ${commandLine}`);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    logger.info(`FFmpeg conversion progress: ${Math.round(progress.percent)}%`);
                }
            })
            .on('stderr', (stderrLine) => {
                logger.info(`FFmpeg STDERR: ${stderrLine}`);
            })
            .on('end', () => {
                logger.info(`Successfully converted ${inputPath} to ${outputPath}`);
                resolve();
            })
            .on('error', (err, stdout, stderr) => {
                logger.error(`Error converting audio: ${err.message}`);
                logger.error(`FFmpeg STDERR: ${stderr}`);
                reject(err);
            })
            .save(outputPath);
    });
};

telegramBot.on(['text', 'voice', 'audio', 'document'], async (ctx) => {
    try {
        logger.info(`Received message from chat ID: ${ctx.chat.id}`);

        if (ctx.chat.id !== TELEGRAM_CHAT_ID) {
            logger.info("Message is not from the specified Telegram chat.");
            return;
        }

        const message = ctx.message;
        const discordChannel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);

        if (!discordChannel) {
            logger.error(`Discord channel with ID ${DISCORD_CHANNEL_ID} not found.`);
            return;
        }

        if (message.text) {
            const content = `[TG] ${message.from.first_name} ${message.from.last_name || ''}: ${message.text}`;
            logger.info(`Forwarding to Discord: ${content}`);
            await discordChannel.send(content);
        } else if (message.voice || message.audio) {
            const file = message.voice || message.audio;
            logger.info(`Processing voice/audio message: ${JSON.stringify(file)}`);

            if (!file.mime_type) {
                logger.warn(`No mime_type found for file ID: ${file.file_id}. Defaulting to 'ogg'.`);
            }

            const fileLink = await telegramBot.telegram.getFileLink(file.file_id);
            logger.info(`Obtained file link: ${fileLink.href}`);

            const fileExtension = file.mime_type ? file.mime_type.split('/').pop() : 'ogg';
            logger.info(`Determined file extension: ${fileExtension}`);

            const filePath = path.join('downloads', `${file.file_id}.${fileExtension}`);
            await fs.ensureDir(path.dirname(filePath));

            await downloadTelegramFile(fileLink.href, filePath);
            logger.info(`Downloaded file to: ${filePath}`);

            const mp3Path = filePath.replace(/\.\w+$/, '.mp3');
            try {
                logger.info(`Starting audio conversion: ${filePath} -> ${mp3Path}`);
                await convertAudio(filePath, mp3Path, 'mp3', 'libmp3lame');
                logger.info(`Successfully converted to MP3: ${mp3Path}`);
            } catch (err) {
                logger.error(`Error converting audio: ${err.message}`);
                return;
            }

            if (!fs.existsSync(mp3Path)) {
                logger.error(`Converted MP3 file does not exist: ${mp3Path}`);
                return;
            }

            const stats = await fs.stat(mp3Path);
            const MAX_DISCORD_FILE_SIZE = 8 * 1024 * 1024; // 8MB
            if (stats.size > MAX_DISCORD_FILE_SIZE) {
                logger.warn(`MP3 file size (${stats.size} bytes) exceeds Discord's limit.`);
                await discordChannel.send(`[TG] ${message.from.first_name} ${message.from.last_name || ''} (Voice): File size exceeds Discord's limit.`);
                await fs.remove(filePath);
                await fs.remove(mp3Path);
                return;
            }

            try {
                const attachment = new AttachmentBuilder(mp3Path).setName(path.basename(mp3Path));
                await discordChannel.send({
                    content: `[TG] ${message.from.first_name} ${message.from.last_name || ''} (Voice):`,
                    files: [attachment],
                });
                logger.info('Voice message sent to Discord.');
            } catch (err) {
                logger.error(`Error sending message to Discord: ${err.message}`);
            }

            try {
                await fs.remove(filePath);
                await fs.remove(mp3Path);
                logger.info('Temporary files removed.');
            } catch (err) {
                logger.warn(`Failed to remove temporary files: ${err.message}`);
            }

        } else if (message.document) {
            const document = message.document;
            logger.info(`Processing document: ${document.file_name}`);

            const fileLink = await telegramBot.telegram.getFileLink(document.file_id);
            logger.info(`Obtained file link: ${fileLink.href}`);

            const filePath = path.join('downloads', document.file_name);
            await fs.ensureDir(path.dirname(filePath));

            await downloadTelegramFile(fileLink.href, filePath);
            logger.info(`Downloaded document to: ${filePath}`);

            const stats = await fs.stat(filePath);
            const MAX_DISCORD_FILE_SIZE = 8 * 1024 * 1024; // 8MB
            if (stats.size > MAX_DISCORD_FILE_SIZE) {
                logger.warn(`Document file size (${stats.size} bytes) exceeds Discord's limit.`);
                await discordChannel.send(`[TG] ${message.from.first_name} ${message.from.last_name || ''} (File): File size exceeds Discord's limit.`);
                await fs.remove(filePath);
                return;
            }

            try {
                const attachment = new AttachmentBuilder(filePath).setName(document.file_name);
                await discordChannel.send({
                    content: `[TG] ${message.from.first_name} ${message.from.last_name || ''} (File):`,
                    files: [attachment],
                });
                logger.info('Document sent to Discord.');
            } catch (err) {
                logger.error(`Error sending document to Discord: ${err.message}`);
            }

            try {
                await fs.remove(filePath);
                logger.info('Temporary file removed.');
            } catch (err) {
                logger.warn(`Failed to remove temporary file: ${err.message}`);
            }
        }

    } catch (err) {
        logger.error(`Error in Telegram to Discord handler: ${err.message}`);
    }
});

discordClient.on('messageCreate', async (message) => {
    try {
        if (message.channel.id !== DISCORD_CHANNEL_ID || message.author.bot) return;

        if (message.content) {
            const text = `[DS] ${message.author.username}: ${message.content}`;
            logger.info(`Forwarding to Telegram: ${text}`);

            try {
                await telegramBot.telegram.sendMessage(TELEGRAM_CHAT_ID, text);
                logger.info('Message forwarded to Telegram successfully.');
            } catch (err) {
                logger.error(`Error sending message to Telegram: ${err.message}`);
            }
        }

        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const filePath = path.join('downloads', attachment.name);
                await fs.ensureDir(path.dirname(filePath));
                try {
                    const response = await fetch(attachment.url);
                    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    await fs.writeFile(filePath, buffer);
                    logger.info(`Downloaded file from Discord: ${filePath}`);
                } catch (err) {
                    logger.error(`Error downloading file from Discord: ${err.message}`);
                    continue;
                }

                const fileExtension = path.extname(attachment.name).toLowerCase();

                if (['.mp3', '.wav', '.ogg', '.m4a'].includes(fileExtension)) {
                    const oggPath = filePath.replace(/\.\w+$/, '.ogg');
                    try {
                        logger.info(`Starting audio conversion: ${filePath} -> ${oggPath}`);
                        await convertAudio(filePath, oggPath, 'ogg', 'libopus');
                        logger.info(`Successfully converted to OGG OPUS: ${oggPath}`);
                    } catch (err) {
                        logger.error(`Error converting audio: ${err.message}`);
                        try {
                            await telegramBot.telegram.sendDocument(
                                TELEGRAM_CHAT_ID,
                                {
                                    source: fs.createReadStream(filePath),
                                    filename: attachment.name,
                                },
                                {
                                    caption: `[DS] ${message.author.username} (File):`,
                                }
                            );
                            logger.info('Audio file sent as document to Telegram.');
                        } catch (sendErr) {
                            logger.error(`Error sending document to Telegram: ${sendErr.message}`);
                        }
                        try {
                            await fs.remove(filePath);
                            logger.info('Temporary file removed.');
                        } catch (cleanupErr) {
                            logger.warn(`Failed to remove temporary file: ${cleanupErr.message}`);
                        }
                        continue;
                    }

                    try {
                        await telegramBot.telegram.sendVoice(
                            TELEGRAM_CHAT_ID,
                            {
                                source: fs.createReadStream(oggPath),
                            },
                            {
                                caption: `[DS] ${message.author.username} (Voice):`,
                            }
                        );
                        logger.info('Voice message sent to Telegram.');
                    } catch (err) {
                        logger.error(`Error sending voice message to Telegram: ${err.message}`);
                    }

                    try {
                        await fs.remove(filePath);
                        await fs.remove(oggPath);
                        logger.info('Temporary files removed.');
                    } catch (err) {
                        logger.warn(`Failed to remove temporary files: ${err.message}`);
                    }

                } else {
                    try {
                        await telegramBot.telegram.sendDocument(
                            TELEGRAM_CHAT_ID,
                            {
                                source: fs.createReadStream(filePath),
                                filename: attachment.name,
                            },
                            {
                                caption: `[DS] ${message.author.username} (File):`,
                            }
                        );
                        logger.info('File sent to Telegram.');
                    } catch (err) {
                        logger.error(`Error sending file to Telegram: ${err.message}`);
                    }

                    try {
                        await fs.remove(filePath);
                        logger.info('Temporary file removed.');
                    } catch (err) {
                        logger.warn(`Failed to remove temporary file: ${err.message}`);
                    }
                }
            }
        }

    } catch (err) {
        logger.error(`Error in Discord to Telegram handler: ${err.message}`);
    }
});

const startBots = async () => {
    try {
        logger.info('Logging into Discord...');
        await discordClient.login(DISCORD_TOKEN);
        logger.info('Discord client logged in successfully.');
    } catch (err) {
        logger.error(`Failed to login to Discord: ${err.message}`);
    }

    try {
        logger.info('Launching Telegram bot...');
        await telegramBot.launch();
        logger.info('Telegram bot launched successfully.');
    } catch (err) {
        logger.error(`Failed to launch Telegram bot: ${err.message}`);
    }

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    logger.info('Both bots have been started and are running.');
};

const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    try {
        await telegramBot.stop();
        await discordClient.destroy();
        logger.info('Bots stopped.');
        process.exit(0);
    } catch (err) {
        logger.error(`Error during shutdown: ${err.message}`);
        process.exit(1);
    }
};

startBots();
