// Use CommonJS require syntax for Node.js compatibility
const fetch = require('node-fetch');

// --- API Helper Functions ---

// Fetches data for XSMB from a reliable public API
const fetchXSMBAPI = async () => {
    // This public API provides recent XSMB results
    const url = 'https://api.xoso.me/app/json-kq-mienbac?page=1&limit=200';
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`XSMB API failed with status ${response.status}`);
    }
    const data = await response.json();

    // The API returns a list, we need to process it
    const results = data.list.map(draw => {
        const dateParts = draw.ngay.split('/'); // Format is DD/MM/YYYY
        const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        // The API provides numbers in a structured way
        const numbers = [
            ...draw.giaidb.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai1.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai2.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai3.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai4.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai5.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai6.split(',').map(n => parseInt(n.slice(-2))),
            ...draw.giai7.split(',').map(n => parseInt(n.slice(-2))),
        ].filter(n => !isNaN(n)); // Filter out any potential parsing errors

        return { date: dateStr, numbers };
    });

    return results.sort((a, b) => new Date(a.date) - new Date(b.date));
};


const fetchVietlottAPI = async (gameType) => {
    // This public API provides recent Vietlott results
    // It's more stable than hitting Vietlott's site directly
    const url = `https://xosoplus.com/json/lastest/${gameType}.json`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Vietlott API (${gameType}) failed with status ${response.status}`);
    }
    const data = await response.json();

    // The API returns data for many days, we need to parse it
    const results = Object.keys(data).map(dateKey => {
        const draw = data[dateKey];
        const dateParts = draw.thu.split('_')[1].split('/'); // Format is ..._DD/MM/YYYY
        const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        const allNumbers = draw.number.split(',').map(n => parseInt(n));

        if (gameType === 'power655') {
            return {
                date: dateStr,
                numbers: { main: allNumbers.slice(0, 6), special: allNumbers[6] }
            };
        } else { // Mega, Keno, Bingo18 (assuming similar structure)
            return { date: dateStr, numbers: allNumbers };
        }
    });

    return results.sort((a, b) => new Date(a.date) - new Date(b.date));
};


// --- Main Serverless Function Handler ---
module.exports = async (request, response) => {
    const { type } = request.query;

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    // Set caching headers
    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache for 1 hour

    try {
        let data;
        switch (type) {
            case 'xsmb':
                data = await fetchXSMBAPI();
                break;
            case 'mega645':
                data = await fetchVietlottAPI('mega645');
                break;
            case 'power655':
                data = await fetchVietlottAPI('power655');
                break;
            case 'keno':
                // Note: The new API might not support Keno in the same way.
                // This is a placeholder and might need a different source if Keno is critical.
                data = []; // Returning empty for now to avoid errors
                break;
            case 'bingo18':
                 data = await fetchVietlottAPI('bingo18');
                break;
            default:
                return response.status(400).json({ error: 'Invalid lottery type provided.' });
        }

        if (!data || data.length === 0) {
            throw new Error("Nguồn API không trả về kết quả hợp lệ cho loại hình này.");
        }
        
        response.status(200).json(data);

    } catch (error) {
        console.error(`Error fetching data for ${type}:`, error);
        response.status(500).json({ error: `Lỗi máy chủ: ${error.message}` });
    }
};

