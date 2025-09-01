import { useState, useEffect } from 'react';

// --- TYPE DEFINITIONS (must match scraper.ts) ---
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

// --- HELPER FUNCTION to get status color ---
function getStatusColor(status: LeadStatus): string {
    switch (status) {
        case 'Potential Lead':
            return 'text-green-400';
        case 'Already Waitlisted':
            return 'text-yellow-400';
        case 'Transitioned to Waitlisted':
            return 'text-orange-400';
        default:
            return 'text-gray-400';
    }
}

function App() {
    const [leads, setLeads] = useState<MatchedLead[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    
    // Get client-side env variables from Vite
    const pollIntervalMs = parseInt(import.meta.env.VITE_UI_POLL_INTERVAL_SECONDS || '5', 10) * 1000;
    const keywordsToDisplay = import.meta.env.VITE_KEYWORDS || 'asbestos';


    const fetchLeads = async () => {
        try {
            // Add a cache-busting query parameter to ensure we get the latest file
            const response = await fetch(`/leads.json?t=${new Date().getTime()}`);
            if (!response.ok) {
                // The file might not exist on the first run, which is okay.
                if (response.status === 404) {
                    console.log("leads.json not found yet. The scraper might be starting up.");
                    return;
                }
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            const data: Cache = await response.json();
            setLeads(data.matchedLeads || []);
            setError(null);
            setLastUpdated(new Date());
        } catch (err) {
            console.error("Failed to fetch leads:", err);
            setError("Failed to load leads. Make sure the scraper is running and the `public/leads.json` file is accessible.");
        }
    };

    // Fetch leads on component mount and then set up an interval to poll for updates
    useEffect(() => {
        fetchLeads(); // Initial fetch
        const intervalId = setInterval(fetchLeads, pollIntervalMs); 

        // Cleanup interval on component unmount
        return () => clearInterval(intervalId);
    }, [pollIntervalMs]);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <div className="container mx-auto p-4 md:p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-bold text-cyan-400">hipages Lead Monitor</h1>
                    <p className="text-lg text-gray-400">
                        Actively monitoring for leads containing: <span className="font-semibold text-cyan-300">"{keywordsToDisplay}"</span>
                    </p>
                    <div className="text-sm text-gray-500 mt-2">
                        {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
                    </div>
                </header>

                {error && (
                    <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded-lg mb-6" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <main>
                    {leads.length > 0 ? (
                        <div className="grid gap-6">
                            {leads.map(lead => (
                                <div key={lead.id} className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700 hover:border-cyan-500 transition-colors duration-300">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-gray-400 text-sm">First Seen: {new Date(lead.matchedOn).toLocaleString()}</p>
                                            <p className="text-gray-500 text-xs mt-1 truncate" title={lead.id}>ID: {lead.id.substring(0, 50)}...</p>
                                        </div>
                                        <span className={`font-bold text-lg ${getStatusColor(lead.currentStatus)}`}>
                                            {lead.currentStatus}
                                        </span>
                                    </div>
                                    <p className="text-gray-300 mb-4 line-clamp-3">{lead.content}</p>
                                    {lead.links && lead.links.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold text-cyan-400 mb-2">Relevant Links:</h3>
                                            <ul className="list-disc list-inside space-y-1">
                                                {lead.links.map((link, index) => (
                                                    <li key={index}>
                                                        <a href={link.href || '#'} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                                                            {link.text || 'Untitled Link'}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg">
                           <h2 className="text-2xl font-semibold text-gray-400">Awaiting Matches...</h2>
                           <p className="text-gray-500 mt-2">No leads matching your keywords have been found yet. The scraper is running in the background.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
