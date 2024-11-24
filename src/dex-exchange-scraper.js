import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import dotenv from 'dotenv';
import fs from 'fs';
import { spawn } from 'child_process';
import Xvfb from 'xvfb';
import path from 'path';

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
const executablePath = (() => {
    switch (os.platform()) {
        case 'darwin':
            return path.join('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
        case 'win32':
            return path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
        default:
            return path.join('/usr', 'bin', 'google-chrome-stable');
    }
})();

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('chrome.runtime')
stealthPlugin.enabledEvasions.delete('iframe.contentWindow')


puppeteer.use(stealthPlugin);





const browser = await puppeteer.launch({
    headless: false,
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
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--lang=en-US,en;q=0.9',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-sandbox',
        ...(os.platform() === 'linux' ? ['--display=:99'] : []),
    ],
    ignoreDefaultArgs: ['--enable-automation'],
});

async function handleCloudflareChallenge(page) {
    try {
        // Wait for Turnstile iframe to load
        await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 10000 });

        // Get all frames
        const frames = page.frames();
        const challengeFrame = frames.find(frame => frame.url().includes('challenges.cloudflare.com'));

        if (challengeFrame) {
            // Wait for the challenge widget to be ready
            await challengeFrame.waitForSelector('#cf-stage', { timeout: 10000 });

            // Try to find and interact with the challenge
            const verifyButton = await challengeFrame.$('#cf-stage button');
            if (verifyButton) {
                await verifyButton.click();
                console.log('Clicked verification button');
            }

            // Wait for verification to complete
            await page.waitForFunction(
                () => !document.querySelector('div[class*="turnstile"]'),
                { timeout: 30000 }
            );
        }

        // Wait for redirect after successful verification
        await page.waitForNavigation({ timeout: 30000 });

    } catch (error) {
        console.error('Error handling Cloudflare challenge:', error);
        throw error;
    }
}

