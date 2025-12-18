// Database Service Layer
// MVP Strategic Planning Tool - Supabase Integration

// Get supabase client from window (set by supabase.js)
const getSupabase = () => {
    // Try to initialize if not ready
    if (!window.supabaseClient && window.initializeSupabase) {
        window.initializeSupabase();
    }

    const client = window.supabaseClient;
    if (!client) {
        console.error('Supabase client not available. window.supabase:', typeof window.supabase);
        throw new Error('Supabase client not initialized. Please refresh the page.');
    }
    return client;
};

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function getOrCreateUser(email, displayName) {
    const supabase = getSupabase();

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

    if (existingUser) {
        // Update last active
        await supabase
            .from('users')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', existingUser.id);
        return existingUser;
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
            email: email.toLowerCase(),
            display_name: displayName
        })
        .select()
        .single();

    if (createError) {
        console.error('Error creating user:', createError);
        throw createError;
    }

    return newUser;
}

async function updateUserPresence(userId, orgId, userName, currentPage) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('user_presence')
        .upsert({
            user_id: userId,
            organization_id: orgId,
            user_name: userName,
            current_page: currentPage,
            last_heartbeat: new Date().toISOString()
        }, {
            onConflict: 'user_id,organization_id'
        });

    if (error) console.error('Error updating presence:', error);
}

async function getActiveUsers(orgId) {
    const supabase = getSupabase();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('user_presence')
        .select('*, users(display_name, email)')
        .eq('organization_id', orgId)
        .gte('last_heartbeat', fiveMinutesAgo);

    if (error) {
        console.error('Error fetching active users:', error);
        return [];
    }

    return data || [];
}

// ============================================================================
// ORGANIZATION (TIN) MANAGEMENT
// ============================================================================

async function getOrganizations() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true)
        .order('name');

    if (error) {
        console.error('Error fetching organizations:', error);
        return [];
    }

    return data || [];
}

async function createOrganization(tin, name, displayName, userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('organizations')
        .insert({
            tin: tin,
            name: name,
            display_name: displayName || name,
            created_by: userId
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating organization:', error);
        throw error;
    }

    return data;
}

async function deleteOrganization(orgId) {
    const supabase = getSupabase();

    // Delete related data first (cascade manually for safety)
    // Delete clinicians
    await supabase.from('clinicians').delete().eq('organization_id', orgId);
    // Delete assignments
    await supabase.from('assignments').delete().eq('organization_id', orgId);
    // Delete MVP selections
    await supabase.from('mvp_selections').delete().eq('organization_id', orgId);
    // Delete measure estimates
    await supabase.from('measure_estimates').delete().eq('organization_id', orgId);
    // Delete scenarios
    await supabase.from('scenarios').delete().eq('organization_id', orgId);
    // Delete version history
    await supabase.from('version_history').delete().eq('organization_id', orgId);
    // Delete user presence
    await supabase.from('user_presence').delete().eq('organization_id', orgId);
    // Delete organization members
    await supabase.from('organization_members').delete().eq('organization_id', orgId);

    // Finally delete the organization
    const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);

    if (error) {
        console.error('Error deleting organization:', error);
        throw error;
    }

    return true;
}

