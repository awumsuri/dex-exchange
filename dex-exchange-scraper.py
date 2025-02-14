from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync

import os
import json
import random
import time
import asyncio
from dotenv import load_dotenv
from user_agents import parse
import requests
from pathlib import Path

# Initialize dotenv
load_dotenv()

def setup_page_stealth(page):
    # Add stealth scripts
    page.add_init_script("""
        () => {
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            Object.defineProperties(navigator, {
                webdriver: { get: () => undefined },
                plugins: { get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin' }
                ]},
                languages: { get: () => ['en-US', 'en'] },
                platform: { get: () => 'Win32' },
                hardwareConcurrency: { get: () => 8 },
                deviceMemory: { get: () => 8 },
                maxTouchPoints: { get: () => 0 },
            });
        }
    """)

def is_token_already_saved(token_address):
    try:
        filename = Path('./pairs/trading-pairs.json')
        if not filename.exists():
            return False
        
        with open(filename, 'r') as f:
            existing_pairs = json.load(f)
        return any(pair['tokenAddress'] == token_address for pair in existing_pairs)
    except Exception as e:
        print(f'Error checking token existence: {e}')
        return False

def send_to_telegram(pair):
    try:
        bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
        chat_id = os.getenv('TELEGRAM_CHAT_ID')
        
        if not bot_token or not chat_id:
            raise ValueError('Telegram bot token or chat ID not found in environment variables')
        
        message = f"""
🔥 New Token Alert 🔥

Token: {pair['token']}
Network: {pair['network']}
Price: ${pair['price']}
Age: {pair['pairAge']}

📊 Stats:
• Buys: {pair['buys']}
• Sells: {pair['sells']}
• Volume: ${pair['volume']:,.2f}
• Makers: {pair['makers']}
• Liquidity: ${pair['liquidity']:,.2f}
• Market Cap: ${pair['marketCap']:,.2f}

📈 Price Changes:
• 5m: {pair['priceChange']['m5']}%
• 1h: {pair['priceChange']['h1']}%
• 6h: {pair['priceChange']['h6']}%
• 24h: {pair['priceChange']['h24']}%

🔗 Contract: {pair['tokenAddress']}
"""

        url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
        response = requests.post(url, json={
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'HTML'
        })
        
        response.raise_for_status()
        print('Message sent to Telegram successfully')
        save_pair_to_file(pair)
        
    except Exception as e:
        print(f'Error sending to Telegram: {e}')

def save_pair_to_file(pair):
    try:
        pairs_dir = Path('./pairs')
        pairs_dir.mkdir(exist_ok=True)
        
        filename = pairs_dir / 'trading-pairs.json'
        existing_pairs = []
        
        if filename.exists():
            with open(filename, 'r') as f:
                existing_pairs = json.load(f)
        
        pair_with_timestamp = {
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            **pair
        }
        
        existing_pairs.append(pair_with_timestamp)
        
        with open(filename, 'w') as f:
            json.dump(existing_pairs, f, indent=2)
        print(f'Pair data appended to {filename}')
    except Exception as e:
        print(f'Error saving pair to file: {e}')

