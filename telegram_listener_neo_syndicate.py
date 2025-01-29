#!/usr/bin/env python3

# from telegram import Updater, MessageHandler, Filters
from telegram.ext import Updater, MessageHandler, Filters
import os
from dotenv import load_dotenv
import requests
import datetime
import logging
from logging.handlers import RotatingFileHandler

# Initialize dotenv
load_dotenv()

# Configure logging
log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
log_file = 'telegram_bot.log'
log_handler = RotatingFileHandler(log_file, maxBytes=1024*1024, backupCount=5)  # 1MB per file, keep 5 backup files
log_handler.setFormatter(log_formatter)

logger = logging.getLogger('TelegramBot')
logger.setLevel(logging.INFO)
logger.addHandler(log_handler)

# Replace with your Bot Token
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')

# Replace this with your channel ID (including the -100 prefix for private channels)
CHANNEL_ID = -1002378410637

def handle_new_message(update, context):
    message = update.channel_post
    if message is not None:
        logger.info(f"New message in channel: {message.text}")
        # Parse message text for token ticker or name
        text = message.text.lower()
        
        # Look for Red Coin variations
        if any(variant in text.replace(' ', '') for variant in ['redcoin', 'reddcoin', 'red coin', 'redd coin']):
            # Check if it's the double 'd' variant
            is_redd = any(variant in text.replace(' ', '') for variant in ['reddcoin', 'redd coin'])
            token_info = {
                'token': '$REDDCOIN' if is_redd else '$REDCOIN',
                'solona': 'Solana',
                'name': 'Redd Coin' if is_redd else 'Red Coin'              
            }
            logger.info(f"Found {'Redd' if is_redd else 'Red'} Coin token mention") 
            send_to_telegram(token_info)


    
def send_to_telegram(pair):
    try:
        bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
        chat_id = os.getenv('TELEGRAM_CHAT_ID')
        
        if not bot_token or not chat_id:
            logger.error('Telegram bot token or chat ID not found in environment variables')
            raise ValueError('Telegram bot token or chat ID not found in environment variables')
        
        message = f"""
            🔥 Found {pair['name']} TOKEN 🔥

            Token: {pair['token']}
            Network: {pair['solona']}
            Name: {pair['name']}
        """

        url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
        response = requests.post(url, json={
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'HTML'
        })
        
        response.raise_for_status()
        logger.info('Message sent to Telegram successfully')
       
        
    except Exception as e:
        logger.error(f'Error sending to Telegram: {str(e)}') 
        
        
if __name__ == "__main__":
    # Initialize the Updater with your bot token
    updater = Updater(BOT_TOKEN, use_context=True)
    logger.info("Bot initialized successfully")

    dispatcher = updater.dispatcher

    # Create a handler that only listens to the specified channel
    channel_filter = Filters.chat(CHANNEL_ID)

    # Add a handler that calls handle_new_message whenever a text message appears
    # in the channel
    handler = MessageHandler(channel_filter & Filters.text, handle_new_message)
    dispatcher.add_handler(handler)

    # Start polling for updates
    updater.start_polling()
    logger.info(f"Listening for new messages in channel {CHANNEL_ID}...")
    
    # Run until Ctrl+C
    updater.idle()