async function addOrganizationMember(orgId, userId, role = 'member') {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('organization_members')
        .upsert({
            organization_id: orgId,
            user_id: userId,
            role: role
        }, {
            onConflict: 'organization_id,user_id'
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding organization member:', error);
        throw error;
    }

    return data;
}

async function getUserOrganizations(userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('organization_members')
        .select('*, organizations(*)')
        .eq('user_id', userId);

    if (error) {
        console.error('Error fetching user organizations:', error);
        return [];
    }

    return data?.map(m => m.organizations) || [];
}

// ============================================================================
// CLINICIANS
// ============================================================================

async function getClinicians(orgId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('clinicians')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');

    if (error) {
        console.error('Error fetching clinicians:', error);
        return [];
    }

    return data || [];
}

async function addClinician(orgId, npi, name, specialty, separateEhr = 'No') {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('clinicians')
        .insert({
            organization_id: orgId,
            npi: npi,
            name: name,
            specialty: specialty,
            separate_ehr: separateEhr
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding clinician:', error);
        throw error;
    }

    return data;
}

async function importClinicians(orgId, cliniciansData, userId) {
    const supabase = getSupabase();

    // Build clinicians list and deduplicate by NPI
    const npiMap = new Map();
    cliniciansData.forEach(c => {
        const npi = c.npi || c.NPI || '';
        if (npi && !npiMap.has(npi)) {
            npiMap.set(npi, {
                organization_id: orgId,
                npi: npi,
                name: c.name || c.Name || `${c.first_name || c['First Name'] || ''} ${c.last_name || c['Last Name'] || ''}`.trim(),
                specialty: c.specialty || c.Specialty || 'Unknown',
                separate_ehr: c.separate_ehr || c['Separate EHR'] || 'No'
            });
        }
    });

    const toInsert = Array.from(npiMap.values());
    console.log(`Importing ${toInsert.length} unique clinicians (deduped from ${cliniciansData.length})`);

    if (toInsert.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from('clinicians')
        .upsert(toInsert, {
            onConflict: 'organization_id,npi',
            ignoreDuplicates: false
        })
        .select();

    if (error) {
        console.error('Error importing clinicians:', error);
        throw error;
    }

    return data || [];
}

async function deleteClinician(clinicianId, orgId, userId) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('clinicians')
        .update({ is_active: false })
        .eq('id', clinicianId);

    if (error) {
        console.error('Error deleting clinician:', error);
        throw error;
    }
}

// ============================================================================
// REFERENCE DATA (MVPs, Measures, Benchmarks)
// ============================================================================

async function getMVPs() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('mvps')
        .select('*')
        .eq('is_active', true)
        .order('mvp_id');

    if (error) {
        console.error('Error fetching MVPs:', error);
        return [];
    }

    return data || [];
}

async function getMeasures() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('measures')
        .select('*')
        .eq('is_active', true)
        .order('measure_id');

    if (error) {
        console.error('Error fetching measures:', error);
        return [];
    }

    return data || [];
}

async function getBenchmarks() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('benchmarks')
        .select('*')
        .order('measure_id');

    if (error) {
        console.error('Error fetching benchmarks:', error);
        return [];
    }

    return data || [];
}

// ============================================================================
// ASSIGNMENTS (Clinician-to-MVP)
// ============================================================================

async function getAssignments(orgId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('organization_id', orgId);

    if (error) {
        console.error('Error fetching assignments:', error);
        return [];
    }

    return data || [];
}

async function saveAssignment(orgId, mvpId, clinicianNpi, userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('assignments')
        .upsert({
            organization_id: orgId,
            mvp_id: mvpId,
            clinician_npi: clinicianNpi,
            created_by: userId
        }, {
            onConflict: 'organization_id,mvp_id,clinician_npi'
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving assignment:', error);
        throw error;
    }

    return data;
}

async function deleteAssignment(orgId, mvpId, clinicianNpi, userId) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('organization_id', orgId)
        .eq('mvp_id', mvpId)
        .eq('clinician_npi', clinicianNpi);

    if (error) {
        console.error('Error deleting assignment:', error);
        throw error;
    }
}

async function saveAllAssignments(orgId, assignments, userId) {
    const supabase = getSupabase();

    // Delete existing assignments for this org
    await supabase
        .from('assignments')
        .delete()
        .eq('organization_id', orgId);

    // Insert new assignments
    const toInsert = [];
    for (const mvpId in assignments) {
        for (const npi of assignments[mvpId]) {
            toInsert.push({
                organization_id: orgId,
                mvp_id: mvpId,
                clinician_npi: npi,
                created_by: userId
            });
        }
    }

    if (toInsert.length > 0) {
        const { error } = await supabase
            .from('assignments')
            .insert(toInsert);

        if (error) {
            console.error('Error saving assignments:', error);
            throw error;
        }
    }
}

