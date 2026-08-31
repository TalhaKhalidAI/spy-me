import asyncio
import argparse
import sys
from playwright.async_api import 

async def run_client(url: str, token: str, name: str, room: str, headless: bool = True):
    print(f"[*] Starting SFU Client...")
    print(f"[*] Target URL: {url}")
    print(f"[*] Headless mode: {headless}")
    
    async with async_playwright() as p:
        args = [
            "--use-fake-ui-for-media-stream",
            "--enable-usermedia-screen-capturing",
            "--allow-http-screen-capture",
            "--auto-select-desktop-capture-source=Entire screen"
        ]
        
        browser = await p.chromium.launch(
            headless=headless,
            args=args
        )
        
        context = await browser.new_context(
            permissions=['camera', 'microphone']
        )
        
        page = await context.new_page()
        target_url = f"{url}?token={token}" if token else url
        
        print("[*] Navigating to page...")
        try:
            await page.goto(target_url, wait_until="networkidle")
            
            print(f"[*] Entering client name: {name}")
            await page.fill("input[placeholder='Enter your name']", name)
            
            if room:
                print(f"[*] Selecting room: {room}")
                # Wait for the select dropdown to appear (it might be loading rooms)
                await page.wait_for_selector("select", timeout=10000)
                await page.select_option("select", value=room)
                
            print("[*] Clicking Initialize Broadcast...")
            # Wait for button to become enabled
            await page.wait_for_function("document.querySelector('button').disabled === false", timeout=10000)
            await page.click("button:has-text('Initialize Broadcast')")
            
            print("[+] Successfully connected to the SFU web client!")
            print("[*] Press Ctrl+C to stop the client.")
            
            await asyncio.Event().wait()
            
        except Exception as e:
            print(f"[-] Error occurred: {e}")
            
        finally:
            print("[*] Closing browser...")
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cross-Platform Python SFU Client")
    parser.add_argument("--url", type=str, required=True, help="URL of the frontend SFU client (e.g. http://localhost:5173/sfu-client-test)")
    parser.add_argument("--token", type=str, default="", help="Authentication token for the room")
    parser.add_argument("--name", type=str, default="PythonClient", help="Name of the client in the call")
    parser.add_argument("--room", type=str, default="", help="Specific Room ID to select (if not locked by token)")
    parser.add_argument("--visible", action="store_true", help="Run the browser visibly (useful for debugging)")
    
    args = parser.parse_args()
    
    try:
        asyncio.run(run_client(args.url, args.token, args.name, args.room, headless=not args.visible))
    except KeyboardInterrupt:
        print("\n[*] Shutting down...")
        sys.exit(0)
