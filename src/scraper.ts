import puppeteer, { Browser, Page } from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// --- DEBUGGING: Add a global error handler to catch unhandled promise rejections ---
process.on('unhandledRejection', (reason, promise) => {
	console.error('--- UNHANDLED REJECTION ---');
	console.error('A promise was rejected but not handled. This is the reason:');
	console.error(reason);
	console.error('--- PROMISE THAT WAS REJECTED ---');
	console.error(promise);
	console.error('-----------------------------');
});


// --- INITIALIZE ENVIRONMENT VARIABLES ---
dotenv.config();

// --- CONFIGURATION ---
const {
	HIPAGES_USERNAME,
	HIPAGES_PASSWORD,
	HIPAGES_LEADS_URL,
	TIME_WINDOW_START,
	TIME_WINDOW_END,
	EMAIL_HOST,
	EMAIL_PORT,
	EMAIL_USER,
	EMAIL_PASS,
	EMAIL_TO,
	SCRAPER_INTERVAL_SECONDS, // Corrected from VITE_UI_POLL_INTERVAL_SECONDS
	KEYWORDS,
	KEYWORD_MATCH_TYPE
} = process.env;

const CHECK_INTERVAL_MS = parseInt(SCRAPER_INTERVAL_SECONDS || '10', 10) * 1000;
// Parse keywords from comma-separated string, trim whitespace, and convert to lowercase
const KEYWORD_ARRAY = (KEYWORDS || 'asbestos').split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
const MATCH_TYPE = KEYWORD_MATCH_TYPE === 'all' ? 'all' : 'each'; // Default to 'each'

const START_HOUR = parseInt(TIME_WINDOW_START?.split(':')[0] || '8', 10);
const START_MINUTE = parseInt(TIME_WINDOW_START?.split(':')[1] || '0', 10);
const END_HOUR = parseInt(TIME_WINDOW_END?.split(':')[0] || '18', 10);
const END_MINUTE = parseInt(TIME_WINDOW_END?.split(':')[1] || '0', 10);

// --- SETUP FILE PATHS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.resolve(__dirname, '..', 'public', 'leads.json');

// --- TYPE DEFINITIONS ---
type LeadStatus = 'Potential Lead' | 'Already Waitlisted' | 'Transitioned to Waitlisted';

interface StatusHistoryItem {
	datetime_changed: string;
	new_status: LeadStatus;
}

interface LeadLink {
	href: string | null;
	text: string;
}

interface MatchedLead {
	id: string;
	matchedOn: string;
	links: LeadLink[];
	content: string;
	currentStatus: LeadStatus;
	statusHistory: StatusHistoryItem[];
}

interface Cache {
	matchedLeads: MatchedLead[];
}

// --- HELPER FUNCTIONS ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function formatElapsedTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];
	if (days > 0) parts.push(`${days} day(s)`);
	if (hours > 0) parts.push(`${hours} hour(s)`);
	if (minutes > 0) parts.push(`${minutes} minute(s)`);
	parts.push(`${seconds} second(s)`);

	return parts.join(', ');
}

async function writeCache(cache: Cache): Promise<void> {
	try {
		await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
	} catch (error) {
		console.error('Error writing to cache file:', error);
	}
}

async function initializeCache(): Promise<Cache> {
	try {
		const data = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
		if (data.trim() === '') {
			throw new Error("Cache file is empty.");
		}
		return JSON.parse(data) as Cache;
	} catch (error) {
		console.log('Cache file not found, empty, or invalid. Initializing a new one.');
		const initialCache: Cache = { matchedLeads: [] };
		await writeCache(initialCache);
		return initialCache;
	}
}

function getTodaysMatches(cache: Cache): MatchedLead[] {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);
	// Only count "Potential Lead" towards the daily limit
	return cache.matchedLeads.filter(lead => {
		const matchedDate = new Date(lead.matchedOn);
		return matchedDate >= today && matchedDate < tomorrow && lead.currentStatus === 'Potential Lead';
	});
}

function getWindowTimes(date: Date): { start: Date, end: Date } {
	const start = new Date(date);
	start.setHours(START_HOUR, START_MINUTE, 0, 0);
	const end = new Date(date);
	end.setHours(END_HOUR, END_MINUTE, 0, 0);
	return { start, end };
}