// ============================================================================
// MVP SELECTIONS (Measures per MVP)
// ============================================================================

async function getMvpSelections(orgId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('mvp_selections')
        .select('*')
        .eq('organization_id', orgId);

    if (error) {
        console.error('Error fetching MVP selections:', error);
        return [];
    }

    return data || [];
}

async function saveMvpSelection(orgId, mvpId, measureId, collectionType, config, userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('mvp_selections')
        .upsert({
            organization_id: orgId,
            mvp_id: mvpId,
            measure_id: measureId,
            collection_type: collectionType,
            config: config,
            created_by: userId
        }, {
            onConflict: 'organization_id,mvp_id,measure_id'
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving MVP selection:', error);
        throw error;
    }

    return data;
}

async function deleteMvpSelection(orgId, mvpId, measureId) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('mvp_selections')
        .delete()
        .eq('organization_id', orgId)
        .eq('mvp_id', mvpId)
        .eq('measure_id', measureId);

    if (error) {
        console.error('Error deleting MVP selection:', error);
        throw error;
    }
}

async function saveAllMvpSelections(orgId, selections, userId) {
    const supabase = getSupabase();

    // Delete existing selections for this org
    await supabase
        .from('mvp_selections')
        .delete()
        .eq('organization_id', orgId);

    // Insert new selections
    const toInsert = [];
    for (const mvpId in selections) {
        const sel = selections[mvpId];
        if (sel.measures) {
            for (const measureId of sel.measures) {
                const config = sel.configs?.[measureId] || {};
                toInsert.push({
                    organization_id: orgId,
                    mvp_id: mvpId,
                    measure_id: measureId,
                    collection_type: config.collectionType || 'MIPS CQM',
                    config: config,
                    created_by: userId
                });
            }
        }
    }

    if (toInsert.length > 0) {
        const { error } = await supabase
            .from('mvp_selections')
            .insert(toInsert);

        if (error) {
            console.error('Error saving MVP selections:', error);
            throw error;
        }
    }
}

// ============================================================================
// MEASURE ESTIMATES
// ============================================================================

async function getMeasureEstimates(orgId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('measure_estimates')
        .select('*')
        .eq('organization_id', orgId);

    if (error) {
        console.error('Error fetching measure estimates:', error);
        return [];
    }

    return data || [];
}

async function saveMeasureEstimate(orgId, mvpId, measureId, estimatedRate, userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('measure_estimates')
        .upsert({
            organization_id: orgId,
            mvp_id: mvpId,
            measure_id: measureId,
            estimated_rate: estimatedRate,
            updated_by: userId
        }, {
            onConflict: 'organization_id,mvp_id,measure_id'
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving measure estimate:', error);
        throw error;
    }

    return data;
}

async function saveAllMeasureEstimates(orgId, estimates, userId) {
    const supabase = getSupabase();

    // Delete existing estimates for this org
    await supabase
        .from('measure_estimates')
        .delete()
        .eq('organization_id', orgId);

    // Insert new estimates
    const toInsert = [];
    for (const key in estimates) {
        const [mvpId, measureId] = key.split('_');
        if (mvpId && measureId && estimates[key] !== null && estimates[key] !== undefined) {
            toInsert.push({
                organization_id: orgId,
                mvp_id: mvpId,
                measure_id: measureId,
                estimated_rate: estimates[key],
                updated_by: userId
            });
        }
    }

    if (toInsert.length > 0) {
        const { error } = await supabase
            .from('measure_estimates')
            .insert(toInsert);

        if (error) {
            console.error('Error saving measure estimates:', error);
            throw error;
        }
    }
}

// ============================================================================
// SCENARIOS
// ============================================================================

async function getScenarios(orgId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching scenarios:', error);
        return [];
    }

    return data || [];
}

