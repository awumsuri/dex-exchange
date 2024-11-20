import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import dotenv from 'dotenv';
import fs from 'fs';
import { spawn } from 'child_process';
import Xvfb from 'xvfb';

// Modify the Xvfb initialization block
let xvfb;
if (os.platform() === 'linux') {
    console.log('Starting Xvfb...')
    xvfb = new Xvfb({
        silent: true,
        xvfb_args: [
            '-screen', '0', '1280x1024x24', 
            '-ac',
            '+extension', 'RANDR',
            '+extension', 'RENDER',
            '-nolisten', 'tcp',
            '-dpi', '96'
        ]
    });
    xvfb.startSync();
    process.env.DISPLAY = ':99';
}


// Initialize dotenv at the top of your file
dotenv.config();

puppeteer.use(StealthPlugin());
const cacheLocation = os.platform() === 'darwin' ? '/Users/surimtui/dexexchange-scraper/cache-chrome/' : '/root/chrome-cache/'
const executablePath = os.platform() === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome-stable'       

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('chrome.runtime')
stealthPlugin.enabledEvasions.delete('iframe.contentWindow')
puppeteer.use(stealthPlugin);

const browser = await puppeteer.launch({
    headless: false,  // Use new headless mode
    // defaultViewport: { width: 1920, height: 1080 },
    userDataDir: cacheLocation,
    executablePath: executablePath,
    args: [
        '--no-sandbox',                
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
        '--disable-web-security',
        '--disable-notifications',
        ...(os.platform() === 'linux' ? ['--display=:99'] : []),
    ],
    ignoreDefaultArgs: ['--enable-automation'],
});