// --- EMAIL NOTIFICATION FUNCTIONS ---
async function sendEmailNotification(lead: MatchedLead, elapsedTime?: string) {
	if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS || !EMAIL_TO) {
		console.log("Email settings not configured in .env file. Skipping notification.");
		return;
	}

	const transporter = nodemailer.createTransport({
		host: EMAIL_HOST,
		port: parseInt(EMAIL_PORT, 10),
		secure: parseInt(EMAIL_PORT, 10) === 465, // true for 465, false for other ports
		auth: {
			user: EMAIL_USER,
			pass: EMAIL_PASS,
		},
	});

	const linksHtml = lead.links.map(link => `<li><a href="${link.href}">${link.text || 'Untitled Link'}</a></li>`).join('');

	// Conditionally add the elapsed time to the email body
	const elapsedTimeHtml = elapsedTime
		? `<p><b>Time as Potential Lead:</b> ${elapsedTime}</p>`
		: '';

	try {
		await transporter.sendMail({
			from: `"hipages Monitor" <${EMAIL_USER}>`,
			to: EMAIL_TO,
			subject: `Lead Update: ${lead.currentStatus}`,
			html: `
                <h1>Lead Status Update!</h1>
                <p>A lead's status has been updated to "<b>${lead.currentStatus}</b>" at ${new Date().toLocaleString()}.</p>
                ${elapsedTimeHtml}
                <p><b>Keywords Searched:</b> ${KEYWORD_ARRAY.join(', ')}</p>
                <p><b>Match Type:</b> ${MATCH_TYPE}</p>
                <hr>
                <h2>Lead Content Preview:</h2>
                <p style="white-space: pre-wrap; font-family: monospace; background-color: #f4f4f4; padding: 15px; border-radius: 5px;">${lead.content}</p>
                <h2>Links:</h2>
                <ul>${linksHtml}</ul>
            `,
		});
		console.log('Email notification sent successfully.');
	} catch (error) {
		console.error('Failed to send email notification:', error);
	}
}