async function saveScenario(orgId, name, description, snapshotData, userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('scenarios')
        .upsert({
            organization_id: orgId,
            name: name,
            description: description,
            assignments_snapshot: snapshotData.assignments_snapshot || snapshotData.assignments || {},
            selections_snapshot: snapshotData.selections_snapshot || snapshotData.selections || {},
            estimates_snapshot: snapshotData.estimates_snapshot || snapshotData.estimates || {},
            yearly_plan_snapshot: snapshotData.yearly_plan_snapshot || snapshotData.yearlyPlan || {},
            created_by: userId,
            updated_by: userId,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'organization_id,name'
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving scenario:', error);
        throw error;
    }

    return data;
}

async function loadScenario(orgId, scenarioName) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('organization_id', orgId)
        .eq('name', scenarioName)
        .single();

    if (error) {
        console.error('Error loading scenario:', error);
        return null;
    }

    return data;
}

async function deleteScenario(scenarioId, orgId, userId) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('scenarios')
        .update({ is_active: false })
        .eq('id', scenarioId);

    if (error) {
        console.error('Error deleting scenario:', error);
        throw error;
    }
}

// ============================================================================
// VERSION HISTORY
// ============================================================================

async function createVersionSnapshot(orgId, versionName, description, stateSnapshot, userId, trigger = 'manual_save') {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('version_history')
        .insert({
            organization_id: orgId,
            version_name: versionName,
            description: description,
            state_snapshot: stateSnapshot,
            created_by: userId,
            trigger_event: trigger
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating version snapshot:', error);
        throw error;
    }

    return data;
}

async function getVersionHistory(orgId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('version_history')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching version history:', error);
        return [];
    }

    return data || [];
}

async function rollbackToVersion(orgId, versionId, userId) {
    const supabase = getSupabase();

    // Get the version
    const { data: version, error: fetchError } = await supabase
        .from('version_history')
        .select('*')
        .eq('id', versionId)
        .single();

    if (fetchError || !version) {
        throw new Error('Version not found');
    }

    return version.state_snapshot || {};
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

let realtimeSubscriptions = [];

function subscribeToChanges(orgId, callback) {
    const supabase = getSupabase();

    // Unsubscribe from previous subscriptions
    unsubscribeAll();

    const tables = ['assignments', 'mvp_selections', 'measure_estimates', 'scenarios', 'user_presence'];

    tables.forEach(table => {
        const channel = supabase
            .channel(`${table}:${orgId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: table,
                filter: `organization_id=eq.${orgId}`
            }, payload => {
                console.log(`${table} change:`, payload);
                if (callback) callback(table, payload);
            })
            .subscribe();

        realtimeSubscriptions.push(channel);
    });
}

function unsubscribeAll() {
    const supabase = getSupabase();

    realtimeSubscriptions.forEach(channel => {
        try {
            supabase.removeChannel(channel);
        } catch (e) {
            console.log('Error removing channel:', e);
        }
    });
    realtimeSubscriptions = [];
}

// ============================================================================
// EXPORT FOR USE IN APP
// ============================================================================

window.db = {
    // User
    getOrCreateUser,
    updateUserPresence,
    getActiveUsers,

    // Organization
    getOrganizations,
    createOrganization,
    deleteOrganization,
    addOrganizationMember,
    getUserOrganizations,

    // Clinicians
    getClinicians,
    addClinician,
    importClinicians,
    deleteClinician,

    // Reference Data
    getMVPs,
    getMeasures,
    getBenchmarks,

    // Assignments
    getAssignments,
    saveAssignment,
    deleteAssignment,
    saveAllAssignments,

    // MVP Selections
    getMvpSelections,
    saveMvpSelection,
    deleteMvpSelection,
    saveAllMvpSelections,

    // Measure Estimates
    getMeasureEstimates,
    saveMeasureEstimate,
    saveAllMeasureEstimates,

    // Scenarios
    getScenarios,
    saveScenario,
    loadScenario,
    deleteScenario,

    // Version History
    createVersionSnapshot,
    getVersionHistory,
    rollbackToVersion,

    // Real-time
    subscribeToChanges,
    unsubscribeAll
};

console.log('Database service layer initialized');
