from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
import time
import random

def extra_stealth(page):
    # Override canvas fingerprinting by modifying toDataURL with slight noise
    page.add_init_script("""
        (() => {
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function() {
                try {
                    let context = this.getContext('2d');
                    if (context) {
                        let imageData = context.getImageData(0, 0, this.width, this.height);
                        // Add slight random noise to some pixels
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 10);
                        }
                        context.putImageData(imageData, 0, 0);
                    }
                } catch (e) {
                    // Fail silently if any error occurs
                }
                return originalToDataURL.apply(this, arguments);
            };
        })();
    """)

    # Additional overrides for common fingerprint properties
    page.add_init_script("""
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        
        // Override plugins and mimeTypes
        Object.defineProperty(navigator, 'plugins', { 
            get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'mimeTypes', { 
            get: () => [1, 2, 3, 4, 5]
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        
        // Set window.chrome to a dummy object
        window.chrome = { runtime: {} };
    """)

    # Randomize viewport slightly on each launch to avoid fixed fingerprinting
    base_width, base_height = 1920, 1080
    rand_width = base_width + random.randint(-10, 10)
    rand_height = base_height + random.randint(-10, 10)
    page.context().set_viewport_size({'width': rand_width, 'height': rand_height})

def main():
    with sync_playwright() as p:
        # Use a persistent context with a real user profile if available
        user_profile = "/Users/surimtui/Library/Application Support/Google/Chrome/Profile 4"
        context = p.chromium.launch_persistent_context(
            user_data_dir=user_profile,
            headless=False,
            executable_path=r"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()

        # Apply playwright-stealth modifications
        stealth_sync(page)
        # Apply extra stealth measures
        extra_stealth(page)

        # Optionally randomize delay timings to mimic human-like interactions
        time.sleep(random.uniform(3, 5))

        page.goto("https://dexscreener.com/?rankBy=pairAge", wait_until="networkidle", timeout=60000)
        print("Page loaded with enhanced stealth measures")
        
        # Keep the browser open for observation
        time.sleep(20)
        # context.close()

if __name__ == '__main__':
    main()
