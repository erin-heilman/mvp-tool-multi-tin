-- MVP Strategic Planning Tool - Supabase Schema
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. USERS (simple identity, no auth)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- 2. ORGANIZATIONS (TINs - configurable)
-- ============================================================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tin VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_organizations_tin ON organizations(tin);

-- ============================================================================
-- 3. ORGANIZATION_MEMBERS
-- ============================================================================
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================================================
-- 4. CLINICIANS (per organization)
-- ============================================================================
CREATE TABLE clinicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    npi VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255),
    separate_ehr VARCHAR(10) DEFAULT 'No',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, npi)
);

CREATE INDEX idx_clinicians_org ON clinicians(organization_id);
CREATE INDEX idx_clinicians_specialty ON clinicians(specialty);

-- ============================================================================
-- 5. MVPS (shared reference data)
-- ============================================================================
CREATE TABLE mvps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mvp_id VARCHAR(50) UNIQUE NOT NULL,
    mvp_name VARCHAR(500) NOT NULL,
    specialties TEXT,
    available_measures TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mvps_mvp_id ON mvps(mvp_id);

-- ============================================================================
-- 6. MEASURES (shared reference data)
-- ============================================================================
CREATE TABLE measures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measure_id VARCHAR(50) UNIQUE NOT NULL,
    measure_name VARCHAR(500) NOT NULL,
    is_activated VARCHAR(10) DEFAULT 'N',
    collection_types VARCHAR(255),
    difficulty VARCHAR(50) DEFAULT 'Medium',
    is_inverse VARCHAR(10) DEFAULT 'N',
    setup_time VARCHAR(100),
    readiness INTEGER DEFAULT 3,
    prerequisites TEXT,
    median_benchmark DECIMAL(10,4) DEFAULT 75,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_measures_measure_id ON measures(measure_id);

-- ============================================================================
-- 7. BENCHMARKS (shared reference data)
-- ============================================================================
CREATE TABLE benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_year VARCHAR(10),
    measure_id VARCHAR(50) NOT NULL,
    collection_type VARCHAR(100),
    is_inverse VARCHAR(10) DEFAULT 'N',
    mean_performance DECIMAL(10,4),
    decile_1 DECIMAL(10,4),
    decile_2 DECIMAL(10,4),
    decile_3 DECIMAL(10,4),
    decile_4 DECIMAL(10,4),
    decile_5 DECIMAL(10,4),
    decile_6 DECIMAL(10,4),
    decile_7 DECIMAL(10,4),
    decile_8 DECIMAL(10,4),
    decile_9 DECIMAL(10,4),
    decile_10 DECIMAL(10,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(measure_id, collection_type, benchmark_year)
);

CREATE INDEX idx_benchmarks_measure ON benchmarks(measure_id);

-- ============================================================================
-- 8. ASSIGNMENTS (clinician-to-MVP, per org)
-- ============================================================================
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mvp_id VARCHAR(50) NOT NULL,
    clinician_npi VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(organization_id, mvp_id, clinician_npi)
);

CREATE INDEX idx_assignments_org ON assignments(organization_id);
CREATE INDEX idx_assignments_mvp ON assignments(mvp_id);

-- ============================================================================
-- 9. MVP_SELECTIONS (measures per MVP, per org)
-- ============================================================================
CREATE TABLE mvp_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mvp_id VARCHAR(50) NOT NULL,
    measure_id VARCHAR(50) NOT NULL,
    collection_type VARCHAR(100) DEFAULT 'MIPS CQM',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(organization_id, mvp_id, measure_id)
);

CREATE INDEX idx_mvp_selections_org ON mvp_selections(organization_id);
CREATE INDEX idx_mvp_selections_mvp ON mvp_selections(mvp_id);

-- ============================================================================
-- 10. MEASURE_ESTIMATES (performance projections)
-- ============================================================================
CREATE TABLE measure_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mvp_id VARCHAR(50) NOT NULL,
    measure_id VARCHAR(50) NOT NULL,
    estimated_rate DECIMAL(10,4),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id),
    UNIQUE(organization_id, mvp_id, measure_id)
);

CREATE INDEX idx_measure_estimates_org ON measure_estimates(organization_id);

-- ============================================================================
-- 11. SCENARIOS (named snapshots, shared)
-- ============================================================================
CREATE TABLE scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    assignments_snapshot JSONB DEFAULT '{}',
    selections_snapshot JSONB DEFAULT '{}',
    estimates_snapshot JSONB DEFAULT '{}',
    yearly_plan_snapshot JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id),
    UNIQUE(organization_id, name)
);

CREATE INDEX idx_scenarios_org ON scenarios(organization_id);

-- ============================================================================
-- 12. AUDIT_LOG (change tracking)
-- ============================================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    operation VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    description TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org ON audit_log(organization_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);

-- ============================================================================
-- 13. VERSION_HISTORY (for rollback)
-- ============================================================================
CREATE TABLE version_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version_number SERIAL,
    version_name VARCHAR(255),
    description TEXT,
    state_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    trigger_event VARCHAR(100)
);

CREATE INDEX idx_version_history_org ON version_history(organization_id);
CREATE INDEX idx_version_history_created ON version_history(created_at DESC);

-- ============================================================================
-- 14. USER_PRESENCE (real-time collaboration)
-- ============================================================================
CREATE TABLE user_presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_name VARCHAR(255),
    current_page VARCHAR(255),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

CREATE INDEX idx_user_presence_org ON user_presence(organization_id);
CREATE INDEX idx_user_presence_heartbeat ON user_presence(last_heartbeat);

-- ============================================================================
-- ENABLE REALTIME FOR COLLABORATION TABLES
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE mvp_selections;
ALTER PUBLICATION supabase_realtime ADD TABLE measure_estimates;
ALTER PUBLICATION supabase_realtime ADD TABLE scenarios;
ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;

-- ============================================================================
-- ROW LEVEL SECURITY (Disabled for simplicity - enable later if needed)
-- ============================================================================
-- For now, we'll use application-level security since users don't have
-- Supabase Auth accounts. RLS can be added later if needed.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE measure_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE version_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access (since we're not using Supabase Auth)
CREATE POLICY "Allow all access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON organization_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON clinicians FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON mvps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON measures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON benchmarks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON mvp_selections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON measure_estimates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON scenarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON version_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON user_presence FOR ALL USING (true) WITH CHECK (true);
