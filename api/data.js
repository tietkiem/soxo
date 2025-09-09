// Use dynamic import for node-fetch
let fetch;
import('node-fetch').then(nodeFetch => {
    fetch = nodeFetch.default;
});

// Use dynamic import for cheerio
let cheerio;
import('cheerio').then(cheerioModule => {
    cheerio = cheerioModule;
});


// --- Helper Functions ---
const parseXSMBMultiDayPage = (htmlContent) => {
    if (!cheerio) throw new Error("Cheerio module not loaded yet.");
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
    if (!fetch) throw new Error("Node-fetch module not loaded yet.");
    const url = `https://vietlott.vn/api/w/service/`;
    // Fetch last 200 draws for a good dataset
    const payload = { GameTypeId: gameTypeId, PageIndex: 1, PageSize: 200 };
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
export default async function handler(request, response) {
    const { type } = request.query;

    // Add caching headers
    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache for 1 hour

    try {
        if (!fetch || !cheerio) {
            return response.status(503).send('Server is initializing, please try again in a moment.');
        }

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
}
