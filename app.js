// MVP Strategic Planning Tool - SUPABASE COLLABORATIVE VERSION
console.log('MVP Tool Starting - Supabase Collaborative Version...');

// Configuration
const SHEET_ID = '1CHs8cP3mDQkwG-XL-B7twFVukRxcB4umn9VX9ZK2VqM';

// Global state
let clinicians = [];
let mvps = [];
let measures = [];
let benchmarks = [];
let assignments = {};
let mvpSelections = {};
let mvpPerformance = {};
let selectedClinicians = new Set();
let currentMVP = null;
let currentMode = 'tin-analysis';
let savedScenarios = {};
let currentScenarioName = 'Default';
let currentTIN = null; // Will be set from Supabase organization ID
let currentOrganization = null; // Current organization object

// New state for enhanced features
let selectedSpecialties = new Set();
let measureEstimates = {};
let measureConfigurations = {};
let yearlyPlan = {
    2026: { mvps: [], measures: [], focus: 'Foundation - High readiness measures' },
    2027: { mvps: [], measures: [], focus: 'Expansion - Add specialty MVPs' },
    2028: { mvps: [], measures: [], focus: 'Integration - Cross-specialty coordination' },
    2029: { mvps: [], measures: [], focus: 'Optimization - Performance improvement' },
    2030: { mvps: [], measures: [], focus: 'Excellence - Full MVP implementation' }
};
let currentYear = 2026;
let globalTINNumber = '123456789'; // Default TIN, will be updated from database

// Supabase User State
let currentUser = null;
let organizations = [];
let activeUsers = [];
let saveTimeout = null;
let isSaving = false;

// MVP recommendations based on specialty
const mvpRecommendations = {
    'Family Practice': 'Value in Primary Care MVP',
    'Family Medicine': 'Value in Primary Care MVP', 
    'Internal Medicine': 'Value in Primary Care MVP',
    'Emergency Medicine': 'Adopting Best Practices and Promoting Patient Safety within Emergency Medicine MVP',
    'Orthopedic Surgery': 'Improving Care for Lower Extremity Joint Repair MVP',
    'Anesthesiology': 'Patient Safety and Support of Positive Experiences with Anesthesia MVP',
    'General Surgery': 'Surgical Care MVP',
    'Cardiology': 'Advancing Care for Heart Disease MVP',
    'Neurology': 'Optimal Care for Patients with Episodic Neurological Conditions MVP',
    'Ophthalmology': 'Optimizing Cataract Surgery and Refractive Outcomes MVP',
    'Gastroenterology': 'Gastric and Esophageal Treatment MVP',
    'Rheumatology': 'Rheumatology Care MVP',
    'Pulmonology': 'Pulmonary Disease Management MVP',
    'Nephrology': 'Kidney Care MVP'
};

// ============================================================================
// USER IDENTITY & INITIALIZATION
// ============================================================================

// Check for saved user identity
function checkUserIdentity() {
    const savedUser = localStorage.getItem('mvp_user');
    if (savedUser) {
        try {
            return JSON.parse(savedUser);
        } catch (e) {
            return null;
        }
    }
    return null;
}

// Show user identity modal
function showIdentityModal() {
    const modal = document.getElementById('identity-modal');
    if (modal) {
        modal.style.display = 'flex';

        // Enable/disable submit button based on input
        const nameInput = document.getElementById('user-name');
        const emailInput = document.getElementById('user-email');
        const submitBtn = document.getElementById('identity-submit');

        function validateInputs() {
            const nameValid = nameInput.value.trim().length >= 2;
            const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim());
            submitBtn.disabled = !(nameValid && emailValid);
        }

        nameInput.addEventListener('input', validateInputs);
        emailInput.addEventListener('input', validateInputs);

        // Allow Enter key to submit
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !submitBtn.disabled) {
                submitUserIdentity();
            }
        });
    }
}

// Submit user identity
async function submitUserIdentity() {
    const nameInput = document.getElementById('user-name');
    const emailInput = document.getElementById('user-email');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name || !email) {
        alert('Please enter your name and email');
        return;
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = 'Setting up your account...';
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        // Create or get user in Supabase
        currentUser = await window.db.getOrCreateUser(email, name);

        // Save to localStorage for future sessions
        localStorage.setItem('mvp_user', JSON.stringify({
            id: currentUser.id,
            email: currentUser.email,
            display_name: currentUser.display_name
        }));

        // Hide modal
        const modal = document.getElementById('identity-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        // Update UI with user info
        updateUserInfoDisplay();

        // Continue with app initialization
        await initializeApp();

    } catch (error) {
        console.error('Error creating user:', error);
        statusEl.textContent = `Error: ${error.message}. Please try again.`;
        statusEl.className = 'status-error';
    }
}

// Update user info display in header
function updateUserInfoDisplay() {
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userNameDisplay = document.getElementById('user-name-display');

    if (currentUser && userInfo) {
        userInfo.style.display = 'flex';

        // Set avatar to first letter of name
        const initials = currentUser.display_name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

        if (userAvatar) userAvatar.textContent = initials;
        if (userNameDisplay) userNameDisplay.textContent = currentUser.display_name;
    }
}

// Update active users display
function updateActiveUsersDisplay() {
    const countEl = document.getElementById('active-users-count');
    if (countEl && activeUsers) {
        const count = activeUsers.length;
        countEl.textContent = `${count} online`;
    }
}

// Wait for Supabase to be ready
async function waitForSupabase(maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
        // Try to initialize
        if (window.initializeSupabase) {
            window.initializeSupabase();
        }

        if (window.supabaseClient) {
            console.log('Supabase ready after', i, 'attempts');
            return true;
        }

        // Wait 100ms before trying again
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.error('Supabase failed to initialize after', maxAttempts, 'attempts');
    return false;
}

// Initialize the application
async function init() {
    console.log('Initializing Supabase Collaborative MVP tool...');
    const statusEl = document.getElementById('connection-status');

    // Wait for Supabase to be ready
    statusEl.textContent = 'Connecting to database...';
    statusEl.className = 'status-loading';

    const supabaseReady = await waitForSupabase();
    if (!supabaseReady) {
        statusEl.textContent = 'Error: Could not connect to database. Please refresh.';
        statusEl.className = 'status-error';
        return;
    }

    // Check if user is already identified
    const savedUser = checkUserIdentity();

    if (savedUser) {
        // Verify user still exists in database and refresh
        try {
            statusEl.textContent = 'Reconnecting...';
            statusEl.className = 'status-loading';

            currentUser = await window.db.getOrCreateUser(savedUser.email, savedUser.display_name);
            updateUserInfoDisplay();
            await initializeApp();
        } catch (error) {
            console.error('Error reconnecting user:', error);
            // Clear saved user and show identity modal
            localStorage.removeItem('mvp_user');
            showIdentityModal();
        }
    } else {
        // Show identity modal for new users
        showIdentityModal();
    }
}

// Main app initialization (called after user identity is confirmed)
async function initializeApp() {
    console.log('Initializing app with user:', currentUser?.display_name);
    const statusEl = document.getElementById('connection-status');

    try {
        statusEl.textContent = 'Loading data from Supabase...';
        statusEl.className = 'status-loading';

        // Load organizations
        await loadOrganizations();

        // Load reference data (MVPs, measures, benchmarks)
        await loadReferenceData();

        // If we have an organization selected, load its data
        if (currentOrganization) {
            await loadOrganizationData();

            // Subscribe to real-time updates
            setupRealtimeSubscriptions();

            // Update user presence
            if (currentUser) {
                await window.db.updateUserPresence(currentUser.id, currentOrganization.id, currentUser.display_name, currentMode);

                // Refresh active users
                activeUsers = await window.db.getActiveUsers(currentOrganization.id);
                updateActiveUsersDisplay();
            }
        }

        statusEl.textContent = `Connected! Loaded ${clinicians.length} clinicians and ${mvps.length} MVPs`;
        statusEl.className = 'status-success';

        // Show the app immediately
        document.getElementById('nav-tabs').style.display = 'block';
        document.getElementById('main-app').style.display = 'block';

        // Hide status after 2 seconds
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

        setupInterface();
        switchToMode('tin-analysis');

        // Start presence heartbeat
        startPresenceHeartbeat();

    } catch (error) {
        console.error('Initialization error:', error);
        statusEl.textContent = `Error: ${error.message}. Please refresh the page.`;
        statusEl.className = 'status-error';

        // Still show the app so user can try to add an organization
        document.getElementById('nav-tabs').style.display = 'block';
        document.getElementById('main-app').style.display = 'block';
        setupInterface();
    }
}

// Presence heartbeat - update every 30 seconds
let presenceInterval = null;
function startPresenceHeartbeat() {
    if (presenceInterval) clearInterval(presenceInterval);

    presenceInterval = setInterval(async () => {
        if (currentUser && currentOrganization) {
            try {
                await window.db.updateUserPresence(
                    currentUser.id,
                    currentOrganization.id,
                    currentUser.display_name,
                    currentMode
                );

                // Refresh active users list
                activeUsers = await window.db.getActiveUsers(currentOrganization.id);
                updateActiveUsersDisplay();
            } catch (e) {
                console.error('Presence update failed:', e);
            }
        }
    }, 30000);
}

// Load organizations from Supabase
async function loadOrganizations() {
    try {
        organizations = await window.db.getOrganizations();
        console.log(`Loaded ${organizations.length} organizations`);

        // Populate TIN selector
        const selector = document.getElementById('tin-selector');
        if (selector) {
            selector.innerHTML = '';

            if (organizations.length === 0) {
                selector.innerHTML = '<option value="">No organizations yet - Add one!</option>';
            } else {
                organizations.forEach(org => {
                    const option = document.createElement('option');
                    option.value = org.id;
                    option.textContent = org.display_name || org.name;
                    selector.appendChild(option);
                });

                // Select first org or saved preference
                const savedOrgId = localStorage.getItem('mvp_current_org');
                if (savedOrgId && organizations.find(o => o.id === savedOrgId)) {
                    selector.value = savedOrgId;
                    currentOrganization = organizations.find(o => o.id === savedOrgId);
                } else if (organizations.length > 0) {
                    currentOrganization = organizations[0];
                    selector.value = currentOrganization.id;
                }

                currentTIN = currentOrganization?.id;
                globalTINNumber = currentOrganization?.tin || '';

                updateTINSelectorUI();
            }
        }
    } catch (error) {
        console.error('Error loading organizations:', error);
        throw error;
    }
}

// Load reference data from Google Sheets (or Supabase as fallback)
async function loadReferenceData() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
        if (isLocalhost) {
            // On localhost, use Supabase seed data
            console.log('Loading reference data from Supabase (localhost)...');
            mvps = await window.db.getMVPs();
            measures = await window.db.getMeasures();
            benchmarks = await window.db.getBenchmarks();
        } else {
            // On deployed site, load from Google Sheets
            console.log('Loading reference data from Google Sheets...');

            // Load MVPs from Google Sheets
            const mvpResponse = await fetch('/api/sheets/mvps');
            if (mvpResponse.ok) {
                const rawMvps = await mvpResponse.json();
                mvps = rawMvps.map(row => ({
                    mvp_id: row.mvp_id || row['MVP ID'] || '',
                    mvp_name: row.mvp_name || row['MVP Name'] || '',
                    description: row.description || row['Description'] || '',
                    eligible_specialties: row.eligible_specialties || row['Eligible Specialties'] || '',
                    available_measures: row.available_measures || row['Available Measures'] || '',
                    category: row.category || row['Category'] || 'General'
                }));
                console.log(`Loaded ${mvps.length} MVPs from Google Sheets`);
            } else {
                console.warn('Failed to load MVPs from Sheets, falling back to Supabase');
                mvps = await window.db.getMVPs();
            }

            // Load Measures from Google Sheets
            const measuresResponse = await fetch('/api/sheets/measures');
            if (measuresResponse.ok) {
                const rawMeasures = await measuresResponse.json();
                measures = rawMeasures.map(row => {
                    // Normalize is_activated to 'Y' or 'N' for consistency
                    const activatedRaw = row.is_activated || row['Is Activated'] || row['Activated'] || '';
                    const isActivated = activatedRaw === 'Y' || activatedRaw === 'Yes' || activatedRaw === 'yes' ||
                                       activatedRaw === 'true' || activatedRaw === 'TRUE' || activatedRaw === true ||
                                       activatedRaw === '1' || activatedRaw === 1;

                    // Normalize is_inverse similarly
                    const inverseRaw = row.is_inverse || row['Is Inverse'] || row['Inverse'] || '';
                    const isInverse = inverseRaw === 'Y' || inverseRaw === 'Yes' || inverseRaw === 'yes' ||
                                     inverseRaw === 'true' || inverseRaw === 'TRUE' || inverseRaw === true;

                    return {
                        measure_id: row.measure_id || row['Measure ID'] || '',
                        measure_name: row.measure_name || row['Measure Name'] || '',
                        measure_type: row.measure_type || row['Measure Type'] || row['Type'] || 'Quality',
                        is_inverse: isInverse ? 'Y' : 'N',
                        is_activated: isActivated ? 'Y' : 'N',
                        collection_types: row.collection_types || row['Collection Types'] || 'eCQM',
                        setup_months: parseInt(row.setup_months || row['Setup Months'] || '0') || 0,
                        description: row.description || row['Description'] || ''
                    };
                });
                console.log(`Loaded ${measures.length} measures from Google Sheets`);

                // Log activated measures for debugging
                const activatedCount = measures.filter(m => m.is_activated === 'Y').length;
                console.log(`Found ${activatedCount} activated measures`);
            } else {
                console.warn('Failed to load measures from Sheets, falling back to Supabase');
                measures = await window.db.getMeasures();
            }

            // Load Benchmarks from Google Sheets
            const benchmarksResponse = await fetch('/api/sheets/benchmarks');
            if (benchmarksResponse.ok) {
                const rawBenchmarks = await benchmarksResponse.json();
                benchmarks = rawBenchmarks.map(row => ({
                    measure_id: row.measure_id || row['Measure ID'] || '',
                    benchmark_year: row.benchmark_year || row['Benchmark Year'] || '2024',
                    decile_3: parseFloat(row.decile_3 || row['Decile 3'] || '0') || 0,
                    decile_4: parseFloat(row.decile_4 || row['Decile 4'] || '0') || 0,
                    decile_5: parseFloat(row.decile_5 || row['Decile 5'] || '0') || 0,
                    decile_6: parseFloat(row.decile_6 || row['Decile 6'] || '0') || 0,
                    decile_7: parseFloat(row.decile_7 || row['Decile 7'] || '0') || 0,
                    decile_8: parseFloat(row.decile_8 || row['Decile 8'] || '0') || 0,
                    decile_9: parseFloat(row.decile_9 || row['Decile 9'] || '0') || 0,
                    decile_10: parseFloat(row.decile_10 || row['Decile 10'] || '0') || 0
                }));
                console.log(`Loaded ${benchmarks.length} benchmarks from Google Sheets`);
            } else {
                console.warn('Failed to load benchmarks from Sheets, falling back to Supabase');
                benchmarks = await window.db.getBenchmarks();
            }
        }

        console.log(`Loaded ${mvps.length} MVPs, ${measures.length} measures, ${benchmarks.length} benchmarks`);

        // Update measures with benchmark medians
        measures.forEach(measure => {
            const benchmark = benchmarks.find(b => b.measure_id === measure.measure_id);
            if (benchmark) {
                measure.median_benchmark = benchmark.decile_5 || benchmark.median_performance || 75;
            }
        });

        updateStats();
    } catch (error) {
        console.error('Error loading reference data:', error);
        throw error;
    }
}

