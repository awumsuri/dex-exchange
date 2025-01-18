#!/usr/bin/env python3

# from telegram import Updater, MessageHandler, Filters
from telegram.ext import Updater, MessageHandler, Filters
import os
from dotenv import load_dotenv
import requests
import datetime
# Initialize dotenv
load_dotenv()

# Replace with your Bot Token
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')

# Replace this with your channel ID (including the -100 prefix for private channels)
CHANNEL_ID = -1002378410637

def handle_new_message(update, context):
    message = update.channel_post
    if message is not None:
        print("New message in channel:", message.text)
        # Parse message text for token ticker or name
        text = message.text.lower()
        
        # Look for $ORACLE ticker
        if '$oracle' in text:
            token_info = {
                'token': '$ORACLE',
                'solona': 'Solana',
                'name': 'The Oracle'              
            }
            print("Found $ORACLE token mention")
            send_to_telegram(token_info)
            
        # Look for "the oracle" token name
        elif 'the oracle' in text:
            token_info = {
                'token': '$ORACLE',
                'solona': 'Solana',
                'name': 'The Oracle'              
            }
            print("Found The Oracle token mention") 
            send_to_telegram(token_info)


    
def send_to_telegram(pair):
    try:
        bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
        chat_id = os.getenv('TELEGRAM_CHAT_ID')
        
        if not bot_token or not chat_id:
            raise ValueError('Telegram bot token or chat ID not found in environment variables')
        
        message = f"""
            🔥 Found ORACLE TOKEN 🔥

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
        print('Message sent to Telegram successfully')
       
        
    except Exception as e:
        print(f'Error sending to Telegram: {e}') 
        
        
if __name__ == "__main__":
    # Initialize the Updater with your bot token
    updater = Updater(BOT_TOKEN, use_context=True)

    dispatcher = updater.dispatcher

    # Create a handler that only listens to the specified channel
    channel_filter = Filters.chat(CHANNEL_ID)

    # Add a handler that calls handle_new_message whenever a text message appears
    # in the channel
    handler = MessageHandler(channel_filter & Filters.text, handle_new_message)
    dispatcher.add_handler(handler)

    # Start polling for updates
    updater.start_polling()
    print(f"Listening for new messages in channel {CHANNEL_ID}...")
    
    # Run until Ctrl+C
    updater.idle()


