const { query } = require('./db');

async function updateDb() {
  console.log('Updating Neon DB with Credit Cards library and policies...');

  try {
    // 1. Ensure departments table has credit-cards and re-order primary departments
    await query(`
      INSERT INTO departments (id, name, icon, hierarchy_level, sort_order)
      VALUES 
        ('credit-cards', 'Credit Cards', 'credit-card', 'section', 1),
        ('retail-lending', 'Retail Lending', 'piggy-bank', 'section', 2),
        ('onboarding', 'Onboarding', 'user-check', 'section', 3),
        ('security', 'Security & InfoSec', 'shield', 'section', 4),
        ('legal-compliance', 'Legal & Compliance', 'scale', 'section', 5)
      ON CONFLICT (id) DO UPDATE 
        SET name = EXCLUDED.name, 
            icon = EXCLUDED.icon, 
            sort_order = EXCLUDED.sort_order;
    `);

    await query("UPDATE departments SET sort_order = 15 WHERE id = 'company-policies'");

    // 2. Insert / Update the 10 core policies (2 per primary department)
    const policies = [
      // 1. Credit Cards Library (2 policies)
      {
        id: 'credit-card-limits-policy',
        department_id: 'credit-cards',
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
          approval_limits: { officer_cap: '$5,000', manager_cap: '$15,000', executive_cap: '$50,000' },
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
        id: 'credit-card-rewards-sop',
        department_id: 'credit-cards',
        title: 'Revolving Credit Line & Card Activation Standard',
        summary: 'Procedures for digital wallet tokenization, revolving balance risk buffers, and instant credit limit adjustments.',
        version: '1.1',
        status: 'active',
        is_masked: false,
        content: `### 1. Card Activation & Tokenization
Governs instant card provisioning into Apple Wallet, Google Pay, and physical chip card PIN generation.

### 2. Revolving Credit Facility Guidelines
1. **Automated Risk Monitoring**: Daily review of revolving credit utilization (>85% triggers early warning flags).
2. **Limit Increase Requests**: Require 6 months on-time payment track record before eligibility.
3. **Emergency Limit Blocks**: Suspicious transactions trigger automated SMS confirmation and transient card lock.`,
        parameters: {
          approval_limits: { officer_cap: '$10,000', manager_cap: '$25,000' },
          turnaround_sla: '4 Hours',
          verification_steps: [
            'Automated 3-Factor Digital Device Binding',
            'NPP Real-time PayID Activation Check',
            'SMS One-Time Passcode Authorization'
          ]
        },
        created_by: 'Marcus Vance (Approver)'
      },

      // 2. Retail Lending Library (2 policies)
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
          approval_limits: { officer_cap: '$10,000', manager_cap: '$30,000', executive_cap: '$75,000' },
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
      {
        id: 'mortgage-underwriting-standard',
        department_id: 'retail-lending',
        title: 'Residential Mortgages & Tier-1 Home Loan Assessment Standard',
        summary: 'Regulatory assessment benchmarks for owner-occupied and investor residential mortgages under APRA APS 220 directives.',
        version: '2.0',
        status: 'active',
        is_masked: false,
        content: `### 1. Scope & Prudential Mandate
Applies to all retail mortgage originations across branch, online, and broker channels adhering to APRA APS 220 credit risk standards.

### 2. Mandatory Underwriting Thresholds
1. **Serviceability Buffer**: Mandatory minimum +3.00% interest rate buffer applied over the standard variable rate.
2. **Loan-to-Value Ratio (LVR)**: LVR exceeding 80% requires Lenders Mortgage Insurance (LMI) validation.
3. **Genuine Savings**: Minimum 5% verified genuine savings held for at least 3 continuous months.`,
        parameters: {
          approval_limits: { officer_cap: '$500,000', manager_cap: '$1,200,000', executive_cap: '$2,500,000' },
          turnaround_sla: '72 Hours',
          verification_steps: [
            '3-Month Genuine Savings Bank Statement Verification',
            'Valuation Report via CoreLogic Electronic Valuation (EVR)',
            'HEM Living Expense Cross-Verification',
            'Title Deed & Encumbrance Check via PEXA'
          ]
        },
        created_by: 'Sarah Jenkins (Maker)'
      },

      // 3. Onboarding Library (2 policies)
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
          approval_limits: { initial_funding_cap: '$2,500' },
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
          approval_limits: { operating_account_ceiling: '$250,000' },
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

      // 4. Security & InfoSec Library (2 policies)
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
          approval_limits: { access_clearance: 'Standard Clearance' },
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
          approval_limits: { authorization_mode: 'Dual-Admin Required' },
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

      // 5. Legal & Compliance Library (2 policies)
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
          approval_limits: { reporting_threshold: '$10,000 AUD TTR' },
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
          approval_limits: { scope: 'Accredited Data Recipient (ADR) Scope' },
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
      await query(`
        INSERT INTO policies (id, department_id, title, summary, version, status, is_masked, content, parameters, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE 
        SET department_id = EXCLUDED.department_id,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            version = EXCLUDED.version,
            status = 'active',
            is_masked = false,
            content = EXCLUDED.content,
            parameters = EXCLUDED.parameters,
            updated_at = CURRENT_TIMESTAMP;
      `, [p.id, p.department_id, p.title, p.summary, p.version, p.status, p.is_masked, p.content, p.parameters, p.created_by]);
    }

    console.log('Successfully updated database with Credit Cards library and 10 active policies!');
  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    process.exit(0);
  }
}

updateDb();