def main():
    with sync_playwright() as p:
        user_profile = "/Users/surimtui/Library/Application Support/Google/Chrome/Profile 4"
        browser_context = p.chromium.launch_persistent_context(
            headless=False,
            executable_path=r"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            user_data_dir=user_profile,
            viewport={'width': 1920, 'height': 1080},
            # user_agent=str(parse('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.165 Safari/537.36')),
            # locale='en-US',
        )

        try:
            # Create page directly from browser_context, no need for new_context()
            page = browser_context.new_page()
            stealth_sync(page)

            # setup_page_stealth(page)

            while True:
                try:
                    print('Loading page...')
                    page.goto('https://dexscreener.com/?rankBy=pairAge', 
                             wait_until='networkidle', timeout=60000)
                    
                    print('Waiting for initial load...')
                    page.wait_for_timeout(5000)
                    
                    # Wait for table rows
                    page.wait_for_selector('.ds-dex-table-row', timeout=30000)
                    
                    pairs = page.evaluate("""
                        () => {
                            const pairElements = document.querySelectorAll('.ds-dex-table-row');
                            if (pairElements.length === 0) return [];
                            
                            return Array.from(pairElements).map(row => {
                                try {
                                    const href = row.getAttribute('href') || '';
                                    const parts = href.split('/');
                                    const tokenAddress = parts[parts.length - 1];
                                    const network = parts[1] || '';
                                    
                                    const getTextContent = (selector) => {
                                        const element = row.querySelector(selector);
                                        return element?.textContent?.trim() || '';
                                    };
                                    
                                    const parseNumber = (text) => {
                                        return parseFloat(text.replace(/[$,]/g, '')) || 0;
                                    };
                                    
                                    return {
                                        'network': network,
                                        'tokenAddress': tokenAddress,
                                        'token': getTextContent('.ds-dex-table-row-col-token'),
                                        'price': parseNumber(getTextContent('.ds-dex-table-row-col-price')),
                                        'pairAge': getTextContent('.ds-dex-table-row-col-pair-age'),
                                        'buys': parseInt(getTextContent('.ds-dex-table-row-col-buys').replace(',', '')) || 0,
                                        'sells': parseInt(getTextContent('.ds-dex-table-row-col-sells').replace(',', '')) || 0,
                                        'volume': parseNumber(getTextContent('.ds-dex-table-row-col-volume')),
                                        'makers': parseInt(getTextContent('.ds-dex-table-row-col-makers').replace(',', '')) || 0,
                                        'priceChange': {
                                            'm5': parseNumber(getTextContent('.ds-dex-table-row-col-price-change-m5')),
                                            'h1': parseNumber(getTextContent('.ds-dex-table-row-col-price-change-h1')),
                                            'h6': parseNumber(getTextContent('.ds-dex-table-row-col-price-change-h6')),
                                            'h24': parseNumber(getTextContent('.ds-dex-table-row-col-price-change-h24'))
                                        },
                                        'liquidity': parseNumber(getTextContent('.ds-dex-table-row-col-liquidity')),
                                        'marketCap': parseNumber(getTextContent('.ds-dex-table-row-col-market-cap'))
                                    };
                                } catch (error) {
                                    console.error('Error parsing row:', error);
                                    return null;
                                }
                            }).filter(item => item !== null);
                        }
                    """)

                    print(f'Number of pairs found: {len(pairs)}')
                    if not pairs:
                        print('No pairs found, waiting before retry...')
                        page.wait_for_timeout(10000)
                        continue

                    # Filter pairs based on criteria
                    high_maker_pairs = [
                        pair for pair in pairs                       
                        if (pair['token'] == '$TIND' or pair['token'] == '$TINDER')                       
                        and pair['network'] == 'solana'
                    ]

                    if high_maker_pairs:
                        print('\nFiltered pairs meeting criteria:')
                        first_pair = high_maker_pairs[0]
                        if not is_token_already_saved(first_pair['tokenAddress']):
                            send_to_telegram(first_pair)
                            print(json.dumps(first_pair, indent=2))
                        else:
                            print(f"Token {first_pair['token']} already saved")
                        print('------------------------\n')
                    else:
                        print(f'No New Found Tokens == {time.strftime("%Y-%m-%d %H:%M:%S")}')

                    page.wait_for_timeout(5000)

                except Exception as e:
                    print(f'Error in scraping loop: {e}')
                    page.wait_for_timeout(10000)

        except Exception as e:
            print(f'Fatal error: {e}')
            browser_context.close()
            exit(1)


def main2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()
        stealth_sync(page)
        page.goto("https://dexscreener.com/?rankBy=pairAge", wait_until="networkidle", timeout=60000)
        print("Page loaded with stealth measures")
        input("Press Enter to close browser...")
        browser.close()

if __name__ == '__main__':
  main()