// --- SCRAPING CYCLE LOGIC ---
async function performScrapeCycle(page: Page, cache: Cache): Promise<boolean> {
	let newMatchFoundThisCycle = false;
	try {
		console.log(`\n[${new Date().toLocaleString()}] Reloading page and searching for leads...`);
		await page.reload({ waitUntil: 'networkidle2' });
		const leadsOnPage = await page.$$eval('article', (leads, keywords, matchType) => {
			return leads.map(article => {
				const primaryLink = article.querySelector('a');
				const id = article.id || (primaryLink ? primaryLink.href : article.outerHTML);
				let hasMatch = false;
				let status: 'Potential Lead' | 'Already Waitlisted' | null = null;

				// --- STATUS-FIRST SEARCH LOGIC ---

				// 1. Check for "Waitlist" status first.
				const statusSpan = article.querySelector('section > .text-content-muted > span[role=status]');
				if (statusSpan?.textContent?.trim() === 'Waitlist') {
					hasMatch = true;
					status = 'Already Waitlisted';
				} else {
					// 2. If not waitlisted, check for keywords in description elements.
					const headingText = Array.from(article.querySelectorAll('h2'))[0].textContent || '';
					let textToSearch = headingText;
					textToSearch += Array.from(document.querySelectorAll('.text-body-emphasis')).map(d => d.textContent).join(' ') || '';
					textToSearch += Array.from(article.querySelectorAll('h4')).map(d => d.textContent).join(' ') || '';
					textToSearch += Array.from(article.querySelectorAll('h4 + p')).map(d => d.textContent).join(' ') || '';

					const lowerCaseTextToSearch = textToSearch.toLowerCase();
					if (lowerCaseTextToSearch) {
						if (matchType === 'all') {
							hasMatch = keywords.every(keyword => lowerCaseTextToSearch.includes(keyword));
						} else {
							hasMatch = keywords.some(keyword => lowerCaseTextToSearch.includes(keyword));
						}

						if (hasMatch) {
							console.log(`[${new Date().toLocaleString()}] 👍 Found a match. Setting it as a potential lead. Heading text is ${headingText}`);
							status = 'Potential Lead';
						}
					}
				}

				let links: { href: string | null; text: string }[] = [];
				if (hasMatch) {
					const anchorElements = Array.from(article.querySelectorAll('a'));
					links = anchorElements.map(a => ({ href: a.href, text: a.innerText.trim() }));
				}

				return { id, hasMatch, status, links, content: article.textContent?.trim() || '' };
			});
		}, KEYWORD_ARRAY, MATCH_TYPE);

		console.log(`[${new Date().toLocaleString()}] Found ${leadsOnPage.length} leads on the page. Checking for matches...`);
		let cacheUpdated = false;
		for (const scrapedArticle of leadsOnPage) {
			const existingLeadIndex = cache.matchedLeads.findIndex(l => l.id === scrapedArticle.id);

			if (existingLeadIndex === -1) {
				// --- NEW LEAD LOGIC ---
				if (scrapedArticle.hasMatch && scrapedArticle.status) {
					newMatchFoundThisCycle = true;
					const now = new Date();
					const timestamp = now.toISOString().replace(/[:.]/g, '-');
					await page.screenshot({ path: `src/screenshots/${timestamp}.png`, fullPage: true, captureBeyondViewport: true });
					cacheUpdated = true;
					console.log(`[${new Date().toLocaleString()}] ✅ NEW MATCH FOUND - Status: ${scrapedArticle.status}`);
					const nowISO = new Date().toISOString();
					const newLead: MatchedLead = {
						id: scrapedArticle.id,
						matchedOn: nowISO,
						links: scrapedArticle.links,
						content: scrapedArticle.content,
						currentStatus: scrapedArticle.status,
						statusHistory: [{ datetime_changed: nowISO, new_status: scrapedArticle.status }],
					};
					cache.matchedLeads.unshift(newLead);

					if (newLead.currentStatus === 'Potential Lead') {
						try {
							const acceptLink = newLead.links.find(link => link.text.includes('Accept'));
							// click acceptLink, get the HTML of the resulting page and take a screenshot of the resulting page
							if (acceptLink && acceptLink.href) {
								console.log(`[${new Date().toLocaleString()}] Found Potential Lead. The accept link is: ${acceptLink?.href}`);								
								await page.goto(acceptLink.href);
								const now = new Date();
								const timestamp = now.toISOString().replace(/[:.]/g, '-');
								const pageContent = await page.content();
								console.log(`[${new Date().toLocaleString()}] Taking a screenshot of the acceptance page.`);
								await fs.writeFile(`src/screenshots/leads/acceptLead-${timestamp}.html`, pageContent, 'utf-8');
								await page.screenshot({ path: `src/screenshots/leads/acceptLead-${timestamp}.png`, fullPage: true, captureBeyondViewport: true });
							}
						} catch (err) {
							console.error(`[${new Date().toLocaleString()}] ☠️ ERROR processing new lead ${newLead.id}:`, err);
						} finally {
							await sendEmailNotification(newLead);
						}
					}
				}
			} else {
				// --- EXISTING LEAD LOGIC ---
				const existingLead = cache.matchedLeads[existingLeadIndex];

				if (existingLead.currentStatus === 'Potential Lead' && scrapedArticle.status === 'Already Waitlisted') {
					console.log(`[${new Date().toLocaleString()}] 🌟 STATUS TRANSITION DETECTED for lead ${existingLead.id}`);
					cacheUpdated = true;
					newMatchFoundThisCycle = true;

					const nowISO = new Date().toISOString();
					const newStatus: LeadStatus = 'Transitioned to Waitlisted';

					existingLead.currentStatus = newStatus;
					existingLead.statusHistory.push({ datetime_changed: nowISO, new_status: newStatus });

					const initialTime = new Date(existingLead.matchedOn).getTime();
					const transitionTime = new Date(nowISO).getTime();
					const elapsedTimeMs = transitionTime - initialTime;
					const formattedElapsedTime = formatElapsedTime(elapsedTimeMs);

					await sendEmailNotification(existingLead, formattedElapsedTime);
				}
			}
		}

		if (cacheUpdated) {
			await writeCache(cache);
			console.log(`[${new Date().toLocaleString()}] Cache updated.`);
		} else {
			console.log(`[${new Date().toLocaleString()}] No new leads or status changes found this cycle.`);
		}
	} catch (error) {
		console.error('An error occurred during the page processing:', error);
	}
	return newMatchFoundThisCycle;
}