// Load organization-specific data
async function loadOrganizationData() {
    if (!currentOrganization) return;

    const orgId = currentOrganization.id;
    console.log('Loading data for organization:', currentOrganization.name);

    try {
        // Load clinicians for this organization
        clinicians = await window.db.getClinicians(orgId);
        console.log(`Loaded ${clinicians.length} clinicians`);

        // Load assignments
        const dbAssignments = await window.db.getAssignments(orgId);
        assignments = {};
        dbAssignments.forEach(a => {
            if (!assignments[a.mvp_id]) {
                assignments[a.mvp_id] = [];
            }
            assignments[a.mvp_id].push(a.clinician_npi);
        });
        console.log(`Loaded ${dbAssignments.length} assignments`);

        // Load MVP selections
        const dbSelections = await window.db.getMvpSelections(orgId);
        mvpSelections = {};
        dbSelections.forEach(s => {
            if (!mvpSelections[s.mvp_id]) {
                mvpSelections[s.mvp_id] = { measures: [], configs: {} };
            }
            mvpSelections[s.mvp_id].measures.push(s.measure_id);
            mvpSelections[s.mvp_id].configs[s.measure_id] = {
                collectionType: s.collection_type,
                ...s.config
            };
        });
        console.log(`Loaded selections for ${Object.keys(mvpSelections).length} MVPs`);

        // Load measure estimates
        const dbEstimates = await window.db.getMeasureEstimates(orgId);
        measureEstimates = {};
        dbEstimates.forEach(e => {
            measureEstimates[`${e.mvp_id}_${e.measure_id}`] = e.estimated_rate;
        });
        console.log(`Loaded ${dbEstimates.length} measure estimates`);

        // Load scenarios
        const dbScenarios = await window.db.getScenarios(orgId);
        savedScenarios = {};
        dbScenarios.forEach(s => {
            savedScenarios[s.name] = s;
        });
        console.log(`Loaded ${dbScenarios.length} scenarios`);

        updateStats();

    } catch (error) {
        console.error('Error loading organization data:', error);
        throw error;
    }
}

// Setup real-time subscriptions for collaboration
function setupRealtimeSubscriptions() {
    if (!currentOrganization) return;

    window.db.subscribeToChanges(currentOrganization.id, (table, payload) => {
        console.log('Real-time update:', table, payload.eventType);

        switch (table) {
            case 'assignments':
                handleAssignmentChange(payload);
                break;
            case 'mvp_selections':
                handleSelectionChange(payload);
                break;
            case 'measure_estimates':
                handleEstimateChange(payload);
                break;
            case 'scenarios':
                handleScenarioChange(payload);
                break;
            case 'user_presence':
                handlePresenceChange(payload);
                break;
        }
    });
}

// Handle real-time assignment changes
function handleAssignmentChange(payload) {
    const { eventType, new: newData, old: oldData } = payload;

    if (eventType === 'INSERT' && newData) {
        if (!assignments[newData.mvp_id]) {
            assignments[newData.mvp_id] = [];
        }
        if (!assignments[newData.mvp_id].includes(newData.clinician_npi)) {
            assignments[newData.mvp_id].push(newData.clinician_npi);
        }
    } else if (eventType === 'DELETE' && oldData) {
        if (assignments[oldData.mvp_id]) {
            assignments[oldData.mvp_id] = assignments[oldData.mvp_id].filter(
                npi => npi !== oldData.clinician_npi
            );
        }
    }

    // Refresh UI
    if (currentMode === 'planning') {
        renderPlanningMode();
    }
    updateStats();
}

// Handle real-time selection changes
function handleSelectionChange(payload) {
    const { eventType, new: newData, old: oldData } = payload;

    if (eventType === 'INSERT' && newData) {
        if (!mvpSelections[newData.mvp_id]) {
            mvpSelections[newData.mvp_id] = { measures: [], configs: {} };
        }
        if (!mvpSelections[newData.mvp_id].measures.includes(newData.measure_id)) {
            mvpSelections[newData.mvp_id].measures.push(newData.measure_id);
            mvpSelections[newData.mvp_id].configs[newData.measure_id] = {
                collectionType: newData.collection_type,
                ...newData.config
            };
        }
    } else if (eventType === 'DELETE' && oldData) {
        if (mvpSelections[oldData.mvp_id]) {
            mvpSelections[oldData.mvp_id].measures = mvpSelections[oldData.mvp_id].measures.filter(
                m => m !== oldData.measure_id
            );
            delete mvpSelections[oldData.mvp_id].configs[oldData.measure_id];
        }
    }

    // Refresh UI
    if (currentMVP) {
        renderMeasures(currentMVP);
    }
}

// Handle real-time estimate changes
function handleEstimateChange(payload) {
    const { eventType, new: newData } = payload;

    if ((eventType === 'INSERT' || eventType === 'UPDATE') && newData) {
        measureEstimates[`${newData.mvp_id}_${newData.measure_id}`] = newData.estimated_rate;
    }

    // Refresh performance view if active
    if (currentMode === 'performance') {
        renderPerformanceEstimation();
    }
}

// Handle real-time scenario changes
function handleScenarioChange(payload) {
    // Reload scenarios
    loadOrganizationData().then(() => {
        updateScenarioDropdown();
    });
}

// Handle real-time presence changes
function handlePresenceChange(payload) {
    window.db.getActiveUsers(currentOrganization.id).then(users => {
        activeUsers = users;
        updateActiveUsersDisplay();
    });
}

// Load data from API with proper benchmark loading
async function loadData() {
    console.log('Loading data from API...');
    console.log('Current TIN:', currentTIN);

    try {
        // Load clinicians with TIN parameter
        console.log(`Fetching clinicians from /api/sheets/clinicians?tin=${currentTIN}...`);
        const response = await fetch(`/api/sheets/clinicians?tin=${currentTIN}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load clinicians: ${response.status}`);
        }
        
        const cliniciansData = await response.json();
        console.log(`Loaded ${cliniciansData.length} clinicians`);
        
        // Process clinicians data
        clinicians = cliniciansData.map(row => {
            let name = 'Unknown';
            
            if (row['first_name'] && row['last_name']) {
                name = `${row['first_name']} ${row['last_name']}`.trim();
            } else if (row['First Name'] && row['Last Name']) {
                name = `${row['First Name']} ${row['Last Name']}`.trim();
            } else if (row['full_name']) {
                name = row['full_name'].trim();
            } else if (row['Full Name']) {
                name = row['Full Name'].trim();
            } else if (row['name']) {
                name = row['name'].trim();
            } else if (row['Name']) {
                name = row['Name'].trim();
            }
            
            // Get TIN from first clinician if available
            if (row.tin || row.TIN) {
                globalTINNumber = row.tin || row.TIN;
            }
            
            return {
                npi: row.npi || row.NPI || '',
                name: name,
                specialty: row.specialty || row.Specialty || 'Unknown',
                tin: row.tin || row.TIN || '',
                separate_ehr: row.separate_ehr || row['Separate EHR'] || 'No'
            };
        });
        
        // Update TIN display
        updateTINNumber(globalTINNumber);
        
        // Load MVPs
        console.log('Fetching MVPs from /api/sheets/mvps...');
        const mvpsResponse = await fetch('/api/sheets/mvps');
        
        if (mvpsResponse.ok) {
            const mvpsData = await mvpsResponse.json();
            
            mvps = mvpsData.map(row => ({
                mvp_id: row.mvp_id || row['MVP ID'] || '',
                mvp_name: row.mvp_name || row['MVP Name'] || '',
                specialties: row.eligible_specialties || row['Eligible Specialties'] || '',
                available_measures: row.available_measures || row['Available Measures'] || ''
            }));
            
            console.log(`Loaded ${mvps.length} MVPs`);
        }
        
        // Load measures
        console.log('Fetching measures from /api/sheets/measures...');
        const measuresResponse = await fetch('/api/sheets/measures');
        
        if (measuresResponse.ok) {
            const measuresData = await measuresResponse.json();
            
            measures = measuresData.map(row => ({
                measure_id: row.measure_id || row['Measure ID'] || '',
                measure_name: row.measure_name || row['Measure Name'] || '',
                is_activated: row.is_activated || row['Is Activated'] || 'N',
                collection_types: row.collection_types || row['Collection Types'] || 'MIPS CQM',
                difficulty: row.difficulty || row['Difficulty'] || 'Medium',
                is_inverse: row.is_inverse || row['Is Inverse'] || 'N',
                setup_time: row.setup_time || row['Setup Time'] || '3 months',
                readiness: parseInt(row.readiness || row['Readiness'] || '3'),
                prerequisites: row.prerequisites || row['Prerequisites'] || '',
                median_benchmark: parseFloat(row.median_benchmark || row['Median Benchmark'] || '75')
            }));
            
            console.log(`Loaded ${measures.length} measures`);
        }
        
        // LOAD BENCHMARKS - CRITICAL FOR SCORING!
        console.log('Fetching benchmarks from /api/sheets/benchmarks...');
        const benchmarksResponse = await fetch('/api/sheets/benchmarks');
        
        if (benchmarksResponse.ok) {
            const benchmarksData = await benchmarksResponse.json();
            
            benchmarks = benchmarksData.map(row => ({
                benchmark_year: row.benchmark_year || row['Benchmark Year'] || '2025',
                measure_id: row.measure_id || row['Measure ID'] || '',
                collection_type: row.collection_type || row['Collection Type'] || '',
                is_inverse: row.is_inverse || row['Is Inverse'] || 'N',
                mean_performance: parseFloat(row.mean_performance || row['Mean Performance'] || 0),
                // The median is typically at decile_5 (50th percentile)
                median_performance: parseFloat(row.decile_5 || row['Decile 5'] || row.median_performance || row['Median Performance'] || 50),
                decile_1: parseFloat(row.decile_1 || row['Decile 1'] || 0),
                decile_2: parseFloat(row.decile_2 || row['Decile 2'] || 0),
                decile_3: parseFloat(row.decile_3 || row['Decile 3'] || 0),
                decile_4: parseFloat(row.decile_4 || row['Decile 4'] || 0),
                decile_5: parseFloat(row.decile_5 || row['Decile 5'] || 0),
                decile_6: parseFloat(row.decile_6 || row['Decile 6'] || 0),
                decile_7: parseFloat(row.decile_7 || row['Decile 7'] || 0),
                decile_8: parseFloat(row.decile_8 || row['Decile 8'] || 0),
                decile_9: parseFloat(row.decile_9 || row['Decile 9'] || 0),
                decile_10: parseFloat(row.decile_10 || row['Decile 10'] || 100)
            }));
            
            console.log(`Loaded ${benchmarks.length} benchmarks`);
            
            // Log sample benchmark to verify median is loading correctly
            if (benchmarks.length > 0) {
                const q416Benchmark = benchmarks.find(b => b.measure_id === 'Q416');
                if (q416Benchmark) {
                    console.log('Q416 Benchmark median:', q416Benchmark.median_performance, 'Decile 5:', q416Benchmark.decile_5);
                }
            }
            
            // Update measures with median benchmark from benchmarks if available
            measures.forEach(measure => {
                const benchmark = benchmarks.find(b => b.measure_id === measure.measure_id);
                if (benchmark) {
                    // Use decile_5 as the median (50th percentile)
                    measure.median_benchmark = benchmark.decile_5 || benchmark.median_performance || 75;
                    console.log(`${measure.measure_id}: Setting median to ${measure.median_benchmark}`);
                }
            });
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Unable to load data. Using demo data.');
        
        // Demo data
        clinicians = [
            { npi: '1234567890', name: 'John Smith', specialty: 'Family Practice', tin: '123456789' },
            { npi: '0987654321', name: 'Jane Doe', specialty: 'Emergency Medicine', tin: '123456789' },
            { npi: '1111111111', name: 'Bob Johnson', specialty: 'Orthopedic Surgery', tin: '123456789' },
            { npi: '2222222222', name: 'Alice Williams', specialty: 'Anesthesiology', tin: '123456789' },
            { npi: '3333333333', name: 'Charlie Brown', specialty: 'Cardiology', tin: '123456789' }
        ];
        
        mvps = [
            { mvp_id: 'MVP001', mvp_name: 'Value in Primary Care MVP', specialties: 'Family Medicine', available_measures: 'Q001,Q112,Q113,Q134' },
            { mvp_id: 'MVP002', mvp_name: 'Emergency Medicine MVP', specialties: 'Emergency Medicine', available_measures: 'Q065,Q116,Q254,Q255' }
        ];
        
        measures = [
            { measure_id: 'Q001', measure_name: 'Diabetes Control', is_activated: 'Y', collection_types: 'eCQM,MIPS CQM', difficulty: 'Easy', is_inverse: 'Y', setup_time: '2 months', readiness: 4, prerequisites: 'EHR integration', median_benchmark: 72 }
        ];
        
        benchmarks = [];
    }
    
    updateStats();
}