async function scrapeDexScreener() {
    try {
        // Launch browser


        const page = await browser.newPage();

        // Load saved cookies if they exist
        await loadCookies(page);

        // Set a more realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Add extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept-Encoding': 'gzip, deflate, br',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
        });


        // Initial page load
        await page.goto('https://dexscreener.com/?rankBy=pairAge&order=asc&minLiq=50000&min24HVol=80000&profile=1', {
            timeout: 60000
        });

        // Check for and handle Cloudflare challenge
        // If we encounter Cloudflare and manage to pass it, save the cookies
        if (await page.$('div[class*="turnstile"]') !== null) {
            await handleCloudflareChallenge(page);
            // Save cookies after successful verification
            await saveCookies(page);
        }

        // Initial delay to ensure WebSocket connection
        await new Promise(resolve => setTimeout(resolve, 2000));



        while (true) {
            const pairs = await page.evaluate(() => {

                function parseNumberWithSuffix(value) {
                    // Remove $ and commas, and trim whitespace
                    let cleanValue = value.replace('$', '').replace(/,/g, '').trim();

                    // Convert to uppercase for consistency
                    cleanValue = cleanValue.toUpperCase();

                    // Handle K (thousands)
                    if (cleanValue.endsWith('K')) {
                        return parseFloat(cleanValue.replace('K', '')) * 1000;
                    }

                    // Handle M (millions)
                    if (cleanValue.endsWith('M')) {
                        return parseFloat(cleanValue.replace('M', '')) * 1000000;
                    }

                    // If no suffix, just parse the float
                    return parseFloat(cleanValue);
                }

                const pairElements = document.querySelectorAll('.ds-dex-table-row.ds-dex-table-row-new');
                return Array.from(pairElements).map(row => {
                    // Get token address from href
                    const tokenAddress = row.getAttribute('href').split('/').pop();
                    // Get network name from href
                    const network = row.getAttribute('href').split('/')[1];

                    return {
                        network,
                        tokenAddress,
                        token: row.querySelector('.ds-dex-table-row-col-token').innerText
                            .replace(/[^a-zA-Z0-9]/g, ' ')  // Remove special characters
                            .trim(),  // Remove leading/trailing whitespace
                        price: parseFloat(row.querySelector('.ds-dex-table-row-col-price').innerText.replace('$', '').replace(',', '')),
                        pairAge: row.querySelector('.ds-dex-table-row-col-pair-age').innerText,
                        buys: parseInt(row.querySelector('.ds-dex-table-row-col-buys').innerText.replace(',', '')),
                        sells: parseInt(row.querySelector('.ds-dex-table-row-col-sells').innerText.replace(',', '')),
                        volume: parseNumberWithSuffix(row.querySelector('.ds-dex-table-row-col-volume').innerText),
                        makers: parseNumberWithSuffix(row.querySelector('.ds-dex-table-row-col-makers').innerText),
                        liquidity: parseNumberWithSuffix(row.querySelector('.ds-dex-table-row-col-liquidity').innerText),
                        marketCap: parseNumberWithSuffix(row.querySelector('.ds-dex-table-row-col-market-cap').innerText),
                        priceChange: {
                            m5: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-m5').innerText.replace('%', '')),
                            h1: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-h1').innerText.replace('%', '')),
                            h6: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-h6').innerText.replace('%', '')),
                            h24: parseFloat(row.querySelector('.ds-dex-table-row-col-price-change-h24').innerText.replace('%', '')),
                        },
                    };
                });
            });

            // console.log('Scraped Pairs:', pairs);
            // Filter and log pairs with makers over 10000
            const highMakerPairs = pairs.filter(pair =>
                pair.makers > 800 && // existing makers filter
                pair.liquidity > 50000 && // minimum liquidity $100k
                pair.volume > 80000 && // minimum 24h volume $50k
                //pair.priceChange.h24 > 0 && // positive 24h price change
                // pair.buys > pair.sells &&
                pair.network === 'solana' // more buys than sells
            );

            if (highMakerPairs.length > 0) {
                console.log('\nFiltered pairs meeting criteria:');
                for (const pair of highMakerPairs) {
                    if (!await isTokenAlreadySaved(pair.tokenAddress)) {
                        // Open token in new page and get additional details
                        const contractAddresses = await scrapeTokenDetails(browser, pair);

                        for (const contractAddress of contractAddresses) {
                            if (contractAddress.toLowerCase().includes('pump')) {
                                const enrichedPair = { ...pair, contractAddress };
                                await sendToTelegram(enrichedPair);
                                console.log(JSON.stringify(enrichedPair, null, 2));
                            }
                        }

                    } else {
                        console.log(`Token ${pair.token} already saved`);
                    }
                }
                console.log('------------------------\n');
            } else {
                console.log(`No New Found Tokens == ${new Date()}`)
            }
            // Wait 5 seconds before next evaluation
            // await saveCookies(page);

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
        const botToken = "7632649627:AAH_RX2xldjvv_WeW5wmTKByCe2ZhmGJW10";
        const chatId = "-1002297270332"

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

🔗 Contract: ${pair.contractAddress}
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



async function saveCookies(page, filePath = './cookies.json') {
    try {
        const cookies = await page.cookies();
        await fs.promises.writeFile(filePath, JSON.stringify(cookies, null, 2));
        console.log('Cookies saved successfully!');
    } catch (error) {
        console.error('Failed to save cookies:', error);
    }
}

async function loadCookies(page, filePath = './cookies.json') {
    try {
        const cookiesString = await fs.promises.readFile(filePath);
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log('Cookies loaded successfully!');
    } catch (error) {
        console.error('Failed to load cookies:', error);
    }
}

// Add this new function to scrape token details
async function scrapeTokenDetails(browser, pair) {
    const tokenPage = await browser.newPage();
    try {
        // Construct the URL for the token page
        const tokenUrl = `https://dexscreener.com/${pair.network}/${pair.tokenAddress}`;
        await tokenPage.goto(tokenUrl, { waitUntil: 'networkidle2' });

        // Wait for chakra-text elements to appear
        await tokenPage.waitForSelector('span.chakra-text', {
            timeout: 30000 // 30 second timeout
        });

        // Wait 3 seconds to allow dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Scrape additional details
        const contractAddress = await tokenPage.evaluate((pairData) => {
            // Find all chakra-text elements
            const chakraTexts = document.querySelectorAll('div span.chakra-text');
            const tokenElements = []
            const tokenNames = []

            // Find the element that matches the token name
            chakraTexts.forEach(element => {
                const elementText = element.innerText.trim()
                if (pairData.token.includes(elementText) && elementText.length > 0 && elementText !== 'SOL') {
                    tokenElements.push(element)
                }
                // tokenNames.push(elementText)
            });
            // Get all title attributes from matching token elements
            const contractAddresses = tokenElements.map(element => element.getAttribute('title')).filter(Boolean);

            // Filter for Solana contract addresses (they start with a letter and are 32-44 chars)
            const solanaAddresses = contractAddresses.filter(addr =>
               addr.length >= 32
            );
            // Return first matching Solana address or undefined if none found
            return solanaAddresses
        }, pair);

        return contractAddress;

    } catch (error) {
        console.error('Error scraping token details:', error);
        return {};
    } finally {
        await tokenPage.close();
    }
}
