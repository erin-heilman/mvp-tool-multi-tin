// API Route: /api/sheets/[sheet].js
// This handles BOTH /api/sheets/clinicians AND /api/sheets?sheet=clinicians

export default async function handler(req, res) {
    // Get sheet name from either URL pattern
    let sheet = req.query.sheet;

    // If using /api/sheets/[sheet] pattern, the sheet name is in the URL
    // Extract from the URL path if not in query params
    if (!sheet && req.url) {
        const pathParts = req.url.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        // Remove any query string from the last part
        sheet = lastPart.split('?')[0];
    }

    // Get TIN parameter (for multi-TIN support)
    const tin = req.query.tin || 'main'; // Default to 'main'

    console.log('API Request for sheet:', sheet);
    console.log('TIN parameter:', tin);
    console.log('Full URL:', req.url);
    console.log('Query params:', req.query);

    // Google Sheet configuration - YOUR SHEET ID
    const SHEET_ID = '1CHs8cP3mDQkwG-XL-B7twFVukRxcB4umn9VX9ZK2VqM';

    // Tab GIDs from your Google Sheet
    const SHEET_GIDS = {
        'clinicians': '0',  // Default main campus - will be overridden by TIN logic
        'measures': '1838421790',
        'mvps': '467952052',
        'benchmarks': '322699637',
        'assignments': '1879320597',
        'selections': '1724246569',
        'performance': '557443576',
        'work': '1972144134',
        'config': '128453598'
    };

    // TIN-specific GIDs for clinicians
    const TIN_CLINICIAN_GIDS = {
        'main': '0',              // Memorial Main Campus
        'medical': '1706113631'   // Memorial Medical Group
    };

    // Validate sheet parameter
    if (!sheet || !SHEET_GIDS[sheet]) {
        console.error('Invalid sheet requested:', sheet);
        return res.status(400).json({
            error: 'Invalid or missing sheet parameter',
            requested: sheet,
            validSheets: Object.keys(SHEET_GIDS)
        });
    }

    // Build Google Sheets CSV export URL
    let gid = SHEET_GIDS[sheet];

    // If requesting clinicians, use TIN-specific GID
    if (sheet === 'clinicians') {
        gid = TIN_CLINICIAN_GIDS[tin] || TIN_CLINICIAN_GIDS['main'];
        console.log(`Using TIN-specific GID for ${tin}:`, gid);
    }

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    
    console.log('Fetching from Google Sheets:', url);
    
    try {
        // Fetch CSV data from Google Sheets
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error('Google Sheets returned status:', response.status);
            throw new Error(`Google Sheets returned status ${response.status}`);
        }
        
        const csvText = await response.text();
        console.log('CSV Response length:', csvText.length);
        console.log('First 200 chars:', csvText.substring(0, 200));
        
        // Check for HTML error response
        if (csvText.includes('<!DOCTYPE') || csvText.includes('<html')) {
            console.error('Got HTML instead of CSV - sheet not public');
            return res.status(403).json({ 
                error: 'Unable to access sheet. Make sure it is publicly shared.',
                sheet: sheet,
                hint: 'Set Google Sheet sharing to "Anyone with the link can view"'
            });
        }
        
        // Parse CSV to JSON
        const data = parseCSV(csvText);
        
        console.log(`Successfully parsed ${data.length} rows from ${sheet}`);
        
        // Log sample data for debugging
        if (data.length > 0) {
            console.log('Sample row:', JSON.stringify(data[0], null, 2));
        }
        
        // Set cache headers
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        return res.status(200).json(data);
        
    } catch (error) {
        console.error(`Error fetching ${sheet}:`, error);
        
        return res.status(500).json({ 
            error: 'Failed to fetch sheet data',
            sheet: sheet,
            details: error.message
        });
    }
}

// Improved CSV Parser
function parseCSV(csvText) {
    if (!csvText || csvText.trim() === '') {
        return [];
    }
    
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length === 0) {
        return [];
    }
    
    // Parse headers - don't lowercase them yet, keep original
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    
    console.log('CSV Headers found:', headers);
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const values = parseCSVLine(line);
        
        // Create object from headers and values
        const row = {};
        headers.forEach((header, index) => {
            // Store with multiple key formats for compatibility
            const originalHeader = header.trim();
            const lowerHeader = originalHeader.toLowerCase().replace(/\s+/g, '_');
            
            const value = (values[index] || '').trim();
            
            // Store with both original and normalized keys
            row[originalHeader] = value;
            row[lowerHeader] = value;
            
            // Also add common variations
            if (originalHeader === 'Name') {
                row['name'] = value;
                row['clinician_name'] = value;
            }
            if (originalHeader === 'NPI') {
                row['npi'] = value;
            }
            if (originalHeader === 'Specialty') {
                row['specialty'] = value;
                row['primary_specialty'] = value;
            }
            if (originalHeader === 'TIN') {
                row['tin'] = value;
            }
            if (originalHeader === 'Separate EHR') {
                row['separate_ehr'] = value;
            }
            
            // For MVP sheet
            if (originalHeader === 'MVP ID') {
                row['mvp_id'] = value;
            }
            if (originalHeader === 'MVP Name') {
                row['mvp_name'] = value;
            }
            if (originalHeader === 'Eligible Specialties') {
                row['eligible_specialties'] = value;
                row['specialties'] = value;
            }
            if (originalHeader === 'Available Measures') {
                row['available_measures'] = value;
            }
            
            // For Measures sheet
            if (originalHeader === 'Measure ID') {
                row['measure_id'] = value;
            }
            if (originalHeader === 'Measure Name') {
                row['measure_name'] = value;
            }
            if (originalHeader === 'Is Activated') {
                row['is_activated'] = value;
            }
            if (originalHeader === 'Collection Types') {
                row['collection_types'] = value;
            }
        });
        
        // Only add non-empty rows
        if (Object.values(row).some(v => v && v !== '')) {
            data.push(row);
        }
    }
    
    console.log(`Parsed ${data.length} data rows`);
    
    return data;
}

// Parse a single CSV line handling quotes properly
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quotes
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current);
            current = '';
        } else if (char !== '\r') {
            current += char;
        }
    }
    
    // Don't forget last field
    result.push(current);
    
    return result.map(field => field.trim());
}
