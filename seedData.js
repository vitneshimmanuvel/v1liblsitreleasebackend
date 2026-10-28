const { query } = require('./db');

async function seedData() {
  console.log('Seeding initial data into Neon PostgreSQL...');

  try {
    // 1. Clear existing seed data cleanly
    await query(`TRUNCATE TABLE contextual_artifacts, operational_metrics, maker_checker_requests, change_logs, policy_versions, policies, departments CASCADE;`);

    // 2. Insert Departments matching Base44 / Team Guru screenshot & bank operations
    const departments = [
      { id: 'company-policies', name: 'Company Policies', icon: 'shield', sort_order: 1 },
      { id: 'onboarding', name: 'Onboarding', icon: 'user-plus', sort_order: 2 },
      { id: 'retail-lending', name: 'Retail Lending', icon: 'credit-card', sort_order: 3 },
      { id: 'security', name: 'Security & InfoSec', icon: 'lock', sort_order: 4 },
      { id: 'legal-compliance', name: 'Legal & Compliance', icon: 'scale', sort_order: 5 },
      { id: 'it-support', name: 'IT & Tech Support', icon: 'laptop', sort_order: 6 },
      { id: 'customer-support', name: 'Customer Support', icon: 'headphones', sort_order: 7 },
      { id: 'finance-operations', name: 'Finance & Operations', icon: 'wallet', sort_order: 8 },
      { id: 'hr-people', name: 'HR & People', icon: 'users', sort_order: 9 },
      { id: 'product-dev', name: 'Product & Development', icon: 'wrench', sort_order: 10 },
      { id: 'project-management', name: 'Project Management', icon: 'folder', sort_order: 11 },
      { id: 'announcements', name: 'Announcements', icon: 'megaphone', sort_order: 12 },
      { id: 'meeting-notes', name: 'Meeting Notes', icon: 'file-text', sort_order: 13 },
      { id: 'templates-docs', name: 'Templates & Documents', icon: 'files', sort_order: 14 }
    ];

    for (const d of departments) {
      await query(
        `INSERT INTO departments (id, name, icon, hierarchy_level, sort_order, created_by)
         VALUES ($1, $2, $3, 'section', $4, 'System Administrator')
         ON CONFLICT (id) DO NOTHING;`,
        [d.id, d.name, d.icon, d.sort_order]
      );
    }

    // 3. Insert Realistic Policies (including masked and active policies)
    const policies = [
      // 1. Retail Lending
      {
        id: 'credit-card-limits-policy',
        department_id: 'retail-lending',
        title: 'Credit Card Issuance & Daily Limit Policy',
        summary: 'Defines tiered approval thresholds, mandatory KYC/credit score verification, and turnaround SLAs for consumer card issuance.',
        version: '1.2',
        status: 'active',
        is_masked: false,
        content: `### 1. Purpose & Scope
This operational policy outlines the mandatory criteria and authorization limits for underwriting, approving, and activating consumer credit cards for Commonwealth Bank of Australia (CBA).

### 2. Operational Rules & Mandatory Verifications
1. **Applicant Eligibility**: Minimum age 18 years, Australian resident, minimum ongoing gross income of $35,000 per annum.
2. **Comprehensive Credit Check**: Credit report verification via Equifax. Applications with credit scores below 620 require Level 2 supervisory review.
3. **Identity Verification (KYC)**: Biometric digital ID or 100-point physical verification before card issuance.
4. **Card Limits**:
   - Tier 1 Standard Card: Maximum single credit limit of $5,000 (automated approval eligible).
   - Tier 2 Gold/Platinum Card: Up to $15,000 (Requires Credit Officer sign-off).
   - Tier 3 Diamond / Executive: Up to $50,000 (Requires Department Manager approval).

### 3. Turnaround SLA & Compliance Monitoring
All standard consumer applications must be adjudicated within 24 hours of document submission. Escalated applications must resolve within 48 business hours.`,
        parameters: {
          approval_limits: {
            officer_cap: '$5,000',
            manager_cap: '$15,000',
            executive_cap: '$50,000'
          },
          turnaround_sla: '24 Hours',
          verification_steps: [
            'Digital KYC 100-Point Identity Verification',
            'Equifax Comprehensive Credit History Score >= 620',
            '30-Day Pay Slip & Bank Account Income Verification',
            'Serviceability Buffer Calculation (+3.0% over active rate)'
          ]
        },
        created_by: 'Sarah Jenkins (Maker)'
      },
      {
        id: 'personal-loans-assessment-sop',
        department_id: 'retail-lending',
        title: 'Personal Loans & Overdraft Assessment Procedure',
        summary: 'Standard underwriting guidelines for unsecured personal loans, car loans, and revolving overdraft lines.',
        version: '1.1',
        status: 'active',
        is_masked: false,
        content: `### 1. Underwriting Principles
Governs credit assessment for unsecured personal loans up to $75,000 AUD, vehicle loans, and overdraft limits across retail branch networks.

### 2. Key Criteria
1. **Employment Stability**: Minimum 6 months continuous employment with current employer.
2. **Debt-to-Income (DTI)**: Maximum aggregate DTI of 6.0x across all credit liabilities.
3. **HEM Benchmark**: Living expense verification comparing declared customer expenses against Household Expenditure Measure (HEM).`,
        parameters: {
          approval_limits: {
            officer_cap: '$10,000',
            manager_cap: '$30,000',
            executive_cap: '$75,000'
          },
          turnaround_sla: '48 Hours',
          verification_steps: [
            'Employment & 2-Month Proof of Continuous Income',
            'Comprehensive Credit Report Check (CCR)',
            'Debt-to-Income (DTI) Ratio <= 6x Benchmark',
            'Living Expense Assessment via Transaction Categorization'
          ]
        },
        created_by: 'Marcus Vance (Approver)'
      },

      // 2. Onboarding
      {
        id: 'customer-onboarding-sop',
        department_id: 'onboarding',
        title: 'Digital Customer Onboarding & Identity Verification SOP',
        summary: 'Standard operating procedure for fast-track mobile and web digital banking customer onboarding.',
        version: '1.0',
        status: 'active',
        is_masked: false,
        content: `### 1. Overview
Ensures frictionless retail account opening while maintaining strict compliance with AUSTRAC customer identification and AML/CTF standards.

### 2. Verification Flow
1. **Document Verification**: Real-time cross-match against Australian Document Verification Service (DVS) for Passport or Driver Licence.
2. **Biometric Face Match**: Active liveness detection score >= 92%.
3. **PEP & Sanctions**: Instantaneous screening against DFAT and international sanctions databases.`,
        parameters: {
          approval_limits: {
            initial_funding_cap: '$2,500'
          },
          turnaround_sla: '5 Minutes (Automated Digital)',
          verification_steps: [
            'Document Verification Service (DVS) National Check',
            'Biometric Face Liveness Score >= 92%',
            'Sanctions & Politically Exposed Persons (PEP) Screening',
            'Mobile Number Verification via One-Time Security PIN'
          ]
        },
        created_by: 'Sarah Jenkins (Maker)'
      },
      {
        id: 'commercial-kyc-sop',
        department_id: 'onboarding',
        title: 'Commercial Entity KYC & Beneficial Ownership Guideline',
        summary: 'Verification workflow for corporate accounts, trusts, partnerships, and ultimate beneficial owners (UBO >= 25%).',
        version: '1.3',
        status: 'active',
        is_masked: false,
        content: `### 1. Corporate Customer Due Diligence
Mandatory verification steps before activating commercial deposit or merchant accounts for Australian registered entities.

### 2. Governance Requirements
1. **ASIC Validation**: Live extract confirming company status, registered office, and current directors.
2. **Beneficial Ownership (UBO)**: Identification of all natural persons holding 25% or more equity or effective control.
3. **Signatory Mandate**: Formal board resolution authorizing named operators.`,
        parameters: {
          approval_limits: {
            operating_account_ceiling: '$250,000'
          },
          turnaround_sla: '3 Business Days',
          verification_steps: [
            'ASIC Company Extract & Certificate of Registration',
            'Ultimate Beneficial Ownership (UBO >= 25%) Identification',
            'Authorized Signatory ID & Board Resolution Mandate',
            'Industry Risk Categorization & Source of Wealth Review'
          ]
        },
        created_by: 'Marcus Vance (Approver)'
      },

      // 3. Security & InfoSec
      {
        id: 'remote-access-security-policy',
        department_id: 'security',
        title: 'Remote Workplace Access & Multi-Factor Protocol',
        summary: 'Mandatory technical standards for bank employees accessing internal banking systems and customer databases remotely.',
        version: '1.1',
        status: 'active',
        is_masked: false,
        content: `### 1. Mandatory Controls
1. **VPN & Encryption**: All remote access must route through Commonwealth Bank enterprise VPN with TLS 1.3 encryption.
2. **Multi-Factor Authentication**: Hardware FIDO2 token or enterprise push notification with number matching required on every session.
3. **Session Lock**: Workstations must enforce automatic screen lock after 5 minutes of inactivity.`,
        parameters: {
          approval_limits: {
            access_clearance: 'Standard Clearance'
          },
          turnaround_sla: 'Immediate / Continuous',
          verification_steps: [
            'FIDO2 / Hardware Token Authentication',
            'Device Health & MDM Encryption Check',
            'Geo-location Velocity Anomaly Detection',
            'Automatic Inactivity Screen Lock (5 Minutes)'
          ]
        },
        created_by: 'Marcus Vance (Approver)'
      },
      {
        id: 'privileged-access-sop',
        department_id: 'security',
        title: 'Privileged Access Management & Session Termination Standard',
        summary: 'Governance protocol for administrator access, database root access, cryptographic keys, and automated session auditing.',
        version: '2.0',
        status: 'active',
        is_masked: false,
        content: `### 1. Scope
Applies to all database administrators, cloud infrastructure operators, and core banking systems engineers.

### 2. Safeguards
1. **Just-In-Time Elevation**: Elevated rights expire after a maximum 4-hour lease window.
2. **Dual Approval**: Production modifications require secondary approver sign-off.
3. **Audit Logging**: All privileged terminal sessions are keystroke-indexed and cryptographically hashed.`,
        parameters: {
          approval_limits: {
            authorization_mode: 'Dual-Admin Required'
          },
          turnaround_sla: '1 Hour Emergency Escalation',
          verification_steps: [
            'Just-In-Time (JIT) Elevated Credential Provisioning',
            'Keystroke & Session Video Recording for Core DB Access',
            'Mandatory 4-Eye Principle for Production Changes',
            'Maximum 4-Hour Privileged Lease Window'
          ]
        },
        created_by: 'David Miller (Maker)'
      },

      // 4. Legal & Compliance
      {
        id: 'aml-ctf-screening-policy',
        department_id: 'legal-compliance',
        title: 'Anti-Money Laundering & Sanctions Screening Standard',
        summary: 'Operational rules for AUSTRAC transaction reporting, real-time sanctions screening, and suspicious matter reports (SMR).',
        version: '2.1',
        status: 'active',
        is_masked: false,
        content: `### 1. AUSTRAC Regulatory Reporting
Mandatory compliance standards aligned with the Anti-Money Laundering and Counter-Terrorism Financing Act 2006.

### 2. Operational Obligations
1. **Threshold Transaction Reports (TTR)**: Cash transfers >= $10,000 AUD reported within 10 business days.
2. **Suspicious Matter Reports (SMR)**: Suspicious activity notifications submitted within 24 hours (terrorism financing) or 3 business days (money laundering).
3. **Automated Sanctions Filtering**: Real-time screening of inbound and outbound SWIFT / NPP payments against DFAT lists.`,
        parameters: {
          approval_limits: {
            reporting_threshold: '$10,000 AUD TTR'
          },
          turnaround_sla: '24 Hours for SMR Submission',
          verification_steps: [
            'Real-time DFAT & UN Sanctions List Cross-matching',
            'Significant Cash Transaction Reporting (SCTR) Thresholds',
            'Automated Transaction Monitoring for Smurfing & Layering',
            '24-Hour Regulatory AUSTRAC Notification Escalation'
          ]
        },
        created_by: 'Marcus Vance (Approver)'
      },
      {
        id: 'cdr-privacy-policy',
        department_id: 'legal-compliance',
        title: 'Consumer Data Right (CDR) & Privacy Disclosures Policy',
        summary: 'Requirements for open banking data sharing, customer consent capture, revocation protocols, and APRA CPS 234 privacy adherence.',
        version: '1.4',
        status: 'active',
        is_masked: false,
        content: `### 1. Open Banking Framework
Governs secure customer-directed sharing of banking transaction data with Accredited Data Recipients (ADRs) under the Consumer Data Right.

### 2. Rules & Governance
1. **Consent Management**: Explicit, unbundled, time-limited consumer consents.
2. **Instant Revocation**: Ability for customers to revoke data-sharing access in single click via mobile banking app.
3. **Data Redaction**: Strict masking of joint account non-consenting parties' details.`,
        parameters: {
          approval_limits: {
            scope: 'Accredited Data Recipient (ADR) Scope'
          },
          turnaround_sla: 'Real-time API Consent Sync',
          verification_steps: [
            'Explicit & Unbundled Consumer Consent Verification',
            'End-to-End TLS 1.3 Encryption & MTLS for API Transfers',
            'Instantaneous Consent Revocation & Data Deletion Mechanism',
            'Annual Independent CDR Security Audit Review'
          ]
        },
        created_by: 'Sarah Jenkins (Maker)'
      }
    ];

    for (const p of policies) {
      await query(
        `INSERT INTO policies (id, department_id, title, summary, version, status, is_masked, content, parameters, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;`,
        [p.id, p.department_id, p.title, p.summary, p.version, p.status, p.is_masked, p.content, JSON.stringify(p.parameters), p.created_by]
      );

      // Add to policy_versions
      await query(
        `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [p.id, p.version, p.content, JSON.stringify(p.parameters), p.created_by, 'Initial policy authoring & publishing']
      );
    }

    // 4. Insert Contextual Artifacts (Pane 3 Tabs with Active / Inactive states)
    const artifacts = [
      {
        policy_id: 'credit-card-limits-policy',
        tab_type: 'training',
        title: 'Credit Card Limit Assessment Video & Interactive Guide',
        description: 'Interactive step-by-step module for junior credit officers on evaluating debt-to-income ratios.',
        url_or_file: 'https://training.cba.com.au/modules/card-limits-2026',
        is_active: true
      },
      {
        policy_id: 'credit-card-limits-policy',
        tab_type: 'reports',
        title: 'Monthly Consumer Credit Underwriting Audit Report',
        description: 'Audit report summarizing 14,200 issued cards, zero high-risk SLA breaches, and approval distributions.',
        url_or_file: '/reports/underwriting-q3.pdf',
        is_active: true
      },
      {
        policy_id: 'credit-card-limits-policy',
        tab_type: 'issues',
        title: 'INC-2026-112: Discretionary Limit Exception Variance',
        description: 'Resolved: 3 applications flagged with manual income calculation variance. Resolved with retraining.',
        url_or_file: '#issue-112',
        is_active: true
      },
      {
        policy_id: 'credit-card-limits-policy',
        tab_type: 'faqs',
        title: 'Staff FAQs: Handling Overseas Applicant Income',
        description: 'Clear procedural instructions for applicants with international employment income streams.',
        url_or_file: '#faq-overseas-income',
        is_active: true
      },
      {
        policy_id: 'credit-card-limits-policy',
        tab_type: 'regulatory',
        title: 'Secondary Reference: APRA APS 220 Credit Quality Baselines',
        description: 'Optional reference to statutory prudential credit management benchmarks.',
        url_or_file: 'https://apra.gov.au/standards/aps-220',
        is_active: true
      }
    ];

    for (const a of artifacts) {
      await query(
        `INSERT INTO contextual_artifacts (policy_id, tab_type, title, description, url_or_file, is_active)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [a.policy_id, a.tab_type, a.title, a.description, a.url_or_file, a.is_active]
      );
    }

    // 5. Insert Maker-Checker Requests (For Checker's Notification Counter!)
    await query(`
      INSERT INTO maker_checker_requests (policy_id, policy_title, department_name, maker_name, maker_role, proposed_changes, status, is_closed)
      VALUES (
        'credit-card-limits-policy',
        'Credit Card Issuance & Daily Limit Policy',
        'Retail Lending',
        'Sarah Jenkins (Maker)',
        'Senior Credit Assessor',
        '{"clause": "Section 2.4", "proposed": "Increase Manager Tier 2 Approval Cap from $15,000 to $20,000 for verified prime borrowers (Equifax score >= 750).", "justification": "Reduces executive escalation bottleneck by 35% during holiday peak season."}'::jsonb,
        'pending',
        false
      );
    `);

    // 6. Insert Operational Performance Metrics & User-Defined Reports
    const metrics = [
      {
        department_id: 'retail-lending',
        metric_name: 'Card Application Turnaround SLA Compliance',
        target_value: '95.0%',
        actual_value: '98.4%',
        sla_hours: 24,
        sla_status: 'optimal',
        report_format: 'url',
        report_link: 'https://analytics.cba.com.au/dashboards/credit-sla-performance',
        trend_data: JSON.stringify([
          { week: 'W1', target: 95, actual: 96.2 },
          { week: 'W2', target: 95, actual: 97.1 },
          { week: 'W3', target: 95, actual: 98.4 }
        ])
      },
      {
        department_id: 'retail-lending',
        metric_name: 'Monthly Underwriting Review Package (PDF)',
        target_value: '100%',
        actual_value: '100%',
        sla_hours: 48,
        sla_status: 'optimal',
        report_format: 'pdf',
        report_link: '/reports/monthly-underwriting-october2026.pdf',
        trend_data: JSON.stringify([])
      },
      {
        department_id: 'retail-lending',
        metric_name: 'Application Exception Transaction Log (Excel)',
        target_value: '< 2.0%',
        actual_value: '1.2%',
        sla_hours: 24,
        sla_status: 'optimal',
        report_format: 'excel',
        report_link: '/reports/exceptions-oct2026.xlsx',
        trend_data: JSON.stringify([])
      }
    ];

    for (const m of metrics) {
      await query(
        `INSERT INTO operational_metrics (department_id, metric_name, target_value, actual_value, sla_hours, sla_status, report_format, report_link, trend_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [m.department_id, m.metric_name, m.target_value, m.actual_value, m.sla_hours, m.sla_status, m.report_format, m.report_link, m.trend_data]
      );
    }

    // 7. Initial Change Logs
    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES 
        ('policy', 'credit-card-limits-policy', 'Sarah Jenkins', 'CREATED', 'Retail Lending', 'Initial policy authoring with Tier 1/2/3 limit thresholds'),
        ('department', 'retail-lending', 'Marcus Vance', 'CREATED', 'Operations', 'Created new Departmental Partition: Retail Lending with change control tracking'),
        ('maker_checker', 'credit-card-limits-policy', 'Sarah Jenkins', 'SUBMITTED', 'Retail Lending', 'Submitted change request to raise Manager tier limit to $20,000');
    `);

    console.log('✅ Initial database seed completed successfully!');
  } catch (err) {
    console.error('❌ Seeding error:', err);
    throw err;
  }
}

if (require.main === module) {
  seedData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedData };
