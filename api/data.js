// Use CommonJS require syntax for Node.js compatibility
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- Helper Functions ---
const parseXSMBMultiDayPage = (htmlContent) => {
    const $ = cheerio.load(htmlContent);
    const results = [];
    $('div.table-crucial').each((i, block) => {
        const titleEl = $(block).find('.title-bor-right a, .title-bor-right h2');
        if (!titleEl.length) return;

        const dateMatch = titleEl.text().match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (!dateMatch) return;
        
        const dateStr = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
        const numbers = [];

        $(block).find('[class*="v-g"]').each((j, el) => {
            const prizeText = $(el).text().trim();
            const parts = prizeText.split(/\s+/).filter(Boolean);
            parts.forEach(p => {
                const numStr = p.trim();
                if (numStr.length >= 2) {
                    const num = parseInt(numStr.slice(-2));
                    if (!isNaN(num)) numbers.push(num);
                }
            });
        });
        
        if (numbers.length > 0) {
            results.push({ date: dateStr, numbers });
        }
    });
    return results.sort((a, b) => new Date(a.date) - new Date(b.date));
};

const fetchVietlottAPI = async (gameTypeId) => {
    const url = `https://vietlott.vn/api/w/service/`;
    const payload = { GameTypeId: gameTypeId, PageIndex: 1, PageSize: 200, IsGetToDay: false }; // Fetch 200 latest draws
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Vietlott API failed with status ${response.status}`);
    const data = await response.json();
    
    const results = data?.Data?.DrawResult?.map(draw => {
        const date = draw.DrawDate.split('T')[0];
        const allNumbers = draw.DrawedNumbers;
        if (gameTypeId === 2) { // Power 6/55
            return {
                date,
                numbers: { main: allNumbers.slice(0, 6).sort((a,b)=>a-b), special: allNumbers[6] }
            };
        } else { // Mega, Keno, Bingo
            return { date, numbers: allNumbers.sort((a,b)=>a-b) };
        }
    }) || [];
    
    return results.sort((a, b) => new Date(a.date) - new Date(b.date));
};

// --- Main Serverless Function Handler ---
module.exports = async (request, response) => {
    const { type } = request.query;

    // Set CORS headers to allow requests from any origin
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight request for CORS
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    // Add caching headers for GET requests
    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache for 1 hour

    try {
        let data;
        switch (type) {
            case 'xsmb':
                const xsmbHtml = await fetch('https://xskt.com.vn/xsmb/200-ngay').then(res => res.text());
                data = parseXSMBMultiDayPage(xsmbHtml);
                break;
            case 'mega645':
                data = await fetchVietlottAPI(1); // GameTypeId for Mega 6/45 is 1
                break;
            case 'power655':
                data = await fetchVietlottAPI(2); // GameTypeId for Power 6/55 is 2
                break;
            case 'keno':
                 data = await fetchVietlottAPI(10); // GameTypeId for Keno is 10
                break;
            case 'bingo18':
                 data = await fetchVietlottAPI(11); // GameTypeId for Bingo18 is 11
                break;
            default:
                return response.status(400).json({ error: 'Invalid lottery type provided.' });
        }
        
        response.status(200).json(data);

    } catch (error) {
        console.error(`Error fetching data for ${type}:`, error);
        response.status(500).json({ error: `Failed to fetch data. ${error.message}` });
    }
};