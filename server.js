const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { query } = require('./db');
const { parseDocumentWithAi, parseAndIngestMultipleDocuments, queryRagKnowledge } = require('./ragService');

/**
 * Robust text extractor for uploaded PDF, DOCX, and TXT files
 */
async function extractTextFromUploadFile(file) {
  const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    try {
      const pdfModule = require('pdf-parse');
      // Case 1: pdf-parse v2+ class API
      if (pdfModule && pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: file.buffer });
        await parser.load();
        const res = await parser.getText();
        const text = typeof res === 'string' ? res : (res?.text || '');
        if (text && text.trim().length > 0) return text;
      }
      // Case 2: pdf-parse v1 function API
      if (typeof pdfModule === 'function') {
        const res = await pdfModule(file.buffer);
        if (res && res.text && res.text.trim().length > 0) return res.text;
      }
    } catch (err) {
      console.warn(`PDF parse error on ${file.originalname}:`, err.message);
    }
  }

  // Fallback to text buffer decoding (TXT, RTF, Markdown, CSV, etc.)
  try {
    return file.buffer.toString('utf-8');
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
      creation_mode = 'direct'
    } = req.body;

    if (!department_id || !title || !content) {
      return res.status(400).json({ error: 'Department, title, and content are required' });
    }

    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

    await query(`
      INSERT INTO policies (id, department_id, title, summary, version, status, is_masked, content, parameters, created_by)
      VALUES ($1, $2, $3, $4, '1.0', 'active', false, $5, $6, $7);
    `, [id, department_id, title, summary || title, content, JSON.stringify(parameters), created_by]);

    // Record version 1.0
    await query(`
      INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
      VALUES ($1, '1.0', $2, $3, $4, $5);
    `, [id, content, JSON.stringify(parameters), created_by, `Initial creation via ${creation_mode} mode`]);

    // Change log
    await query(`
      INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
      VALUES ('policy', $1, $2, 'CREATED', $3, $4);
    `, [id, created_by, department_id, `Created policy '${title}' via ${creation_mode} creation`]);

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
// GET /api/maker-checker - List review items & count for notification badge
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

    res.json({
      pendingCount: pendingRes.rows.length,
      pending: pendingRes.rows,
      history: allRes.rows
    });
  } catch (err) {
    console.error('Error fetching maker-checker:', err);
    res.status(500).json({ error: 'Failed to fetch maker-checker items' });
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