// --- MAIN ORCHESTRATION LOGIC ---
async function main() {
	console.log(`[${new Date().toLocaleString()}] --- Starting hipages Scraper ---`);
	console.log(`[${new Date().toLocaleString()}] Monitoring for keywords: [${KEYWORD_ARRAY.join(', ')}] with match type: "${MATCH_TYPE}"`);
	await sleep(100);

	if (!HIPAGES_USERNAME || !HIPAGES_PASSWORD || !HIPAGES_LEADS_URL) {
		console.error(`[${new Date().toLocaleString()}] ERROR: Missing HIPAGES_USERNAME, HIPAGES_PASSWORD, or HIPAGES_LEADS_URL in your .env file.`);
		process.exit(1);
	}

	let browser: Browser | null = null;
	let page: Page | null = null;

	try {
		while (true) {
			let cache = await initializeCache();
			const now = new Date();
			const todayWindow = getWindowTimes(now);
			const todaysMatches = getTodaysMatches(cache);

			if (now < todayWindow.start || now > todayWindow.end) {
				if (browser) {
					console.log(`\n[${new Date().toLocaleString()}] Closing browser instance during idle hours...`);
					await browser.close();
					browser = null;
					page = null;
				}

				let sleepUntil = todayWindow.start;
				if (now > todayWindow.end) {
					const tomorrow = new Date();
					tomorrow.setDate(now.getDate() + 1);
					sleepUntil = getWindowTimes(tomorrow).start;
				}
				const sleepDuration = sleepUntil.getTime() - now.getTime();
				console.log(`\n[${new Date().toLocaleString()}] Outside operating hours. Idling until ${sleepUntil.toLocaleTimeString()}`);
				await sleep(sleepDuration);
				continue;
			}

			if (!browser || !page) {
				console.log(`\n[${new Date().toLocaleString()}] Operating hours have begun. Launching new browser instance...`);
				browser = await puppeteer.launch({ headless: false });
				page = await browser.newPage();
				console.log(`\n[${new Date().toLocaleString()}] Performing initial navigation to ${HIPAGES_LEADS_URL}...`);
				await page.goto(HIPAGES_LEADS_URL, { waitUntil: 'networkidle2' });
				await page.setViewport({
					width: 800,
					height: 1500,
					deviceScaleFactor: 0.5, // You can also adjust the device scale factor if needed
				});
				const emailInput = await page.$('input[name=email]');
				const passwordInput = await page.$('input[name=password]');
				if (emailInput && passwordInput) {
					console.log(`[${new Date().toLocaleString()}] Login form detected. Attempting to log in...`);
					await page.type('input[name=email]', HIPAGES_USERNAME);
					await page.type('input[name=password]', HIPAGES_PASSWORD);
					await page.click('button[type=submit]');
					await page.waitForNavigation({ waitUntil: 'networkidle2' });
					console.log(`[${new Date().toLocaleString()}] Login successful.`);
				} else {
					console.log(`[${new Date().toLocaleString()}] Login form not found. Assuming already logged in.`);
				}
			}

			if (todaysMatches.length >= 2) {
				const tomorrow = new Date();
				tomorrow.setDate(now.getDate() + 1);
				const sleepUntil = getWindowTimes(tomorrow).start;
				const sleepDuration = sleepUntil.getTime() - now.getTime();
				console.log(`\n[${new Date().toLocaleString()}] Daily limit of 2 potential leads reached. Idling until the next window at ${sleepUntil.toLocaleTimeString()}`);
				await sleep(sleepDuration);
				continue;
			}

			if (todaysMatches.length === 1) {
				const firstMatchTime = new Date(todaysMatches[0].matchedOn);
				const noon = new Date();
				noon.setHours(12, 0, 0, 0);
				if (firstMatchTime < noon && now < noon) {
					const sleepDuration = noon.getTime() - now.getTime();
					console.log(`\n[${new Date().toLocaleString()}] First potential lead found before noon. Pausing until 12:00 PM.`);
					await sleep(sleepDuration);
					continue;
				}
			}

			console.log(`\n[${new Date().toLocaleString()}] Within operating hours and under daily limit. Starting scrape cycle.`);
			await performScrapeCycle(page, cache);

			console.log(`[${new Date().toLocaleString()}] --- Cycle complete. Waiting for ${CHECK_INTERVAL_MS / 1000} seconds... ---`);
			await sleep(CHECK_INTERVAL_MS);
		}
	} catch (error) {
		console.error('A critical error occurred:', error);
	} finally {
		if (browser) {
			await browser.close();
		}
		console.log(`[${new Date().toLocaleString()}] --- Scraper stopped ---`);
	}
}

main().catch(err => {
	console.error("\nCRITICAL ERROR: An unhandled rejection occurred in the main process.");
	console.error(err);
	process.exit(1);
});
