require('dotenv').config({ path: './config.txt' });
const { PlaywrightCrawler } = require('crawlee');
const { chromium } = require('playwright');
const { Bot } = require('grammy');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const PAGE_IDS = ['Samedit.off', 'wasafat4dza'];
const LAST_POST_IDS = {};

const crawler = new PlaywrightCrawler({
    launchContext: {
        launcher: chromium,
        launchOptions: { 
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
            ]
        },
    },
    async requestHandler({ page, request }) {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        try {
            if (request.label === 'login') {
                await page.goto('https://m.facebook.com/login');
                await page.fill('#email', process.env.FACEBOOK_EMAIL);
                await page.fill('#pass', process.env.FACEBOOK_PASSWORD);
                await page.click('button[name="login"]');
                await page.waitForSelector('[aria-label="Menu"]', { timeout: 15000 });
                return;
            }

            const pageId = request.userData.pageId;
            console.log(`\n${new Date().toLocaleTimeString()} - Checking ${pageId}...`);
            await page.goto(`https://m.facebook.com/${pageId}`);

            const post = await page.evaluate(() => {
                const article = document.querySelector('[role="article"]');
                if (!article) return null;

                const timeElement = article.querySelector('abbr, [aria-label], [data-store*="time"]');
                const postLink = Array.from(article.querySelectorAll('a[href*="/posts/"], a[href*="/story/"]'))
                    .find(a => a.href.match(/\/posts\/|\/story\//))?.href;

                return {
                    text: article.innerText.replace(/\s+/g, ' ').trim(),
                    url: postLink || window.location.href,
                    timeText: timeElement?.textContent?.trim() || timeElement?.getAttribute('aria-label') || '',
                    pageName: document.title.split('|')[0].trim()
                };
            });

            if (!post) return;

            const postId = post.url.match(/(posts|story_fbid)[=/](\d+)/)?.[2] || post.url;
            if (postId === LAST_POST_IDS[pageId]) return;

            const isNewPost = () => {
                if (!post.timeText) return true;
                if (/just now|now|new|сек|мин|m\b/i.test(post.timeText)) return true;
                if (/\d+ [mм]/.test(post.timeText)) return parseInt(post.timeText) <= 5;
                if (/online status indicator/i.test(post.timeText)) return true;
                return false;
            };

            if (isNewPost()) {
                LAST_POST_IDS[pageId] = postId;
                const cleanUrl = post.url.split('?')[0];
                const cleanTime = post.timeText.replace('Online status indicator', '').trim() || 'Just now';
                const previewText = post.text.length > 100 ? post.text.slice(0, 100) + '...' : post.text;

                const message = `📢 New Post From ${post.pageName}\n⏰ ${cleanTime}\n🔗 ${cleanUrl}\n\n${previewText}`;

                await bot.api.sendMessage(
                    process.env.TELEGRAM_CHAT_ID,
                    message,
                    { disable_web_page_preview: true }
                );
                console.log(`✅ ${pageId} notification sent`);
            }

        } catch (error) {
            console.error('⚠️ Error:', error.message);
        }
    },
});

const runMonitor = async () => {
    const requests = [
        { url: 'https://m.facebook.com', label: 'login' },
        ...PAGE_IDS.map(pageId => ({ 
            url: `https://m.facebook.com/${pageId}`,
            userData: { pageId } 
        }))
    ];

    await crawler.run(requests);
    setTimeout(runMonitor, 60000);
};

PAGE_IDS.forEach(pageId => LAST_POST_IDS[pageId] = '');
runMonitor();