// Show CSV import modal
function showCSVImportModal() {
    // Create a simple file input dialog
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('connection-status');
        statusEl.textContent = 'Processing CSV file...';
        statusEl.className = 'status-loading';
        statusEl.style.display = 'block';

        try {
            const text = await file.text();
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

            const cliniciansData = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                if (values.length >= 2) {
                    const row = {};
                    headers.forEach((h, idx) => {
                        row[h] = values[idx] || '';
                    });
                    cliniciansData.push(row);
                }
            }

            if (cliniciansData.length === 0) {
                alert('No valid data found in CSV');
                statusEl.style.display = 'none';
                return;
            }

            // Import to Supabase
            const imported = await window.db.importClinicians(currentOrganization.id, cliniciansData, currentUser?.id);
            console.log(`Imported ${imported.length} clinicians from CSV`);

            // Reload clinicians
            clinicians = await window.db.getClinicians(currentOrganization.id);

            // Refresh UI
            renderTINAnalysis();
            updateStats();

            statusEl.textContent = `Imported ${imported.length} clinicians from CSV!`;
            statusEl.className = 'status-success';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 2000);

        } catch (error) {
            console.error('Error importing CSV:', error);
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'status-error';
        }
    };

    input.click();
}

// Sample clinician data for local testing
const sampleClinicians = [
    { npi: '1234567890', name: 'Dr. Sarah Johnson', specialty: 'Family Practice', separate_ehr: 'No' },
    { npi: '1234567891', name: 'Dr. Michael Chen', specialty: 'Internal Medicine', separate_ehr: 'No' },
    { npi: '1234567892', name: 'Dr. Emily Williams', specialty: 'Cardiology', separate_ehr: 'No' },
    { npi: '1234567893', name: 'Dr. James Brown', specialty: 'Family Practice', separate_ehr: 'No' },
    { npi: '1234567894', name: 'Dr. Maria Garcia', specialty: 'Pediatrics', separate_ehr: 'No' },
    { npi: '1234567895', name: 'Dr. Robert Davis', specialty: 'Internal Medicine', separate_ehr: 'No' },
    { npi: '1234567896', name: 'Dr. Jennifer Martinez', specialty: 'Cardiology', separate_ehr: 'Yes' },
    { npi: '1234567897', name: 'Dr. David Wilson', specialty: 'Orthopedics', separate_ehr: 'No' },
    { npi: '1234567898', name: 'Dr. Lisa Anderson', specialty: 'Family Practice', separate_ehr: 'No' },
    { npi: '1234567899', name: 'Dr. Thomas Taylor', specialty: 'Gastroenterology', separate_ehr: 'No' },
    { npi: '1234567900', name: 'Dr. Nancy Moore', specialty: 'Rheumatology', separate_ehr: 'No' },
    { npi: '1234567901', name: 'Dr. Christopher Lee', specialty: 'Internal Medicine', separate_ehr: 'No' },
];

// Import clinicians from Google Sheets API (or sample data for localhost)
async function importCliniciansFromSheets() {
    if (!currentOrganization) {
        alert('Please select an organization first');
        return;
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = 'Importing clinicians...';
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        let cliniciansData = [];

        // Check if we're on localhost (API won't work)
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            console.log('Running locally - using sample clinician data');
            cliniciansData = sampleClinicians;
        } else {
            // Determine which TIN to fetch based on org name
            let sheetTIN = 'main';
            const orgNameLower = currentOrganization.name.toLowerCase();
            if (orgNameLower.includes('medical group') || orgNameLower.includes('medical')) {
                sheetTIN = 'medical';
            }

            console.log(`Fetching clinicians from Google Sheets for TIN: ${sheetTIN}`);
            const response = await fetch(`/api/sheets/clinicians?tin=${sheetTIN}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch clinicians: ${response.status}`);
            }

            const rawData = await response.json();
            console.log(`Fetched ${rawData.length} clinicians from Google Sheets`);

            // Transform to the format expected by importClinicians
            cliniciansData = rawData.map(row => ({
                npi: row.npi || row.NPI || '',
                name: row['first_name'] && row['last_name']
                    ? `${row['first_name']} ${row['last_name']}`.trim()
                    : row['First Name'] && row['Last Name']
                        ? `${row['First Name']} ${row['Last Name']}`.trim()
                        : row.name || row.Name || 'Unknown',
                specialty: row.specialty || row.Specialty || 'Unknown',
                separate_ehr: row.separate_ehr || row['Separate EHR'] || 'No'
            }));
        }

        if (cliniciansData.length === 0) {
            alert('No clinicians found');
            statusEl.style.display = 'none';
            return;
        }

        // Import to Supabase
        const imported = await window.db.importClinicians(currentOrganization.id, cliniciansData, currentUser?.id);
        console.log(`Imported ${imported.length} clinicians to Supabase`);

        // Reload clinicians
        clinicians = await window.db.getClinicians(currentOrganization.id);

        // Refresh UI
        renderTINAnalysis();
        updateStats();

        statusEl.textContent = `Imported ${imported.length} clinicians!`;
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('Error importing clinicians:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-error';
    }
}

