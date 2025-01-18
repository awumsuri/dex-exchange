import random
import time
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

# List of realistic user agents to rotate
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.165 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.165 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:111.0) Gecko/20100101 Firefox/111.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0; rv:111.0) Gecko/20100101 Firefox/111.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
]

# Simple helper function for human-like random sleep
def random_sleep(min_seconds=1.0, max_seconds=3.0):
    time.sleep(random.uniform(min_seconds, max_seconds))

def main():
    # Pick a random User-Agent from the list
    random_user_agent = random.choice(USER_AGENTS)

    # Optional: load previously saved cookies/state from file
    STORAGE_FILE = Path("storage_state.json")
    saved_storage = STORAGE_FILE.exists()

    with sync_playwright() as p:
        # Launch browser in non-headless mode
        browser = p.chromium.launch(headless=False)
        
        # If you want to rotate a proxy, you could do something like:
        # browser = p.chromium.launch(proxy={"server": "http://<PROXY_ADDRESS>:<PORT>"}, headless=False)
        
        # Create a new browser context.
        # If you have previously saved a storage state, you can load it here to reuse session/cookies.
        # if saved_storage:
        #     context = browser.new_context(
        #         user_agent=random_user_agent,
        #         storage_state=str(STORAGE_FILE)
        #     )
        # else:
        context = browser.new_context(
            user_agent=random_user_agent
        )
        
        page = context.new_page()

        # --------------------------------------------------------------------
        # STEALTH-LIKE INIT SCRIPT:
        #
        # This injects JavaScript that modifies certain browser APIs to make
        # the environment look less like a headless/automated browser.
        # --------------------------------------------------------------------
        page.add_init_script(
            """
            // Example stealth script that hides webdriver-related properties
            Object.defineProperties(navigator, {
                webdriver: { get: () => undefined },
                plugins: {
                    get: () => [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin' }
                    ]
                },
                languages: { get: () => ['en-US', 'en'] },
                platform: { get: () => 'Win32' },
                hardwareConcurrency: { get: () => 8 },
                deviceMemory: { get: () => 8 },
                maxTouchPoints: { get: () => 0 },
            });
            
            // Example: Cloudflare sometimes checks permissions APIs
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters)
            );
            """
        )

        # --------------------------------------------------------------------
        # NAVIGATE & MIMIC HUMAN BEHAVIOR
        # --------------------------------------------------------------------
        url = "https://dexscreener.com/?rankBy=pairAge&order=asc&minLiq=50000&min24HVol=80000&profile=1"
        print(f"Using User-Agent: {random_user_agent}")
        print(f"Going to {url} (you can replace with your target site)")
        
        page.goto(url, wait_until="networkidle")
        
        # Wait a bit to mimic reading time or JavaScript challenge solving
        random_sleep(3, 5)
        
        # Example: scroll the page a bit
        page.mouse.wheel(0, random.randint(200, 600))
        random_sleep(1, 2)
        page.mouse.wheel(0, random.randint(200, 600))
        random_sleep(1, 3)
        
        # Example: random small mouse movements
        page.mouse.move(random.randint(100, 400), random.randint(100, 400), steps=10)
        random_sleep(1, 2)
        
        # Print page title to confirm we loaded
        print("Page title:", page.title())
        
        # Do something else, e.g., click a link or fill a form
        # (Not present on example.com, but for demonstration we can do):
        # page.click('a.some-link-selector')
        # random_sleep(2, 4)
        
        # --------------------------------------------------------------------
        # SAVE SESSION / COOKIES
        # --------------------------------------------------------------------
        # If you want to persist the session for reuse (avoid repeated challenges)
        storage_state = context.storage_state()
        with open(STORAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(storage_state, f)
        
        print(f"Session (cookies) saved to {STORAGE_FILE}")

        # --------------------------------------------------------------------
        # CLEANUP
        # --------------------------------------------------------------------
        browser.close()

if __name__ == "__main__":
    main()
