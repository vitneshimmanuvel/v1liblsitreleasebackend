const { query } = require('./db');

async function initDatabase() {
  console.log('Initializing Neon PostgreSQL database schema...');
  
  try {
    // 1. Departments / Partitions Table (aligned with Base44 screenshot hierarchy)
    await query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(50) DEFAULT 'folder',
        parent_id VARCHAR(100) REFERENCES departments(id) ON DELETE SET NULL,
        hierarchy_level VARCHAR(50) DEFAULT 'section', -- 'group', 'functional', 'section'
        sort_order INT DEFAULT 0,
        created_by VARCHAR(100) DEFAULT 'System Administrator',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Policies & Standard Operating Procedures (SOPs) Table
    await query(`
      CREATE TABLE IF NOT EXISTS policies (
        id VARCHAR(100) PRIMARY KEY,
        department_id VARCHAR(100) REFERENCES departments(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        summary TEXT,
        version VARCHAR(20) DEFAULT '1.0',
        status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'pending_approval'
        is_masked BOOLEAN DEFAULT FALSE,     -- Document Masking for confidential policies
        content TEXT NOT NULL,
        parameters JSONB DEFAULT '{}'::jsonb, -- Limits, Turnaround SLAs, Verification Steps
        created_by VARCHAR(100) DEFAULT 'Staff Submitter',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Policy Version History Table
    await query(`
      CREATE TABLE IF NOT EXISTS policy_versions (
        id SERIAL PRIMARY KEY,
        policy_id VARCHAR(100) REFERENCES policies(id) ON DELETE CASCADE,
        version_number VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        parameters JSONB DEFAULT '{}'::jsonb,
        changed_by VARCHAR(100) NOT NULL,
        change_summary TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Change Control Logs (Who, When, What Section)
    await query(`
      CREATE TABLE IF NOT EXISTS change_logs (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL, -- 'policy', 'department', 'parameter', 'maker_checker'
        entity_id VARCHAR(100) NOT NULL,
        user_name VARCHAR(100) NOT NULL,
        action VARCHAR(50) NOT NULL,      -- 'CREATED', 'CONFIGURED', 'ARCHIVED', 'ACTIVATED', 'APPROVED', 'REJECTED', 'MASKED'
        section_name VARCHAR(255),
        details TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Maker-Checker Governance Table & Notification Tracking
    await query(`
      CREATE TABLE IF NOT EXISTS maker_checker_requests (
        id SERIAL PRIMARY KEY,
        policy_id VARCHAR(100) REFERENCES policies(id) ON DELETE CASCADE,
        policy_title VARCHAR(255) NOT NULL,
        department_name VARCHAR(100),
        maker_name VARCHAR(100) NOT NULL,
        maker_role VARCHAR(100) DEFAULT 'Staff Submitter',
        proposed_changes JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
        checker_name VARCHAR(100),
        checker_comments TEXT,
        is_closed BOOLEAN DEFAULT FALSE,      -- Simple toggle button to close item as agreed
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP WITH TIME ZONE
      );
    `);

    // 6. Contextual Artifacts (Pane 3 Tabs with Active / Inactive states)
    await query(`
      CREATE TABLE IF NOT EXISTS contextual_artifacts (
        id SERIAL PRIMARY KEY,
        policy_id VARCHAR(100) REFERENCES policies(id) ON DELETE CASCADE,
        tab_type VARCHAR(50) NOT NULL, -- 'training', 'reports', 'issues', 'faqs', 'regulatory'
        title VARCHAR(255) NOT NULL,
        description TEXT,
        url_or_file VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Operational Performance Metrics & Reports (Target vs Actual, SLA, User-Defined Reports)
    await query(`
      CREATE TABLE IF NOT EXISTS operational_metrics (
        id SERIAL PRIMARY KEY,
        department_id VARCHAR(100) REFERENCES departments(id) ON DELETE CASCADE,
        metric_name VARCHAR(255) NOT NULL,
        target_value VARCHAR(100) NOT NULL,
        actual_value VARCHAR(100) NOT NULL,
        sla_hours INT DEFAULT 24,
        sla_status VARCHAR(50) DEFAULT 'optimal', -- 'optimal', 'attention', 'breached'
        report_format VARCHAR(50) DEFAULT 'url',  -- 'pdf', 'excel', 'url'
        report_link VARCHAR(500),
        trend_data JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. RAG & Vector Search Table (pgvector enabled)
    await query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await query(`
      CREATE TABLE IF NOT EXISTS policy_document_vectors (
        id SERIAL PRIMARY KEY,
        document_name VARCHAR(255) NOT NULL,
        policy_id VARCHAR(100),
        department_id VARCHAR(100),
        section_title VARCHAR(255) NOT NULL,
        section_type VARCHAR(50) NOT NULL,
        chunk_content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ All database tables including pgvector RAG tables initialized successfully in Neon PostgreSQL!');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { initDatabase };
