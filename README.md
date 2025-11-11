🤖 Job Lead Auto-Accept Scraper
Overview
This project is an automated Node.js script designed to monitor a specified web platform for new job leads. It uses Puppeteer for browser automation (login, navigation, and clicking) and Nodemailer for sending immediate email notifications when a lead is successfully accepted.

The script runs continuously on a configurable interval, ensuring time-sensitive leads are processed quickly and automatically.

Key Features ✨
Automated Authentication: Logs in using credentials securely managed via environment variables.

Scheduled Monitoring: Runs in a persistent loop, reloading the leads page at a set interval (default: 30 seconds).

Targeted Acceptance: Searches for HTML <article> elements and clicks the associated acceptance link (specifically, an <a> tag with the text content "Accept").

Email Notifications: Sends an immediate email alert detailing the accepted lead's title.

Debugging Tools: Takes screenshots upon login failure and before/after accepting a lead to aid in verification and debugging.

CommonJS Syntax: Uses standard require() syntax for broader Node.js compatibility.

Prerequisites 📋
Node.js (LTS version recommended)

npm or yarn

Installation and Setup 🔧
Clone the Repository:

Bash

git clone [your-repo-link]
cd [your-repo-folder]
Install Dependencies:

Install the necessary packages, including Puppeteer, dotenv, and Nodemailer.

Bash

npm install
Configure Environment Variables:

Create a file named .env in the root directory to securely store all configuration parameters. Do not commit this file to Git.

Bash

# --- Web Platform Configuration ---
LEADS_URL="https://your-leads-platform.com/login"
USERNAME="your_platform_username"
PASSWORD="your_platform_password"

# Optional: Set the monitoring frequency in seconds
SCRAPER_INTERVAL_SECONDS=30 

# --- Email (Nodemailer) Configuration ---
EMAIL_TO="notification_recipient@example.com"
EMAIL_HOST="smtp.your-provider.com"
EMAIL_PORT=587 
EMAIL_USER="your_smtp_username"
EMAIL_PASS="your_smtp_app_password" 
⚠️ Security Note: If you are using Gmail or similar providers, you may need to generate an App Password for EMAIL_PASS instead of using your main account password.