async function scrapeDexScreener() {
    try {
        // Launch browser
       

        const page = await browser.newPage();

        // Initial page load
        await page.goto('https://dexscreener.com/?rankBy=pairAge&order=asc&minLiq=50000&min24HVol=80000&profile=1', {
            timeout: 60000
        });

        // Initial delay to ensure WebSocket connection
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check for verification page
        // const verifyText = await page.evaluate(() => document.body.innerText);
        // if (verifyText.includes('Verify you are human by completing the action below')) {
        //     console.log('Detected verification page, waiting for manual verification...');
        //     // Find and click the checkbox for verification
        //     await page.waitForSelector('input[type="checkbox"]', { timeout: 30000 });
        //     const checkbox = await page.$('input[type="checkbox"]');
        //     if (checkbox) {
        //         await checkbox.click();
        //         console.log('Clicked verification checkbox');
        //     } else {
        //         console.log('Checkbox not found');
        //     }
        //     // Wait for verification to complete by checking when the text is no longer present
        //     await page.waitForFunction(
        //         () => !document.body.innerText.includes('Verify you are human by completing the action below'),
        //         { timeout: 10000 } // 5 minute timeout
        //     );
        //     console.log('Verification completed, continuing...');
        // }

        while (true) {
            const pairs = await page.evaluate(() => {

                const pairElements = document.querySelectorAll('.ds-dex-table-row.ds-dex-table-row-new');
                return Array.from(pairElements).map(row => {
                    // Get token address from href
                    const tokenAddress = row.getAttribute('href').split('/').pop();
                    // Get network name from href
                    const network = row.getAttribute('href').split('/')[1];
                    
                    return {
                        network,
                        tokenAddress,
                        token: row.querySelector('.ds-dex-table-row-col-token').innerText,
                        price: parseFloat(row.querySelector('.ds-dex-table-row-col-price').innerText.replace('$', '').replace(',', '')),
                        pairAge: row.querySelector('.ds-dex-table-row-col-pair-age').innerText,
                        buys: parseInt(row.querySelector('.ds-dex-table-row-col-buys').innerText.replace(',', '')),
                        sells: parseInt(row.querySelector('.ds-dex-table-row-col-sells').innerText.replace(',', '')),
                        volume: parseFloat(row.querySelector('.ds-dex-table-row-col-volume').innerText.replace('$', '').replace(',', '')),
                        makers: parseInt(row.querySelector('.ds-dex-table-row-col-makers').innerText.replace(',', '')),
                        priceChange: {
                            m5: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-m5').innerText.replace('%', '')),
                            h1: parseFloat (row.querySelector('.ds-dex-table-row-col-price-change-h1').innerText.replace('%', '')),
                            h6: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-h6').innerText.replace('%', '')),
                            h24: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-h24').innerText.replace('%', '')),
                        },
                        liquidity: parseFloat(row.querySelector('.ds-dex-table-row-col-liquidity').innerText.replace('$', '').replace(',', '')),
                        marketCap: parseFloat(row.querySelector('.ds-dex-table-row-col-market-cap').innerText.replace('$', '').replace(',', ''))
                    };
                });
            });

            console.log('Scraped Pairs:', pairs);
            // Filter and log pairs with makers over 10000
            const highMakerPairs = pairs.filter(pair => 
                pair.makers > 8 && // existing makers filter
                pair.liquidity > 5 && // minimum liquidity $100k
                pair.volume > 8 && // minimum 24h volume $50k
                //pair.priceChange.h24 > 0 && // positive 24h price change
                // pair.buys > pair.sells &&
                pair.network === 'solana' // more buys than sells
            );

            if (highMakerPairs.length > 0) {
                console.log('\nFiltered pairs meeting criteria:');
                // Send only the first pair that meets the criteria
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
            
            // if (highMakerPairs.length > 0) {
            //     console.log('\nFiltered pairs meeting criteria:');
            //     highMakerPairs.forEach(async pair => {
            //         if (!await isTokenAlreadySaved(pair.tokenAddress)) {                       
            //             await sendToTelegram(pair)
            //             console.log(JSON.stringify(pair, null, 2));                        
            //         } else {
            //             console.log(`Token ${pair.token} already saved`);
            //         }
                   
            //     });
            //     console.log('------------------------\n');
            // } else {
            //     console.log(`No New Found Tokens == ${new Date()}`)
            // }
            // Wait 5 seconds before next evaluation
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

    } catch (error) {
        console.error('Scraping error:', error);
        browser.close()
        throw error
    } 
}


async function isTokenAlreadySaved(tokenAddress) {
    try {
        const filename = './pairs/trading-pairs.json';
        
        // If file doesn't exist, token is not saved
        if (!fs.existsSync(filename)) {
            return false;
        }

        // Read and parse the existing file
        const fileContent = fs.readFileSync(filename, 'utf8');
        const existingPairs = JSON.parse(fileContent);

        // Check if token address exists in saved pairs
        return existingPairs.some(pair => pair.tokenAddress === tokenAddress);

    } catch (error) {
        console.error('Error checking token existence:', error);
        return false; // Return false on error to be safe
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

        savePairToFile(pair)
        
    } catch (error) {
        console.error('Error sending to Telegram:', error);
    }
}

async function savePairToFile(pair) {
    try {
        const filename = './pairs/trading-pairs.json';

        // Ensure the pairs directory exists
        if (!fs.existsSync('pairs')) {
            fs.mkdirSync('pairs');
        }

        // Read existing data or initialize empty array
        let existingPairs = [];
        if (fs.existsSync(filename)) {
            const fileContent = fs.readFileSync(filename, 'utf8');
            existingPairs = JSON.parse(fileContent);
        }

        // Add timestamp to the pair data
        const pairWithTimestamp = {
            timestamp: new Date().toISOString(),
            ...pair
        };

        // Add new pair to the array
        existingPairs.push(pairWithTimestamp);

        // Write back to file
        fs.writeFileSync(filename, JSON.stringify(existingPairs, null, 2));
        console.log(`Pair data appended to ${filename}`);
    } catch (error) {
        console.error('Error saving pair to file:', error);
    }
}



// Modify the execution block to handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('Closing browser and exiting...');
    await browser.close();
    if (xvfb) {
        xvfb.kill();
    }
    process.exit(0)
});

// Execute the scraper
scrapeDexScreener()
    .then(data => {
        // Handle the scraped data here
        console.log('Total pairs found:', data.length);
    })
    .catch(error => {
        console.error('Failed to scrape DEXScreener:', error);
        browser.close();
    });
