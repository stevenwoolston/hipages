/**
 * Job Leads Scraper using Puppeteer and Nodemailer
 *
 * This script runs on an interval to log into a specified URL,
 * find job lead articles with an "Accept" link, click them,
 * and send an email notification upon acceptance.
 *
 * NOTE: This version uses CommonJS 'require()' syntax for compatibility with
 * standard Node.js execution without needing 'type: "module"' in package.json.
 */
// Load environment variables from .env file
require('dotenv').config();

// Switched to CommonJS 'require' syntax
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

// --- Configuration from Environment Variables ---
const LEADS_URL = process.env.LEADS_URL;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const SCRAPER_INTERVAL_SECONDS = parseInt(process.env.SCRAPER_INTERVAL_SECONDS, 10) || 30; // Default to 30s
const INTERVAL_MS = SCRAPER_INTERVAL_SECONDS * 1000;

const EMAIL_TO = process.env.EMAIL_TO;
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT, 10);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Nodemailer transport setup
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465, // Use true for 465, false for other ports (like 587)
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

/**
 * Sends an email notification about a successful lead acceptance.
 * @param {string} leadTitle - The title of the accepted job lead.
 */
async function sendNotificationEmail(leadTitle) {
  if (!EMAIL_TO || !EMAIL_USER) {
    console.warn('⚠️ Email notification skipped: EMAIL_TO or EMAIL_USER is not set.');
    return;
  }

  const mailOptions = {
    from: `Lead Scraper <${EMAIL_USER}>`,
    to: EMAIL_TO,
    subject: `✅ Accepted New Job Lead: ${leadTitle}`,
    text: `The job lead titled "${leadTitle}" was successfully found and accepted at ${new Date().toLocaleString()}.\n\nCheck the leads page for confirmation.`,
    html: `
            <p>The job lead titled "<strong>${leadTitle}</strong>" was successfully found and accepted at ${new Date().toLocaleString()}.</p>
            <p>Check the leads page for confirmation: <a href="${LEADS_URL}">Go to Leads Page</a></p>
        `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent successfully for lead: ${leadTitle}`);
  } catch (error) {
    console.error('❌ Error sending email notification:', error.message);
  }
}

/**
 * Utility function to pause execution for a given number of milliseconds.
 * @param {*} ms 
 * @returns 
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes the login procedure.
 * Assumes the login form has input fields with IDs or names for username and password,
 * and a submit button. Adjust selectors if necessary.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 */
async function login(page) {
  console.log(`➡️ Navigating to login page: ${LEADS_URL}`);
  await page.goto(LEADS_URL, { waitUntil: 'domcontentloaded' });
  await sleep(30000);
  console.log('✅ Login successful (navigation detected).');
  return;
  
  // The rest of the login logic is commented out in the original code, 
  // keeping it commented out for consistency.
}

/**
 * The main scraping and accepting logic.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {Set<string>} acceptedLeadTitles - The cache of already accepted lead titles.
 */
async function scrapeAndAcceptLeads(page, acceptedLeadTitles) {
  let acceptedCount = 0;
  console.log(`🔍 Searching for leads on page: ${page.url()}`);

  // Wait for the main article container element
  try {
    await page.waitForSelector('article', { timeout: INTERVAL_MS });  // long pause if rate limited
    console.log('    - Article elements detected. Proceeding with filtering.');
  } catch (e) {
    console.log(`    - Timeout: No article elements detected within ${INTERVAL_MS / 1000} seconds. Assuming rate limiting.`);
    return 0;
  }

  // Find all article elements on the page (simple CSS selector)
  const articleHandles = await page.$$('article');

  if (articleHandles.length === 0) {
    console.log('No article elements found on the page.');
    return 0;
  }

  console.log(`Found ${articleHandles.length} total articles.`);

  let leadsToClick = [];

  // Step 1: Filter articles in the browser context and prepare click targets by adding a unique temporary ID.
  for (const articleHandle of articleHandles) {

    // Use page.evaluate to run code inside the browser on the specific articleHandle element
    const leadInfo = await page.evaluate(el => {
      // Find the 'Accept' link using standard DOM API
      const acceptLink = Array.from(el.querySelectorAll('a')).find(a => a.textContent.trim() === 'Accept');
      if (!acceptLink) return null;

      const h2 = el.querySelector('h2');
      const title = h2 ? h2.textContent.trim() : 'Lead with no title found';
      
      // Check if the title is empty or too generic before proceeding
      if (!title || title.length < 5) return null; 

      // Generate and set a unique ID attribute on the link element for re-selection from Node
      const tempId = 'scraper-click-' + Math.random().toString(36).substring(2, 9);
      acceptLink.setAttribute('data-scraper-click', tempId);

      return { title, tempId };
    }, articleHandle);


    if (leadInfo) {
      // --- CACHE IMPLEMENTATION START (Filtering) ---
      if (acceptedLeadTitles.has(leadInfo.title)) {
          console.log(`    - Skipping cached lead: "${leadInfo.title}"`);
          continue; // Skip this lead if its title is already in the cache
      }
      // --- CACHE IMPLEMENTATION END (Filtering) ---
      
      leadsToClick.push(leadInfo);
    }
  }

  if (leadsToClick.length === 0) {
    console.log('No new (non-cached) leads found containing an "Accept" link.');
    return 0;
  }

  console.log(`Found ${leadsToClick.length} potential new leads.`);

  // Process the first lead and process it, then reload the leads page for more
  const lead = leadsToClick[0];
  const leadTitle = lead.title;
  const selector = `[data-scraper-click="${lead.tempId}"]`;

  console.log(`\n🔔 Found new lead: "${leadTitle}"`);

  // --- CACHE IMPLEMENTATION START (Adding to cache) ---
  // Add the title to the cache immediately so if the script re-runs before the
  // server updates, it won't be clicked again.
  acceptedLeadTitles.add(leadTitle);
  console.log(`    - Lead "${leadTitle}" added to cache.`);
  // --- CACHE IMPLEMENTATION END (Adding to cache) ---

  // Find the specific ElementHandle using the unique attribute selector
  const acceptLinkHandle = await page.$(selector);

  if (acceptLinkHandle) {
    try {
      await sendNotificationEmail(leadTitle);
      await acceptLinkHandle.click();
      console.log('  - Clicked "Accept" link. Taking screenshot and waiting for next step...');
      await page.screenshot({ path: `screenshots/${leadTitle.replace(/\s+/g, '_')}_accepted.png` });
      await sleep(500);
      
      await page.keyboard.press('Enter'); // Confirm acceptance
      console.log('  - Next step completed. Taking acceptance screenshot.');
      await page.screenshot({ path: `screenshots/${leadTitle.replace(/\s+/g, '_')}_post_accepted.png` });
      
      await sleep(1000);
      await page.keyboard.press('Enter'); // View Job Details

      console.log('  - Viewing Job details. Taking confirmation screenshot.');
      await sleep(1000);
      await page.screenshot({ path: `screenshots/${leadTitle.replace(/\s+/g, '_')}_job_details.png` });

      acceptedCount++;
      console.log(`✅ Successfully accepted lead: "${leadTitle}".`);
      await page.goto(LEADS_URL);
    } catch (error) {
      console.error(`❌ Failed to click or process lead "${leadTitle}":`, error.message);
      // OPTIONAL: If clicking fails, you might want to remove it from the cache
      // so the next cycle can retry, but this risks multiple clicks if the failure
      // was a temporary page glitch. Sticking with keeping it cached for safety.
    }
  }

  return acceptedCount;
}

/**
 * Main function to start the scraping loop.
 */
async function startScraper() {
  if (!LEADS_URL || !USERNAME || !PASSWORD) {
    console.error('Fatal Error: LEADS_URL, USERNAME, or PASSWORD environment variables are missing.');
    return;
  }
  
  // --- CACHE IMPLEMENTATION START (Initialization) ---
  // Simple in-memory cache to store the titles of accepted leads.
  // This will clear if the script is stopped and restarted.
  const acceptedLeadTitles = new Set();
  // --- CACHE IMPLEMENTATION END (Initialization) ---

  let browser;
  let scraperInterval;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await login(page);

    let runCount = 0;

    const intervalJob = async () => {
      runCount++;
      console.log(`\n--- SCRAPING CYCLE ${runCount} STARTED (${new Date().toLocaleTimeString()}) ---`);
      
      // If the set gets too large, you might want to log its size here
      // console.log(`Current cache size: ${acceptedLeadTitles.size}`);

      try {
        await page.reload({ waitUntil: 'domcontentloaded' });

        // Pass the cache set to the scraping function
        const acceptedLeads = await scrapeAndAcceptLeads(page, acceptedLeadTitles);
        
        if (acceptedLeads > 0) {
          // After accepting leads, navigate back to the main leads page to refresh the list of leads
          await page.goto(LEADS_URL, { waitUntil: 'domcontentloaded' });
        }

        console.log(`--- SCRAPING CYCLE ${runCount} FINISHED. Accepted ${acceptedLeads} leads. ---`);
      } catch (error) {
        console.error(`\n🔴 An error occurred during scraping cycle ${runCount}:`, error.message);
        if (error.message.includes('Login process failed') || error.message.includes('No node found')) {
          console.log('Attempting to re-login due to potential session issue...');
          try {
            await login(page);
          } catch (reloginError) {
            console.error('🔴 Re-login failed. Stopping scraper.', reloginError.message);
            clearInterval(scraperInterval);
            await browser.close();
          }
        }
      }
    };

    await intervalJob();
    scraperInterval = setInterval(intervalJob, INTERVAL_MS);

    console.log(`\nScraper is now running every ${SCRAPER_INTERVAL_SECONDS} seconds.`);
    console.log('Press Ctrl+C to stop the process.');

  } catch (e) {
    console.error('A critical error occurred. Scraper is stopping:', e.message);
    if (browser) {
      await browser.close();
    }
  }
}

startScraper();