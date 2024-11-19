import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import dotenv from 'dotenv';
import fs from 'fs';
import Xvfb from 'xvfb';

// Initialize dotenv
dotenv.config();

// Initialize Xvfb for Linux environments
let xvfb;
if (os.platform() === 'linux') {
    console.log('Starting Xvfb...')
    xvfb = new Xvfb({
        silent: true,
        xvfb_args: ['-screen', '0', '800x600x16', '-ac']
    });
    xvfb.startSync();
    process.env.DISPLAY = ':99';
}

// Setup puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

// Configure paths based on OS
const cacheLocation = os.platform() === 'darwin' ? '/Users/surimtui/dexexchange-scraper/cache-chrome/' : '/root/chrome-cache/'
const executablePath = os.platform() === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome-stable'       

// Launch browser
const browser = await puppeteer.launch({
    headless: false,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1024,768'
    ],
    defaultViewport: { width: 1024, height: 768 },
    executablePath: executablePath,
    userDataDir: cacheLocation,
});

async function scrapeDexScreener() {
    try {
        const page = await browser.newPage();
        
        // Set viewport and user agent
        await page.setViewport({ width: 1024, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Loading page...');
        await page.goto('https://dexscreener.com/?rankBy=pairAge&order=asc&minLiq=50000&min24HVol=80000&profile=1', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('Waiting for initial load...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        while (true) {
            try {
                // Wait for the table to be present
                await page.waitForSelector('.ds-dex-table-row', { timeout: 30000 });
                
                const pairs = await page.evaluate(() => {
                    console.log('Starting evaluation...');
                    const pairElements = document.querySelectorAll('.ds-dex-table-row');
                    console.log('Found elements:', pairElements.length);
                    
                    if (pairElements.length === 0) {
                        return [];
                    }

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
                                network,
                                tokenAddress,
                                token: getTextContent('.ds-dex-table-row-col-token'),
                                price: parseNumber(getTextContent('.ds-dex-table-row-col-price')),
                                pairAge: getTextContent('.ds-dex-table-row-col-pair-age'),
                                buys: parseInt(getTextContent('.ds-dex-table-row-col-buys').replace(',', '')) || 0,
                                sells: parseInt(getTextContent('.ds-dex-table-row-col-sells').replace(',', '')) || 0,
                                volume: parseNumber(getTextContent('.ds-dex-table-row-col-volume')),
                                makers: parseInt(getTextContent('.ds-dex-table-row-col-makers').replace(',', '')) || 0,
                                priceChange: {
                                    m5: parseNumber(getTextContent('.ds-dex-table-row-col-price-change-m5')),
                                    h1: parseNumber(getTextContent('.ds-dex-table-row-col-price-change-h1')),
                                    h6: parseNumber(getTextContent('.ds-dex-table-row-col-price-change-h6')),
                                    h24: parseNumber(getTextContent('.ds-dex-table-row-col-price-change-h24'))
                                },
                                liquidity: parseNumber(getTextContent('.ds-dex-table-row-col-liquidity')),
                                marketCap: parseNumber(getTextContent('.ds-dex-table-row-col-market-cap'))
                            };
                        } catch (error) {
                            console.error('Error parsing row:', error);
                            return null;
                        }
                    }).filter(item => item !== null);
                });

                console.log('Number of pairs found:', pairs.length);
                if (pairs.length === 0) {
                    console.log('No pairs found, waiting before retry...');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }

                // Filter pairs based on criteria
                const highMakerPairs = pairs.filter(pair => 
                    pair.makers > 8 &&
                    pair.liquidity > 5 &&
                    pair.volume > 8 &&
                    pair.network === 'solana'
                );

                if (highMakerPairs.length > 0) {
                    console.log('\nFiltered pairs meeting criteria:');
                    const firstPair = highMakerPairs[0];
                    if (!await isTokenAlreadySaved(firstPair.tokenAddress)) {
                        await sendToTelegram(firstPair);
                        console.log(JSON.stringify(firstPair, null, 2));
                    } else {
                        console.log(`Token ${firstPair.token} already saved`);
                    }
                    console.log('------------------------\n');
                } else {
                    console.log(`No New Found Tokens == ${new Date()}`);
                }

                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error('Error in scraping loop:', error);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    } catch (error) {
        console.error('Fatal scraping error:', error);
        await browser.close();
        throw error;
    }
}

async function isTokenAlreadySaved(tokenAddress) {
    try {
        const filename = './pairs/trading-pairs.json';
        
        if (!fs.existsSync(filename)) {
            return false;
        }

        const fileContent = fs.readFileSync(filename, 'utf8');
        const existingPairs = JSON.parse(fileContent);
        return existingPairs.some(pair => pair.tokenAddress === tokenAddress);
    } catch (error) {
        console.error('Error checking token existence:', error);
        return false;
    }
}

async function sendToTelegram(pair) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!botToken || !chatId) {
            throw new Error('Telegram bot token or chat ID not found in environment variables');
        }
        
        const message = `
🔥 New Token Alert 🔥

Token: ${pair.token}
Network: ${pair.network}
Price: $${pair.price}
Age: ${pair.pairAge}

📊 Stats:
• Buys: ${pair.buys}
• Sells: ${pair.sells}
• Volume: $${pair.volume.toLocaleString()}
• Makers: ${pair.makers}
• Liquidity: $${pair.liquidity.toLocaleString()}
• Market Cap: $${pair.marketCap.toLocaleString()}

📈 Price Changes:
• 5m: ${pair.priceChange.m5}%
• 1h: ${pair.priceChange.h1}%
• 6h: ${pair.priceChange.h6}%
• 24h: ${pair.priceChange.h24}%

🔗 Contract: ${pair.tokenAddress}
`;

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log('Message sent to Telegram successfully');
        await savePairToFile(pair);
        
    } catch (error) {
        console.error('Error sending to Telegram:', error);
    }
}

async function savePairToFile(pair) {
    try {
        const filename = './pairs/trading-pairs.json';

        if (!fs.existsSync('pairs')) {
            fs.mkdirSync('pairs');
        }

        let existingPairs = [];
        if (fs.existsSync(filename)) {
            const fileContent = fs.readFileSync(filename, 'utf8');
            existingPairs = JSON.parse(fileContent);
        }

        const pairWithTimestamp = {
            timestamp: new Date().toISOString(),
            ...pair
        };

        existingPairs.push(pairWithTimestamp);
        fs.writeFileSync(filename, JSON.stringify(existingPairs, null, 2));
        console.log(`Pair data appended to ${filename}`);
    } catch (error) {
        console.error('Error saving pair to file:', error);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing browser and exiting...');
    await browser.close();
    if (xvfb) {
        xvfb.stopSync();
    }
    process.exit(0);
});

// Execute the scraper
scrapeDexScreener()
    .catch(error => {
        console.error('Failed to scrape DEXScreener:', error);
        browser.close();
        if (xvfb) {
            xvfb.stopSync();
        }
        process.exit(1);
    }); 