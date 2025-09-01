# hi-pages Scraper 🤖

This project is an automated scraper designed to monitor the **hi-pages** website for new leads. It uses **Puppeteer** to navigate and scrape content based on customizable keywords. When a potential lead is found, it saves the details and sends an **email notification**. The project also includes a **React-based UI** for viewing the scraped leads.

---

## ✨ Features

-   **Automated Scraping:** Continuously monitors the hi-pages website for new job postings.
-   **Keyword Matching:** Scans job descriptions for specific keywords (e.g., "asbestos").
-   **Real-time Notifications:** Sends an email notification via **Nodemailer** when a new lead is detected.
-   **Lead Status Tracking:** Tracks leads and detects status changes, such as a lead moving to the "Waitlisted" status.
-   **Configurable Settings:** All key parameters like keywords, email settings, and scraping intervals are managed via a `.env` file.
-   **React UI:** A simple front-end application to display all scraped leads in a user-friendly format.

---

## 🚀 Getting Started

### Prerequisites

-   Node.js (version 18 or higher)
-   npm (Node Package Manager)

### Installation

1.  Clone the repository:
    ```bash
    git clone [https://github.com/your-username/hipages-asbestos-scraper.git](https://github.com/your-username/hipages-asbestos-scraper.git)
    cd hipages-asbestos-scraper
    ```
2.  Install the project dependencies:
    ```bash
    npm install
    ```

### Configuration

Create a file named `.env` in the root of the project and add your configuration details. This is where you'll store your login credentials, email settings, and scraping preferences.

```dotenv
# hipages Credentials
HIPAGES_USERNAME="your-hipages-email"
HIPAGES_PASSWORD="your-hipages-password"
HIPAGES_LEADS_URL="[https://app.hipages.com.au/leads/my-leads](https://app.hipages.com.au/leads/my-leads)"

# Scraper Settings
# Time window for scraping (in 24-hour format)
TIME_WINDOW_START="08:00"
TIME_WINDOW_END="18:00"
# Scraper interval in seconds
SCRAPER_INTERVAL_SECONDS="60"
# Keywords to search for, comma-separated
KEYWORDS="asbestos,demolition,removal"
# Match type: 'all' requires all keywords; 'each' requires at least one
KEYWORD_MATCH_TYPE="each" 

# Email Notification Settings
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="465"
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-email-app-password"
EMAIL_TO="recipient-email@example.com"