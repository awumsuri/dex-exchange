import { chromium } from 'playwright';
import os from 'os';
import dotenv from 'dotenv';
import fs from 'fs';
import UserAgent from 'user-agents';
import ProxyChain from 'proxy-chain';

// Initialize dotenv
dotenv.config();

async function main() {
    // Setup proxy if provided
    let proxyServer;
    if (process.env.PROXY_URL) {
        proxyServer = await ProxyChain.anonymizeProxy(process.env.PROXY_URL);
    }

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--disable-web-security',
            '--disable-features=ScriptStreaming',
            '--no-first-run',
            '--no-default-browser-check',
            '--no-zygote',
            '--disable-accelerated-2d-canvas',
            '--disable-background-timer-throttling',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-extensions',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            ...(proxyServer ? [`--proxy-server=${proxyServer}`] : [])
        ]
    });

    try {
        const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent,
            permissions: ['geolocation'],
            geolocation: { latitude: 40.712776, longitude: -74.005974 },
            locale: 'en-US',
            timezoneId: 'America/New_York',
            deviceScaleFactor: 1,
            hasTouch: false,
            javaScriptEnabled: true,
            bypassCSP: true,
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': userAgent,
                'Accept-Encoding': 'gzip, deflate, br',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        });

        // Enhanced stealth scripts
        await context.addInitScript(() => {
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Overwrite navigator properties
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

            // Mock WebGL
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel(R) Iris(TM) Graphics 6100';
                return getParameter.apply(this, arguments);
            };

            // Prevent detection via error stack trace
            Error.prototype.toString = function() {
                return `${this.name}: ${this.message}`;
            };
        });

        const page = await context.newPage();
        // await setupPageHooks(page);

        await page.mouse.move(Math.random() * 500, Math.random() * 500);

        while (true) {
            try {
                console.log('Loading page...');
                await page.goto('https://dexscreener.com/?rankBy=pairAge&order=asc&minLiq=50000&min24HVol=80000&profile=1', {
                    waitUntil: 'networkidle',
                    timeout: 60000
                });

                console.log('Waiting for initial load...');
                await page.waitForTimeout(5000);

                // Wait for the table rows to be present
                await page.waitForSelector('.ds-dex-table-row', { timeout: 30000 });

                const pairs = await page.evaluate(() => {
                    console.log('Starting evaluation...');
                    const pairElements = document.querySelectorAll('.ds-dex-table-row');
                    console.log('Found elements:', pairElements.length);

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
                    await page.waitForTimeout(10000);
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

                await page.waitForTimeout(5000);

            } catch (error) {
                console.error('Error in scraping loop:', error);
                await page.waitForTimeout(10000);
            }
        }
    } catch (error) {
        console.error('Fatal error:', error);
        await browser.close();
        process.exit(1);
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
    await browser?.close();
    process.exit(0);
});

// Start the scraper
main().catch(console.error); 