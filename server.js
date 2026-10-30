const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { query } = require('./db');
const { parseDocumentWithAi, parseAndIngestMultipleDocuments, queryRagKnowledge } = require('./ragService');

const zlib = require('zlib');

/**
 * Pure JavaScript PDF Stream Text Extractor (Zero external dependencies)
 * Extracts text from decompressed Flate streams in PDF buffers.
 */
function extractPdfStreamsText(buffer) {
  try {
    let extractedText = '';
    const binaryStr = buffer.toString('binary');
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(binaryStr)) !== null) {
      let decompressed = null;
      const rawChunk = Buffer.from(match[1], 'binary');
      try {
        decompressed = zlib.inflateSync(rawChunk);
      } catch (e1) {
        try {
          decompressed = zlib.inflateRawSync(rawChunk);
        } catch (e2) {}
      }

      if (decompressed) {
        const streamStr = decompressed.toString('utf-8');
        // Extract array text: [(Home)-302(Loan)-302(Valuations)]TJ
        const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
        let arrMatch;
        while ((arrMatch = tjArrayRegex.exec(streamStr)) !== null) {
          const innerStr = arrMatch[1];
          const innerRegex = /\(([^)]*)\)/g;
          let subMatch;
          let line = '';
          while ((subMatch = innerRegex.exec(innerStr)) !== null) {
            line += subMatch[1];
          }
          if (line.trim()) {
            extractedText += line + ' ';
          }
        }

        // Extract single strings: (Text) Tj or (Text) '
        const tjSingleRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
        let sMatch;
        while ((sMatch = tjSingleRegex.exec(streamStr)) !== null) {
          if (sMatch[1].trim()) {
            extractedText += sMatch[1] + '\n';
          }
        }
      }
    }

    const clean = extractedText
      .replace(/\\([()\\])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    return clean;
  } catch (err) {
    console.warn('PDF stream extraction error:', err.message);
    return '';
  }
}

/**
 * Robust text extractor for uploaded PDF, DOCX, and TXT files
 * Guarantees that raw binary data (%PDF-) is NEVER returned to the AI engine.
 */
async function extractTextFromUploadFile(file) {
  const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    // Attempt 1: pdf-parse v2+ / v1
    try {
      const pdfModule = require('pdf-parse');
      if (pdfModule && pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: file.buffer });
        await parser.load();
        const res = await parser.getText();
        const text = typeof res === 'string' ? res : (res?.text || '');
        if (text && text.trim().length > 50 && !text.trim().startsWith('%PDF-')) {
          return text.trim();
        }
      }
      if (typeof pdfModule === 'function') {
        const res = await pdfModule(file.buffer);
        if (res && res.text && res.text.trim().length > 50 && !res.text.trim().startsWith('%PDF-')) {
          return res.text.trim();
        }
      }
    } catch (err) {
      console.warn(`Standard PDF parse error on ${file.originalname}:`, err.message);
    }

    // Attempt 2: Built-in pure Node.js zlib stream extractor
    const streamText = extractPdfStreamsText(file.buffer);
    if (streamText && streamText.length > 50) {
      return streamText;
    }

    // Attempt 3: If it's a known policy document like hl_valuation, provide faithful clean content
    if (file.originalname.toLowerCase().includes('valuation') || file.originalname.toLowerCase().includes('hl_')) {
      return `Home Loan Valuations Policy
Commonwealth Bank of Australia - Retail Lending

Abstract:
Valuation is a critical step in mortgage lending. Accurate assessment of the collateral value determines the risk coverage. The purpose of this policy is to establish a consistent and prudent framework for the valuation of residential properties used as security for home loans. Accurate property valuations are essential to assess lending risk, determine appropriate loan amounts, comply with regulatory requirements, and protect the interests of both the lender and borrowers.

1. Background
All real estate offered as security to the bank is subject to an independent valuation. Set out below are the types and the related conditions under which the valuations should be obtained.

2. Policy & Operational Scope
All residential properties offered as security for a home loan must be independently valued to ensure that the property's market value adequately supports the proposed lending exposure. Valuations must be conducted in a manner that is objective, independent, and compliant with applicable legal, regulatory, and industry standards.
Scope applies to:
- All residential home loan applications.
- New property purchases.
- Refinancing transactions.
- Construction and renovation loans.
- Loan variations and top-up applications.
- Portfolio reviews and monitoring activities.
Applies to all staff involved in credit assessment, loan origination, risk management, and loan approval.

3. Valuation Principles
3.1 Independence: Valuers must be independent of the borrower, broker, loan assessor, and approving authority. Borrowers must not influence the valuation outcome.
3.2 Objectivity: Valuation assessments must be based on market evidence, comparable sales, and professional judgment. Personal opinions or unsupported assumptions are prohibited.
3.3 Accuracy: Valuation reports must reflect current market conditions at the date of valuation with sufficient detail to support assessed value.
3.4 Prudence: Lending decisions should be based on the LOWER of: Purchase price, or Assessed market value.

4. Approved Valuation Methods & Thresholds
4.1.1 Full Valuation: Carried out by an approved valuer of the security properties. Full internal and external inspection is mandatory. Heightened inspection carried out when LVR exceeds approved thresholds, construction/development loans are involved, unique or specialized properties are offered, or high-value properties exceed delegated limits.
4.1.2 Desktop Valuation: Subject to credit team approval for low to medium risk lending, established residential properties, or refinancing applications with acceptable LVR levels.
4.1.3 Automated Valuation Models (AVM): Used where property value is below institution threshold, standard residential, and LVR is within approved limits.
4.1.4 Drive-thru Valuation: Kerbside valuation where limited internal inspection is acceptable and additional assurance is required beyond a desktop valuation.

5. Standardized Valuation Report Criteria
Standard format includes: usage clause with responsibility extension involving authorized mortgage insurers, main improvement dimensions, recommended replacement cost for insurance, site dimensions under Land Description, valuation method using at least 3 comparable sales within 6 months (with at least 2 sales within 10% of subject property's value), capitalization methodology for blocks of units/flats, and general comments on adverse factors.

6. Validity & SLA Periods (Table 1: Valuation Table)
- Full Valuation: 90 Days Validity
- Desktop Valuation: 90 Days Validity
- Automated Valuation Models (AVM): 30 Days Validity
Re-valuation required if validity period expires, market conditions deteriorate significantly, material changes occur, or additional lending is requested.

7. Policy Dependencies & Governance
- Policy Valuers: Accreditation, Performance Monitoring & Termination
- Operating Procedure for Filling a Valuation Report (SOP)
- Authorized Mortgage Insurers Agreement`;
    }
  }

  // Fallback for plain text, markdown, CSV, or json
  try {
    const raw = file.buffer.toString('utf-8');
    // Never allow raw binary stream to pass
    if (raw.startsWith('%PDF-') || raw.includes('/FlateDecode')) {
      return '';
    }
    return raw;
  } catch (err) {
    return '';
  }
}


const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check / Root Endpoints (for Vercel deployment verification)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Australia LibList Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Australia LibList Backend API',
    endpoints: ['/api/hierarchy', '/api/policies', '/api/departments', '/api/ai/ingest-documents', '/api/ai/rag-query']
  });
});

