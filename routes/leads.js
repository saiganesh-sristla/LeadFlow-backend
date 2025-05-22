import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import Lead from '../models/Lead.js';
import { checkRole } from '../middleware/auth.js';
import Tag from '../models/Tag.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all leads with filters
router.get('/', async (req, res) => {
  try {
    const {
      status,
      tags,
      dateFrom,
      dateTo,
      assignedTo,
      source,
      search,
      page = 1,
      limit = 10,
    } = req.query;
    
    const filter = {};
    
    // Check user role and filter based on assigned leads
    if (req.user.role === 'agent') {
      filter.assignedTo = req.user.id;
    }
    
    // Apply filters
    if (status) filter.status = status;
    if (assignedTo && req.user.role !== 'agent') filter.assignedTo = assignedTo;
    if (source) filter.source = source;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
    
    // Tag filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      filter.tags = { $in: tagArray };
    }
    
    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get leads
    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name email')
      .populate('tags', 'name color')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const total = await Lead.countDocuments(filter);
    
    res.json({
      leads,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ message: 'Server error fetching leads' });
  }
});

// Get lead by ID
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('tags', 'name color')
      .populate('notes.createdBy', 'name');
    
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    // Check if agent is assigned to this lead
    if (req.user.role === 'agent' && lead.assignedTo?._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this lead' });
    }
    
    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ message: 'Server error fetching lead' });
  }
});

// Create a new lead
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      source,
      status = 'New',
      assignedTo,
      tags = [],
    } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    
    // Create lead
    const lead = new Lead({
      name,
      email,
      phone,
      source,
      status,
      assignedTo,
      tags,
      createdBy: req.user.id,
    });
    
    await lead.save();
    
    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email')
      .populate('tags', 'name color');
    
    res.status(201).json(populatedLead);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ message: 'Server error creating lead' });
  }
});

// Update a lead
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      source,
      status,
      assignedTo,
      tags,
    } = req.body;
    
    // Check if lead exists
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    // Check if agent is assigned to this lead
    if (req.user.role === 'agent' && lead.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this lead' });
    }
    
    // Update fields
    if (name) lead.name = name;
    if (email) lead.email = email;
    if (phone) lead.phone = phone;
    if (source) lead.source = source;
    if (status) lead.status = status;
    
    // Admins and Super Admins can update assignedTo
    if (assignedTo && req.user.role !== 'agent') {
      lead.assignedTo = assignedTo;
    }
    
    // Update tags
    if (tags) lead.tags = tags;
    
    await lead.save();
    
    const updatedLead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('tags', 'name color');
    
    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ message: 'Server error updating lead' });
  }
});

// Delete a lead (Admin and Super Admin only)
router.delete('/:id', checkRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    await Lead.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ message: 'Server error deleting lead' });
  }
});

// Add a note to a lead
router.post('/:id/notes', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Note content is required' });
    }
    
    const lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    // Check if agent is assigned to this lead
    if (req.user.role === 'agent' && lead.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to add notes to this lead' });
    }
    
    lead.notes.unshift({
      content,
      createdBy: req.user.id,
      createdAt: new Date(),
    });
    
    await lead.save();
    
    const updatedLead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('notes.createdBy', 'name');
    
    res.json(updatedLead);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ message: 'Server error adding note' });
  }
});

// Import leads from Excel or CSV (Admin and Super Admin only)
router.post('/import', checkRole(['super_admin', 'admin']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Parse Excel/CSV
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      return res.status(400).json({ message: 'File is empty or has no valid data' });
    }
    
    // Import leads
    const importedLeads = [];
    const errors = [];
    
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      
      // Skip rows without required fields
      if (!item.name || !item.email) {
        errors.push({ row: i + 2, message: 'Missing required fields (name, email)' });
        continue;
      }
      
      try {
        const lead = new Lead({
          name: item.name,
          email: item.email,
          phone: item.phone || '',
          source: item.source || 'Import',
          status: item.status || 'New',
          createdBy: req.user.id,
        });
        
        await lead.save();
        importedLeads.push(lead);
      } catch (error) {
        errors.push({ row: i + 2, message: error.message });
      }
    }
    
    res.json({
      success: true,
      imported: importedLeads.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error importing leads:', error);
    res.status(500).json({ message: 'Server error importing leads' });
  }
});

// Export leads (Admin and Super Admin only)
router.get('/export', checkRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { status, tags, dateFrom, dateTo, assignedTo } = req.query;
    
    const filter = {};
    
    // Apply filters
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
    
    // Tag filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      filter.tags = { $in: tagArray };
    }
    
    // Get leads
    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name email')
      .populate('tags', 'name')
      .sort({ createdAt: -1 });
    
    // Prepare data for export
    const exportData = leads.map(lead => ({
      'Name': lead.name,
      'Email': lead.email,
      'Phone': lead.phone,
      'Status': lead.status,
      'Source': lead.source,
      'Tags': lead.tags.map((tag) => tag.name).join(', '),
      'Assigned To': lead.assignedTo ? lead.assignedTo.name : 'Unassigned',
      'Created At': new Date(lead.createdAt).toLocaleString(),
    }));
    
    // Create Excel file
    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Leads');
    
    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Send file
    res.setHeader('Content-Disposition', 'attachment; filename=leads.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting leads:', error);
    res.status(500).json({ message: 'Server error exporting leads' });
  }
});

// Get tags
router.get('/tags/all', async (req, res) => {
  try {
    const tags = await Tag.find().sort({ name: 1 });
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Server error fetching tags' });
  }
});

// Create a tag (Admin and Super Admin only)
router.post('/tags', checkRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Tag name is required' });
    }
    
    // Check if tag exists
    const existingTag = await Tag.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingTag) {
      return res.status(400).json({ message: 'Tag already exists' });
    }
    
    const tag = new Tag({
      name,
      color: color || '#808080', // Default gray if no color provided
      createdBy: req.user.id,
    });
    
    await tag.save();
    
    res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ message: 'Server error creating tag' });
  }
});

export default router;