// TIN Analysis Functions
function renderTINAnalysis() {
    console.log('Rendering TIN Analysis...');

    // Show import button if no clinicians
    const specialtyGrid = document.getElementById('specialty-grid');
    if (clinicians.length === 0) {
        specialtyGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: white; border-radius: 8px; border: 2px dashed #dee2e6;">
                <h3 style="color: #586069; margin-bottom: 15px;">No Clinicians Found</h3>
                <p style="color: #586069; margin-bottom: 20px;">This organization doesn't have any clinicians yet.</p>
                <button onclick="importCliniciansFromSheets()" style="padding: 12px 24px; background: #004877; color: white; border: none; cursor: pointer; font-size: 16px; margin-right: 10px;">
                    Import from Google Sheets
                </button>
                <button onclick="showCSVImportModal()" style="padding: 12px 24px; background: #28a745; color: white; border: none; cursor: pointer; font-size: 16px;">
                    Upload CSV File
                </button>
            </div>
        `;

        document.getElementById('tin-total').textContent = '0';
        document.getElementById('tin-specialties').textContent = '0';
        document.getElementById('tin-mvps').textContent = '0';
        return;
    }

    const specialtyCount = {};
    const specialtyClinicians = {};

    clinicians.forEach(clinician => {
        const spec = clinician.specialty || 'Unspecified';
        specialtyCount[spec] = (specialtyCount[spec] || 0) + 1;
        if (!specialtyClinicians[spec]) {
            specialtyClinicians[spec] = [];
        }
        specialtyClinicians[spec].push(clinician);
    });

    // Update TIN overview cards
    document.getElementById('tin-total').textContent = clinicians.length;
    document.getElementById('tin-specialties').textContent = Object.keys(specialtyCount).length;
    
    // Count recommended MVPs
    const recommendedMVPs = new Set();
    Object.keys(specialtyCount).forEach(specialty => {
        if (mvpRecommendations[specialty]) {
            recommendedMVPs.add(mvpRecommendations[specialty]);
        }
    });
    document.getElementById('tin-mvps').textContent = recommendedMVPs.size;
    
    // Render specialty cards (specialtyGrid already declared above)
    specialtyGrid.innerHTML = '';
    
    // Sort specialties by count (descending)
    const sortedSpecialties = Object.entries(specialtyCount).sort((a, b) => b[1] - a[1]);
    
    // Auto-select specialties with MVP recommendations
    sortedSpecialties.forEach(([specialty, count]) => {
        const recommendedMVP = mvpRecommendations[specialty];
        const mvp = mvps.find(m => m.mvp_name === recommendedMVP);
        
        // Auto-select if has recommendation
        if (recommendedMVP && mvp) {
            selectedSpecialties.add(specialty);
        }
        
        const card = document.createElement('div');
        card.className = 'specialty-card';
        if (selectedSpecialties.has(specialty)) {
            card.classList.add('selected');
        }
        card.dataset.specialty = specialty;
        
        card.innerHTML = `
            <div class="specialty-header">
                <div class="specialty-name">${specialty}</div>
                <div class="clinician-count">${count}</div>
            </div>
            ${recommendedMVP && mvp ? `
                <div class="mvp-recommendation">
                    <strong>Recommended:</strong><br>
                    ${recommendedMVP}
                </div>
            ` : `
                <div style="color: #586069; font-style: italic; margin-top: 10px;">
                    No specific MVP recommendation
                </div>
            `}
            <div class="clinician-preview">
                ${specialtyClinicians[specialty].slice(0, 3).map(c => c.name).join('<br>')}
                ${count > 3 ? `<br><span style="color: #004877; cursor: pointer; text-decoration: underline;" 
                    onclick="event.stopPropagation(); showClinicianPreview('${specialty}', '${mvp ? mvp.mvp_id : ''}', '${recommendedMVP || specialty}')">
                    ... view all ${count} clinicians</span>` : ''}
            </div>
        `;
        
        card.onclick = () => toggleSpecialtySelection(specialty);
        specialtyGrid.appendChild(card);
    });
}

function toggleSpecialtySelection(specialty) {
    if (selectedSpecialties.has(specialty)) {
        selectedSpecialties.delete(specialty);
    } else {
        selectedSpecialties.add(specialty);
    }
    
    const card = document.querySelector(`[data-specialty="${specialty}"]`);
    if (card) {
        card.classList.toggle('selected');
    }
}

function updateTINNumber(value) {
    globalTINNumber = value;
    document.getElementById('tin-number').textContent = value;
    document.getElementById('tin-number-input').value = value;
}

// ============================================================================
// ORGANIZATION (TIN) MANAGEMENT FUNCTIONS
// ============================================================================

// Show save indicator
function showSaveIndicator(status) {
    const indicator = document.getElementById('save-indicator');
    if (!indicator) return;

    indicator.style.display = 'inline-block';
    indicator.className = 'save-indicator ' + status;

    if (status === 'saving') {
        indicator.textContent = 'Saving...';
    } else if (status === 'saved') {
        indicator.textContent = 'Saved';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 2000);
    } else if (status === 'error') {
        indicator.textContent = 'Save failed';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 3000);
    }
}

// Auto-save with debounce
function triggerAutoSave() {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        await saveCurrentState();
    }, 1000);
}

// Save current state to Supabase
async function saveCurrentState() {
    if (!currentOrganization || !currentUser) return;

    showSaveIndicator('saving');
    isSaving = true;

    try {
        // Save assignments
        await window.db.saveAllAssignments(
            currentOrganization.id,
            assignments,
            currentUser.id
        );

        // Save selections
        await window.db.saveAllMvpSelections(
            currentOrganization.id,
            mvpSelections,
            currentUser.id
        );

        // Save estimates
        await window.db.saveAllMeasureEstimates(
            currentOrganization.id,
            measureEstimates,
            currentUser.id
        );

        showSaveIndicator('saved');
        console.log('State saved successfully');
    } catch (error) {
        console.error('Error saving state:', error);
        showSaveIndicator('error');
    } finally {
        isSaving = false;
    }
}

// Legacy function name - calls saveCurrentState for backward compatibility
function saveTINSpecificData() {
    // Only save if we have an org and user
    if (currentOrganization && currentUser) {
        saveCurrentState();
    }
}

function updateTINSelectorUI() {
    const indicatorEl = document.getElementById('tin-active-indicator');

    if (indicatorEl && currentOrganization) {
        indicatorEl.textContent = `TIN: ${currentOrganization.tin || 'Not set'}`;
    }

    // Update TIN number display
    if (currentOrganization) {
        globalTINNumber = currentOrganization.tin || '';
        const tinNumberEl = document.getElementById('tin-number');
        const tinInputEl = document.getElementById('tin-number-input');
        if (tinNumberEl) tinNumberEl.textContent = globalTINNumber;
        if (tinInputEl) tinInputEl.value = globalTINNumber;
    }

    console.log('TIN Selector UI updated');
}

// Switch to different organization
async function switchTIN(newOrgId) {
    if (!newOrgId || newOrgId === currentOrganization?.id) {
        console.log('Already on this organization or no org selected');
        return;
    }

    console.log(`Switching to organization: ${newOrgId}`);

    // Unsubscribe from current org's real-time updates
    window.db.unsubscribeAll();

    // Update current organization
    currentOrganization = organizations.find(o => o.id === newOrgId);
    currentTIN = newOrgId;
    localStorage.setItem('mvp_current_org', newOrgId);

    // Clear current state
    selectedClinicians.clear();
    selectedSpecialties.clear();
    currentMVP = null;

    // Show loading indicator
    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = `Switching to ${currentOrganization?.name || 'organization'}...`;
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        // Load new organization's data
        await loadOrganizationData();

        // Subscribe to new org's real-time updates
        setupRealtimeSubscriptions();

        // Update user presence
        if (currentUser) {
            await window.db.updateUserPresence(
                currentUser.id,
                currentOrganization.id,
                currentUser.display_name,
                currentMode
            );

            activeUsers = await window.db.getActiveUsers(currentOrganization.id);
            updateActiveUsersDisplay();
        }

        // Rebuild specialty filters
        setupFilters();

        // Update UI
        updateTINSelectorUI();

        // Refresh current view
        if (currentMode === 'tin-analysis') {
            renderTINAnalysis();
        } else if (currentMode === 'planning') {
            renderPlanningMode();
        } else if (currentMode === 'performance') {
            renderPerformanceEstimation();
        } else if (currentMode === 'executive') {
            renderExecutiveDashboard();
        }

        updateStats();

        statusEl.textContent = `Switched to ${currentOrganization?.name}`;
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('Error switching organization:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-error';
    }
}

// Open TIN modal
function openTinModal() {
    const modal = document.getElementById('tin-modal');
    if (modal) {
        modal.classList.add('show');

        // Clear inputs
        document.getElementById('new-tin-number').value = '';
        document.getElementById('new-tin-name').value = '';
        document.getElementById('new-tin-display').value = '';
    }
}

// Close TIN modal
function closeTinModal() {
    const modal = document.getElementById('tin-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Save new TIN/Organization
async function saveNewTin() {
    const tinNumber = document.getElementById('new-tin-number').value.trim();
    const tinName = document.getElementById('new-tin-name').value.trim();
    const displayName = document.getElementById('new-tin-display').value.trim();

    if (!tinNumber || !tinName) {
        alert('Please enter a TIN number and organization name');
        return;
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = 'Creating organization...';
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        const newOrg = await window.db.createOrganization(
            tinNumber,
            tinName,
            displayName || tinName,
            currentUser?.id
        );

        // Add current user as member
        if (currentUser) {
            await window.db.addOrganizationMember(newOrg.id, currentUser.id, 'admin');
        }

        // Reload organizations
        await loadOrganizations();

        // Switch to new organization
        await switchTIN(newOrg.id);

        closeTinModal();

        statusEl.textContent = `Created ${tinName}!`;
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('Error creating organization:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-error';
    }
}

// Delete current TIN/Organization
async function deleteCurrentTin() {
    if (!currentOrganization) {
        alert('No organization selected');
        return;
    }

    const confirmMsg = `Are you sure you want to delete "${currentOrganization.display_name || currentOrganization.name}"?\n\nThis will permanently delete:\n- All clinicians\n- All assignments\n- All scenarios\n- All version history\n\nThis action cannot be undone!`;

    if (!confirm(confirmMsg)) {
        return;
    }

    // Double-check with the org name
    const typedName = prompt(`To confirm deletion, type the organization name: "${currentOrganization.name}"`);
    if (typedName !== currentOrganization.name) {
        alert('Organization name did not match. Deletion cancelled.');
        return;
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = 'Deleting organization...';
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        await window.db.deleteOrganization(currentOrganization.id);

        // Clear localStorage reference
        localStorage.removeItem('mvp_current_org');

        // Reload organizations
        await loadOrganizations();

        // If there are remaining orgs, switch to the first one
        if (organizations.length > 0) {
            await switchTIN(organizations[0].id);
        } else {
            currentOrganization = null;
            currentTIN = null;
            clinicians = [];
            assignments = {};
            mvpSelections = {};
            renderTINAnalysis();
        }

        statusEl.textContent = 'Organization deleted';
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('Error deleting organization:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-error';
    }
}

// Open history modal
function openHistoryModal() {
    if (!currentOrganization) {
        alert('Please select an organization first');
        return;
    }

    const modal = document.getElementById('history-modal');
    const body = document.getElementById('history-modal-body');

    if (modal && body) {
        modal.style.display = 'block';
        body.innerHTML = '<p>Loading version history...</p>';

        window.db.getVersionHistory(currentOrganization.id).then(history => {
            if (history.length === 0) {
                body.innerHTML = '<p style="color: #586069;">No version history yet. History is created when you save scenarios.</p>';
                return;
            }

            let html = '<div style="max-height: 400px; overflow-y: auto;">';
            history.forEach((version, index) => {
                const date = new Date(version.created_at).toLocaleString();
                html += `
                    <div style="padding: 15px; margin-bottom: 10px; background: #f6f8fa; border-left: 3px solid #004877;">
                        <strong>Version ${version.version_number || history.length - index}</strong>
                        <div style="font-size: 12px; color: #586069; margin: 5px 0;">
                            ${date} ${version.trigger_event ? `- ${version.trigger_event}` : ''}
                        </div>
                        ${version.version_name ? `<div style="margin: 5px 0;">${version.version_name}</div>` : ''}
                        ${version.description ? `<div style="font-size: 13px; color: #586069;">${version.description}</div>` : ''}
                        <button onclick="rollbackToVersion('${version.id}')" style="margin-top: 10px; padding: 6px 12px; background: #586069; color: white; border: none; cursor: pointer; font-size: 12px;">
                            Restore This Version
                        </button>
                    </div>
                `;
            });
            html += '</div>';
            body.innerHTML = html;
        }).catch(error => {
            body.innerHTML = `<p style="color: #dc3545;">Error loading history: ${error.message}</p>`;
        });
    }
}

// Close history modal
function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Rollback to a version
async function rollbackToVersion(versionId) {
    if (!confirm('Are you sure you want to restore this version? Current changes will be lost.')) {
        return;
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = 'Restoring version...';
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        const restoredState = await window.db.rollbackToVersion(currentOrganization.id, versionId, currentUser?.id);

        // Apply restored state
        if (restoredState.assignments_snapshot) {
            assignments = restoredState.assignments_snapshot;
        }
        if (restoredState.selections_snapshot) {
            mvpSelections = restoredState.selections_snapshot;
        }
        if (restoredState.estimates_snapshot) {
            measureEstimates = restoredState.estimates_snapshot;
        }

        // Save restored state to database
        await saveCurrentState();

        // Refresh UI
        if (currentMode === 'planning') {
            renderPlanningMode();
        } else if (currentMode === 'performance') {
            renderPerformanceEstimation();
        }
        updateStats();

        closeHistoryModal();

        statusEl.textContent = 'Version restored!';
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('Error restoring version:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-error';
    }
}

async function createSubgroups() {
    if (selectedSpecialties.size === 0) {
        alert('Please select at least one specialty to create subgroups');
        return;
    }

    // Create MVP assignments for selected specialties
    selectedSpecialties.forEach(specialty => {
        const recommendedMVP = mvpRecommendations[specialty];
        if (recommendedMVP) {
            const mvp = mvps.find(m => m.mvp_name === recommendedMVP);
            if (mvp) {
                if (!assignments[mvp.mvp_id]) {
                    assignments[mvp.mvp_id] = [];
                }
                // Assign clinicians of this specialty to the MVP
                clinicians.forEach(clinician => {
                    // Robust specialty matching - trim and case-insensitive
                    const specialtyMatches = clinician.specialty &&
                        clinician.specialty.trim().toLowerCase() === specialty.trim().toLowerCase();

                    if (specialtyMatches && !assignments[mvp.mvp_id].includes(clinician.npi)) {
                        assignments[mvp.mvp_id].push(clinician.npi);
                    }
                });
            }
        }
    });

    // Rebuild filters after creating assignments
    setupFilters();

    // Save to Supabase
    triggerAutoSave();

    // Switch to planning mode
    switchToMode('planning');
    alert(`Created ${Object.keys(assignments).length} MVP subgroups`);
}

// Performance Estimation with CORRECT decile calculation
function renderPerformanceEstimation() {
    const container = document.getElementById('performance-cards');
    if (!container) return;
    
    container.innerHTML = '';
    
    const activeMVPs = mvps.filter(mvp => 
        assignments[mvp.mvp_id]?.length > 0 && 
        mvpSelections[mvp.mvp_id]?.measures.length > 0
    );
    
    if (activeMVPs.length === 0) {
        container.innerHTML = '<div class="empty-state">Please assign clinicians and select measures for at least one MVP first.</div>';
        return;
    }
    
    activeMVPs.forEach(mvp => {
        const card = document.createElement('div');
        card.className = 'mvp-performance-card';
        
        let html = `
            <div class="mvp-performance-header">${mvp.mvp_name}</div>
            <div style="color: #586069; margin-bottom: 15px;">
                ${assignments[mvp.mvp_id].length} clinicians assigned
            </div>
        `;
        
        const selections = mvpSelections[mvp.mvp_id];
        if (selections && selections.measures.length > 0) {
            selections.measures.forEach(measureId => {
                const measure = measures.find(m => m.measure_id === measureId);
                if (!measure) return;
                
                // Get the actual median benchmark
                const config = selections.configs[measureId] || {};
                const collectionType = config.collectionType || 'MIPS CQM';
                const benchmark = benchmarks.find(b => 
                    b.measure_id === measureId && 
                    b.collection_type === collectionType
                );
                
                // Use decile_5 (50th percentile) as the median
                const medianBenchmark = benchmark?.decile_5 || benchmark?.median_performance || measure.median_benchmark || 75;
                
                const isInverse = benchmark?.is_inverse === 'Y' || benchmark?.is_inverse === 'Yes' || 
                                 measure.is_inverse === 'Y' || measure.is_inverse === 'Yes';
                
                html += `
                    <div class="measure-estimation">
                        <div class="measure-name">
                            ${measureId}: ${measure.measure_name}
                            ${isInverse ? '<span style="color: #dc3545; font-size: 11px;"> (Inverse)</span>' : ''}
                        </div>
                        <input type="number" 
                               class="estimation-input" 
                               min="0" max="100" step="0.01"
                               value="${measureEstimates[`${mvp.mvp_id}_${measureId}`] || ''}"
                               placeholder="Est %"
                               onchange="updateMeasureEstimate('${mvp.mvp_id}', '${measureId}', this.value)">
                        <div class="benchmark-value">Median: ${medianBenchmark.toFixed(2)}%</div>
                        <div id="score-${mvp.mvp_id}-${measureId}" class="score-value">--</div>
                    </div>
                `;
            });
        }
        
        html += `
            <div class="score-summary" id="mvp-score-${mvp.mvp_id}">
                <div style="font-size: 14px; color: #586069;">Total Points</div>
                <div class="composite-score">--</div>
            </div>
        `;
        
        card.innerHTML = html;
        container.appendChild(card);
        
        // Auto-calculate scores on load if there are estimates
        updateMVPTotalScore(mvp.mvp_id);
    });
}

function updateMeasureEstimate(mvpId, measureId, value) {
    const key = `${mvpId}_${measureId}`;
    measureEstimates[key] = parseFloat(value) || 0;

    // Calculate score using proper decile calculation
    const selections = mvpSelections[mvpId];
    const config = selections?.configs[measureId] || {};
    const decileInfo = calculateDecile(measureId, config.collectionType || 'MIPS CQM', parseFloat(value) || 0);

    const scoreEl = document.getElementById(`score-${mvpId}-${measureId}`);
    if (scoreEl) {
        scoreEl.textContent = `${decileInfo.points.toFixed(1)} pts`;
    }

    // Update MVP total score (sum, not average)
    updateMVPTotalScore(mvpId);

    // Auto-save to Supabase
    triggerAutoSave();
}

// CORRECT calculateDecile function from original
function calculateDecile(measureId, collectionType, performanceRate) {
    // Find the specific benchmark for this measure and collection type
    const benchmark = benchmarks.find(b => 
        b.measure_id === measureId && 
        b.collection_type === collectionType
    );
    
    if (!benchmark) {
        console.log(`No benchmark found for ${measureId} - ${collectionType}, using defaults`);
        // Fallback to simple calculation if no benchmark found
        if (performanceRate >= 95) return { decile: 10, points: 10.0 };
        if (performanceRate >= 90) return { decile: 9, points: 9.0 };
        if (performanceRate >= 85) return { decile: 8, points: 8.0 };
        if (performanceRate >= 80) return { decile: 7, points: 7.0 };
        if (performanceRate >= 75) return { decile: 6, points: 6.0 };
        if (performanceRate >= 70) return { decile: 5, points: 5.0 };
        if (performanceRate >= 60) return { decile: 4, points: 4.0 };
        if (performanceRate >= 50) return { decile: 3, points: 3.0 };
        if (performanceRate >= 40) return { decile: 2, points: 2.0 };
        return { decile: 1, points: 1.0 };
    }
    
    // Check if this is an inverse measure
    const measure = measures.find(m => m.measure_id === measureId);
    const isInverse = benchmark.is_inverse === 'Y' || benchmark.is_inverse === 'Yes' || 
                     benchmark.is_inverse === true || benchmark.is_inverse === 'TRUE' ||
                     measure?.is_inverse === 'Y' || measure?.is_inverse === 'Yes';
    
    let decile = 1;
    let points = 1.0;
    
    if (isInverse) {
        // INVERSE MEASURE: Lower is better
        if (performanceRate <= benchmark.decile_10) {
            decile = 10;
            points = 10.0;
        } else if (performanceRate <= benchmark.decile_9) {
            decile = 9;
            points = 9.0;
        } else if (performanceRate <= benchmark.decile_8) {
            decile = 8;
            points = 8.0;
        } else if (performanceRate <= benchmark.decile_7) {
            decile = 7;
            points = 7.0;
        } else if (performanceRate <= benchmark.decile_6) {
            decile = 6;
            points = 6.0;
        } else if (performanceRate <= benchmark.decile_5) {
            decile = 5;
            points = 5.0;
        } else if (performanceRate <= benchmark.decile_4) {
            decile = 4;
            points = 4.0;
        } else if (performanceRate <= benchmark.decile_3) {
            decile = 3;
            points = 3.0;
        } else if (performanceRate <= benchmark.decile_2) {
            decile = 2;
            points = 2.0;
        } else {
            decile = 1;
            points = 1.0;
        }
    } else {
        // NORMAL MEASURE: Higher is better
        if (performanceRate >= benchmark.decile_10) {
            decile = 10;
            points = 10.0;
        } else if (performanceRate >= benchmark.decile_9) {
            decile = 9;
            points = 9.0;
        } else if (performanceRate >= benchmark.decile_8) {
            decile = 8;
            points = 8.0;
        } else if (performanceRate >= benchmark.decile_7) {
            decile = 7;
            points = 7.0;
        } else if (performanceRate >= benchmark.decile_6) {
            decile = 6;
            points = 6.0;
        } else if (performanceRate >= benchmark.decile_5) {
            decile = 5;
            points = 5.0;
        } else if (performanceRate >= benchmark.decile_4) {
            decile = 4;
            points = 4.0;
        } else if (performanceRate >= benchmark.decile_3) {
            decile = 3;
            points = 3.0;
        } else if (performanceRate >= benchmark.decile_2) {
            decile = 2;
            points = 2.0;
        } else {
            decile = 1;
            points = 1.0;
        }
    }
    
    // Add fractional points within decile (optional, from original)
    if (decile < 10 && decile > 0) {
        try {
            const currentThreshold = benchmark[`decile_${decile}`];
            const nextThreshold = benchmark[`decile_${Math.min(decile + 1, 10)}`];
            
            if (currentThreshold !== undefined && nextThreshold !== undefined) {
                let progress;
                
                if (isInverse) {
                    if (decile === 1) {
                        progress = 0;
                    } else {
                        const worseThreshold = decile === 1 ? 100 : benchmark[`decile_${decile - 1}`] || 100;
                        progress = (worseThreshold - performanceRate) / (worseThreshold - currentThreshold);
                    }
                } else {
                    if (decile === 1) {
                        progress = performanceRate / currentThreshold;
                    } else {
                        const lowerThreshold = benchmark[`decile_${decile - 1}`] || 0;
                        progress = (performanceRate - lowerThreshold) / (currentThreshold - lowerThreshold);
                    }
                }
                
                if (progress > 0 && progress <= 1) {
                    points = (decile - 1) + Math.min(progress, 1) * 0.9 + 0.1;
                }
            }
        } catch (e) {
            console.log('Error calculating fractional points:', e);
        }
    }
    
    return { 
        decile: decile, 
        points: parseFloat(points.toFixed(1))
    };
}

function updateMVPTotalScore(mvpId) {
    const selections = mvpSelections[mvpId];
    if (!selections || selections.measures.length === 0) return;
    
    let totalPoints = 0;
    let count = 0;
    
    selections.measures.forEach(measureId => {
        const estimate = measureEstimates[`${mvpId}_${measureId}`];
        if (estimate !== undefined && estimate !== null) {
            const config = selections.configs[measureId] || {};
            const decileInfo = calculateDecile(measureId, config.collectionType || 'MIPS CQM', estimate);
            totalPoints += decileInfo.points;
            count++;
        }
    });
    
    // Display TOTAL points, not average
    const scoreEl = document.getElementById(`mvp-score-${mvpId}`);
    if (scoreEl) {
        scoreEl.innerHTML = `
            <div style="font-size: 14px; color: #586069;">Total Points (${count} measures)</div>
            <div class="composite-score">${totalPoints.toFixed(1)}</div>
        `;
    }
}

function calculateTotalScores() {
    // Calculate all MVP scores
    const activeMVPs = mvps.filter(mvp => 
        assignments[mvp.mvp_id]?.length > 0 && 
        mvpSelections[mvp.mvp_id]?.measures.length > 0
    );
    
    activeMVPs.forEach(mvp => {
        updateMVPTotalScore(mvp.mvp_id);
    });
    
    alert('Scores calculated! Review the total points for each MVP.');
}

// Executive Dashboard with readiness-based planning
function renderExecutiveDashboard() {
    // Create yearly plan based on measure readiness and setup time
    const mvpData = [];
    
    // Analyze each MVP's implementation complexity
    Object.keys(assignments).forEach(mvpId => {
        if (!assignments[mvpId] || assignments[mvpId].length === 0) return;
        
        let totalSetupMonths = 0;
        let avgReadiness = 0;
        let newMeasureCount = 0;
        let activatedMeasureCount = 0;
        let measureDetails = [];
        
        if (mvpSelections[mvpId] && mvpSelections[mvpId].measures.length > 0) {
            mvpSelections[mvpId].measures.forEach(measureId => {
                const measure = measures.find(m => m.measure_id === measureId);
                const config = measureConfigurations[`${mvpId}_${measureId}`] || {};
                
                const readiness = config.readiness || measure?.readiness || 3;
                const isActivated = measure?.is_activated === 'Y';
                
                // Parse setup time
                let setupMonths = 0;
                if (!isActivated) {
                    const setupTime = config.setupTime || measure?.setup_time || '3 months';
                    if (setupTime.includes('month')) {
                        setupMonths = parseInt(setupTime) || 3;
                    } else if (setupTime.includes('year')) {
                        setupMonths = parseInt(setupTime) * 12 || 12;
                    } else if (setupTime === '0' || setupTime === '0 months') {
                        setupMonths = 0;
                    } else {
                        setupMonths = 3; // default
                    }
                }
                
                measureDetails.push({
                    measureId: measureId,
                    readiness: readiness,
                    setupMonths: setupMonths,
                    isActivated: isActivated
                });
                
                if (isActivated) {
                    activatedMeasureCount++;
                } else {
                    newMeasureCount++;
                    totalSetupMonths += setupMonths;
                }
                
                avgReadiness += readiness;
            });
            
            avgReadiness = avgReadiness / mvpSelections[mvpId].measures.length;
        }
        
        mvpData.push({
            mvpId: mvpId,
            totalSetupMonths: totalSetupMonths,
            avgReadiness: avgReadiness,
            newMeasureCount: newMeasureCount,
            activatedMeasureCount: activatedMeasureCount,
            measureDetails: measureDetails,
            // Priority score: Lower setup time and higher readiness = higher priority
            priorityScore: (avgReadiness * 10) - (totalSetupMonths * 2)
        });
    });
    
    // Sort MVPs by priority (highest priority first)
    // Group 1: MVPs with all measures already activated (0 setup time)
    // Group 2: MVPs with mostly activated measures and high readiness
    // Group 3: Other MVPs by priority score
    mvpData.sort((a, b) => {
        // MVPs with 0 setup time (all measures activated) go first
        if (a.totalSetupMonths === 0 && b.totalSetupMonths > 0) return -1;
        if (b.totalSetupMonths === 0 && a.totalSetupMonths > 0) return 1;
        
        // Then MVPs with mostly activated measures (>50%) and high readiness
        const aActivatedRatio = a.activatedMeasureCount / (a.activatedMeasureCount + a.newMeasureCount);
        const bActivatedRatio = b.activatedMeasureCount / (b.activatedMeasureCount + b.newMeasureCount);
        
        if (aActivatedRatio > 0.5 && bActivatedRatio <= 0.5) return -1;
        if (bActivatedRatio > 0.5 && aActivatedRatio <= 0.5) return 1;
        
        // Then by priority score
        return b.priorityScore - a.priorityScore;
    });
    
    // Initialize yearly tracking
    const yearMVPs = {
        2026: { all: new Set(), new: new Set() },
        2027: { all: new Set(), new: new Set() },
        2028: { all: new Set(), new: new Set() },
        2029: { all: new Set(), new: new Set() },
        2030: { all: new Set(), new: new Set() }
    };

    const yearMeasures = {
        2026: { new: [], improve: [] },
        2027: { new: [], improve: [] },
        2028: { new: [], improve: [] },
        2029: { new: [], improve: [] },
        2030: { new: [], improve: [] }
    };

    const years = [2026, 2027, 2028, 2029, 2030];

    // Track when each MVP is introduced
    const mvpIntroductionYear = {};

    // Strategy: Distribute MVPs more evenly
    // Year 2026: Quick wins (0 setup MVPs) + 1-2 easy MVPs
    // Year 2027: 1-2 medium complexity MVPs
    // Year 2028: Continue adding MVPs if any remain
    // Year 2029: Final MVPs if any
    // Year 2030: Pure optimization (no new MVPs)

    let mvpIndex = 0;

    // Phase 1: Add MVPs with all measures already activated to 2026
    mvpData.forEach(mvp => {
        if (mvp.totalSetupMonths === 0 && mvp.newMeasureCount === 0) {
            mvpIntroductionYear[mvp.mvpId] = 2026;
            yearMVPs[2026].new.add(mvp.mvpId);

            // Add all its measures as "improve" measures
            mvp.measureDetails.forEach(m => {
                yearMeasures[2026].improve.push({
                    mvpId: mvp.mvpId,
                    measureId: m.measureId,
                    isActivated: true
                });
            });
            mvpIndex++;
        }
    });

    // Phase 2: Distribute remaining MVPs across 2026-2029 (not 2030!)
    // Calculate how many MVPs per year
    const remainingMVPs = mvpData.filter(mvp => !mvpIntroductionYear[mvp.mvpId]);
    const mvpsPerYear = Math.max(1, Math.ceil(remainingMVPs.length / 4)); // Spread over 4 years max

    let currentYear = 2026;
    let mvpsAddedThisYear = yearMVPs[2026].new.size; // Count already added MVPs

    remainingMVPs.forEach(mvp => {
        // Move to next year if we've added enough MVPs this year
        if (mvpsAddedThisYear >= mvpsPerYear && currentYear < 2029) {
            currentYear++;
            mvpsAddedThisYear = 0;
        }

        // Don't add new MVPs in 2030 - that's optimization year only
        if (currentYear >= 2030) {
            currentYear = 2029; // Put any remaining in 2029
        }
        
        mvpIntroductionYear[mvp.mvpId] = currentYear;
        yearMVPs[currentYear].new.add(mvp.mvpId);
        
        // Add measures for this MVP
        mvp.measureDetails.forEach(m => {
            if (m.isActivated) {
                yearMeasures[currentYear].improve.push({
                    mvpId: mvp.mvpId,
                    measureId: m.measureId,
                    isActivated: true
                });
            } else {
                yearMeasures[currentYear].new.push({
                    mvpId: mvp.mvpId,
                    measureId: m.measureId,
                    setupMonths: m.setupMonths,
                    readiness: m.readiness,
                    isActivated: false
                });
            }
        });
        
        mvpsAddedThisYear++;
    });
    
    // Build cumulative MVP lists and propagate improvement measures
    let cumulativeMVPs = new Set();
    years.forEach(year => {
        // Add new MVPs for this year
        yearMVPs[year].new.forEach(mvpId => {
            cumulativeMVPs.add(mvpId);
        });
        // All cumulative MVPs are active
        yearMVPs[year].all = new Set(cumulativeMVPs);
        
        // For continuing MVPs, add their measures to improvement list
        cumulativeMVPs.forEach(mvpId => {
            if (!yearMVPs[year].new.has(mvpId)) {
                // This is a continuing MVP
                const mvp = mvpData.find(m => m.mvpId === mvpId);
                if (mvp) {
                    mvp.measureDetails.forEach(m => {
                        // Check if this measure is already in new or improve lists
                        const isInNew = yearMeasures[year].new.some(nm => 
                            nm.mvpId === mvpId && nm.measureId === m.measureId
                        );
                        const isInImprove = yearMeasures[year].improve.some(im => 
                            im.mvpId === mvpId && im.measureId === m.measureId
                        );
                        
                        if (!isInNew && !isInImprove) {
                            yearMeasures[year].improve.push({
                                mvpId: mvpId,
                                measureId: m.measureId,
                                isActivated: true
                            });
                        }
                    });
                }
            }
        });
    });
    
    // Update yearlyPlan
    Object.keys(yearlyPlan).forEach(year => {
        yearlyPlan[year].mvps = Array.from(yearMVPs[year].all);
        yearlyPlan[year].newMvps = Array.from(yearMVPs[year].new);
        yearlyPlan[year].newMeasures = [...new Set(yearMeasures[year].new.map(item => item.measureId))];
        yearlyPlan[year].improveMeasures = [...new Set(yearMeasures[year].improve.map(item => item.measureId))];
        
        // Update focus based on what's happening that year
        if (year == 2026) {
            yearlyPlan[year].focus = 'Foundation - Quick wins and high readiness measures';
        } else if (year == 2027) {
            yearlyPlan[year].focus = 'Expansion - Add specialty MVPs';
        } else if (year == 2028) {
            yearlyPlan[year].focus = 'Integration - Cross-specialty coordination';
        } else if (year == 2029) {
            yearlyPlan[year].focus = 'Optimization - Performance improvement';
        } else if (year == 2030) {
            if (yearMVPs[year].new.size === 0) {
                yearlyPlan[year].focus = 'Excellence - Full optimization and continuous improvement';
            } else {
                yearlyPlan[year].focus = 'Excellence - Full MVP implementation';
            }
        }
    });

    selectYear(2026);
}

function selectYear(year) {
    currentYear = year;
    
    // Update active state
    document.querySelectorAll('.year-item').forEach(item => {
        item.classList.remove('active');
        if (item.querySelector('.year-number').textContent == year) {
            item.classList.add('active');
        }
    });
    
    // Render year details
    const detailsContainer = document.getElementById('year-details');
    const plan = yearlyPlan[year];
    
    let html = '';
    html += '<div class="year-details">';
    html += '<h3>Year ' + year + ' Implementation Plan</h3>';
    html += '<p style="color: #586069; margin-bottom: 20px;">';
    html += '<strong>Focus:</strong> ' + plan.focus;
    html += '</p>';
    
    html += '<div class="implementation-grid">';
    
    // All Active MVPs card
    html += '<div class="implementation-card">';
    html += '<h4>All Active MVPs (' + plan.mvps.length + ')</h4>';
    html += '<ul style="list-style: none; padding: 0;">';
    
    plan.mvps.forEach(function(mvpId) {
        const mvp = mvps.find(m => m.mvp_id === mvpId);
        if (mvp) {
            const isNew = plan.newMvps && plan.newMvps.includes(mvpId);
            html += '<li style="padding: 5px 0;' + (isNew ? ' font-weight: 600;' : '') + '">';
            html += mvp.mvp_name;
            if (isNew) {
                html += '<span style="color: #28a745; font-size: 12px; margin-left: 8px;">NEW</span>';
            }
            html += '</li>';
        }
    });
    
    html += '</ul>';
    html += '</div>';
    
    // New Measures to Implement card
    html += '<div class="implementation-card">';
    html += '<h4>New Measures to Implement (' + (plan.newMeasures ? plan.newMeasures.length : 0) + ')</h4>';
    
    if (plan.newMeasures && plan.newMeasures.length > 0) {
        html += '<ul style="list-style: none; padding: 0;">';
        
        const displayMeasures = plan.newMeasures.slice(0, 3);
        displayMeasures.forEach(function(measureId) {
            const measure = measures.find(m => m.measure_id === measureId);
            if (measure) {
                // Find configuration
                let readiness = 3;
                const mvpMeasureKey = Object.keys(measureConfigurations).find(k => k.includes(measureId));
                if (mvpMeasureKey) {
                    const config = measureConfigurations[mvpMeasureKey];
                    if (config && config.readiness) {
                        readiness = config.readiness;
                    } else if (measure.readiness) {
                        readiness = measure.readiness;
                    }
                } else if (measure.readiness) {
                    readiness = measure.readiness;
                }
                
                html += '<li style="padding: 5px 0;">';
                html += measureId + ': ' + measure.measure_name;
                html += '<span style="font-size: 12px; color: #586069;"> (Readiness: ' + readiness + '/5)</span>';
                html += '</li>';
            }
        });
        
        if (plan.newMeasures.length > 3) {
            html += '<li style="padding: 5px 0; font-style: italic; color: #004877; cursor: pointer;" ';
            html += 'onclick="showMeasureDetails(\'' + year + '\', \'new\')">';
            html += '... and ' + (plan.newMeasures.length - 3) + ' more (click to view all)';
            html += '</li>';
        }
        
        html += '</ul>';
    } else {
        html += '<p style="color: #586069; font-size: 14px;">No new measures this year</p>';
    }
    
    html += '</div>';
    
    // Measures to Improve card
    html += '<div class="implementation-card">';
    html += '<h4>Measures to Improve (' + (plan.improveMeasures ? plan.improveMeasures.length : 0) + ')</h4>';
    
    if (plan.improveMeasures && plan.improveMeasures.length > 0) {
        html += '<ul style="list-style: none; padding: 0;">';
        
        const displayImprove = plan.improveMeasures.slice(0, 3);
        displayImprove.forEach(function(measureId) {
            const measure = measures.find(m => m.measure_id === measureId);
            if (measure) {
                html += '<li style="padding: 5px 0; color: #586069;">';
                html += measureId + ': ' + measure.measure_name;
                html += '</li>';
            }
        });
        
        if (plan.improveMeasures.length > 3) {
            html += '<li style="padding: 5px 0; font-style: italic; color: #004877; cursor: pointer;" ';
            html += 'onclick="showMeasureDetails(\'' + year + '\', \'improve\')">';
            html += '... and ' + (plan.improveMeasures.length - 3) + ' more (click to view all)';
            html += '</li>';
        }
        
        html += '</ul>';
    } else {
        html += '<p style="color: #586069; font-size: 14px;">No existing measures to improve</p>';
    }
    
    html += '</div>';
    html += '</div>';
    
    // Key Milestones
    html += '<div class="implementation-grid" style="margin-top: 20px;">';
    html += '<div class="implementation-card" style="grid-column: span 3;">';
    html += '<h4>Key Milestones for ' + year + '</h4>';
    html += '<ul style="list-style: none; padding: 0;">';
    
    if (plan.newMeasures && plan.newMeasures.length > 0) {
        html += '<li style="padding: 5px 0;">Q1: Implement all new measures (' + plan.newMeasures.length + ' total)</li>';
        html += '<li style="padding: 5px 0;">Q2: Performance improvement on existing measures</li>';
    } else if (plan.improveMeasures && plan.improveMeasures.length > 0) {
        html += '<li style="padding: 5px 0;">Q1-Q2: Continuous performance improvement on existing measures</li>';
    }
    
    html += '<li style="padding: 5px 0;">Q3: Review updates to available measures and MVPs for ' + (year + 1) + '</li>';
    html += '<li style="padding: 5px 0;">Q4: Review new clinicians, update groupings, and incorporate new data elements</li>';
    html += '</ul>';
    html += '</div>';
    html += '</div>';
    
    html += '</div>';
    
    detailsContainer.innerHTML = html;
}

// Switch between major modes
function switchToMode(mode) {
    console.log('Switching to mode:', mode);

    // Auto-save current TIN data before switching modes
    saveTINSpecificData();

    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Find and activate the correct tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.textContent.toLowerCase().includes(mode.replace('-', ' '))) {
            tab.classList.add('active');
        }
    });
    
    // Hide all modes
    document.getElementById('tin-analysis').style.display = 'none';
    document.getElementById('planning-mode').style.display = 'none';
    document.getElementById('review-mode').style.display = 'none';
    document.getElementById('performance-estimation').style.display = 'none';
    document.getElementById('executive-dashboard').style.display = 'none';
    
    // Show selected mode
    switch(mode) {
        case 'tin-analysis':
            document.getElementById('tin-analysis').style.display = 'block';
            renderTINAnalysis();
            break;
        case 'planning':
            document.getElementById('planning-mode').style.display = 'block';
            renderPlanningMode();
            break;
        case 'performance':
            document.getElementById('performance-estimation').style.display = 'block';
            renderPerformanceEstimation();
            break;
        case 'executive':
            document.getElementById('executive-dashboard').style.display = 'block';
            renderExecutiveDashboard();
            break;
    }
    
    currentMode = mode;
}

// Enhanced measure configuration with collection type selector
function renderEnhancedMeasuresTab(mvp) {
    const container = document.getElementById('mvp-details');
    if (!container) return;
    
    const selections = mvpSelections[mvp.mvp_id] || { measures: [], configs: {} };
    const availableMeasureIds = mvp.available_measures ? 
        mvp.available_measures.split(',').map(m => m.trim()) : [];
    
    if (availableMeasureIds.length === 0) {
        container.innerHTML = `
            <h3>${mvp.mvp_name}</h3>
            <p class="empty-state">No measures configured for this MVP.</p>
        `;
        return;
    }
    
    let html = `
        <h3>${mvp.mvp_name} - Measure Selection</h3>
        <p class="measure-requirement">Select exactly 4 measures. ${selections.measures.length}/4 selected.</p>
        <div class="measures-grid">
    `;
    
    availableMeasureIds.forEach(measureId => {
        const measure = measures.find(m => m.measure_id === measureId);
        if (!measure) {
            console.warn(`Measure not found: "${measureId}". Available IDs sample:`, measures.slice(0, 5).map(m => m.measure_id));
            return;
        }

        const isSelected = selections.measures.includes(measureId);
        const isActivated = measure.is_activated === 'Y';
        const config = measureConfigurations[`${mvp.mvp_id}_${measureId}`] || {};
        const availableTypes = measure.collection_types ? 
            measure.collection_types.split(',').map(t => t.trim()) : ['MIPS CQM'];
        
        // Get actual median benchmark
        const benchmark = benchmarks.find(b => 
            b.measure_id === measureId && 
            b.collection_type === (config.collectionType || availableTypes[0])
        );
        // Decile 5 is the median (50th percentile)
        const medianBenchmark = benchmark?.decile_5 || measure.median_benchmark || 75;
        
        const isInverse = benchmark?.is_inverse === 'Y' || measure.is_inverse === 'Y';
        
        html += `
            <div class="measure-card ${isSelected ? 'selected' : ''} ${isActivated ? 'activated' : ''}">
                <label>
                    <input type="checkbox" 
                           value="${measureId}"
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleMeasure('${mvp.mvp_id}', '${measureId}')">
                    <div class="measure-content">
                        <div class="measure-header">
                            <span class="measure-id">${measureId}</span>
                            <span class="measure-name">${measure.measure_name}</span>
                        </div>
                        <div class="measure-meta">
                            <span class="collection-types">Available: ${availableTypes.join(', ')}</span>
                            <span class="difficulty difficulty-${(measure.difficulty || 'Medium').toLowerCase()}">
                                ${measure.difficulty || 'Medium'}
                            </span>
                        </div>
                        ${isActivated ? '<span class="badge activated">Already Activated</span>' : '<span class="badge new">New Measure</span>'}
                        ${isInverse ? '<span class="badge inverse">Inverse Measure</span>' : ''}
                        <div style="margin-top: 8px; font-size: 12px; color: #586069;">
                            Median Benchmark: ${medianBenchmark.toFixed(2)}%
                        </div>
                    </div>
                </label>
                ${isSelected ? `
                    <div class="measure-config">
                        ${availableTypes.length > 1 ? `
                            <div class="config-item">
                                <label class="config-label">Collection Type</label>
                                <select class="config-select" onchange="setCollectionType('${mvp.mvp_id}', '${measureId}', this.value)">
                                    ${availableTypes.map(type => 
                                        `<option value="${type}" ${selections.configs[measureId]?.collectionType === type ? 'selected' : ''}>${type}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        ` : ''}
                        <div class="config-item">
                            <label class="config-label">Setup Time</label>
                            <input type="text" class="config-input" 
                                   value="${config.setupTime || measure.setup_time || '3 months'}"
                                   onchange="updateMeasureConfig('${mvp.mvp_id}', '${measureId}', 'setupTime', this.value)">
                        </div>
                        <div class="config-item">
                            <label class="config-label">Readiness (1-5)</label>
                            <div class="readiness-scale">
                                ${[1,2,3,4,5].map(r => `
                                    <button class="readiness-btn ${(config.readiness || measure.readiness) == r ? 'selected' : ''}"
                                            onclick="updateMeasureConfig('${mvp.mvp_id}', '${measureId}', 'readiness', ${r})">
                                        ${r}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="config-item full-width">
                            <label class="config-label">Prerequisites/Dependencies</label>
                            <textarea class="config-textarea"
                                      onchange="updateMeasureConfig('${mvp.mvp_id}', '${measureId}', 'prerequisites', this.value)">${config.prerequisites || measure.prerequisites || ''}</textarea>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Keep all other functions from original (setupInterface, renderPlanningMode, etc.)
function setupInterface() {
    setupFilters();
    setupEventHandlers();
}

function setupFilters() {
    // Get all assigned clinician NPIs
    const assignedNPIs = new Set();
    Object.values(assignments).forEach(npis => {
        npis.forEach(npi => assignedNPIs.add(npi));
    });

    // Filter to only unassigned clinicians
    const unassignedClinicians = clinicians.filter(c => !assignedNPIs.has(c.npi));

    // Get unique specialties from unassigned clinicians only and trim/normalize them
    const specialties = [...new Set(unassignedClinicians.map(c => c.specialty ? c.specialty.trim() : ''))]
        .filter(s => s && s !== 'Unknown')
        .sort();

    const filterContainer = document.getElementById('filter-container');
    if (!filterContainer) return;

    const mvpOptions = mvps.map(mvp =>
        `<option value="${mvp.mvp_id}">${mvp.mvp_name}</option>`
    ).join('');

    filterContainer.innerHTML = `
        <div class="filter-row">
            <input type="text" id="search-box" placeholder="Search by name or NPI..." onkeyup="filterClinicians()">
            <select id="specialty-filter" onchange="filterClinicians()">
                <option value="">All Specialties (${unassignedClinicians.length})</option>
                ${specialties.map(s => {
                    const count = unassignedClinicians.filter(c => c.specialty && c.specialty.trim() === s).length;
                    return `<option value="${s}">${s} (${count})</option>`;
                }).join('')}
            </select>
            <button onclick="selectAllVisible()" class="btn-select">Select All</button>
            <button onclick="clearSelection()" class="btn-clear">Clear Selection</button>
            <div class="assignment-controls">
                <select id="mvp-selector">
                    <option value="">Choose MVP...</option>
                    ${mvpOptions}
                </select>
                <button onclick="assignSelectedToMVP()" class="btn-assign">Assign Selected</button>
            </div>
        </div>
        <div class="scenario-controls">
            <span style="font-weight: 500; margin-right: 10px;">Scenario:</span>
            <select id="scenario-selector">
                <option value="Default">Default Scenario</option>
                ${Object.keys(savedScenarios).map(name =>
                    name !== 'Default' ? `<option value="${name}">${name}</option>` : ''
                ).join('')}
                <option value="new">+ Create New Scenario</option>
            </select>
            <button onclick="saveScenario()" class="btn-save" title="Save current scenario">Save</button>
            <button onclick="saveAsNewScenario()" class="btn-save-as" title="Save as new scenario">Save As...</button>
            <button onclick="deleteScenario()" class="btn-reset" title="Delete current scenario">Delete</button>
        </div>
    `;

    // Set the current scenario in the dropdown and add event listener
    const selector = document.getElementById('scenario-selector');
    if (selector) {
        if (currentScenarioName) {
            selector.value = currentScenarioName;
        }
        // Add event listener programmatically (more reliable than inline onchange)
        selector.addEventListener('change', function() {
            loadScenario(this.value);
        });
    }
}

function renderPlanningMode() {
    currentMode = 'planning';
    
    const planningEl = document.getElementById('planning-mode');
    const reviewEl = document.getElementById('review-mode');
    
    if (planningEl) planningEl.style.display = 'block';
    if (reviewEl) reviewEl.style.display = 'none';
    
    renderClinicians();
    renderMVPs();
    renderDetails();
}

function renderClinicians() {
    const container = document.getElementById('clinician-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const unassigned = clinicians.filter(c => !isClinicianAssigned(c.npi));
    
    if (unassigned.length === 0) {
        container.innerHTML = '<div class="empty-state">All clinicians assigned!</div>';
        return;
    }
    
    unassigned.forEach(clinician => {
        const div = document.createElement('div');
        div.className = 'clinician-item';
        if (selectedClinicians.has(clinician.npi)) {
            div.classList.add('selected');
        }
        div.dataset.npi = clinician.npi;
        
        div.innerHTML = `
            <input type="checkbox" 
                   ${selectedClinicians.has(clinician.npi) ? 'checked' : ''} 
                   onclick="event.stopPropagation(); toggleSelection('${clinician.npi}')">
            <div class="clinician-info">
                <strong>${clinician.name}</strong>
                <small>${clinician.specialty}</small>
                <small class="npi">NPI: ${clinician.npi}</small>
            </div>
        `;
        
        div.onclick = () => toggleSelection(clinician.npi);
        container.appendChild(div);
    });
}

function renderMVPs() {
    const container = document.getElementById('mvp-cards');
    if (!container) return;

    container.innerHTML = '';

    const activeMVPs = mvps.filter(mvp => assignments[mvp.mvp_id]?.length > 0);
    
    if (activeMVPs.length === 0) {
        container.innerHTML = `
            <div class="empty-mvp-state">
                <h3>No Active MVPs</h3>
                <p>Select clinicians and assign them to an MVP using the dropdown above.</p>
                <p>Or go to TIN Analysis to auto-create subgroups.</p>
            </div>
        `;
        return;
    }
    
    activeMVPs.forEach(mvp => {
        const assigned = assignments[mvp.mvp_id] || [];
        const selections = mvpSelections[mvp.mvp_id];
        
        const div = document.createElement('div');
        div.className = 'mvp-card';
        if (currentMVP === mvp.mvp_id) {
            div.classList.add('active');
        }
        div.onclick = () => selectMVP(mvp.mvp_id);
        
        div.innerHTML = `
            <h4>${mvp.mvp_name}</h4>
            <div class="mvp-meta">
                <span>Clinicians: ${assigned.length}</span>
                ${selections ? `<span>Measures: ${selections.measures.length}/4</span>` : ''}
            </div>
            <div class="mvp-specialties">${mvp.specialties}</div>
            <div class="mvp-clinician-list">
                ${assigned.slice(0, 3).map(npi => {
                    const c = clinicians.find(cl => cl.npi === npi);
                    return c ? `<div class="mini-clinician">${c.name}</div>` : '';
                }).join('')}
                ${assigned.length > 3 ? `<div class="more">+${assigned.length - 3} more</div>` : ''}
            </div>
            <button onclick="event.stopPropagation(); removeAllFromMVP('${mvp.mvp_id}')" class="remove-mvp">Remove All</button>
        `;
        
        container.appendChild(div);
    });
}

function renderDetails() {
    if (!currentMVP) {
        const measuresEl = document.getElementById('mvp-details');
        const cliniciansEl = document.getElementById('clinicians-details');
        
        if (measuresEl) measuresEl.innerHTML = '<div class="empty-state">Select an MVP to configure</div>';
        if (cliniciansEl) cliniciansEl.innerHTML = '<div class="empty-state">Select an MVP to view clinicians</div>';
        return;
    }
    
    const mvp = mvps.find(m => m.mvp_id === currentMVP);
    if (!mvp) return;
    
    renderEnhancedMeasuresTab(mvp);
    renderCliniciansTab(mvp);
}

function renderCliniciansTab(mvp) {
    const container = document.getElementById('clinicians-details');
    if (!container) return;
    
    const assigned = assignments[mvp.mvp_id] || [];
    
    let html = `
        <h3>Assigned Clinicians (${assigned.length})</h3>
        <div class="clinician-table">
    `;
    
    assigned.forEach(npi => {
        const clinician = clinicians.find(c => c.npi === npi);
        if (!clinician) return;
        
        html += `
            <div class="clinician-row">
                <div>${clinician.name}</div>
                <div>${clinician.specialty}</div>
                <div>${clinician.npi}</div>
                <button onclick="removeFromMVP('${npi}', '${mvp.mvp_id}')" class="btn-remove">Remove</button>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Update measure configuration
function updateMeasureConfig(mvpId, measureId, field, value) {
    const key = `${mvpId}_${measureId}`;
    if (!measureConfigurations[key]) {
        measureConfigurations[key] = {};
    }
    measureConfigurations[key][field] = value;
    
    // Update UI if needed
    if (field === 'readiness') {
        document.querySelectorAll(`.readiness-btn`).forEach(btn => {
            const btnValue = parseInt(btn.textContent);
            if (btn.onclick.toString().includes(measureId)) {
                btn.classList.toggle('selected', btnValue === value);
            }
        });
    }
}

// Helper functions
function toggleSelection(npi) {
    if (selectedClinicians.has(npi)) {
        selectedClinicians.delete(npi);
    } else {
        selectedClinicians.add(npi);
    }
    renderClinicians();
    filterClinicians();
}

function selectAllVisible() {
    const searchTerm = document.getElementById('search-box')?.value.toLowerCase() || '';
    const specialty = document.getElementById('specialty-filter')?.value || '';

    const unassigned = clinicians.filter(c => !isClinicianAssigned(c.npi));

    unassigned.forEach(clinician => {
        const matchesSearch = !searchTerm ||
            clinician.name.toLowerCase().includes(searchTerm) ||
            clinician.npi.includes(searchTerm);

        // More robust specialty matching - trim and case-insensitive
        const matchesSpecialty = !specialty ||
            (clinician.specialty && clinician.specialty.trim().toLowerCase() === specialty.trim().toLowerCase());

        if (matchesSearch && matchesSpecialty) {
            selectedClinicians.add(clinician.npi);
        }
    });

    renderClinicians();
    filterClinicians();
}

function clearSelection() {
    selectedClinicians.clear();
    
    // Reset search filters
    const searchBox = document.getElementById('search-box');
    const specialtyFilter = document.getElementById('specialty-filter');
    if (searchBox) searchBox.value = '';
    if (specialtyFilter) specialtyFilter.value = '';
    
    // Re-render to show only unassigned clinicians
    renderClinicians();
    filterClinicians();
}

function filterClinicians() {
    const searchTerm = document.getElementById('search-box')?.value.toLowerCase() || '';
    const specialty = document.getElementById('specialty-filter')?.value || '';

    // Get all assigned clinician NPIs
    const assignedNPIs = new Set();
    Object.values(assignments).forEach(npis => {
        npis.forEach(npi => assignedNPIs.add(npi));
    });

    const items = document.querySelectorAll('.clinician-item');
    let visibleCount = 0;

    items.forEach(item => {
        const clinician = clinicians.find(c => c.npi === item.dataset.npi);
        if (!clinician) return;

        // Hide if already assigned
        const isAssigned = assignedNPIs.has(clinician.npi);

        const matchesSearch = !searchTerm ||
            clinician.name.toLowerCase().includes(searchTerm) ||
            clinician.npi.includes(searchTerm);

        // More robust specialty matching - trim and case-insensitive
        const matchesSpecialty = !specialty ||
            (clinician.specialty && clinician.specialty.trim().toLowerCase() === specialty.trim().toLowerCase());

        // Show only if matches filters and not assigned
        const shouldShow = matchesSearch && matchesSpecialty && !isAssigned;
        item.style.display = shouldShow ? 'flex' : 'none';

        if (shouldShow) visibleCount++;
    });
}

function assignSelectedToMVP() {
    const mvpId = document.getElementById('mvp-selector')?.value;

    if (!mvpId) {
        alert('Please select an MVP from the dropdown');
        return;
    }

    if (selectedClinicians.size === 0) {
        alert('Please select clinicians to assign');
        return;
    }

    if (!assignments[mvpId]) {
        assignments[mvpId] = [];
    }

    selectedClinicians.forEach(npi => {
        // Remove from any other MVP
        for (let id in assignments) {
            assignments[id] = assignments[id].filter(n => n !== npi);
        }
        // Add to selected MVP
        assignments[mvpId].push(npi);
    });

    selectedClinicians.clear();
    setupFilters();
    renderClinicians();
    renderMVPs();
    updateStats();
    filterClinicians();

    // Auto-save to Supabase
    triggerAutoSave();
}

function selectMVP(mvpId) {
    currentMVP = mvpId;
    renderMVPs();
    renderDetails();
}

function removeAllFromMVP(mvpId) {
    if (confirm('Remove all clinicians from this MVP?')) {
        delete assignments[mvpId];
        delete mvpSelections[mvpId];
        delete mvpPerformance[mvpId];

        // Clear measure configurations for this MVP
        Object.keys(measureConfigurations).forEach(key => {
            if (key.startsWith(mvpId)) {
                delete measureConfigurations[key];
            }
        });

        if (currentMVP === mvpId) {
            currentMVP = null;
        }

        setupFilters();
        renderClinicians();
        renderMVPs();
        renderDetails();
        updateStats();

        // Auto-save to Supabase
        triggerAutoSave();
    }
}

function removeFromMVP(npi, mvpId) {
    assignments[mvpId] = assignments[mvpId].filter(n => n !== npi);

    if (assignments[mvpId].length === 0) {
        delete assignments[mvpId];
        delete mvpSelections[mvpId];

        if (currentMVP === mvpId) {
            currentMVP = null;
        }
    }

    setupFilters();
    renderClinicians();
    renderMVPs();
    renderDetails();
    updateStats();

    // Auto-save to Supabase
    triggerAutoSave();
}

function toggleMeasure(mvpId, measureId) {
    if (!mvpSelections[mvpId]) {
        mvpSelections[mvpId] = { measures: [], configs: {} };
    }
    
    const selections = mvpSelections[mvpId];
    const index = selections.measures.indexOf(measureId);
    
    if (index === -1) {
        // Allow selecting more than 4 measures but keep UI text saying 4/4
        // if (selections.measures.length >= 4) {
        //     alert('You can only select 4 measures per MVP');
        //     event.target.checked = false;
        //     return;
        // }
        
        const measure = measures.find(m => m.measure_id === measureId);
        const availableTypes = measure?.collection_types ? 
            measure.collection_types.split(',').map(t => t.trim()) : ['MIPS CQM'];
        
        selections.measures.push(measureId);
        selections.configs[measureId] = {
            collectionType: availableTypes[0],
            difficulty: measure?.difficulty || 'Medium'
        };
    } else {
        selections.measures.splice(index, 1);
        delete selections.configs[measureId];
        delete measureConfigurations[`${mvpId}_${measureId}`];
    }

    renderDetails();

    // Auto-save to Supabase
    triggerAutoSave();
}

function setCollectionType(mvpId, measureId, value) {
    if (!mvpSelections[mvpId]) {
        mvpSelections[mvpId] = { measures: [], configs: {} };
    }

    if (!mvpSelections[mvpId].configs[measureId]) {
        mvpSelections[mvpId].configs[measureId] = {};
    }

    mvpSelections[mvpId].configs[measureId].collectionType = value;
    console.log(`Set ${measureId} to ${value} for MVP ${mvpId}`);

    // Re-render to update benchmark display
    renderDetails();

    // Auto-save to Supabase
    triggerAutoSave();
}

// Scenario Management (Supabase-enabled)
async function saveScenario() {
    if (!currentOrganization) {
        alert('Please select an organization first');
        return;
    }

    // Don't allow saving over Default scenario
    if (currentScenarioName === 'Default') {
        const name = prompt('Default scenario cannot be modified. Enter a name for a new scenario:', 'Scenario ' + (Object.keys(savedScenarios).length + 1));
        if (!name || name.trim() === '') return;

        currentScenarioName = name.trim();

        // Update dropdown to show new scenario
        updateScenarioDropdown();
        const selector = document.getElementById('scenario-selector');
        if (selector) selector.value = currentScenarioName;
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = 'Saving scenario...';
    statusEl.className = 'status-loading';
    statusEl.style.display = 'block';

    try {
        // Save to Supabase
        const scenarioData = {
            assignments_snapshot: assignments,
            selections_snapshot: mvpSelections,
            estimates_snapshot: measureEstimates,
            yearly_plan_snapshot: yearlyPlan
        };

        await window.db.saveScenario(
            currentOrganization.id,
            currentScenarioName,
            `Scenario saved at ${new Date().toLocaleString()}`,
            scenarioData,
            currentUser?.id
        );

        // Also create a version snapshot for history
        await window.db.createVersionSnapshot(
            currentOrganization.id,
            `Scenario: ${currentScenarioName}`,
            'Saved scenario',
            {
                assignments_snapshot: assignments,
                selections_snapshot: mvpSelections,
                estimates_snapshot: measureEstimates,
                yearly_plan_snapshot: yearlyPlan
            },
            currentUser?.id,
            'scenario_save'
        );

        // Update local cache
        savedScenarios[currentScenarioName] = {
            name: currentScenarioName,
            ...scenarioData
        };

        statusEl.textContent = `Scenario "${currentScenarioName}" saved!`;
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);

        // Refresh the scenario dropdown
        updateScenarioDropdown();

    } catch (error) {
        console.error('Error saving scenario:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-error';
    }
}

function saveAsNewScenario() {
    const name = prompt('Enter a name for this scenario:', 'Scenario ' + (Object.keys(savedScenarios).length + 1));
    if (!name || name.trim() === '') return;
    
    currentScenarioName = name.trim();
    saveScenario();
    
    // Update the dropdown to show and select the new scenario
    updateScenarioDropdown();
    document.getElementById('scenario-selector').value = currentScenarioName;
}

async function loadScenario(name) {
    if (!name || name === '') return;

    if (name === 'new') {
        // Create a new blank scenario
        createNewScenario();
        return;
    }

    const defaultYearlyPlan = {
        2026: { mvps: [], measures: [], focus: 'Foundation - High readiness measures' },
        2027: { mvps: [], measures: [], focus: 'Expansion - Add specialty MVPs' },
        2028: { mvps: [], measures: [], focus: 'Integration - Cross-specialty coordination' },
        2029: { mvps: [], measures: [], focus: 'Optimization - Performance improvement' },
        2030: { mvps: [], measures: [], focus: 'Excellence - Full MVP implementation' }
    };

    // Default scenario is always blank
    if (name === 'Default') {
        currentScenarioName = 'Default';
        assignments = {};
        mvpSelections = {};
        mvpPerformance = {};
        measureEstimates = {};
        measureConfigurations = {};
        selectedClinicians.clear();
        selectedSpecialties.clear();
        currentMVP = null;
        yearlyPlan = { ...defaultYearlyPlan };
    } else if (savedScenarios[name]) {
        const scenario = savedScenarios[name];
        currentScenarioName = name;

        // Handle both old format (assignments) and new format (assignments_snapshot)
        assignments = scenario.assignments_snapshot || scenario.assignments || {};
        mvpSelections = scenario.selections_snapshot || scenario.selections || {};
        mvpPerformance = scenario.performance || {};
        measureEstimates = scenario.estimates_snapshot || scenario.measureEstimates || {};
        measureConfigurations = scenario.measureConfigurations || {};
        yearlyPlan = scenario.yearly_plan_snapshot || scenario.yearlyPlan || { ...defaultYearlyPlan };

        if (scenario.tinNumber) {
            updateTINNumber(scenario.tinNumber);
        }
    } else {
        // Try to load from Supabase
        if (currentOrganization) {
            try {
                const scenario = await window.db.loadScenario(currentOrganization.id, name);
                if (scenario) {
                    currentScenarioName = name;
                    assignments = scenario.assignments_snapshot || {};
                    mvpSelections = scenario.selections_snapshot || {};
                    measureEstimates = scenario.estimates_snapshot || {};
                    yearlyPlan = scenario.yearly_plan_snapshot || { ...defaultYearlyPlan };
                } else {
                    alert('Scenario not found');
                    return;
                }
            } catch (error) {
                console.error('Error loading scenario:', error);
                alert('Error loading scenario');
                return;
            }
        } else {
            alert('Scenario not found');
            return;
        }
    }

    // Rebuild filters after loading scenario
    setupFilters();

    // Refresh the current view
    if (currentMode === 'tin-analysis') {
        renderTINAnalysis();
    } else if (currentMode === 'planning') {
        renderPlanningMode();
    } else if (currentMode === 'performance') {
        renderPerformanceEstimation();
    } else if (currentMode === 'executive') {
        renderExecutiveDashboard();
    }

    updateStats();
}

function createNewScenario() {
    const name = prompt('Enter a name for the new scenario:', 'Scenario ' + (Object.keys(savedScenarios).length + 1));
    if (!name || name.trim() === '') return;
    
    // Reset all data for new scenario
    currentScenarioName = name.trim();
    assignments = {};
    mvpSelections = {};
    mvpPerformance = {};
    measureEstimates = {};
    measureConfigurations = {};
    selectedClinicians.clear();
    selectedSpecialties.clear();
    currentMVP = null;
    yearlyPlan = {
        2026: { mvps: [], measures: [], focus: 'Foundation - High readiness measures' },
        2027: { mvps: [], measures: [], focus: 'Expansion - Add specialty MVPs' },
        2028: { mvps: [], measures: [], focus: 'Integration - Cross-specialty coordination' },
        2029: { mvps: [], measures: [], focus: 'Optimization - Performance improvement' },
        2030: { mvps: [], measures: [], focus: 'Excellence - Full MVP implementation' }
    };

    // Save the new blank scenario
    saveScenario();
    
    // Update the dropdown and select the new scenario
    updateScenarioDropdown();
    document.getElementById('scenario-selector').value = currentScenarioName;
    
    // Refresh the view
    if (currentMode === 'tin-analysis') {
        renderTINAnalysis();
    } else if (currentMode === 'planning') {
        renderPlanningMode();
    }
    
    updateStats();
}

function deleteScenario() {
    if (currentScenarioName === 'Default') {
        alert('Cannot delete the Default scenario');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete the scenario "${currentScenarioName}"?`)) {
        return;
    }
    
    delete savedScenarios[currentScenarioName];
    localStorage.setItem(`${currentTIN}_scenarios`, JSON.stringify(savedScenarios));

    // Switch to Default scenario
    loadScenario('Default');
    updateScenarioDropdown();
    document.getElementById('scenario-selector').value = 'Default';
}

function updateScenarioDropdown() {
    const selector = document.getElementById('scenario-selector');
    if (!selector) return;
    
    const currentValue = selector.value;
    
    selector.innerHTML = `
        <option value="Default">Default Scenario</option>
        ${Object.keys(savedScenarios).map(name => 
            name !== 'Default' ? `<option value="${name}">${name}</option>` : ''
        ).join('')}
        <option value="new">+ Create New Scenario</option>
    `;
    
    // Restore the selected value if it still exists
    if (currentValue && Array.from(selector.options).some(opt => opt.value === currentValue)) {
        selector.value = currentValue;
    } else {
        selector.value = currentScenarioName;
    }
}

function resetScenario() {
    if (!confirm('Are you sure you want to reset the current scenario? This will clear all assignments and selections.')) {
        return;
    }
    
    assignments = {};
    mvpSelections = {};
    mvpPerformance = {};
    measureEstimates = {};
    measureConfigurations = {};
    selectedClinicians.clear();
    selectedSpecialties.clear();
    currentMVP = null;
    
    renderTINAnalysis();
    updateStats();
}

function loadSavedScenarios() {
    // Scenarios are now loaded from Supabase in loadOrganizationData()
    // This function just ensures the Default scenario doesn't exist in the cache
    if (savedScenarios['Default']) {
        delete savedScenarios['Default'];
    }
    console.log(`Loaded ${Object.keys(savedScenarios).length} scenarios from Supabase`);
}

// Utility functions
function isClinicianAssigned(npi) {
    for (let mvpId in assignments) {
        if (assignments[mvpId].includes(npi)) {
            return true;
        }
    }
    return false;
}

function updateStats() {
    const assignedCount = Object.values(assignments).flat().length;
    const activeMVPs = Object.keys(assignments).filter(id => assignments[id]?.length > 0).length;
    
    const clinCountEl = document.getElementById('clinician-count');
    const assignedEl = document.getElementById('assigned-count');
    const mvpCountEl = document.getElementById('mvp-count');
    const activeEl = document.getElementById('active-mvps');
    const measureEl = document.getElementById('measure-count');
    
    if (clinCountEl) clinCountEl.textContent = clinicians.length;
    if (assignedEl) assignedEl.textContent = assignedCount;
    if (mvpCountEl) mvpCountEl.textContent = mvps.length;
    if (activeEl) activeEl.textContent = activeMVPs;
    if (measureEl) measureEl.textContent = measures.length;
}

function toggleMode() {
    if (currentMode === 'planning') {
        renderReviewMode();
    } else {
        renderPlanningMode();
    }
}

function switchDetailTab(tab) {
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    if (event && event.target) {
        event.target.classList.add('active');
        const tabEl = document.getElementById(`${tab}-tab`);
        if (tabEl) tabEl.classList.add('active');
    }
}

// Export function for Executive Dashboard only
function exportPlan() {
    const exportData = {
        timestamp: new Date().toISOString(),
        scenario: currentScenarioName,
        tin_number: globalTINNumber,
        tin_analysis: {
            total_clinicians: clinicians.length,
            specialties: [...new Set(clinicians.map(c => c.specialty))].length,
            selected_specialties: Array.from(selectedSpecialties)
        },
        assignments: assignments,
        selections: mvpSelections,
        measure_configurations: measureConfigurations,
        performance_estimates: measureEstimates,
        yearly_plan: yearlyPlan,
        summary: {
            total_clinicians: clinicians.length,
            assigned: Object.values(assignments).flat().length,
            active_mvps: Object.keys(assignments).filter(id => assignments[id]?.length > 0).length
        }
    };
    
    // Create CSV for Excel - Sheet 1: MVP Summary
    let csvContent = "===MVP SUMMARY===\n";
    csvContent += "Year,MVP,Status,Clinicians,New Measures,Improvement Measures,Total Measures,Average Readiness,Total Setup Time,Focus\n";
    
    Object.entries(yearlyPlan).forEach(([year, plan]) => {
        plan.mvps.forEach(mvpId => {
            const mvp = mvps.find(m => m.mvp_id === mvpId);
            const isNew = plan.newMvps && plan.newMvps.includes(mvpId);
            const clinicianCount = assignments[mvpId]?.length || 0;
            
            // Count new vs improvement measures for this MVP
            let newMeasureCount = 0;
            let improveMeasureCount = 0;
            
            if (mvpSelections[mvpId]) {
                mvpSelections[mvpId].measures.forEach(measureId => {
                    const measure = measures.find(m => m.measure_id === measureId);
                    if (plan.newMeasures && plan.newMeasures.includes(measureId)) {
                        newMeasureCount++;
                    } else if (plan.improveMeasures && plan.improveMeasures.includes(measureId)) {
                        improveMeasureCount++;
                    }
                });
            }
            
            const totalMeasureCount = newMeasureCount + improveMeasureCount;
            
            // Calculate average readiness
            let totalReadiness = 0;
            let totalSetupMonths = 0;
            
            if (mvpSelections[mvpId]) {
                mvpSelections[mvpId].measures.forEach(measureId => {
                    const config = measureConfigurations[`${mvpId}_${measureId}`] || {};
                    const measure = measures.find(m => m.measure_id === measureId);
                    
                    totalReadiness += config.readiness || measure?.readiness || 3;
                    
                    // Only count setup time for new measures
                    if (plan.newMeasures && plan.newMeasures.includes(measureId)) {
                        const setupTime = config.setupTime || measure?.setup_time || '3 months';
                        if (setupTime.includes('month')) {
                            totalSetupMonths += parseInt(setupTime) || 3;
                        }
                    }
                });
            }
            
            const avgReadiness = totalMeasureCount > 0 ? (totalReadiness / totalMeasureCount).toFixed(1) : 0;
            
            csvContent += `${year},"${mvp?.mvp_name || mvpId}",${isNew ? 'NEW' : 'CONTINUING'},${clinicianCount},${newMeasureCount},${improveMeasureCount},${totalMeasureCount},${avgReadiness},${totalSetupMonths} months,"${plan.focus}"\n`;
        });
    });
    
    // Sheet 2: Detailed Measure Information (NEW measures only)
    csvContent += "\n\n===NEW MEASURE DETAILS===\n";
    csvContent += "Year,MVP,Measure ID,Measure Name,Collection Type,Readiness,Setup Time,Difficulty,Already Activated,Median Benchmark,Is Inverse,Quality Domain\n";
    
    // Collect all NEW measure details by year
    Object.entries(yearlyPlan).forEach(([year, plan]) => {
        // Process only new measures
        if (plan.newMeasures) {
            plan.newMeasures.forEach(measureId => {
                const measure = measures.find(m => m.measure_id === measureId);
                if (!measure) return;
                
                // Find which MVP this measure belongs to
                let mvpName = '';
                let collectionType = 'MIPS CQM';
                let readiness = 3;
                let setupTime = '3 months';
                
                Object.keys(mvpSelections).forEach(mvpId => {
                    if (mvpSelections[mvpId].measures.includes(measureId)) {
                        const mvp = mvps.find(m => m.mvp_id === mvpId);
                        if (mvp) mvpName = mvp.mvp_name;
                        
                        const config = measureConfigurations[`${mvpId}_${measureId}`] || {};
                        readiness = config.readiness || measure.readiness || 3;
                        setupTime = config.setupTime || measure.setup_time || '3 months';
                        
                        if (mvpSelections[mvpId].configs && mvpSelections[mvpId].configs[measureId]) {
                            collectionType = mvpSelections[mvpId].configs[measureId].collectionType || 'MIPS CQM';
                        }
                    }
                });
                
                const benchmark = benchmarks.find(b => 
                    b.measure_id === measureId && 
                    b.collection_type === collectionType
                );
                const medianBenchmark = benchmark?.decile_5 || measure.median_benchmark || 75;
                const isInverse = benchmark?.is_inverse === 'Y' || measure.is_inverse === 'Y' ? 'Yes' : 'No';
                const isActivated = measure.is_activated === 'Y' ? 'Yes' : 'No';
                const difficulty = measure.difficulty || 'Medium';
                const qualityDomain = measure.quality_domain || '';
                
                csvContent += `${year},"${mvpName}",${measureId},"${measure.measure_name}",${collectionType},${readiness}/5,${setupTime},${difficulty},${isActivated},${medianBenchmark.toFixed(2)}%,${isInverse},"${qualityDomain}"\n`;
            });
        }
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mvp-strategic-plan-${currentScenarioName}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

function setupEventHandlers() {
    // Any additional event handlers
}

// Export functions for global access
window.switchToMode = switchToMode;
window.toggleSpecialtySelection = toggleSpecialtySelection;
window.createSubgroups = createSubgroups;
window.selectYear = selectYear;
window.updateMeasureEstimate = updateMeasureEstimate;
window.calculateTotalScores = calculateTotalScores;
window.updateMeasureConfig = updateMeasureConfig;
window.toggleSelection = toggleSelection;
window.selectAllVisible = selectAllVisible;
window.clearSelection = clearSelection;
window.assignSelectedToMVP = assignSelectedToMVP;
window.filterClinicians = filterClinicians;
window.selectMVP = selectMVP;
window.removeAllFromMVP = removeAllFromMVP;
window.removeFromMVP = removeFromMVP;
window.toggleMeasure = toggleMeasure;
window.setCollectionType = setCollectionType;
window.toggleMode = toggleMode;
window.switchDetailTab = switchDetailTab;
window.exportPlan = exportPlan;
window.saveScenario = saveScenario;
window.saveAsNewScenario = saveAsNewScenario;
window.loadScenario = loadScenario;
window.resetScenario = resetScenario;
window.deleteScenario = deleteScenario;
window.createNewScenario = createNewScenario;
window.updateScenarioDropdown = updateScenarioDropdown;
window.updateTINNumber = updateTINNumber;

// Supabase/User functions
window.submitUserIdentity = submitUserIdentity;
window.switchTIN = switchTIN;
window.openTinModal = openTinModal;
window.closeTinModal = closeTinModal;
window.saveNewTin = saveNewTin;
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.rollbackToVersion = rollbackToVersion;
window.triggerAutoSave = triggerAutoSave;
window.importCliniciansFromSheets = importCliniciansFromSheets;
window.showCSVImportModal = showCSVImportModal;

// Modal functions
function showMeasureDetails(year, type) {
    const modal = document.getElementById('measureModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    const plan = yearlyPlan[year];
    if (!plan) return;
    
    const measureList = type === 'new' ? plan.newMeasures : plan.improveMeasures;
    if (!measureList) return;
    
    const titleText = type === 'new' 
        ? 'Year ' + year + ' - New Measures to Implement'
        : 'Year ' + year + ' - Measures to Improve';
    
    modalTitle.textContent = titleText;
    
    let html = '<div class="measure-list">';
    
    measureList.forEach(function(measureId) {
        const measure = measures.find(function(m) { return m.measure_id === measureId; });
        if (!measure) return;
        
        // Find MVP and configuration for this measure
        let mvpName = '';
        let readiness = 3;
        let collectionType = 'MIPS CQM';
        
        Object.keys(mvpSelections).forEach(function(mvpId) {
            if (mvpSelections[mvpId] && mvpSelections[mvpId].measures && mvpSelections[mvpId].measures.includes(measureId)) {
                const mvp = mvps.find(function(m) { return m.mvp_id === mvpId; });
                if (mvp) {
                    mvpName = mvp.mvp_name;
                }
                
                const configKey = mvpId + '_' + measureId;
                const config = measureConfigurations[configKey] || {};
                readiness = config.readiness || measure.readiness || 3;
                
                if (mvpSelections[mvpId].configs && mvpSelections[mvpId].configs[measureId]) {
                    collectionType = mvpSelections[mvpId].configs[measureId].collectionType || 'MIPS CQM';
                }
            }
        });
        
        const benchmark = benchmarks.find(function(b) {
            return b.measure_id === measureId && b.collection_type === collectionType;
        });
        
        const medianBenchmark = (benchmark && benchmark.decile_5) ? benchmark.decile_5 : (measure.median_benchmark || 75);
        const isInverse = (benchmark && benchmark.is_inverse === 'Y') || (measure.is_inverse === 'Y');
        
        html += '<div class="measure-list-item">';
        html += '<strong>' + measureId + ': ' + measure.measure_name + '</strong>';
        html += '<div class="measure-meta-info">';
        html += '<span>MVP: ' + mvpName + '</span>';
        html += '<span>Readiness: ' + readiness + '/5</span>';
        html += '<span>Collection: ' + collectionType + '</span>';
        html += '<span>Median: ' + medianBenchmark.toFixed(2) + '%</span>';
        
        if (isInverse) {
            html += '<span style="color: #dc3545;">Inverse Measure</span>';
        }
        
        if (type === 'new') {
            html += '<span>Status: New Implementation</span>';
        } else {
            html += '<span>Status: Improvement Phase</span>';
        }
        
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    modalBody.innerHTML = html;
    modal.style.display = 'block';
}

function closeMeasureModal() {
    const modal = document.getElementById('measureModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Export the modal functions
window.showMeasureDetails = showMeasureDetails;
window.closeMeasureModal = closeMeasureModal;

// Clinician Preview Modal functions
function showClinicianPreview(specialty, mvpId, mvpName) {
    const modal = document.getElementById('clinicianModal');
    const modalTitle = document.getElementById('clinicianModalTitle');
    const modalBody = document.getElementById('clinicianModalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Find the clinicians for this specialty
    const cliniciansInSpecialty = clinicians.filter(c => c.specialty === specialty);
    
    modalTitle.textContent = mvpName + ' - Recommended Clinicians (' + specialty + ')';
    
    let html = '<div class="clinician-list">';
    html += '<p style="margin-bottom: 15px; color: #586069;">These clinicians from the ' + specialty + ' specialty are recommended for the ' + mvpName + ' MVP:</p>';
    
    cliniciansInSpecialty.forEach(function(clinician) {
        html += '<div class="clinician-list-item" style="padding: 10px; margin-bottom: 8px; background: #f6f8fa; border-left: 3px solid #004877;">';
        html += '<strong>' + clinician.name + '</strong>';
        html += '<div style="font-size: 13px; color: #586069; margin-top: 3px;">';
        html += 'NPI: ' + clinician.npi;
        html += ' | Specialty: ' + clinician.specialty;
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    modalBody.innerHTML = html;
    modal.style.display = 'block';
}

function closeClinicianModal() {
    const modal = document.getElementById('clinicianModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Export the clinician modal functions
window.showClinicianPreview = showClinicianPreview;
window.closeClinicianModal = closeClinicianModal;

// Update window click handler to close both modals
window.onclick = function(event) {
    const measureModal = document.getElementById('measureModal');
    const clinicianModal = document.getElementById('clinicianModal');
    
    if (event.target === measureModal) {
        measureModal.style.display = 'none';
    }
    if (event.target === clinicianModal) {
        clinicianModal.style.display = 'none';
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