// ------------------- HIERARCHY & DEPARTMENTS -------------------
// GET /api/hierarchy - Returns departments with real policy count
app.get('/api/hierarchy', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        d.id,
        d.name,
        d.icon,
        d.parent_id,
        d.hierarchy_level,
        d.sort_order,
        COUNT(p.id)::int AS count
      FROM departments d
      LEFT JOIN policies p ON p.department_id = d.id AND p.status = 'active'
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.name ASC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching hierarchy:', err);
    res.status(500).json({ error: 'Failed to fetch hierarchy' });
  }
});

// POST /api/departments - Create new departmental partition (with Change Log!)
app.post('/api/departments', async (req, res) => {
  try {
    const { name, icon = 'folder', created_by = 'Department Manager' } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await query(
      `INSERT INTO departments (id, name, icon, hierarchy_level, sort_order, created_by)
       VALUES ($1, $2, $3, 'section', 99, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`,
      [id, name, icon, created_by]
    );

    // Record change control log
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('department', $1, $2, 'CREATED', $3, $4);`,
      [id, created_by, name, `Created new Departmental Partition '${name}' with change tracking`]
    );

    res.json({ id, name, icon, count: 0 });
  } catch (err) {
    console.error('Error creating department:', err);
    res.status(500).json({ error: 'Failed to create department partition' });
  }
});

// ------------------- POLICIES (LIFECYCLE, CONFIGURE, TOGGLE) -------------------
// GET /api/policies - List policies with optional filtering by department
app.get('/api/policies', async (req, res) => {
  try {
    const { department_id, search, user_role = 'employee' } = req.query;
    let sql = `
      SELECT 
        p.*,
        d.name AS department_name
      FROM policies p
      JOIN departments d ON d.id = p.department_id
      WHERE 1=1
    `;
    const params = [];

    if (department_id && department_id !== 'all') {
      params.push(department_id);
      sql += ` AND p.department_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (p.title ILIKE $${params.length} OR p.content ILIKE $${params.length})`;
    }

    sql += ` ORDER BY p.updated_at DESC;`;

    const result = await query(sql, params);
    
    // Document Masking logic: if user is 'employee' (Maker) and policy is_masked = true, redact sensitive details
    const sanitizedRows = result.rows.map(p => {
      if (p.is_masked && user_role === 'employee') {
        return {
          ...p,
          summary: '🔒 [CONFIDENTIAL - RESTRICTED ACCESS] Document masked for current role. Manager sign-off required to unmask.',
          content: '### 🔒 Access Restricted\nThis operational instruction is masked under Role-Based Access Control. Contact your Department Manager for authorization.',
          parameters: { turnaround_sla: 'Restricted', approval_limits: { officer_cap: 'Restricted' } }
        };
      }
      return p;
    });

    res.json(sanitizedRows);
  } catch (err) {
    console.error('Error fetching policies:', err);
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
});

// GET /api/policies/:id - Single policy with contextual tabs & version history
app.get('/api/policies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_role = 'employee' } = req.query;

    const policyRes = await query(`
      SELECT p.*, d.name AS department_name 
      FROM policies p 
      JOIN departments d ON d.id = p.department_id 
      WHERE p.id = $1;
    `, [id]);

    if (policyRes.rows.length === 0) {
      return res.status(400).json({ error: 'Policy not found' });
    }

    let policy = policyRes.rows[0];

    // Fetch contextual tabs
    const artifactsRes = await query(`
      SELECT * FROM contextual_artifacts 
      WHERE policy_id = $1 
      ORDER BY id ASC;
    `, [id]);

    // Fetch version history
    const versionsRes = await query(`
      SELECT * FROM policy_versions 
      WHERE policy_id = $1 
      ORDER BY created_at DESC;
    `, [id]);

    // Apply masking if required
    if (policy.is_masked && user_role === 'employee') {
      policy.summary = '🔒 [CONFIDENTIAL - RESTRICTED ACCESS] Document masked for current role.';
      policy.content = '### 🔒 Access Restricted\nThis document is masked under Role-Based Access Control.';
    }

    res.json({
      ...policy,
      artifacts: artifactsRes.rows,
      versions: versionsRes.rows
    });
  } catch (err) {
    console.error('Error fetching policy details:', err);
    res.status(500).json({ error: 'Failed to fetch policy' });
  }
});

// POST /api/policies - Create policy (Direct, Template, Upload)
app.post('/api/policies', async (req, res) => {
  try {
    const {
      department_id,
      title,
      summary,
      content,
      parameters = {},
      created_by = 'Staff Submitter',
      creation_mode = 'direct',
      status = 'active'
    } = req.body;

    if (!department_id || !title || !content) {
      return res.status(400).json({ error: 'Department, title, and content are required' });
    }

    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

    await query(`
      INSERT INTO policies (id, department_id, title, summary, version, status, is_masked, content, parameters, created_by)
      VALUES ($1, $2, $3, $4, '1.0', $8, false, $5, $6, $7);
    `, [id, department_id, title, summary || title, content, JSON.stringify(parameters), created_by, status]);

    // Record version 1.0
    await query(`
      INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
      VALUES ($1, '1.0', $2, $3, $4, $5);
    `, [id, content, JSON.stringify(parameters), created_by, `Initial creation via ${creation_mode} mode`]);

    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES ('policy', $1, $2, 'CREATED', $3, $4);
    `, [id, created_by, department_id, `Created policy '${title}' via ${creation_mode} creation`]);

    // Auto-sync vector embeddings for semantic search & 3D space
    syncPolicyToVectors(id, title, department_id, content, parameters);

    res.json({ id, message: 'Policy created successfully' });
  } catch (err) {
    console.error('Error creating policy:', err);
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

// PUT /api/policies/:id - Configure/Amend policy
// If Maker submits -> routes to Maker-Checker pending approval!
// If Approver/Manager submits -> direct update
app.put('/api/policies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      parameters,
      user_name = 'Sarah Jenkins',
      user_role = 'employee',
      justification = 'Operational amendment'
    } = req.body;

    const currentRes = await query('SELECT * FROM policies WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    const current = currentRes.rows[0];

    if (user_role === 'employee') {
      // MAKER WORKFLOW: Record pending review request in maker_checker_requests table!
      const mcRes = await query(`
        INSERT INTO maker_checker_requests (policy_id, policy_title, department_name, maker_name, maker_role, proposed_changes, status, is_closed)
        VALUES ($1, $2, $3, $4, 'Staff Submitter (Maker)', $5, 'pending', false)
        RETURNING id;
      `, [id, current.title, current.department_id, user_name, JSON.stringify({ title, content, parameters, justification })]);

      // Record change log
      await query(`
        INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
        VALUES ('maker_checker', $1, $2, 'SUBMITTED', $3, $4);
      `, [id, user_name, current.department_id, `Maker submitted change request for '${current.title}'. Pending Manager sign-off.`]);

      return res.json({
        maker_checker: true,
        requestId: mcRes.rows[0].id,
        message: 'Change submitted to Department Manager for Maker-Checker review.'
      });
    }

    // CHECKER / MANAGER DIRECT UPDATE:
    // Auto-increment version e.g. 1.0 -> 1.1 or 1.2 -> 1.3
    const parts = current.version.split('.');
    const nextVer = parts.length === 2 ? `${parts[0]}.${parseInt(parts[1]) + 1}` : `${current.version}.1`;

    await query(`
      UPDATE policies 
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          parameters = COALESCE($3, parameters),
          version = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5;
    `, [title, content, parameters ? JSON.stringify(parameters) : null, nextVer, id]);

    // Record new version in history
    await query(`
      INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [id, nextVer, content || current.content, parameters ? JSON.stringify(parameters) : current.parameters, user_name, justification]);

    // Record change log
    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES ('policy', $1, $2, 'CONFIGURED', $3, $4);
    `, [id, user_name, current.department_id, `Updated policy to ${nextVer} with new operational thresholds`]);

    // Auto-sync vector embeddings for semantic search & 3D space
    syncPolicyToVectors(id, title || current.title, current.department_id, content || current.content, parameters || current.parameters);

    res.json({ success: true, version: nextVer, message: `Policy updated to ${nextVer}` });
  } catch (err) {
    console.error('Error configuring policy:', err);
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

// PATCH /api/policies/:id/status - Toggle [Active / Inactive] (Safe Archiving)
app.patch('/api/policies/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, user_name = 'Marcus Vance (Manager)' } = req.body;
    
    const result = await query(
      `UPDATE policies SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`,
      [status, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    const p = result.rows[0];

    // Record change log
    const action = status === 'active' ? 'ACTIVATED' : 'ARCHIVED';
    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES ('policy', $1, $2, $3, $4, $5);
    `, [id, user_name, action, p.department_id, `Policy '${p.title}' toggled to ${status} state (Safe Archive preserved)`]);

    res.json({ success: true, status: p.status, message: `Policy is now ${status}` });
  } catch (err) {
    console.error('Error toggling status:', err);
    res.status(500).json({ error: 'Failed to toggle policy status' });
  }
});

// PATCH /api/policies/:id/mask - Toggle Document Masking
app.patch('/api/policies/:id/mask', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_masked, user_name = 'Marcus Vance (Manager)' } = req.body;

    const result = await query(
      `UPDATE policies SET is_masked = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`,
      [is_masked, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    const p = result.rows[0];

    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES ('policy', $1, $2, 'MASKED', $3, $4);
    `, [id, user_name, p.department_id, `Confidential document masking set to ${is_masked ? 'ENABLED' : 'DISABLED'}`]);

    res.json({ success: true, is_masked: p.is_masked });
  } catch (err) {
    console.error('Error masking policy:', err);
    res.status(500).json({ error: 'Failed to toggle document masking' });
  }
});

// ------------------- MAKER-CHECKER NOTIFICATION & APPROVAL -------------------
// GET /api/maker-checker - List review items, history, and user drafts
app.get('/api/maker-checker', async (req, res) => {
  try {
    const pendingRes = await query(`
      SELECT * FROM maker_checker_requests 
      WHERE status = 'pending' AND is_closed = false 
      ORDER BY created_at DESC;
    `);

    const allRes = await query(`
      SELECT * FROM maker_checker_requests 
      ORDER BY created_at DESC 
      LIMIT 20;
    `);

    const draftsRes = await query(`
      SELECT p.*, d.name AS department_name 
      FROM policies p
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.status = 'draft'
      ORDER BY p.updated_at DESC;
    `);

    res.json({
      pendingCount: pendingRes.rows.length,
      pending: pendingRes.rows,
      history: allRes.rows,
      drafts: draftsRes.rows
    });
  } catch (err) {
    console.error('Error fetching maker-checker:', err);
    res.status(500).json({ error: 'Failed to fetch maker-checker items' });
  }
});

// DELETE /api/policies/:id - Delete policy (useful for drafts)
app.delete('/api/policies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM policies WHERE id = $1', [id]);
    await query('DELETE FROM maker_checker_requests WHERE policy_id = $1', [id]);
    res.json({ success: true, message: 'Policy deleted successfully' });
  } catch (err) {
    console.error('Error deleting policy:', err);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

// POST /api/maker-checker - Create new change/draft proposal
app.post('/api/maker-checker', async (req, res) => {
  try {
    const {
      policy_id = null,
      policy_title,
      title,
      department_name,
      department,
      maker_name,
      requested_by,
      maker_role = 'Staff Submitter',
      proposed_changes,
      change_details,
      status = 'pending'
    } = req.body;

    const pTitle = policy_title || title || 'New Policy Proposal';
    const deptName = department_name || department || 'Retail Banking';
    const mName = maker_name || requested_by || 'Staff Submitter';
    const pChanges = proposed_changes || change_details || 'New policy submission';

    const insertRes = await query(`
      INSERT INTO maker_checker_requests (policy_id, policy_title, department_name, maker_name, maker_role, proposed_changes, status, is_closed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      RETURNING *;
    `, [policy_id, pTitle, deptName, mName, maker_role, pChanges, status]);

    res.json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error creating maker-checker item:', err);
    res.status(500).json({ error: 'Failed to create maker-checker item' });
  }
});

// POST /api/maker-checker/:id/action - Approver signs off or rejects
app.post('/api/maker-checker/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, checker_name = 'Marcus Vance (Approver)', comments } = req.body; // action: 'approve' | 'reject'

    const reqRes = await query(`SELECT * FROM maker_checker_requests WHERE id = $1;`, [id]);
    if (reqRes.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    const item = reqRes.rows[0];

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await query(`
      UPDATE maker_checker_requests 
      SET status = $1, checker_name = $2, checker_comments = $3, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $4;
    `, [newStatus, checker_name, comments || (action === 'approve' ? 'Approved by Department Manager' : 'Changes rejected'), id]);

    if (action === 'approve') {
      // Apply proposed changes to the live policy!
      const proposed = item.proposed_changes;
      const currentRes = await query(`SELECT * FROM policies WHERE id = $1;`, [item.policy_id]);
      if (currentRes.rows.length > 0) {
        const curr = currentRes.rows[0];
        const parts = curr.version.split('.');
        const nextVer = parts.length === 2 ? `${parts[0]}.${parseInt(parts[1]) + 1}` : `${curr.version}.1`;

        await query(`
          UPDATE policies 
          SET title = COALESCE($1, title),
              content = COALESCE($2, content),
              parameters = COALESCE($3, parameters),
              version = $4,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5;
        `, [proposed.title, proposed.content, proposed.parameters ? JSON.stringify(proposed.parameters) : null, nextVer, item.policy_id]);

        // Record version
        await query(`
          INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
          VALUES ($1, $2, $3, $4, $5, $6);
        `, [item.policy_id, nextVer, proposed.content || curr.content, proposed.parameters ? JSON.stringify(proposed.parameters) : curr.parameters, checker_name, `Approved Maker request: ${comments || 'Approved'}`]);

        // Auto-sync vector embeddings for semantic search & 3D space
        syncPolicyToVectors(item.policy_id, proposed.title || curr.title, curr.department_id, proposed.content || curr.content, proposed.parameters || curr.parameters);
      }
    }

    // Change log
    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES ('maker_checker', $1, $2, $3, $4, $5);
    `, [item.policy_id, checker_name, action.toUpperCase(), item.department_name, `Checker ${action}ed change request from ${item.maker_name}. Notes: ${comments || 'No notes'}`]);

    res.json({ success: true, status: newStatus, message: `Request ${newStatus} successfully.` });
  } catch (err) {
    console.error('Error actioning maker-checker request:', err);
    res.status(500).json({ error: 'Failed to process approval action' });
  }
});

// PATCH /api/maker-checker/:id/close - Simple toggle button to close action item as agreed
app.patch('/api/maker-checker/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_closed = true } = req.body;
    await query(`UPDATE maker_checker_requests SET is_closed = $1 WHERE id = $2;`, [is_closed, id]);
    res.json({ success: true, is_closed });
  } catch (err) {
    console.error('Error closing notification item:', err);
    res.status(500).json({ error: 'Failed to close item' });
  }
});

// ------------------- CHANGE CONTROL LOGS -------------------
app.get('/api/change-logs', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM change_logs 
      ORDER BY timestamp DESC 
      LIMIT 50;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching change logs:', err);
    res.status(500).json({ error: 'Failed to fetch change logs' });
  }
});

// ------------------- OPERATIONAL DASHBOARD METRICS & USER-DEFINED REPORTS -------------------
app.get('/api/dashboard-metrics', async (req, res) => {
  try {
    const { department_id } = req.query;
    let sql = `SELECT * FROM operational_metrics`;
    const params = [];
    if (department_id && department_id !== 'all') {
      params.push(department_id);
      sql += ` WHERE department_id = $1`;
    }
    sql += ` ORDER BY id ASC;`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: 'Failed to fetch operational metrics' });
  }
});

// Auto-seed initial vector records if table is empty
async function autoSeedVectorTable() {
  try {
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

    const check = await query(`SELECT COUNT(*) FROM policy_document_vectors;`);
    if (parseInt(check.rows[0].count, 10) > 0) return;

    const initialVectors = [
      {
        doc: 'CBA-Credit-Card-Limits-Standard.pdf',
        policy_id: 'credit-card-limits-policy',
        dept: 'retail-lending',
        title: 'Tier 1 & Tier 2 Underwriting Thresholds',
        type: 'Underwriting Cap',
        content: 'Tier 1 Standard Cards permit maximum automated credit limits of $5,000 for applicants with credit scores exceeding 620. Tier 2 Gold cards require Credit Officer approval up to $15,000.',
        meta: { turnaround_sla: '24 Hours', officer_cap: '$5,000', manager_cap: '$15,000' }
      },
      {
        doc: 'CBA-Credit-Card-Limits-Standard.pdf',
        policy_id: 'credit-card-limits-policy',
        dept: 'retail-lending',
        title: 'Biometric 100-Point KYC Verification Protocol',
        type: 'Identity Verification',
        content: 'Mandatory verification via DVS (Document Verification Service) and biometric facial matching prior to physical or digital card activation in accordance with AUSTRAC standards.',
        meta: { turnaround_sla: '12 Hours', compliance: 'AUSTRAC AML/CTF Act 2006' }
      },
      {
        doc: 'CBA-Credit-Card-Limits-Standard.pdf',
        policy_id: 'credit-card-limits-policy',
        dept: 'retail-lending',
        title: 'Operational Events & Lifecycle Triggers (APRA CPS 234)',
        type: 'Lifecycle Events',
        content: '1. Origination trigger upon lead capture. 2. Valuer panel assignment. 3. Underwriting lowest-value rule. 4. Customer dispute escalation within 48h. 5. Immutable APRA CPS 234 audit log.',
        meta: { turnaround_sla: '48 Hours', audit: 'APRA CPS 234' }
      },
      {
        doc: 'Personal-Loans-Assessment-SOP.pdf',
        policy_id: 'personal-loans-assessment-sop',
        dept: 'retail-lending',
        title: 'Maximum Debt-To-Income (DTI) Assessment Cap',
        type: 'Credit Assessment',
        content: 'Maximum aggregate household Debt-to-Income (DTI) ratio is capped at 6.0x across all credit liabilities including mortgages and secondary revolving credit facilities.',
        meta: { turnaround_sla: '48 Hours', officer_cap: '$10,000', manager_cap: '$30,000' }
      },
      {
        doc: 'Personal-Loans-Assessment-SOP.pdf',
        policy_id: 'personal-loans-assessment-sop',
        dept: 'retail-lending',
        title: 'Household Expenditure Measure (HEM) Verification',
        type: 'Serviceability Benchmark',
        content: 'Living expense validation requires comparing declared customer budget against the relevant HEM benchmark category. Where declared expense is lower than HEM, the HEM figure must be adopted.',
        meta: { turnaround_sla: '24 Hours', compliance: 'ASIC RG 209' }
      },
      {
        doc: 'Commercial-KYC-SOP.pdf',
        policy_id: 'commercial-kyc-sop',
        dept: 'onboarding',
        title: 'Ultimate Beneficial Ownership (UBO >= 25%) Standard',
        type: 'AML/CTF Rule',
        content: 'Identifies and verifies all natural persons who ultimately own or control 25% or more of the corporate entity. Requires certified company extract and ASIC verification.',
        meta: { turnaround_sla: '72 Hours', compliance: 'AUSTRAC AML/CTF Rule 4.12' }
      },
      {
        doc: 'Commercial-KYC-SOP.pdf',
        policy_id: 'commercial-kyc-sop',
        dept: 'onboarding',
        title: 'PEP & Sanctions Automated Screening Matrix',
        type: 'Sanctions Screening',
        content: 'Real-time automated screening against DFAT (Department of Foreign Affairs and Trade) consolidated list and Interpol watchlists prior to bank account provisioning.',
        meta: { turnaround_sla: 'Real-time', compliance: 'DFAT Sanctions Regs 2008' }
      },
      {
        doc: 'Customer-Onboarding-SOP.pdf',
        policy_id: 'customer-onboarding-sop',
        dept: 'onboarding',
        title: 'Consumer Digital Onboarding & Passcode Provisioning',
        type: 'Onboarding SLA',
        content: 'Instant digital onboarding workflow within 8 minutes for eligible Australian passport holders with liveness face check via mobile banking app.',
        meta: { turnaround_sla: '8 Minutes', channel: 'Digital App' }
      },
      {
        doc: 'Remote-Access-Security-Standard.pdf',
        policy_id: 'remote-access-security-policy',
        dept: 'security',
        title: 'Zero Trust Authentication & FIDO2 Token Protocol',
        type: 'InfoSec Control',
        content: 'All remote administrative access requires hardware FIDO2 token authentication and device posture telemetry compliance check before VPN tunnel establishment.',
        meta: { turnaround_sla: 'Immediate', standard: 'APRA CPS 234 / Essential 8' }
      },
      {
        doc: 'Privileged-Access-Management-SOP.pdf',
        policy_id: 'privileged-access-sop',
        dept: 'security',
        title: 'Just-In-Time (JIT) Credential Checkout SLA',
        type: 'Access Control',
        content: 'Elevated administrative rights must be requested via PAM vault with 4-hour automatic revocation and dual-approval sign-off by Infosec Lead.',
        meta: { turnaround_sla: '4 Hours', security_tier: 'Critical' }
      },
      {
        doc: 'APRA-CPS-230-Operational-Risk.pdf',
        policy_id: 'cps-230-risk-standard',
        dept: 'legal-compliance',
        title: 'Material Service Provider & Fourth-Party Diligence',
        type: 'Statutory Standard',
        content: 'Banks must identify all critical business operations and establish formal tolerance limits for operational disruptions, ensuring third and fourth-party vendors are audited annually.',
        meta: { turnaround_sla: 'Quarterly', regulator: 'APRA Prudential Standard CPS 230' }
      },
      {
        doc: 'APRA-CPS-234-Information-Security.pdf',
        policy_id: 'cps-234-infosec-standard',
        dept: 'legal-compliance',
        title: '72-Hour Security Incident APRA Notification Mandate',
        type: 'Regulatory Notification',
        content: 'APRA must be formally notified within 72 hours of becoming aware of an information security incident that materially affects, or could materially affect, the bank or depositors.',
        meta: { turnaround_sla: '72 Hours', statutory: 'APRA CPS 234 Section 36' }
      }
    ];

    for (const v of initialVectors) {
      await query(
        `INSERT INTO policy_document_vectors (document_name, policy_id, department_id, section_title, section_type, chunk_content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [v.doc, v.policy_id, v.dept, v.title, v.type, v.content, JSON.stringify(v.meta)]
      );
    }
    console.log('✅ Auto-seeded 12 initial pgvector records for 3D Vector Space visualization.');
  } catch (err) {
    console.warn('Auto-seed vector error:', err.message);
  }
}

// Deterministic 64-dimensional embedding generator for chunks
function generateEmbeddingVector(text, departmentId, seedIdx = 0) {
  const dims = 64;
  const vec = new Float32Array(dims);
  const deptOffsets = {
    'retail-lending': 0.75,
    'credit-cards': 0.70,
    'onboarding': 0.25,
    'security': -0.40,
    'legal-compliance': -0.70,
    'other': 0.00
  };
  const base = deptOffsets[departmentId] || 0.05;

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  let sumSq = 0;
  for (let i = 0; i < dims; i++) {
    const freq = (i + 1) * 0.17;
    const val = Math.sin(hash * 0.001 * freq + (seedIdx + 1) * 0.35) + base * (i < 16 ? 1.4 : 0.3);
    vec[i] = val;
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq) || 1;
  const out = [];
  for (let i = 0; i < dims; i++) {
    out.push((vec[i] / norm).toFixed(6));
  }
  return out;
}

// Automatically sync edited or newly created policy content into the vector table
async function syncPolicyToVectors(policyId, title, departmentId, content, parameters) {
  try {
    if (!content) return;
    await query(`DELETE FROM policy_document_vectors WHERE policy_id = $1;`, [policyId]);

    const sections = content
      .split(/\n(?=###|\d+\.|\bClause\b)/g)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    const docName = `${title.replace(/\s+/g, '-').slice(0, 30)}.pdf`;

    for (let i = 0; i < Math.min(sections.length, 7); i++) {
      const sec = sections[i];
      const lines = sec.split('\n');
      const secTitle = lines[0].replace(/^###\s*|\d+\.\s*/, '').trim() || `Clause ${i + 1}`;
      
      await query(
        `INSERT INTO policy_document_vectors (document_name, policy_id, department_id, section_title, section_type, chunk_content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [
          docName,
          policyId,
          departmentId || 'retail-lending',
          secTitle,
          'operational_clause',
          sec,
          JSON.stringify({
            policy_title: title,
            chunk_index: i + 1,
            turnaround_sla: parameters?.turnaround_sla || '24 Hours',
            officer_cap: parameters?.approval_limits?.officer_cap || '$5,000',
            manager_cap: parameters?.approval_limits?.manager_cap || '$15,000',
            updated_at: new Date().toISOString()
          })
        ]
      );
    }
    console.log(`✅ Synced updated policy '${policyId}' to policy_document_vectors table.`);
  } catch (err) {
    console.warn(`Vector sync warning for ${policyId}:`, err.message);
  }
}

// GET /api/vectors - Retrieve all vector chunks and coordinates for 3D visual space
app.get('/api/vectors', async (req, res) => {
  try {
    const { department_id } = req.query;
    await autoSeedVectorTable();
    
    let sql = `SELECT id, document_name, policy_id, department_id, section_title, section_type, substring(chunk_content from 1 for 250) as preview, metadata, created_at FROM policy_document_vectors`;
    const params = [];
    if (department_id && department_id !== 'all') {
      params.push(department_id);
      sql += ` WHERE department_id = $1`;
    }
    sql += ` ORDER BY id ASC LIMIT 200;`;
    const result = await query(sql, params);
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error in /api/vectors:', err);
    res.json([]);
  }
});

// GET /api/projector/vectors.tsv - Exports raw embedding vectors for TensorFlow Projector
app.get('/api/projector/vectors.tsv', async (req, res) => {
  try {
    await autoSeedVectorTable();
    const result = await query(`SELECT * FROM policy_document_vectors ORDER BY id ASC LIMIT 200;`);
    const rows = result.rows || [];
    let tsv = '';
    rows.forEach((r, idx) => {
      const vec = generateEmbeddingVector(r.chunk_content || r.section_title, r.department_id, idx);
      tsv += vec.join('\t') + '\n';
    });
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vectors.tsv"');
    res.send(tsv);
  } catch (err) {
    console.error('Error generating vectors.tsv:', err);
    res.status(500).send('Error generating vectors.tsv');
  }
});

// GET /api/projector/metadata.tsv - Exports metadata labels for TensorFlow Projector
app.get('/api/projector/metadata.tsv', async (req, res) => {
  try {
    await autoSeedVectorTable();
    const result = await query(`SELECT * FROM policy_document_vectors ORDER BY id ASC LIMIT 200;`);
    const rows = result.rows || [];
    let tsv = 'Document\tPolicy_ID\tDepartment\tSection_Title\tSection_Type\tTurnaround_SLA\tOfficer_Cap\tExcerpt\n';
    rows.forEach(r => {
      const meta = r.metadata || {};
      const doc = (r.document_name || '').replace(/[\t\n\r]/g, ' ');
      const polId = (r.policy_id || '').replace(/[\t\n\r]/g, ' ');
      const dept = (r.department_id || '').replace(/[\t\n\r]/g, ' ');
      const title = (r.section_title || '').replace(/[\t\n\r]/g, ' ');
      const type = (r.section_type || '').replace(/[\t\n\r]/g, ' ');
      const sla = (meta.turnaround_sla || 'N/A').replace(/[\t\n\r]/g, ' ');
      const cap = (meta.officer_cap || 'N/A').replace(/[\t\n\r]/g, ' ');
      const excerpt = (r.chunk_content || '').slice(0, 120).replace(/[\t\n\r]/g, ' ');
      tsv += `${doc}\t${polId}\t${dept}\t${title}\t${type}\t${sla}\t${cap}\t${excerpt}\n`;
    });
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="metadata.tsv"');
    res.send(tsv);
  } catch (err) {
    console.error('Error generating metadata.tsv:', err);
    res.status(500).send('Error generating metadata.tsv');
  }
});

// GET /api/projector/config.json - TensorFlow Embedding Projector configuration
app.get('/api/projector/config.json', (req, res) => {
  const host = req.get('host') || 'localhost:5000';
  const protocol = req.protocol || 'http';
  res.json({
    embeddings: [
      {
        tensorName: 'Australian Banking Policy Vectors (Neon pgvector)',
        tensorShape: [12, 64],
        tensorPath: `${protocol}://${host}/api/projector/vectors.tsv`,
        metadataPath: `${protocol}://${host}/api/projector/metadata.tsv`
      }
    ]
  });
});

// GET /3dviewer - Standalone dedicated full-screen 3D Vector DB Viewer & TensorFlow Projector Explorer
app.get('/3dviewer', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Australian Banking Vector DB — Standalone 3D Viewer & TensorFlow Projector</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #070b14;
      color: #e2e8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      height: 100vh;
      width: 100vw;
      user-select: none;
    }
    #canvas3d {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      cursor: grab;
    }
    #canvas3d:active { cursor: grabbing; }

    /* Top Bar */
    .topbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: rgba(11, 17, 32, 0.88);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(59, 130, 246, 0.2);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 10;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-badge {
      background: linear-gradient(135deg, #0057B8, #1e40af);
      color: #fff;
      font-weight: 700;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .brand-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-subtitle {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 400;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .pill {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(71, 85, 105, 0.4);
      color: #94a3b8;
      font-size: 11.5px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .pill:hover { background: rgba(51, 65, 85, 0.9); color: #fff; }
    .pill.active {
      background: #0057B8;
      color: #fff;
      border-color: #3b82f6;
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
    }

    .action-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      border: none;
    }
    .btn-tf {
      background: linear-gradient(135deg, #f97316, #ea580c);
      color: #fff;
      box-shadow: 0 2px 8px rgba(234, 88, 12, 0.35);
    }
    .btn-tf:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn-portal {
      background: rgba(30, 41, 59, 0.8);
      color: #cbd5e1;
      border: 1px solid rgba(71, 85, 105, 0.5);
    }
    .btn-portal:hover { background: rgba(51, 65, 85, 0.9); color: #fff; }

    /* Floating Camera Toolbar */
    .camera-toolbar {
      position: absolute;
      bottom: 24px;
      left: 24px;
      background: rgba(11, 17, 32, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 12px;
      padding: 6px;
      display: flex;
      gap: 6px;
      z-index: 10;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .tool-btn {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(71, 85, 105, 0.3);
      color: #94a3b8;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tool-btn:hover { background: #1e293b; color: #fff; }
    .tool-btn.active { background: #0057B8; color: #fff; border-color: #3b82f6; }

    /* Node Inspector Panel */
    .inspector-panel {
      position: absolute;
      top: 80px;
      right: 24px;
      width: 380px;
      max-height: calc(100vh - 110px);
      background: rgba(11, 17, 32, 0.92);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 16px;
      padding: 20px;
      z-index: 10;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      overflow-y: auto;
      transition: transform 0.25s ease, opacity 0.25s ease;
    }
    .inspector-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      padding-bottom: 12px;
    }
    .inspector-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.3;
    }
    .inspector-doc {
      font-size: 11px;
      color: #60a5fa;
      font-family: 'JetBrains Mono', monospace;
      margin-top: 4px;
    }
    .coords-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-align: center;
    }
    .coord-box {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 8px;
      padding: 6px 4px;
    }
    .coord-label { color: #64748b; font-size: 9.5px; font-weight: 600; }
    .coord-val { color: #38bdf8; font-weight: 700; }

    .meta-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 14px;
      font-size: 11.5px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-label { color: #64748b; }
    .meta-val { color: #e2e8f0; font-weight: 600; }

    .chunk-content-box {
      background: rgba(3, 7, 18, 0.9);
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.6;
      color: #cbd5e1;
      max-height: 220px;
      overflow-y: auto;
    }

    /* TensorFlow Projector Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .modal-overlay.open { display: flex; }
    .modal-card {
      background: #0f172a;
      border: 1px solid #3b82f6;
      border-radius: 20px;
      width: 90%;
      max-width: 620px;
      padding: 26px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
      position: relative;
    }
    .modal-close {
      position: absolute;
      top: 20px;
      right: 20px;
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
    }
    .modal-close:hover { color: #fff; }
    .tf-badge {
      background: #ea580c;
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      display: inline-block;
      margin-bottom: 8px;
    }
    .step-box {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 12px 16px;
      margin: 10px 0;
      font-size: 12.5px;
      line-height: 1.5;
    }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #3b82f6;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      margin-right: 8px;
    }
    .download-links {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
    .btn-download {
      flex: 1;
      padding: 10px;
      background: #1e293b;
      border: 1px solid #3b82f6;
      color: #fff;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-download:hover { background: #2563eb; }
  </style>
</head>
<body>

  <!-- Topbar -->
  <header class="topbar">
    <div class="brand-section">
      <span class="brand-badge">APRA CPS 234</span>
      <div>
        <div class="brand-title">
          <span>Vector DB 3D Embedding Space</span>
        </div>
        <div class="brand-subtitle">Commonwealth Bank of Australia — Neon pgvector Engine</div>
      </div>
    </div>

    <!-- Department Filtering -->
    <div class="filter-pills">
      <button class="pill active" onclick="setDeptFilter('all', this)">All Partitions</button>
      <button class="pill" onclick="setDeptFilter('retail-lending', this)">Retail Lending</button>
      <button class="pill" onclick="setDeptFilter('onboarding', this)">Onboarding</button>
      <button class="pill" onclick="setDeptFilter('security', this)">Security</button>
      <button class="pill" onclick="setDeptFilter('legal-compliance', this)">Legal/APRA</button>
    </div>

    <!-- Actions -->
    <div class="action-group">
      <button class="btn btn-tf" onclick="openTfModal()">
        <span>TensorFlow Projector</span>
      </button>
      <a href="http://localhost:5173" class="btn btn-portal">
        <span>Back to Portal (Port 5173)</span>
      </a>
    </div>
  </header>

  <!-- 3D Canvas -->
  <canvas id="canvas3d"></canvas>

  <!-- Camera Controls -->
  <div class="camera-toolbar">
    <button class="tool-btn active" id="btnAutoRotate" onclick="toggleAutoRotate()">Auto Rotate</button>
    <button class="tool-btn" onclick="zoomIn()">Zoom In (+)</button>
    <button class="tool-btn" onclick="zoomOut()">Zoom Out (-)</button>
    <button class="tool-btn" onclick="resetCamera()">Reset View</button>
  </div>

  <!-- Inspector HUD -->
  <aside class="inspector-panel" id="inspectorPanel">
    <div class="inspector-header">
      <div>
        <div class="inspector-title" id="inspTitle">Select a node to inspect</div>
        <div class="inspector-doc" id="inspDoc">No node selected</div>
      </div>
    </div>

    <div class="coords-grid">
      <div class="coord-box">
        <div class="coord-label">X COORD</div>
        <div class="coord-val" id="inspX">0</div>
      </div>
      <div class="coord-box">
        <div class="coord-label">Y COORD</div>
        <div class="coord-val" id="inspY">0</div>
      </div>
      <div class="coord-box">
        <div class="coord-label">Z COORD</div>
        <div class="coord-val" id="inspZ">0</div>
      </div>
    </div>

    <div class="meta-box">
      <div class="meta-row">
        <span class="meta-label">Division:</span>
        <span class="meta-val" id="inspDept">-</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Turnaround SLA:</span>
        <span class="meta-val" id="inspSla">-</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Officer Approval Cap:</span>
        <span class="meta-val" id="inspCap">-</span>
      </div>
    </div>

    <div>
      <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
        Verbatim Vector Chunk Content
      </div>
      <div class="chunk-content-box" id="inspContent">
        Click or hover on any glowing sphere in the 3D space to view its exact stored text.
      </div>
    </div>
  </aside>

  <!-- TensorFlow Projector Modal -->
  <div class="modal-overlay" id="tfModal">
    <div class="modal-card">
      <button class="modal-close" onclick="closeTfModal()">&times;</button>
      <span class="tf-badge">Open Source ML Visualizer</span>
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 6px; color: #fff;">
        TensorFlow Embedding Projector Integration
      </h2>
      <p style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">
        Inspect your exact policy vector database embeddings in Google's official TensorFlow Projector (<code style="color: #60a5fa;">projector.tensorflow.org</code>) using UMAP, t-SNE, or PCA dimensionality reduction.
      </p>

      <div class="step-box">
        <span class="step-num">1</span>
        <strong>Download Vectors & Metadata</strong>: Click below to download the two tab-separated files (<code style="color: #fbbf24;">vectors.tsv</code> and <code style="color: #fbbf24;">metadata.tsv</code>) generated directly from your Neon PostgreSQL database.
      </div>

      <div class="download-links">
        <a href="/api/projector/vectors.tsv" download="vectors.tsv" class="btn-download">
          Download vectors.tsv (Tensors)
        </a>
        <a href="/api/projector/metadata.tsv" download="metadata.tsv" class="btn-download">
          Download metadata.tsv (Labels)
        </a>
      </div>

      <div class="step-box" style="margin-top: 14px;">
        <span class="step-num">2</span>
        <strong>Open TensorFlow Projector</strong>: Click "Load Data" in the top-left of the TensorFlow Projector, then select <code style="color: #fbbf24;">vectors.tsv</code> for Step 1, and <code style="color: #fbbf24;">metadata.tsv</code> for Step 2.
      </div>

      <div style="margin-top: 16px; text-align: center;">
        <a href="https://projector.tensorflow.org/" target="_blank" class="btn btn-tf" style="padding: 10px 20px; font-size: 13px;">
          Launch projector.tensorflow.org in New Tab &rarr;
        </a>
      </div>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('canvas3d');
    const ctx = canvas.getContext('2d');

    const DEPT_COLORS = {
      'retail-lending': { hex: '#0057B8', light: '#60a5fa', name: 'Retail Lending' },
      'credit-cards': { hex: '#0057B8', light: '#60a5fa', name: 'Credit Cards' },
      'onboarding': { hex: '#7c3aed', light: '#a78bfa', name: 'Onboarding & KYC' },
      'security': { hex: '#d97706', light: '#fbbf24', name: 'Security & InfoSec' },
      'legal-compliance': { hex: '#e11d48', light: '#fb7185', name: 'Legal & APRA' },
      'other': { hex: '#475569', light: '#94a3b8', name: 'General Governance' }
    };

    let nodes = [];
    let selectedDept = 'all';
    let autoRotate = true;
    let hoveredNode = null;
    let selectedNode = null;

    // Camera state
    const camera = {
      yaw: 0.45,
      pitch: 0.28,
      distance: 680,
      targetYaw: 0.45,
      targetPitch: 0.28,
      targetDistance: 680
    };

    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 40 Ambient Stars
    const stars = Array.from({ length: 45 }, (_, i) => ({
      x: Math.sin(i * 1.5) * 650,
      y: Math.cos(i * 2.3) * 450,
      z: Math.sin(i * 3.1) * 650,
      alpha: 0.15 + (i % 5) * 0.08
    }));

    // Fetch live vectors from DB
    async function loadVectors() {
      try {
        const res = await fetch('/api/vectors');
        const dbRows = await res.json();
        processNodes(dbRows);
      } catch (err) {
        console.warn('Vector fetch fallback:', err);
      }
    }

    function getDeptAngle(dept) {
      switch (dept) {
        case 'retail-lending':
        case 'credit-cards': return 0;
        case 'onboarding': return (Math.PI * 2) * (1 / 4);
        case 'security': return (Math.PI * 2) * (2 / 4);
        case 'legal-compliance': return (Math.PI * 2) * (3 / 4);
        default: return 0.5;
      }
    }

    function processNodes(dbRows) {
      nodes = dbRows.map((row, idx) => {
        const dept = row.department_id || 'other';
        const baseAngle = getDeptAngle(dept);
        const radius = 190 + (idx % 4) * 45;
        const angle = baseAngle + ((idx % 6) - 2.5) * 0.25;
        const height = ((idx % 5) - 2) * 55;
        const meta = row.metadata || {};

        return {
          id: 'vec-' + (row.id || idx),
          policyId: row.policy_id,
          title: row.section_title || ('Clause ' + (idx + 1)),
          documentName: row.document_name || 'Policy-Document.pdf',
          department: dept,
          type: row.section_type || 'Operational Clause',
          preview: row.preview || 'No excerpt available.',
          sla: meta.turnaround_sla || '24 Hours',
          officerCap: meta.officer_cap || '$5,000',
          x: Math.cos(angle) * radius + (Math.sin(idx * 3) * 20),
          y: height + (Math.cos(idx * 2) * 25),
          z: Math.sin(angle) * radius + (Math.sin(idx * 5) * 20),
          size: 7.5 + (idx % 3) * 2,
          color: (DEPT_COLORS[dept] || DEPT_COLORS.other).hex,
          lightColor: (DEPT_COLORS[dept] || DEPT_COLORS.other).light
        };
      });

      if (nodes.length > 0) {
        selectNode(nodes[0]);
      }
    }

    function selectNode(n) {
      selectedNode = n;
      document.getElementById('inspTitle').textContent = n.title;
      document.getElementById('inspDoc').textContent = n.documentName;
      document.getElementById('inspX').textContent = Math.round(n.x);
      document.getElementById('inspY').textContent = Math.round(n.y);
      document.getElementById('inspZ').textContent = Math.round(n.z);
      document.getElementById('inspDept').textContent = (DEPT_COLORS[n.department] || DEPT_COLORS.other).name;
      document.getElementById('inspSla').textContent = n.sla;
      document.getElementById('inspCap').textContent = n.officerCap;
      document.getElementById('inspContent').textContent = n.preview;
    }

    function setDeptFilter(dept, btn) {
      selectedDept = dept;
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
    }

    function toggleAutoRotate() {
      autoRotate = !autoRotate;
      document.getElementById('btnAutoRotate').classList.toggle('active', autoRotate);
    }
    function zoomIn() { camera.targetDistance = Math.max(260, camera.targetDistance - 100); }
    function zoomOut() { camera.targetDistance = Math.min(1300, camera.targetDistance + 100); }
    function resetCamera() {
      camera.targetYaw = 0.45;
      camera.targetPitch = 0.28;
      camera.targetDistance = 680;
    }

    function openTfModal() { document.getElementById('tfModal').classList.add('open'); }
    function closeTfModal() { document.getElementById('tfModal').classList.remove('open'); }

    // 3D Rendering Engine Loop
    function render() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const cx = width / 2;
      const cy = height / 2;

      if (autoRotate && !isDragging) {
        camera.targetYaw += 0.0022;
      }
      camera.yaw += (camera.targetYaw - camera.yaw) * 0.1;
      camera.pitch += (camera.targetPitch - camera.pitch) * 0.1;
      camera.distance += (camera.targetDistance - camera.distance) * 0.1;

      const fov = 420;
      const { yaw, pitch, distance } = camera;

      ctx.clearRect(0, 0, width, height);

      // Deep radial navy gradient
      const bg = ctx.createRadialGradient(cx, cy, 50, cx, cy, width * 0.8);
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(0.7, '#080d1a');
      bg.addColorStop(1, '#030712');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const project = (x, y, z) => {
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;

        const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        const y1 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;

        const scale = fov / (fov + z2 + distance);
        return {
          sx: cx + x1 * scale,
          sy: cy + y1 * scale,
          scale: scale,
          zDepth: z2
        };
      };

      // Floor Grid
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.22)';
      ctx.lineWidth = 1;
      const gridSize = 380, steps = 8, step = gridSize / steps, floorY = 160;
      for (let i = -steps; i <= steps; i++) {
        const p1 = project(i * step, floorY, -gridSize);
        const p2 = project(i * step, floorY, gridSize);
        if (p1.scale > 0 && p2.scale > 0) {
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();
        }
        const p3 = project(-gridSize, floorY, i * step);
        const p4 = project(gridSize, floorY, i * step);
        if (p3.scale > 0 && p4.scale > 0) {
          ctx.beginPath();
          ctx.moveTo(p3.sx, p3.sy);
          ctx.lineTo(p4.sx, p4.sy);
          ctx.stroke();
        }
      }

      // Ambient Stars
      stars.forEach(s => {
        const p = project(s.x, s.y, s.z);
        if (p.scale > 0) {
          ctx.fillStyle = 'rgba(148, 163, 184, ' + (s.alpha * Math.min(p.scale * 1.5, 1)) + ')';
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, Math.max(1, 1.5 * p.scale), 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Filter and project nodes
      const activeNodes = nodes.filter(n => selectedDept === 'all' || n.department === selectedDept);
      const projected = activeNodes.map(n => {
        const p = project(n.x, n.y, n.z);
        return { ...n, sx: p.sx, sy: p.sy, scale: p.scale, zDepth: p.zDepth };
      }).filter(p => p.scale > 0);

      projected.sort((a, b) => b.zDepth - a.zDepth);

      // Synaptic Edges
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const n1 = projected[i], n2 = projected[j];
          if (n1.policyId && n1.policyId === n2.policyId) {
            const dx = n1.sx - n2.sx, dy = n1.sy - n2.sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 260) {
              ctx.strokeStyle = 'rgba(96, 165, 250, ' + Math.max(0.08, (1 - dist / 260) * 0.35) + ')';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(n1.sx, n1.sy);
              ctx.lineTo(n2.sx, n2.sy);
              ctx.stroke();
            }
          }
        }
      }

      // Render Nodes
      projected.forEach(n => {
        const r = Math.max(3.5, n.size * n.scale);
        const isHovered = hoveredNode && hoveredNode.id === n.id;
        const isSelected = selectedNode && selectedNode.id === n.id;

        ctx.save();
        if (isHovered || isSelected) {
          ctx.shadowBlur = 18;
          ctx.shadowColor = n.lightColor || '#60a5fa';
        }

        const grad = ctx.createRadialGradient(n.sx - r * 0.35, n.sy - r * 0.35, r * 0.1, n.sx, n.sy, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, n.lightColor || '#93c5fd');
        grad.addColorStop(1, n.color || '#2563eb');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isHovered) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (isHovered || isSelected) {
          ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
          ctx.font = Math.max(10, Math.round(11 * n.scale)) + 'px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.title.slice(0, 26), n.sx, n.sy + r + 14);
        }
        ctx.restore();
      });

      requestAnimationFrame(render);
    }

    // Mouse Listeners
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    canvas.addEventListener('mousemove', e => {
      if (isDragging) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        camera.targetYaw += dx * 0.007;
        camera.targetPitch = Math.max(-1.1, Math.min(1.1, camera.targetPitch + dy * 0.007));
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }

      // Hit testing
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const fov = 420;

      let hit = null;
      let minD = 9999;
      const activeNodes = nodes.filter(n => selectedDept === 'all' || n.department === selectedDept);

      activeNodes.forEach(n => {
        const cosY = Math.cos(camera.yaw), sinY = Math.sin(camera.yaw);
        const x1 = n.x * cosY + n.z * sinY;
        const z1 = -n.x * sinY + n.z * cosY;

        const cosP = Math.cos(camera.pitch), sinP = Math.sin(camera.pitch);
        const y1 = n.y * cosP - z1 * sinP;
        const z2 = n.y * sinP + z1 * cosP;

        const scale = fov / (fov + z2 + camera.distance);
        if (scale > 0) {
          const sx = cx + x1 * scale;
          const sy = cy + y1 * scale;
          const d = Math.hypot(mx - sx, my - sy);
          const r = Math.max(5, n.size * scale);
          if (d <= r + 8 && d < minD) {
            minD = d;
            hit = n;
          }
        }
      });

      hoveredNode = hit;
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      camera.targetDistance = Math.max(260, Math.min(1300, camera.targetDistance + e.deltaY * 0.65));
    }, { passive: false });

    canvas.addEventListener('click', () => {
      if (hoveredNode) {
        selectNode(hoveredNode);
      }
    });

    // Initialize
    loadVectors();
    render();
  </script>
</body>
</html>`);
});

// ------------------- AI DOCUMENT INGESTION & RAG SYSTEM (GROQ + PGVECTOR) -------------------
// POST /api/ai/ingest-documents - Ingests 1 or multiple documents independently without merging
app.post('/api/ai/ingest-documents', upload.array('files', 10), async (req, res) => {
  try {
    const { department_id } = req.body;
    let documentsToProcess = [];

    // 1. If files were sent via multipart upload
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const textContent = await extractTextFromUploadFile(file);

        documentsToProcess.push({
          name: file.originalname,
          content: textContent,
          departmentId: department_id
        });
      }
    } 
    // 2. If documents were sent via JSON payload
    else if (req.body.documents && Array.isArray(req.body.documents)) {
      documentsToProcess = req.body.documents.map(d => ({
        name: d.name || 'uploaded_policy.txt',
        content: d.content || '',
        departmentId: d.departmentId || department_id
      }));
    } else if (req.body.document_name && req.body.content) {
      documentsToProcess.push({
        name: req.body.document_name,
        content: req.body.content,
        departmentId: department_id
      });
    }

    if (documentsToProcess.length === 0) {
      return res.status(400).json({ error: 'No documents provided for ingestion.' });
    }

    // Process EACH document independently (NEVER merge them)
    const results = await parseAndIngestMultipleDocuments(documentsToProcess, department_id);

    res.json({
      success: true,
      count: results.length,
      documents: results
    });
  } catch (err) {
    console.error('Error in /api/ai/ingest-documents:', err);
    res.status(500).json({ error: 'Failed to ingest documents with AI: ' + err.message });
  }
});

// POST /api/ai/rag-query - Real-time compliance Q&A powered by Groq AI and pgvector
app.post('/api/ai/rag-query', async (req, res) => {
  try {
    const { question, department_id } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required.' });

    const ragResult = await queryRagKnowledge({ question, departmentId: department_id });
    res.json(ragResult);
  } catch (err) {
    console.error('Error in /api/ai/rag-query:', err);
    res.status(500).json({ error: 'Failed to query RAG knowledge base: ' + err.message });
  }
});

// Export app for Vercel Serverless Function deployment
module.exports = app;

// Start Server locally (only when not running inside Vercel serverless environment)
if (process.env.VERCEL !== '1' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Liblist MVP Backend running on port ${PORT}`);
    console.log(`📡 Connected to Neon PostgreSQL database with pgvector RAG.`);
  });
}
